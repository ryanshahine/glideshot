// WebGL2 renderer for the demo: one full-screen pass per frame, like the app's Core Image pipeline.
// Every pixel is projected back onto the tilted screen (inverse homography) and shaded there:
// variable depth-of-field blur from mipmaps, motion blur, cursor, click ripples, shadow, vignette.
import { SCREEN } from "./layout";

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D uScreen;
uniform sampler2D uCursorTex;
uniform vec2 uViewport;       // CSS px
uniform float uDpr;
uniform mat3 uInv;            // CSS px -> screen-plane px (homogeneous)
uniform vec2 uScreenSize;
uniform float uTexScale;      // texels per plane px
uniform float uCorner;
uniform vec3 uBg;
uniform float uShadow;
uniform float uSigma;         // Gaussian radius at full blur, device px (0 = depth of field off)
uniform vec2 uFocus;          // depth-of-field center, plane px
uniform float uR0, uSoft, uRadialAmount;
uniform vec2 uBandDir;
uniform float uBandStart, uBandLength; // length <= 0: no depth gradient
uniform vec4 uCursorRect;     // plane px
uniform float uCursorAlpha;
uniform vec4 uRipples[3];     // x, y, radius (plane px), opacity
uniform vec4 uCaret;          // plane px rect, w = 0 hides
uniform vec2 uSmear;          // motion blur vector, CSS px
uniform int uSmearTaps;
uniform float uVignette;

out vec4 outColor;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// The app's blur mask (Renderer.swift): a linear radial ramp from the focus circle out to
// "Radial blur", max'd with a smooth gradient along the tilt for parts further from the lens.
float blurMask(vec2 p) {
  vec2 d = p - uFocus;
  float m = uRadialAmount * clamp((length(d) - uR0) / uSoft, 0.0, 1.0);
  if (uBandLength > 0.0) {
    float b = clamp((abs(dot(d, uBandDir)) - uBandStart) / uBandLength, 0.0, 1.0);
    m = max(m, b * b * (3.0 - 2.0 * b));
  }
  return m;
}

// Gaussian blur like Core Image, which blurs *after* the perspective warp: the taps are spread in
// screen space (round on screen, whatever the tilt) and each one is projected back onto the screen plane.
vec3 sampleScreen(vec2 css, vec2 p, float sigmaDev, vec2 gx, vec2 gy, int taps) {
  vec3 sharp = textureGrad(uScreen, p / uScreenSize, gx, gy).rgb;
  if (sigmaDev < 0.5) return sharp;
  // Mip level from the larger axis of this pixel's footprint, so no tap is undersampled.
  float footprint = max(length(gx * uScreenSize), length(gy * uScreenSize)) * uTexScale;
  // Pre-blur each tap by roughly half the radius so the taps merge into one smooth Gaussian.
  float lod = max(log2(sigmaDev * footprint) - 0.2, 0.0);
  float sigmaCss = sigmaDev / uDpr;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= taps) break;
    float fi = float(i);
    float r = sigmaCss * sqrt(-2.0 * log(1.0 - (fi + 0.5) / float(taps)));
    float a = fi * 2.39996323;
    vec3 q = uInv * vec3(css + vec2(cos(a), sin(a)) * r, 1.0);
    acc += textureLod(uScreen, (q.xy / q.z) / uScreenSize, lod).rgb;
  }
  return mix(sharp, acc / float(taps), smoothstep(0.5, 1.5, sigmaDev));
}

