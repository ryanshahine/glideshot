// The virtual camera operator, ported from Glideshot's Director.swift. Same settings, same defaults.
import { SCREEN } from "./layout";

export type Aspect = "auto" | "16:9" | "9:16" | "1:1" | "4:5";

export type Look = {
  // Camera
  mode: "follow" | "locked";
  lockX: number; // 0..1
  lockY: number;
  zoom: number;
  smoothing: number; // 0 = follows instantly, 0.98 = very floaty
  framingX: number; // where the focus sits in the frame
  framingY: number;
  keepInBounds: boolean;

  // Motion (camera direction)
  deadZone: boolean;
  deadZoneSize: number; // radius, fraction of the visible height
  settleOnRest: boolean;
  lookAhead: boolean;
  lookAheadSeconds: number;
  zoomOnActivity: boolean;
  activityZoom: number; // +30% = 0.3
  zoomOutOnFast: boolean;
  pullBackWhenIdle: boolean;
  idleSeconds: number;
  drift: boolean;
  driftAmount: number;
  intro: boolean;
  introDuration: number;
  outro: boolean;
  outroDuration: number;

  // Angle
  pitch: number; // + tilts the top away
  yaw: number; // + tilts the right side away
  roll: number; // + rotates counter-clockwise
  perspective: number; // 0..1

  // Lens
  depthOfField: boolean;
  focusFollowsCursor: boolean;
  blur: number; // Gaussian radius in output px at 1080p, like the app's "Blur amount"
  focusSize: number; // sharp diameter, fraction of the visible height
  softness: number;
  radialAmount: number;
  depthBlur: number; // extra blur from the tilt
  motionBlur: boolean;
  motionBlurAmount: number; // shutter, fraction of a frame (0.5 = 180°)

  // Cursor
  cursorVisible: boolean;
  cursorScale: number;
  cursorSmoothing: boolean;
  ripples: boolean;
  hideIdleCursor: boolean;
  cursorIdleSeconds: number;

  // Look
  cornerRadius: number;
  vignette: boolean;
  vignetteStrength: number;
  background: string;
  aspect: Aspect;
};

export const DEFAULT_LOOK: Look = {
  mode: "follow",
  lockX: 0.42,
  lockY: 0.3,
  zoom: 2.4,
  smoothing: 0.2,
  framingX: 0.5,
  framingY: 0.5,
  keepInBounds: true,

  deadZone: true,
  deadZoneSize: 0.15,
  settleOnRest: true,
  lookAhead: true,
  lookAheadSeconds: 0.3,
  zoomOnActivity: true,
  activityZoom: 0.3,
  zoomOutOnFast: true,
  pullBackWhenIdle: false,
  idleSeconds: 5,
  drift: false,
  driftAmount: 0.5,
  intro: false,
  introDuration: 1.5,
  outro: false,
  outroDuration: 1.5,

  pitch: 22,
  yaw: 16,
  roll: -7,
  perspective: 0.7,

  depthOfField: true,
  focusFollowsCursor: true,
  blur: 16,
  focusSize: 0.3,
  softness: 0.35,
  radialAmount: 0.85,
  depthBlur: 0.6,
  motionBlur: true,
  motionBlurAmount: 0.5,

  cursorVisible: true,
  cursorScale: 1.2,
  cursorSmoothing: true,
  ripples: true,
  hideIdleCursor: false,
  cursorIdleSeconds: 3,

  cornerRadius: 22,
  vignette: true,
  vignetteStrength: 0.35,
  background: "#f5f5f7",
  aspect: "auto",
};

