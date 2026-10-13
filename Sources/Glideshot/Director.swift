import CoreGraphics
import Foundation

struct Ripple {
    var point: CGPoint  // source pixels
    var age: Double     // seconds since the click
    static let lifetime = 0.55
}

/// Everything the renderer needs for one frame besides the screen image.
struct FrameState {
    var camera = CameraState()
    var cursor = CGPoint.zero  // source pixels
    var cursorID = 0
    var cursorAlpha = 1.0
    var focusPoint = CGPoint.zero  // center of the depth of field, source pixels
    var ripples: [Ripple] = []

    func lerp(to b: FrameState, _ f: Double) -> FrameState {
        func mix(_ x: Double, _ y: Double) -> Double { x + (y - x) * f }
        var r = self
        r.camera.focus = CGPoint(x: mix(camera.focus.x, b.camera.focus.x), y: mix(camera.focus.y, b.camera.focus.y))
        r.camera.zoom = mix(camera.zoom, b.camera.zoom)
        r.camera.pitch = mix(camera.pitch, b.camera.pitch)
        r.camera.yaw = mix(camera.yaw, b.camera.yaw)
        r.camera.roll = mix(camera.roll, b.camera.roll)
        r.camera.blurScale = mix(camera.blurScale, b.camera.blurScale)
        r.cursor = CGPoint(x: mix(cursor.x, b.cursor.x), y: mix(cursor.y, b.cursor.y))
        r.cursorAlpha = mix(cursorAlpha, b.cursorAlpha)
        r.focusPoint = CGPoint(x: mix(focusPoint.x, b.focusPoint.x), y: mix(focusPoint.y, b.focusPoint.y))
        return r
    }
}

struct DirectorInput {
    var time: Double
    var mouse: CGPoint      // source pixels, now (drives the cursor)
    var onScreen: Bool
    var aim: CGPoint        // source pixels, where the camera wants to look (look-ahead applied)
    var aimOnScreen: Bool
    var buttonDown: Bool
    var activity: Bool      // a click or key press happened (at the aim time)
    var travelSoon: Double  // how far the mouse is about to travel (look-ahead) or just travelled (live), source px
    var travelNearby: Double // travel over a longer window around now; small = the cursor stays put
    var cursorID: Int
    var ripples: [Ripple]
}

/// Critically damped spring, solved exactly so any frame time is stable.
struct Spring {
    var x: Double
    var v = 0.0

    mutating func step(to target: Double, omega: Double, dt: Double) {
        let d = x - target
        let e = exp(-omega * dt)
        let k = (v + omega * d) * dt
        x = target + (d + k) * e
        v = (v - omega * k) * e
    }

    mutating func snap(_ value: Double) {
        x = value
        v = 0
    }
}

/// The virtual camera operator: dead zone, settling, auto zoom and smoothing.
/// Used live (stepped in real time) and offline (stepped over a recorded track).
struct Director {
    let sourceSize: CGSize
    let outputSize: CGSize

    private enum ZoomMode { case base, close, wide, idle }

    private var fx = Spring(x: 0), fy = Spring(x: 0)
    private var logZoom = Spring(x: 0)  // zoom eases in log space, so in and out feel the same
    private var zoomMode = ZoomMode.base
    private var zoomSince = -Double.infinity
    private var pitch = Spring(x: 0), yaw = Spring(x: 0), roll = Spring(x: 0)
    private var cx = Spring(x: 0), cy = Spring(x: 0)
    private var dx = Spring(x: 0), dy = Spring(x: 0)
    private var target = CGPoint.zero
    private var heldAim: CGPoint?
    private var lastAim = CGPoint.zero
    private var lastMouse = CGPoint.zero
    private var speed = 0.0
    private var restTime = 0.0
    private var lastActivity = -Double.infinity
    private var lastMove = -Double.infinity
    private var lastCursorMove = -Double.infinity
    private var cursorAlpha = 1.0
    private var ready = false

    init(sourceSize: CGSize, outputSize: CGSize) {
        self.sourceSize = sourceSize
        self.outputSize = outputSize
    }

