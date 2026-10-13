import { useEffect, useRef, useState } from "react";
import { applyTimeEffects, Director, type Frame, type Look } from "./director";
import { FinderScreen } from "./FinderScreen";
import { SCREEN } from "./layout";
import { activityBetween, clicksBetween, LOOP, mouseAt, screenAt, type ScreenState } from "./script";

const deg = Math.PI / 180;

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

function isLight(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
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

/**
 * Glideshot's look in plain DOM + CSS: the screen is a 3D plane under a CSS perspective camera,
 * and depth of field is three stacked copies (heavy blur, light blur, sharp) where the sharper
 * copies are masked around the focus point and along the tilt, like the app's blur mask.
 * Motion blur is a Gaussian blur stretched along the camera's on-screen movement.
 */
export function TiltDemoDom({
  look,
  label,
  inset = { right: 0, bottom: 0 },
  className = "",
}: {
  look: Look;
  label: string;
  /** Space covered by an overlay; the camera centers on what's left. */
  inset?: { right: number; bottom: number };
  className?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const sharpRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ripplesRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  // Motion blur: stretch → CSS blur → squash, so a cheap round blur becomes a directional smear.
  const smearOuterRef = useRef<HTMLDivElement>(null);
  const smearBlurRef = useRef<HTMLDivElement>(null);
  const smearInnerRef = useRef<HTMLDivElement>(null);

  const lookRef = useRef(look);
  lookRef.current = look;
  const insetRef = useRef(inset);
  insetRef.current = inset;

  const [screen, setScreen] = useState<ScreenState>(() => screenAt(0));
  const [paused, setPaused] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const stage = stageRef.current!;
    let size = { w: stage.clientWidth, h: stage.clientHeight };
    const resize = new ResizeObserver(() => (size = { w: stage.clientWidth, h: stage.clientHeight }));
    resize.observe(stage);

    let onScreen = true;
    const io = new IntersectionObserver(([e]) => (onScreen = e.isIntersecting), { rootMargin: "100px" });
    io.observe(stage);

    const director = new Director();
    const anchorX = new Spring(size.w / 2), anchorY = new Spring(size.h / 2);
    let clock = 1.0;
    let prevClock = clock;
    let last = performance.now();
    let screenKey = "";
    let raf = 0;
    let prev: { x: number; y: number; zoom: number } | null = null;

    let lastKey = "";
    let lookSeen: Look | null = null;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!onScreen || size.w === 0 || document.hidden) return;
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
          // With look-ahead the camera knows what's coming; without it, it can only react.
          travelSoon: L.lookAhead ? travel(clock, clock + 0.7) : travel(clock - 0.3, clock),
          travelNearby: L.lookAhead ? travel(clock, clock + 1.6) : travel(clock - 0.6, clock),
        },
        L,
        dt,
        view,
      );
      applyTimeEffects(f, clock, ((clock % LOOP) + LOOP) % LOOP, LOOP, L);

      if (L.ripples && L.cursorVisible) {
        for (const c of clicksBetween(prevClock, clock)) spawnRipple(c.x, c.y, L.cursorScale);
      }
      prevClock = clock;

      const state = screenAt(clock);
      const key = JSON.stringify(state);
      if (key !== screenKey) {
        screenKey = key;
        setScreen(state);
      }

      // Where the focus point sits on the stage: framing, shifted away from any overlay.
      const ins = insetRef.current;
      anchorX.step(L.framingX * (size.w - ins.right), 6, dt);
      anchorY.step(L.framingY * (size.h - ins.bottom), 6, dt);

      // Nothing moved (paused, or the camera has settled)? Then don't touch the DOM at all.
      const r = (v: number) => Math.round(v * 20) / 20;
      const frameKey = [f.fx, f.fy, f.zoom * 100, f.pitch, f.yaw, f.roll, f.cursorX, f.cursorY, f.cursorAlpha * 100,
        f.focusX, f.focusY, f.blurScale * 100, anchorX.x, anchorY.x, size.w, size.h].map(r).join(",");
      if (frameKey === lastKey && L === lookSeen) {
        prev = { x: f.fx, y: f.fy, zoom: f.zoom };
        return;
      }
      lastKey = frameKey;
      lookSeen = L;
      apply(f, L, s0, view, dt);
    };

    const spawnRipple = (x: number, y: number, scale: number) => {
      const el = document.createElement("div");
      const d = 64 * scale;
      el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${d}px;height:${d}px;border-radius:50%;
        border:${3 * scale}px solid rgba(255,255,255,.9);background:rgba(0,0,0,.14);
        box-shadow:0 0 0 ${1.5 * scale}px rgba(0,0,0,.35);animation:ripple .55s cubic-bezier(.2,.7,.3,1) forwards`;
      el.addEventListener("animationend", () => el.remove());
      ripplesRef.current?.appendChild(el);
    };

    const apply = (f: Frame, L: Look, s0: number, view: { w: number; h: number }, dt: number) => {
      const k = s0 * f.zoom;
      const distance = SCREEN.w * (1.3 + (1 - L.perspective) * 5);
      const camera = cameraRef.current!;
      camera.style.perspective = `${distance * k}px`;
      // The big soft shadow only shows when the whole screen is in frame; skip painting it otherwise.
      shadowRef.current!.style.display = f.zoom < 1.25 ? "" : "none";
      camera.style.perspectiveOrigin = `${anchorX.x}px ${anchorY.x}px`;
      const plane = planeRef.current!;
      plane.style.left = `${anchorX.x}px`;
      plane.style.top = `${anchorY.x}px`;
      plane.style.transformOrigin = `${f.fx}px ${f.fy}px`;
      plane.style.transform = `translate(${-f.fx}px, ${-f.fy}px) rotateZ(${-f.roll}deg) rotateX(${f.pitch}deg) rotateY(${f.yaw}deg) scale3d(${k}, ${k}, ${k})`;

      // Motion blur: smear along the camera's on-screen movement during the shutter time.
      let smear = 0, angle = 0;
      if (L.motionBlur && prev && dt > 0) {
        const shutter = L.motionBlurAmount / 60;
        const vx = ((f.fx - prev.x) * k) / dt, vy = ((f.fy - prev.y) * k) / dt;
        const vz = (Math.abs(Math.log(f.zoom / prev.zoom)) / dt) * Math.hypot(size.w, size.h) * 0.15;
        smear = Math.min((Math.hypot(vx, vy) + vz) * shutter * 0.75, 32);
        angle = Math.atan2(vy, vx);
      }
      const outer = smearOuterRef.current!, blurEl = smearBlurRef.current!, inner = smearInnerRef.current!;
      if (smear > 1.5) {
        const c = 5; // stretch: blur along the motion is c× the blur across it
        outer.style.transform = `rotate(${angle}rad) scaleX(${c}) rotate(${-angle}rad)`;
        inner.style.transform = `rotate(${angle}rad) scaleX(${1 / c}) rotate(${-angle}rad)`;
        blurEl.style.filter = `blur(${smear / c}px)`;
      } else if (blurEl.style.filter) {
        outer.style.transform = inner.style.transform = blurEl.style.filter = "";
      }
      prev = { x: f.fx, y: f.fy, zoom: f.zoom };

      const cursor = cursorRef.current!;
      cursor.style.opacity = `${f.cursorAlpha}`;
      cursor.style.transform = `translate(${f.cursorX - 4 * L.cursorScale}px, ${f.cursorY - 3 * L.cursorScale}px) scale(${L.cursorScale})`;

      // "Blur amount" is px at 1080p output; convert to px on the screen plane for CSS blur().
      const blur = (L.blur * (Math.min(size.w, size.h) / 1080) * f.blurScale) / k;
      const dof = L.depthOfField && blur > 0.3;
      farRef.current!.style.display = dof ? "" : "none";
      midRef.current!.style.display = dof ? "" : "none";
      farRef.current!.style.filter = `blur(${blur}px)`;
      midRef.current!.style.filter = `blur(${blur * 0.4}px)`;
      if (!dof) {
        setMask(sharpRef.current!, "");
        return;
      }

      // Same idea as the app's mask: a soft circle around the focus point, intersected with
      // a band along the tilt (parts further from or nearer to the lens go soft).
      const visible = view.h / f.zoom;
      const r0 = (L.focusSize * visible) / 2;
      const soft = Math.max(6, L.softness * visible);
      const edge = 1 - L.radialAmount; // how much sharpness is left outside the focus circle
      const gx = -Math.sin(f.yaw * deg) * Math.cos(f.pitch * deg);
      const gy = Math.sin(f.pitch * deg);
      const gl = Math.hypot(gx, gy);

      const mask = (spread: number) => {
        const radial = `radial-gradient(circle at ${f.focusX}px ${f.focusY}px, #000 ${r0 * spread}px, rgba(0,0,0,${edge}) ${(r0 + soft) * spread}px)`;
        if (L.depthBlur < 0.01 || gl < 0.01) return radial;
        const ux = gx / gl, uy = gy / gl;
        const theta = Math.atan2(ux, -uy);
        const len = Math.abs(SCREEN.w * Math.sin(theta)) + Math.abs(SCREEN.h * Math.cos(theta));
        const at = (f.focusX - SCREEN.w / 2) * ux + (f.focusY - SCREEN.h / 2) * uy + len / 2;
        const half = r0 * 0.6 * spread;
        const fade = ((visible * 0.12) / (L.depthBlur * gl)) * spread;
        const band = `linear-gradient(${theta}rad, transparent ${at - half - fade}px, #000 ${at - half}px, #000 ${at + half}px, transparent ${at + half + fade}px)`;
        return `${radial}, ${band}`;
      };
      setMask(sharpRef.current!, mask(1));
      setMask(midRef.current!, mask(1.9));
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      io.disconnect();
    };
  }, []);

  const light = isLight(look.background);
  const radius = look.cornerRadius;
  const layer = "absolute inset-0 overflow-hidden";
  return (
    <div
      ref={stageRef}
      role="img"
      aria-label={label}
      className={`relative overflow-hidden ${className}`}
      style={{ background: look.background }}
    >
      <div ref={smearOuterRef} className="absolute inset-0">
      <div ref={smearBlurRef} className="absolute inset-0">
      <div ref={smearInnerRef} className="absolute inset-0">
      <div ref={cameraRef} className="absolute inset-0">
        <div ref={planeRef} className="absolute" style={{ width: SCREEN.w, height: SCREEN.h }}>
          {/* The one product shadow, cast by the screen itself. */}
          <div
            ref={shadowRef}
            className="absolute inset-0"
            style={{
              borderRadius: radius,
              boxShadow: light
                ? "0 40px 90px rgba(0,0,0,.28), 0 6px 18px rgba(0,0,0,.12)"
                : "0 40px 90px rgba(0,0,0,.6)",
            }}
          />
          <div ref={farRef} className={layer} style={{ borderRadius: radius }}>
            <FinderScreen {...screen} />
          </div>
          <div ref={midRef} className={layer} style={{ borderRadius: radius }}>
            <FinderScreen {...screen} />
          </div>
          <div ref={sharpRef} className={layer} style={{ borderRadius: radius }}>
            <FinderScreen {...screen} />
          </div>
          <div ref={ripplesRef} className="absolute inset-0" />
          <div ref={cursorRef} className="absolute top-0 left-0 origin-top-left">
            <Arrow />
          </div>
        </div>
      </div>
      </div>
      </div>
      </div>
      {look.vignette && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${
              look.vignetteStrength * (light ? 0.45 : 1.2)
            }) 100%)`,
          }}
        />
      )}
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

function setMask(el: HTMLElement, value: string) {
  const s = el.style as CSSStyleDeclaration & { webkitMaskImage: string; webkitMaskComposite: string };
  s.maskImage = value;
  s.webkitMaskImage = value;
  s.maskComposite = "intersect";
  s.webkitMaskComposite = "source-in";
}

/** macOS-style arrow cursor; hot spot at (4, 3). */
function Arrow() {
  return (
    <svg width="24" height="34" viewBox="0 0 24 34" aria-hidden style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,.35))" }}>
      <path
        d="M4 3v24.5l6.3-6.1 4 9.4 4.2-1.8-4-9.2h8.7Z"
        fill="#000"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