/** The app's presets. Applying one sets the lens and look, and keeps camera behaviour and cursor options. */
export const PRESETS: { name: string; look: Partial<Look> }[] = [
  {
    name: "Cinematic",
    look: { zoom: 2.4, smoothing: 0.2, pitch: 22, yaw: 16, roll: -7, perspective: 0.7, depthOfField: true, blur: 16, focusSize: 0.3, softness: 0.35, radialAmount: 0.85, depthBlur: 0.6, vignette: true, vignetteStrength: 0.35 },
  },
  {
    name: "Subtle",
    look: { zoom: 1.7, pitch: 9, yaw: 7, roll: -2, perspective: 0.7, depthOfField: true, blur: 10, focusSize: 0.45, softness: 0.35, radialAmount: 0.85, depthBlur: 0.35, vignette: true, vignetteStrength: 0.2 },
  },
  {
    name: "Dramatic",
    look: { zoom: 2.9, pitch: 30, yaw: 22, roll: -10, perspective: 0.85, depthOfField: true, blur: 20, focusSize: 0.28, softness: 0.4, radialAmount: 0.85, depthBlur: 0.65, vignette: true, vignetteStrength: 0.45 },
  },
  {
    name: "Flat",
    look: { zoom: 2, pitch: 0, yaw: 0, roll: 0, perspective: 0.7, depthOfField: false, blur: 16, focusSize: 0.3, softness: 0.35, radialAmount: 0.85, depthBlur: 0.6, vignette: false, vignetteStrength: 0.35 },
  },
  {
    name: "Overview",
    look: { zoom: 0.85, pitch: 16, yaw: -18, roll: 4, perspective: 0.7, depthOfField: true, blur: 12, focusSize: 0.5, softness: 0.35, radialAmount: 0.5, depthBlur: 0.5, vignette: true, vignetteStrength: 0.35 },
  },
];

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
  snap(x: number) {
    this.x = x;
    this.v = 0;
  }
}

export type Frame = {
  fx: number;
  fy: number;
  zoom: number;
  pitch: number;
  yaw: number;
  roll: number;
  cursorX: number;
  cursorY: number;
  cursorAlpha: number;
  focusX: number; // depth-of-field center
  focusY: number;
  blurScale: number; // intro/outro fade the blur in and out
};

export type DirectorInput = {
  t: number;
  mouse: { x: number; y: number };
  aim: { x: number; y: number };
  activity: boolean;
  /** How far the mouse is about to travel (or just travelled, without look-ahead), in screen px. */
  travelSoon: number;
  /** How far it moves over a longer window around now: small means it stays put. */
  travelNearby: number;
};

type ZoomMode = "base" | "close" | "wide" | "idle";

export class Director {
  private fx = new Spring();
  private fy = new Spring();
  private logZoom = new Spring(0); // zoom eases in log space, so in and out feel the same
  private pitch = new Spring();
  private yaw = new Spring();
  private roll = new Spring();
  private cx = new Spring();
  private cy = new Spring();
  private dx = new Spring();
  private dy = new Spring();
  private target = { x: 0, y: 0 };
  private lastAim = { x: 0, y: 0 };
  private lastMouse = { x: 0, y: 0 };
  private speed = 0;
  private rest = 0;
  private lastActivity = -Infinity;
  private lastMove = -Infinity;
  private lastCursorMove = -Infinity;
  private cursorAlpha = 1;
  private zoomMode: ZoomMode = "base";
  private zoomSince = -Infinity;
  private ready = false;