vec3 shade(vec2 css, float fw, vec2 gx, vec2 gy, int taps) {
  vec3 q = uInv * vec3(css, 1.0);
  if (q.z <= 0.0) return uBg;
  vec2 p = q.xy / q.z;
  vec2 halfSize = uScreenSize * 0.5;

  // Stage background with the screen's soft shadow.
  float ds = sdRoundBox(p - halfSize - vec2(0.0, 40.0), halfSize, uCorner);
  vec3 bg = mix(uBg, vec3(0.0), uShadow * (1.0 - smoothstep(-60.0, 160.0, ds)));
  float d = sdRoundBox(p - halfSize, halfSize, uCorner);
  if (d > fw) return bg;

  // Blur size in screen pixels, like the app (it blurs the warped image).
  float sigma = uSigma > 0.0 ? uSigma * blurMask(p) : 0.0;
  vec3 col = sampleScreen(css, p, sigma, gx, gy, taps);

  if (uCaret.z > 0.0 && p.x >= uCaret.x && p.x <= uCaret.x + uCaret.z && p.y >= uCaret.y && p.y <= uCaret.y + uCaret.w) {
    col = vec3(0.0, 0.443, 0.89);
  }

  for (int i = 0; i < 3; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.0) continue;
    float dist = length(p - r.xy);
    float R = r.z, bw = R * 0.094;
    float fill = 1.0 - smoothstep(R - bw - fw, R - bw, dist);
    float ring = smoothstep(R - bw - fw, R - bw, dist) * (1.0 - smoothstep(R - fw, R, dist));
    float halo = smoothstep(R - fw, R, dist) * (1.0 - smoothstep(R + bw * 0.5 - fw, R + bw * 0.5, dist));
    col = mix(col, vec3(0.0), fill * 0.14 * r.w);
    col = mix(col, vec3(1.0), ring * 0.9 * r.w);
    col = mix(col, vec3(0.0), halo * 0.35 * r.w);
  }

  if (uCursorAlpha > 0.0) {
    vec2 cu = (p - uCursorRect.xy) / uCursorRect.zw;
    if (cu.x >= 0.0 && cu.y >= 0.0 && cu.x <= 1.0 && cu.y <= 1.0) {
      vec4 c = textureGrad(uCursorTex, cu, gx * uScreenSize / uCursorRect.zw, gy * uScreenSize / uCursorRect.zw);
      col = mix(col, c.rgb / max(c.a, 1e-4), c.a * uCursorAlpha);
    }
  }

  return mix(bg, col, clamp(0.5 - d / fw, 0.0, 1.0));
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uViewport.y * uDpr - gl_FragCoord.y) / uDpr;
  vec3 q0 = uInv * vec3(css, 1.0);
  vec2 p0 = q0.xy / q0.z;
  vec2 dx = dFdx(p0), dy = dFdy(p0);
  float fw = max(length(dx) + length(dy), 1e-3) * 0.5;
  vec2 gx = dx / uScreenSize, gy = dy / uScreenSize;

  vec3 col = vec3(0.0);
  if (uSmearTaps <= 1) {
    col = shade(css, fw, gx, gy, 24);
  } else {
    // During motion blur each sub-sample needs fewer depth-of-field taps.
    for (int i = 0; i < 12; i++) {
      if (i >= uSmearTaps) break;
      float t = float(i) / float(uSmearTaps - 1) - 0.5;
      col += shade(css + uSmear * t, fw, gx, gy, 6);
    }
    col /= float(uSmearTaps);
  }

  if (uVignette > 0.0) {
    vec2 e = (css - uViewport * 0.5) / (uViewport * 0.5 * 1.41421);
    col = mix(col, vec3(0.0), uVignette * clamp((length(e) - 0.55) / 0.45, 0.0, 1.0));
  }
  outColor = vec4(col, 1.0);
}`;

export type DrawParams = {
  viewport: { w: number; h: number }; // CSS px
  dpr: number;
  inv: Float32Array; // column-major 3×3
  corner: number;
  bg: [number, number, number];
  shadow: number;
  sigma: number; // device px
  focus: [number, number];
  r0: number;
  soft: number;
  radialAmount: number;
  bandDir: [number, number];
  bandStart: number;
  bandLength: number;
  cursorRect: [number, number, number, number];
  cursorAlpha: number;
  ripples: Float32Array; // 3 × vec4
  caret: [number, number, number, number];
  smear: [number, number];
  smearTaps: number;
  vignette: number;
};

export type Renderer = {
  setScreen(source: HTMLCanvasElement, texScale: number): void;
  draw(p: DrawParams): void;
  destroy(): void;
};

export function supportsWebGL2() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

export function maxTextureSize(gl: WebGL2RenderingContext) {
  return gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
}

export function createRenderer(canvas: HTMLCanvasElement, cursor: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.isContextLost() ? "WebGL context lost" : (gl.getShaderInfoLog(s) ?? "shader error"));
    }
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link error");
  gl.useProgram(program);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const loc = {
    screen: u("uScreen"), cursorTex: u("uCursorTex"), viewport: u("uViewport"), dpr: u("uDpr"), inv: u("uInv"),
    screenSize: u("uScreenSize"), texScale: u("uTexScale"), corner: u("uCorner"), bg: u("uBg"), shadow: u("uShadow"),
    sigma: u("uSigma"), focus: u("uFocus"), r0: u("uR0"), soft: u("uSoft"), radialAmount: u("uRadialAmount"),
    bandDir: u("uBandDir"), bandStart: u("uBandStart"), bandLength: u("uBandLength"), cursorRect: u("uCursorRect"), cursorAlpha: u("uCursorAlpha"),
    ripples: u("uRipples"), caret: u("uCaret"), smear: u("uSmear"), smearTaps: u("uSmearTaps"), vignette: u("uVignette"),
  };

  const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
  const makeTexture = (unit: number) => {
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (aniso) {
      gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    }
    return tex;
  };
  const screenTex = makeTexture(0);
  const cursorTex = makeTexture(1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cursor);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.uniform1i(loc.screen, 0);
  gl.uniform1i(loc.cursorTex, 1);
  gl.uniform2f(loc.screenSize, SCREEN.w, SCREEN.h);

  return {
    setScreen(source, texScale) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, screenTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.uniform1f(loc.texScale, texScale);
    },
    draw(p) {
      const w = Math.round(p.viewport.w * p.dpr), h = Math.round(p.viewport.h * p.dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(loc.viewport, p.viewport.w, p.viewport.h);
      gl.uniform1f(loc.dpr, p.dpr);
      gl.uniformMatrix3fv(loc.inv, false, p.inv);
      gl.uniform1f(loc.corner, p.corner);
      gl.uniform3f(loc.bg, ...p.bg);
      gl.uniform1f(loc.shadow, p.shadow);
      gl.uniform1f(loc.sigma, p.sigma);
      gl.uniform2f(loc.focus, ...p.focus);
      gl.uniform1f(loc.r0, p.r0);
      gl.uniform1f(loc.soft, p.soft);
      gl.uniform1f(loc.radialAmount, p.radialAmount);
      gl.uniform2f(loc.bandDir, ...p.bandDir);
      gl.uniform1f(loc.bandStart, p.bandStart);
      gl.uniform1f(loc.bandLength, p.bandLength);
      gl.uniform4f(loc.cursorRect, ...p.cursorRect);
      gl.uniform1f(loc.cursorAlpha, p.cursorAlpha);
      gl.uniform4fv(loc.ripples, p.ripples);
      gl.uniform4f(loc.caret, ...p.caret);
      gl.uniform2f(loc.smear, ...p.smear);
      gl.uniform1i(loc.smearTaps, p.smearTaps);
      gl.uniform1f(loc.vignette, p.vignette);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.deleteTexture(screenTex);
      gl.deleteTexture(cursorTex);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      // Don't lose the context: the same canvas may be set up again (React remounts in dev).
    },
  };
}

/**
 * Inverse of the camera projection (CSS px → screen-plane px), column-major for GLSL.
 * Same model as the app: rotate the screen around the focus point, pinhole camera at `distance`,
 * then place the focus at `anchor` with `scale` CSS px per screen px.
 */
export function inverseProjection(
  f: { fx: number; fy: number; zoom: number; pitch: number; yaw: number; roll: number },
  anchor: { x: number; y: number },
  scale: number,
  perspective: number,
): Float32Array {
  const rad = Math.PI / 180;
  const [cy, sy] = [Math.cos(f.yaw * rad), Math.sin(f.yaw * rad)];
  const [cx, sx] = [Math.cos(f.pitch * rad), Math.sin(f.pitch * rad)];
  const [cz, sz] = [Math.cos(-f.roll * rad), Math.sin(-f.roll * rad)];
  // R = Rz · Rx · Ry (CSS conventions: y down, z towards the viewer). Only the first two columns matter.
  const ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
  const rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
  const mul = (a: number[][], b: number[][]) => a.map((row) => [0, 1, 2].map((j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
  const r = mul(mul(rz, rx), ry);

  // Keep every corner in front of the lens.
  let d = SCREEN.w * (1.3 + (1 - perspective) * 5);
  for (const [u, v] of [[0, 0], [SCREEN.w, 0], [0, SCREEN.h], [SCREEN.w, SCREEN.h]]) {
    d = Math.max(d, (r[2][0] * (u - f.fx) + r[2][1] * (v - f.fy)) * 1.3);
  }

  const k = scale, ax = anchor.x, ay = anchor.y;
  // Forward homography for (du, dv, 1) with du = u - fx, dv = v - fy.
  const h = [
    [k * d * r[0][0] - ax * r[2][0], k * d * r[0][1] - ax * r[2][1], ax * d],
    [k * d * r[1][0] - ay * r[2][0], k * d * r[1][1] - ay * r[2][1], ay * d],
    [-r[2][0], -r[2][1], d],
  ];
  // Fold in the focus offset: H · T(-fx, -fy).
  const m = h.map((row) => [row[0], row[1], row[2] - row[0] * f.fx - row[1] * f.fy]);
  // Invert (adjugate / determinant).
  const [a, b, c] = m[0], [e, g, i] = m[1], [j, l, n] = m[2];
  const A = g * n - i * l, B = -(e * n - i * j), C = e * l - g * j;
  const det = a * A + b * B + c * C;
  const inv = [
    [A / det, -(b * n - c * l) / det, (b * i - c * g) / det],
    [B / det, (a * n - c * j) / det, -(a * i - c * e) / det],
    [C / det, -(a * l - b * j) / det, (a * g - b * e) / det],
  ];
  // Column-major.
  return new Float32Array([inv[0][0], inv[1][0], inv[2][0], inv[0][1], inv[1][1], inv[2][1], inv[0][2], inv[1][2], inv[2][2]]);
}