    mutating func step(_ input: DirectorInput, settings s: EffectSettings, dt: Double) -> FrameState {
        let w = sourceSize.width, h = sourceSize.height, t = input.time
        let fit = min(outputSize.width / w, outputSize.height / h)

        // Where to look. Off-display mouse: hold the last on-screen point.
        let aim: CGPoint
        if s.mode == .locked {
            aim = CGPoint(x: s.lockedX * w, y: (1 - s.lockedY) * h)
        } else {
            if input.aimOnScreen || heldAim == nil { heldAim = input.aim }
            aim = heldAim!
        }

        if !ready {
            ready = true
            target = aim
            lastAim = aim
            lastMouse = input.mouse
            fx.snap(aim.x); fy.snap(aim.y); logZoom.snap(log(s.zoom))
            zoomSince = t
            pitch.snap(s.pitch); yaw.snap(s.yaw); roll.snap(s.roll)
            cx.snap(input.mouse.x); cy.snap(input.mouse.y)
            dx.snap(aim.x); dy.snap(aim.y)
            cursorAlpha = input.onScreen ? 1 : 0
            lastMove = t
            lastCursorMove = t
        }

        // Motion analysis in "frames widths per second" so it's resolution independent.
        let visible = min(outputSize.width, outputSize.height) / (fit * s.zoom)
        let moved = hypot(aim.x - lastAim.x, aim.y - lastAim.y)
        speed += (moved / max(dt, 1e-3) - speed) * min(1, dt * 8)
        lastAim = aim
        if moved > visible * 0.002 { lastMove = t }
        if input.activity { lastActivity = t }
        if hypot(input.mouse.x - lastMouse.x, input.mouse.y - lastMouse.y) > 0.5 { lastCursorMove = t }
        lastMouse = input.mouse

        // Dead zone: small movements don't move the camera; leaving the zone drags it along.
        if s.mode == .follow && s.deadZoneEnabled {
            let r = s.deadZoneSize * visible
            let dx = aim.x - target.x, dy = aim.y - target.y, d = hypot(dx, dy)
            if d > r {
                target.x += dx * (1 - r / d)
                target.y += dy * (1 - r / d)
            }
            restTime = speed < visible * 0.05 ? restTime + dt : 0
            // Settle onto the resting mouse with a glide (not a jump, even when smoothing is off).
            if s.settleOnRest && restTime > 0.45 {
                let k = min(1, dt * 4)
                target = CGPoint(x: target.x + (aim.x - target.x) * k, y: target.y + (aim.y - target.y) * k)
            }
        } else {
            target = aim
        }

        // Automatic zoom with intent: pull back for big moves (before they start, with look-ahead),
        // push in for clicks/typing only when the cursor is going to stay there, and hold each choice.
        let frameW = outputSize.width / (fit * s.zoom)
        if input.travelSoon > 0.4 * frameW { lastActivity = -.infinity }  // clicks only count where they happened
        let wantWide = s.zoomOutOnFastMove && input.travelSoon > 0.75 * frameW
        let stillWide = zoomMode == .wide && input.travelNearby > 0.35 * frameW
        let wantClose = s.zoomOnActivity && t - lastActivity < 2.5 && input.travelNearby < 0.15 * frameW
        let idleLong = s.pullBackWhenIdle && t - max(lastMove, lastActivity) > s.idleSeconds
        // Once in close-up, stay there while the work continues nearby (no zooming out between clicks).
        let stillClose = zoomMode == .close && t - lastActivity < 3 && input.travelSoon < 0.4 * frameW
        let desired: ZoomMode = wantWide || stillWide ? .wide : (wantClose || stillClose) ? .close : idleLong ? .idle : .base
        let minHold = zoomMode == .close ? 2.5 : 1.2  // hold each choice; no ping-pong
        if desired != zoomMode && t - zoomSince >= minHold {
            zoomMode = desired
            zoomSince = t
        }
        let factor: Double
        switch zoomMode {
        case .base: factor = 1
        case .close: factor = 1 + s.activityZoom
        case .wide: factor = 0.75
        case .idle: factor = 0.7
        }
        let z = s.zoom * factor

        var goal = target
        if s.keepInBounds {
            let scale = fit * z
            goal.x = clampAxis(goal.x, length: w, visible: outputSize.width / scale, frac: s.framingX)
            goal.y = clampAxis(goal.y, length: h, visible: outputSize.height / scale, frac: 1 - s.framingY)
        }

        if s.smoothing < 0.01 {
            // Smoothing off: the camera locks onto its target instantly.
            fx.snap(goal.x)
            fy.snap(goal.y)
        } else {
            let focusOmega = 2 + (1 - min(max(s.smoothing, 0), 0.98) / 0.98) * 18
            fx.step(to: goal.x, omega: focusOmega, dt: dt)
            fy.step(to: goal.y, omega: focusOmega, dt: dt)
        }
        logZoom.step(to: log(z), omega: 1.4, dt: dt)  // slow, deliberate zooms (≈3 s)
        pitch.step(to: s.pitch, omega: 4, dt: dt)
        yaw.step(to: s.yaw, omega: 4, dt: dt)
        roll.step(to: s.roll, omega: 4, dt: dt)

        // Cursor: light smoothing, fades out when idle or off-screen.
        if s.cursorSmoothing {
            cx.step(to: input.mouse.x, omega: 28, dt: dt)
            cy.step(to: input.mouse.y, omega: 28, dt: dt)
        } else {
            cx.snap(input.mouse.x)
            cy.snap(input.mouse.y)
        }
        let idle = s.hideIdleCursor && !input.buttonDown && t - lastCursorMove > s.cursorIdleSeconds
        let alphaTarget = (s.cursorVisible && input.onScreen && !idle) ? 1.0 : 0.0
        let rate = alphaTarget > cursorAlpha ? 14.0 : 4.0
        cursorAlpha += (alphaTarget - cursorAlpha) * min(1, dt * rate)

        // Depth-of-field center: pulled to the cursor while it's visible, else the frame center.
        let pull = s.focusFollowsCursor ? cursorAlpha : 0
        dx.step(to: fx.x + (input.mouse.x - fx.x) * pull, omega: 7, dt: dt)
        dy.step(to: fy.x + (input.mouse.y - fy.x) * pull, omega: 7, dt: dt)

        return FrameState(
            camera: CameraState(focus: CGPoint(x: fx.x, y: fy.x), zoom: exp(logZoom.x), pitch: pitch.x, yaw: yaw.x, roll: roll.x),
            cursor: CGPoint(x: cx.x, y: cy.x),
            cursorID: input.cursorID,
            cursorAlpha: s.cursorVisible ? cursorAlpha : 0,
            focusPoint: CGPoint(x: dx.x, y: dy.x),
            ripples: s.clickRipples && s.cursorVisible ? input.ripples : [])
    }