  /** `view` = screen pixels visible across the stage at zoom 1. */
  step(input: DirectorInput, look: Look, dt: number, view: { w: number; h: number }): Frame {
    const { t, mouse } = input;
    const aim =
      look.mode === "locked" ? { x: look.lockX * SCREEN.w, y: look.lockY * SCREEN.h } : input.aim;

    if (!this.ready) {
      this.ready = true;
      this.target = { ...aim };
      this.lastAim = { ...aim };
      this.lastMouse = { ...mouse };
      this.fx.snap(aim.x);
      this.fy.snap(aim.y);
      this.logZoom.snap(Math.log(look.zoom));
      this.pitch.snap(look.pitch);
      this.yaw.snap(look.yaw);
      this.roll.snap(look.roll);
      this.cx.snap(mouse.x);
      this.cy.snap(mouse.y);
      this.dx.snap(aim.x);
      this.dy.snap(aim.y);
      this.zoomSince = t;
      this.lastMove = t;
      this.lastCursorMove = t;
    }

    const visible = view.h / look.zoom;
    const moved = Math.hypot(aim.x - this.lastAim.x, aim.y - this.lastAim.y);
    this.speed += (moved / Math.max(dt, 1e-3) - this.speed) * Math.min(1, dt * 8);
    this.lastAim = { ...aim };
    if (moved > visible * 0.002) this.lastMove = t;
    if (input.activity) this.lastActivity = t;
    if (Math.hypot(mouse.x - this.lastMouse.x, mouse.y - this.lastMouse.y) > 0.5) this.lastCursorMove = t;
    this.lastMouse = { ...mouse };

    // Dead zone: small moves don't move the camera; leaving the zone drags it along.
    if (look.mode === "follow" && look.deadZone) {
      const r = look.deadZoneSize * visible;
      const ddx = aim.x - this.target.x, ddy = aim.y - this.target.y, d = Math.hypot(ddx, ddy);
      if (d > r) {
        this.target.x += ddx * (1 - r / d);
        this.target.y += ddy * (1 - r / d);
      }
      this.rest = this.speed < visible * 0.05 ? this.rest + dt : 0;
      // Settle onto the resting mouse with a glide (not a jump, even when smoothing is off).
      if (look.settleOnRest && this.rest > 0.45) {
        const k = Math.min(1, dt * 4);
        this.target = { x: this.target.x + (aim.x - this.target.x) * k, y: this.target.y + (aim.y - this.target.y) * k };
      }
    } else {
      this.target = { ...aim };
    }

    // Auto zoom with intent: pull back for big moves (before they start, with look-ahead), push in
    // for clicks/typing only when the cursor is going to stay there, and hold each choice a moment.
    const frameW = view.w / look.zoom;
    if (input.travelSoon > 0.4 * frameW) this.lastActivity = -Infinity; // clicks only count where they happened
    const wantWide = look.zoomOutOnFast && input.travelSoon > 0.75 * frameW;
    const stillWide = this.zoomMode === "wide" && input.travelNearby > 0.35 * frameW;
    const wantClose =
      look.zoomOnActivity && t - this.lastActivity < 2.5 && input.travelNearby < 0.15 * frameW;
    const idle = look.pullBackWhenIdle && t - Math.max(this.lastMove, this.lastActivity) > look.idleSeconds;
    // Once in close-up, stay there while the work continues nearby (no zooming out between clicks).
    const stillClose =
      this.zoomMode === "close" && t - this.lastActivity < 3 && input.travelSoon < 0.4 * frameW;
    const desired: ZoomMode =
      wantWide || stillWide ? "wide" : wantClose || stillClose ? "close" : idle ? "idle" : "base";
    const minHold = this.zoomMode === "close" ? 2.5 : 1.2; // hold each choice; no ping-pong
    if (desired !== this.zoomMode && t - this.zoomSince >= minHold) {
      this.zoomMode = desired;
      this.zoomSince = t;
    }
    const factor = { base: 1, close: 1 + look.activityZoom, wide: 0.75, idle: 0.7 }[this.zoomMode];
    const z = look.zoom * factor;

    let gx = this.target.x, gy = this.target.y;
    if (look.keepInBounds) {
      const clamp = (p: number, len: number, vis: number, frac: number) => {
        const lo = frac * vis, hi = len - (1 - frac) * vis;
        return lo > hi ? len / 2 + (frac - 0.5) * vis : Math.min(Math.max(p, lo), hi);
      };
      gx = clamp(gx, SCREEN.w, view.w / z, look.framingX);
      gy = clamp(gy, SCREEN.h, view.h / z, look.framingY);
    }

    // Smoothing 0 = the camera locks onto its target instantly.
    if (look.smoothing < 0.01) {
      this.fx.snap(gx);
      this.fy.snap(gy);
    } else {
      const omega = 2 + (1 - Math.min(look.smoothing, 0.98) / 0.98) * 18;
      this.fx.step(gx, omega, dt);
      this.fy.step(gy, omega, dt);
    }
    this.logZoom.step(Math.log(z), 1.4, dt); // slow, deliberate zooms (≈3 s)
    this.pitch.step(look.pitch, 4, dt);
    this.yaw.step(look.yaw, 4, dt);
    this.roll.step(look.roll, 4, dt);

    if (look.cursorSmoothing) {
      this.cx.step(mouse.x, 28, dt);
      this.cy.step(mouse.y, 28, dt);
    } else {
      this.cx.snap(mouse.x);
      this.cy.snap(mouse.y);
    }
    const hidden = look.hideIdleCursor && t - this.lastCursorMove > look.cursorIdleSeconds;
    const alphaTarget = look.cursorVisible && !hidden ? 1 : 0;
    const rate = alphaTarget > this.cursorAlpha ? 14 : 4;
    this.cursorAlpha += (alphaTarget - this.cursorAlpha) * Math.min(1, dt * rate);

    // Depth-of-field center: pulled to the cursor while it's visible, else the frame center.
    const pull = look.focusFollowsCursor ? this.cursorAlpha : 0;
    this.dx.step(this.fx.x + (mouse.x - this.fx.x) * pull, 7, dt);
    this.dy.step(this.fy.x + (mouse.y - this.fy.x) * pull, 7, dt);

    return {
      fx: this.fx.x,
      fy: this.fy.x,
      zoom: Math.exp(this.logZoom.x),
      pitch: this.pitch.x,
      yaw: this.yaw.x,
      roll: this.roll.x,
      cursorX: this.cx.x,
      cursorY: this.cy.x,
      cursorAlpha: look.cursorVisible ? this.cursorAlpha : 0,
      focusX: this.dx.x,
      focusY: this.dy.x,
      blurScale: 1,
    };
  }
}

