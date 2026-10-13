import { useEffect, useRef, useState } from "react";
import { applyTimeEffects, Director, type Look } from "./director";
import { createRenderer, inverseProjection, supportsWebGL2, type Renderer } from "./glRenderer";
import { SCREEN } from "./layout";
import { loadAssets, paintCursor, paintScreen, type Assets, type Rect } from "./screenPainter";
import { activityBetween, clicksBetween, LOOP, mouseAt, screenAt } from "./script";
import { TiltDemoDom } from "./TiltDemoDom";

type Props = {
  look: Look;
  label: string;
  /** Space covered by an overlay; the camera centers on what's left. */
  inset?: { right: number; bottom: number };
  className?: string;
};

/** WebGL2 when available (one GPU pass per frame), the DOM version otherwise. */
export function TiltDemo(props: Props) {
  const [webgl] = useState(supportsWebGL2);
  const [failed, setFailed] = useState(false);
  return webgl && !failed ? <TiltDemoGL {...props} onFail={() => setFailed(true)} /> : <TiltDemoDom {...props} />;
}

/** Largest distance the mouse gets from where it is at `from`, over [from, to]. */
function travel(from: number, to: number) {
  const a = mouseAt(from);
  let max = 0;
  for (let t = from; t <= to + 1e-6; t += 0.1) {
    const b = mouseAt(t);
    max = Math.max(max, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return max;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function isLight(hex: string) {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

class Spring {
  v = 0;
  constructor(public x = 0) {}
  step(target: number, omega: number, dt: number) {
    const d = this.x - target;
    const e = Math.exp(-omega * dt);
    const k = (this.v + omega * d) * dt;
    this.x = target + (d + k) * e;
    this.v = (this.v - omega * k) * e;
  }
}

const RIPPLE_LIFE = 0.55;

function TiltDemoGL({ look, label, inset = { right: 0, bottom: 0 }, className = "", onFail }: Props & { onFail: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const insetRef = useRef(inset);
  insetRef.current = inset;
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;

  const [paused, setPaused] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    let renderer: Renderer | null = null;
    try {
      renderer = createRenderer(canvas, paintCursor());
    } catch (error) {
      console.warn("Glideshot demo: WebGL setup failed, using the DOM renderer.", error);
    }
    if (!renderer) {
      onFailRef.current();
      return;
    }
    const gl = renderer;
    const maxTex = (canvas.getContext("webgl2")!.getParameter(WebGL2RenderingContext.MAX_TEXTURE_SIZE) as number) || 4096;

    let size = { w: stage.clientWidth, h: stage.clientHeight };
    const resize = new ResizeObserver(() => (size = { w: stage.clientWidth, h: stage.clientHeight }));
    resize.observe(stage);
    let onScreen = true;
    const io = new IntersectionObserver(([e]) => (onScreen = e.isIntersecting), { rootMargin: "100px" });
    io.observe(stage);

    // The screen texture: repainted only when what's on the screen changes.
    const screenCanvas = document.createElement("canvas");
    let assets: Assets | null = null;
    let texScale = 0;
    let wantSince = 0;
    let paintedKey = "";
    let caret: Rect | null = null;
    let contentVersion = 0;
    loadAssets().then((a) => (assets = a));

    const director = new Director();
    const anchorX = new Spring(size.w / 2), anchorY = new Spring(size.h / 2);
    let clock = 1.0; // the first glide starts half a second in
    let prevClock = clock;
    let last = performance.now();
    let prev: { x: number; y: number } | null = null;
    let ripples: { x: number; y: number; t: number }[] = [];
    let lastDrawKey = "";
    let raf = 0;

    let forced = false;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      frame(now);
    };
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!forced && (!onScreen || size.w === 0 || document.hidden)) return;
      if (!pausedRef.current) clock += dt;

      const L = lookRef.current;
      const ahead = L.lookAhead ? L.lookAheadSeconds : 0;
      const s0 = Math.min(size.w / SCREEN.w, size.h / SCREEN.h);
      const view = { w: size.w / s0, h: size.h / s0 };
      const f = director.step(
        {
          t: clock,
          mouse: mouseAt(clock),
          aim: mouseAt(clock + ahead),
          activity: activityBetween(prevClock + ahead, clock + ahead),
          travelSoon: L.lookAhead ? travel(clock, clock + 0.7) : travel(clock - 0.3, clock),
          travelNearby: L.lookAhead ? travel(clock, clock + 1.6) : travel(clock - 0.6, clock),
        },
        L,
        dt,
        view,
      );
      const loopT = ((clock % LOOP) + LOOP) % LOOP;
      applyTimeEffects(f, clock, loopT, LOOP, L);
      for (const c of clicksBetween(prevClock, clock)) ripples.push({ x: c.x, y: c.y, t: clock });
      ripples = ripples.filter((r) => clock - r.t < RIPPLE_LIFE && clock >= r.t);
      prevClock = clock;

      // Texture resolution: enough texels for the closest zoom on this display, settled for a moment
      // before re-rendering so dragging the zoom slider doesn't repaint every frame.
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const cap = Math.min(3.5, maxTex / SCREEN.w);
      const want = Math.min(cap, Math.max(1, Math.round(dpr * s0 * L.zoom * (1 + L.activityZoom) * 4) / 4));
      if (texScale === 0 || Math.abs(want - texScale) / texScale > 0.2) {
        if (!wantSince) wantSince = now;
      } else wantSince = 0;
      const scale = texScale === 0 || (wantSince && now - wantSince > 300) ? want : texScale;

      const state = screenAt(clock);
      const key = `${JSON.stringify(state)}|${scale}|${assets ? 1 : 0}`;
      if (assets && key !== paintedKey) {
        screenCanvas.width = Math.round(SCREEN.w * scale);
        screenCanvas.height = Math.round(SCREEN.h * scale);
        caret = paintScreen(screenCanvas, scale, state, assets);
        gl.setScreen(screenCanvas, scale);
        texScale = scale;
        wantSince = 0;
        paintedKey = key;
        contentVersion++;
      }
      if (!assets || texScale === 0) return;

      // Where the focus point sits on the stage: framing, shifted away from any overlay.
      const ins = insetRef.current;
      anchorX.step(L.framingX * (size.w - ins.right), 6, dt);
      anchorY.step(L.framingY * (size.h - ins.bottom), 6, dt);

      const k = s0 * f.zoom;
      const deg = Math.PI / 180;

      // Motion blur: smear along the on-screen movement during the shutter time (CSS px).
      let smear: [number, number] = [0, 0];
      let smearTaps = 1;
      if (L.motionBlur && prev && dt > 0) {
        const shutter = L.motionBlurAmount / 60;
        const mx = ((f.fx - prev.x) * k) / dt, my = ((f.fy - prev.y) * k) / dt;
        const c = Math.cos(-f.roll * deg), s = Math.sin(-f.roll * deg);
        smear = [(c * mx - s * my) * shutter, (s * mx + c * my) * shutter];
        const len = Math.hypot(...smear);
        if (len > 1.5) smearTaps = Math.min(12, Math.ceil(len / 1.5));
        else smear = [0, 0];
      }
      prev = { x: f.fx, y: f.fy };

      // Depth of field: the app's mask (Renderer.swift focusMask), in screen-plane px.
      const visible = Math.min(view.w, view.h) / f.zoom; // screen px across the frame's short side
      const r0 = (L.focusSize * visible) / 2;
      const gx = -Math.cos(f.pitch * deg) * Math.sin(f.yaw * deg), gy = Math.sin(f.pitch * deg);
      const gl2 = Math.hypot(gx, gy);
      const band = L.depthBlur > 0.01 && gl2 > 0.01;

      const cs = L.cursorScale;
      const rippleData = new Float32Array(12);
      ripples.slice(-3).forEach((r, i) => {
        const p = (clock - r.t) / RIPPLE_LIFE;
        const eased = 1 - Math.pow(1 - p, 3);
        const on = L.ripples && L.cursorVisible;
        rippleData.set([r.x, r.y, 32 * cs * (0.2 + 0.8 * eased), on ? 0.9 * (1 - eased) : 0], i * 4);
      });
      const caretOn = caret && (state.focused || state.renaming) && Math.floor(clock * 1.9) % 2 === 0;
      const light = isLight(L.background);

      const params = {
        viewport: size,
        dpr,
        inv: inverseProjection(f, { x: anchorX.x, y: anchorY.x }, k, L.perspective),
        corner: L.cornerRadius,
        bg: rgb(L.background),
        shadow: light ? 0.28 : 0.6,
        // Disc radius ≈ 3σ of the CSS/Core Image Gaussian the Blur setting describes.
        // "Blur amount" is a Gaussian radius in px at 1080p output, scaled to this stage like the app does.
        sigma: L.depthOfField ? L.blur * (Math.min(size.w, size.h) / 1080) * dpr * f.blurScale : 0,
        focus: [f.focusX, f.focusY] as [number, number],
        r0,
        soft: Math.max(2, L.softness * visible),
        radialAmount: L.radialAmount,
        bandDir: band ? ([gx / gl2, gy / gl2] as [number, number]) : ([1, 0] as [number, number]),
        bandStart: r0 * 0.5,
        bandLength: band ? (visible * 0.12) / (L.depthBlur * gl2) : 0,
        cursorRect: [f.cursorX - 4 * cs, f.cursorY - 3 * cs, 24 * cs, 34 * cs] as [number, number, number, number],
        cursorAlpha: f.cursorAlpha,
        ripples: rippleData,
        caret: caretOn && caret ? ([caret.x, caret.y, caret.w, caret.h] as [number, number, number, number]) : ([0, 0, 0, 0] as [number, number, number, number]),
        smear,
        smearTaps,
        vignette: L.vignette ? L.vignetteStrength * (light ? 0.45 : 1.2) : 0,
      };

      // Nothing changed since the last frame (paused, or the camera has settled)? Skip the GPU work.
      const drawKey = [
        ...params.inv, params.sigma, ...params.focus, params.r0, params.soft, params.radialAmount, params.bandLength,
        ...params.cursorRect, params.cursorAlpha, ...rippleData, ...params.caret, smearTaps, params.vignette,
        params.corner, L.background, size.w, size.h, dpr, contentVersion,
      ].map((v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)).join(",");
      if (drawKey === lastDrawKey) return;
      lastDrawKey = drawKey;
      gl.draw(params);
      canvas.style.opacity = "1"; // fade in once the first frame exists
    };

    raf = requestAnimationFrame(tick);
    // Dev only: step frames by hand (e.g. while the page is hidden) to inspect the renderer, or jump to a
    // moment of the take (e.g. to grab a still for the social preview image).
    if (import.meta.env.DEV) {
      const hooks = window as unknown as { __tiltStep: (frames?: number) => void; __tiltSeek: (t: number) => void };
      hooks.__tiltStep = (frames = 1) => {
        forced = true;
        for (let i = 0; i < frames; i++) frame(last + 1000 / 60);
        forced = false;
      };
      hooks.__tiltSeek = (t) => {
        clock = prevClock = t;
        ripples = [];
      };
    }
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      io.disconnect();
      gl.destroy();
    };
  }, []);

  const light = isLight(look.background);
  return (
    <div ref={stageRef} role="img" aria-label={label} className={`relative overflow-hidden ${className}`} style={{ background: look.background }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-500" />
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Play demo" : "Pause demo"}
        className={`press absolute bottom-3 left-3 flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition-colors ${
          light ? "bg-black/[0.06] text-ink hover:bg-black/10" : "bg-white/15 text-white hover:bg-white/25"
        }`}
      >
        {paused ? (
          <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden>
            <path d="M1 1.5v13l12-6.5Z" />
          </svg>
        ) : (
          <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden>
            <rect x="1" y="1" width="4" height="14" rx="1" />
            <rect x="9" y="1" width="4" height="14" rx="1" />
          </svg>
        )}
      </button>
    </div>
  );
}