    /// Keeps the visible window [p - frac*visible, p + (1-frac)*visible] inside [0, length].
    private func clampAxis(_ p: Double, length: Double, visible: Double, frac: Double) -> Double {
        let lo = frac * visible, hi = length - (1 - frac) * visible
        if lo > hi { return length / 2 + (frac - 0.5) * visible }
        return min(max(p, lo), hi)
    }
}

enum TimeEffects {
    /// Handheld drift plus intro/outro (ease in from / out to the flat full screen). `duration` nil = live.
    static func apply(_ f: inout FrameState, t: Double, duration: Double?, settings s: EffectSettings, sourceSize: CGSize) {
        if s.driftEnabled {
            let a = s.driftAmount, tau = 2 * Double.pi
            f.camera.pitch += a * 1.4 * (0.6 * sin(t * 0.31 * tau) + 0.4 * sin(t * 0.77 * tau + 1.3))
            f.camera.yaw += a * 1.4 * (0.6 * sin(t * 0.23 * tau + 0.7) + 0.4 * sin(t * 0.61 * tau + 2.1))
            f.camera.roll += a * 0.7 * sin(t * 0.19 * tau + 0.4)
            let wobble = a * sourceSize.width * 0.0025 / max(f.camera.zoom, 0.5)
            f.camera.focus.x += wobble * sin(t * 0.37 * tau + 0.9)
            f.camera.focus.y += wobble * sin(t * 0.43 * tau + 1.7)
        }
        guard let duration else { return }
        var e = 1.0
        if s.introEnabled && s.introDuration > 0 { e = min(e, smoothstep(t / s.introDuration)) }
        if s.outroEnabled && s.outroDuration > 0 { e = min(e, smoothstep((duration - t) / s.outroDuration)) }
        guard e < 1 else { return }
        let center = CGPoint(x: sourceSize.width / 2, y: sourceSize.height / 2)
        f.camera.focus = CGPoint(x: center.x + (f.camera.focus.x - center.x) * e,
                                 y: center.y + (f.camera.focus.y - center.y) * e)
        f.focusPoint = CGPoint(x: center.x + (f.focusPoint.x - center.x) * e,
                               y: center.y + (f.focusPoint.y - center.y) * e)
        f.camera.zoom = 1 + (f.camera.zoom - 1) * e
        f.camera.pitch *= e
        f.camera.yaw *= e
        f.camera.roll *= e
        f.camera.blurScale *= e
    }

    private static func smoothstep(_ x: Double) -> Double {
        let c = min(max(x, 0), 1)
        return c * c * (3 - 2 * c)
    }
}

/// The camera for a whole take, simulated once at 60 Hz and sampled at any time.
struct CameraPath {
    static let rate = 60.0

    let track: Track
    let settings: EffectSettings
    let sourceSize: CGSize
    let outputSize: CGSize
    private var states: [FrameState] = []