/** Handheld drift, plus intro/outro (ease in from / out to the flat full screen) over each loop. */
export function applyTimeEffects(f: Frame, t: number, loopT: number, loop: number, look: Look) {
  if (look.drift) {
    const a = look.driftAmount, tau = Math.PI * 2;
    f.pitch += a * 1.4 * (0.6 * Math.sin(t * 0.31 * tau) + 0.4 * Math.sin(t * 0.77 * tau + 1.3));
    f.yaw += a * 1.4 * (0.6 * Math.sin(t * 0.23 * tau + 0.7) + 0.4 * Math.sin(t * 0.61 * tau + 2.1));
    f.roll += a * 0.7 * Math.sin(t * 0.19 * tau + 0.4);
    const wobble = (a * SCREEN.w * 0.0025) / Math.max(f.zoom, 0.5);
    f.fx += wobble * Math.sin(t * 0.37 * tau + 0.9);
    f.fy += wobble * Math.sin(t * 0.43 * tau + 1.7);
  }
  const smooth = (x: number) => {
    const c = Math.min(Math.max(x, 0), 1);
    return c * c * (3 - 2 * c);
  };
  let e = 1;
  if (look.intro && look.introDuration > 0) e = Math.min(e, smooth(loopT / look.introDuration));
  if (look.outro && look.outroDuration > 0) e = Math.min(e, smooth((loop - loopT) / look.outroDuration));
  if (e >= 1) return;
  const cx = SCREEN.w / 2, cy = SCREEN.h / 2;
  f.fx = cx + (f.fx - cx) * e;
  f.fy = cy + (f.fy - cy) * e;
  f.focusX = cx + (f.focusX - cx) * e;
  f.focusY = cy + (f.focusY - cy) * e;
  f.zoom = 1 + (f.zoom - 1) * e;
  f.pitch *= e;
  f.yaw *= e;
  f.roll *= e;
  f.blurScale *= e;
}