    init(track: Track, settings s: EffectSettings, sourceSize: CGSize, outputSize: CGSize) {
        self.track = track
        self.settings = s
        self.sourceSize = sourceSize
        self.outputSize = outputSize

        var director = Director(sourceSize: sourceSize, outputSize: outputSize)
        let ahead = s.lookAheadEnabled ? s.lookAhead : 0
        let dt = 1 / CameraPath.rate
        let count = Int((track.duration * CameraPath.rate).rounded(.up)) + 2
        states.reserveCapacity(count)
        for i in 0..<count {
            let t = Double(i) * dt
            let now = track.sample(at: t)
            let future = track.sample(at: t + ahead)
            // With look-ahead the camera knows what's coming; without it, it can only react.
            let soon = ahead > 0 ? CameraPath.travel(track, from: t, to: t + 0.7, sourceSize)
                                 : CameraPath.travel(track, from: t - 0.3, to: t, sourceSize)
            let nearby = ahead > 0 ? CameraPath.travel(track, from: t, to: t + 1.6, sourceSize)
                                   : CameraPath.travel(track, from: t - 0.6, to: t, sourceSize)
            let input = DirectorInput(
                time: t,
                mouse: CameraPath.point(now, sourceSize),
                onScreen: now.on,
                aim: CameraPath.point(future, sourceSize),
                aimOnScreen: future.on,
                buttonDown: now.down,
                activity: track.hasActivity(after: t + ahead - dt, upTo: t + ahead),
                travelSoon: soon,
                travelNearby: nearby,
                cursorID: now.c,
                ripples: [])
            states.append(director.step(input, settings: s, dt: dt))
        }
    }

    func state(at t: Double) -> FrameState {
        guard !states.isEmpty else { return FrameState() }
        let x = max(0, t) * CameraPath.rate
        let i = min(Int(x), states.count - 1)
        let j = min(i + 1, states.count - 1)
        var f = states[i].lerp(to: states[j], x - Double(i))
        if settings.clickRipples && settings.cursorVisible {
            f.ripples = track.clicks(after: t - Ripple.lifetime, upTo: t).map {
                Ripple(point: CameraPath.point(x: $0.x, y: $0.y, sourceSize), age: t - $0.t)
            }
        }
        TimeEffects.apply(&f, t: t, duration: track.duration, settings: settings, sourceSize: sourceSize)
        return f
    }

    /// Frame states spread over the shutter interval. More samples only when the camera actually moves.
    func motionSamples(at t: Double, fps: Double, maxSamples: Int) -> [FrameState] {
        let center = state(at: t)
        guard settings.motionBlurEnabled, maxSamples > 1 else { return [center] }
        let shutter = settings.motionBlurAmount / fps
        let a = state(at: t - shutter / 2), b = state(at: t + shutter / 2)
        let scale = min(outputSize.width / sourceSize.width, outputSize.height / sourceSize.height) * center.camera.zoom
        let diag = hypot(outputSize.width, outputSize.height)
        let pan = hypot(b.camera.focus.x - a.camera.focus.x, b.camera.focus.y - a.camera.focus.y) * scale
        let zoom = abs(log(max(b.camera.zoom, 0.01) / max(a.camera.zoom, 0.01))) * diag * 0.5
        let turn = (abs(b.camera.pitch - a.camera.pitch) + abs(b.camera.yaw - a.camera.yaw)
                    + abs(b.camera.roll - a.camera.roll)) * diag * 0.01
        let pixels = pan + zoom + turn
        let n = min(maxSamples, Int(pixels / 3) + 1)
        guard n > 1 else { return [center] }
        return (0..<n).map { k in state(at: t + shutter * (Double(k) / Double(n - 1) - 0.5)) }
    }

    /// Largest distance (source px) the mouse gets from where it is at `from`, over [from, to].
    static func travel(_ track: Track, from: Double, to: Double, _ size: CGSize) -> Double {
        let a = point(track.sample(at: from), size)
        var maxDistance = 0.0
        var t = from
        while t <= to + 1e-6 {
            let b = point(track.sample(at: t), size)
            maxDistance = max(maxDistance, hypot(b.x - a.x, b.y - a.y))
            t += 0.1
        }
        return maxDistance
    }

    static func point(_ s: Track.Sample, _ size: CGSize) -> CGPoint {
        point(x: s.x, y: s.y, size)
    }

    static func point(x: Double, y: Double, _ size: CGSize) -> CGPoint {
        CGPoint(x: x * size.width, y: (1 - y) * size.height)
    }
}
