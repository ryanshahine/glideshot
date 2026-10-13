import Foundation
import CoreGraphics

struct RGB: Codable, Equatable {
    var r: Double, g: Double, b: Double
}

/// Everything that shapes the look of the shot. Angles in degrees.
struct EffectSettings: Codable, Equatable {
    enum Mode: String, Codable, CaseIterable, Identifiable {
        case follow = "Follow mouse"
        case locked = "Locked"
        var id: String { rawValue }
    }

    // Camera target
    var mode: Mode = .follow
    var lockedX = 0.5          // 0 = left edge of screen, 1 = right
    var lockedY = 0.5          // 0 = top edge of screen, 1 = bottom
    var framingX = 0.5         // where the focus point sits in the output frame
    var framingY = 0.5
    var keepInBounds = true    // don't pan past the screen edges
    var smoothing = 0.2        // 0 = follows instantly, 0.98 = very floaty

    // Camera direction
    var deadZoneEnabled = true
    var deadZoneSize = 0.15    // radius, fraction of the frame's short side
    var settleOnRest = true    // re-center on the mouse once it stops moving
    var lookAheadEnabled = true
    var lookAhead = 0.3        // seconds the camera anticipates the mouse (editor/export)
    var zoomOnActivity = true
    var activityZoom = 0.3     // +30% zoom while clicking/typing
    var zoomOutOnFastMove = true
    var pullBackWhenIdle = false
    var idleSeconds = 5.0
    var driftEnabled = false
    var driftAmount = 0.5
    var introEnabled = false
    var introDuration = 1.5
    var outroEnabled = false
    var outroDuration = 1.5

    // Lens
    var zoom = 2.4
    var pitch = 22.0           // + tilts the top of the screen away
    var yaw = 16.0             // + tilts the right side away
    var roll = -7.0            // + rotates counter-clockwise
    var perspective = 0.7      // 0 = flat/orthographic, 1 = strong wide-angle

    // Depth of field
    var depthOfFieldEnabled = true
    var focusFollowsCursor = true  // the sharp spot tracks the cursor instead of the frame center
    var blurRadius = 16.0      // max blur in px at 1080p
    var focusSize = 0.3        // sharp area diameter, fraction of the frame's short side
    var focusSoftness = 0.35   // falloff width, fraction of the frame's short side
    var radialAmount = 0.85    // blur strength away from the focus circle
    var depthBlur = 0.6        // extra blur from the tilt (parts further from the lens)

    // Motion blur (editor/export)
    var motionBlurEnabled = true
    var motionBlurAmount = 0.5 // shutter as a fraction of the frame time (0.5 = 180°)

    // Cursor
    var cursorVisible = true
    var cursorScale = 1.6
    var cursorSmoothing = true
    var clickRipples = true
    var hideIdleCursor = false
    var cursorIdleSeconds = 3.0

    // Look
    var cornerRadius = 28.0    // screen corner rounding, source pixels
    var vignetteEnabled = true
    var vignette = 0.35
    var background = RGB(r: 0.02, g: 0.02, b: 0.03)

    /// Takes the lens/blur/look of a preset but keeps camera behaviour and cursor options.
    mutating func applyLook(from p: EffectSettings) {
        zoom = p.zoom; pitch = p.pitch; yaw = p.yaw; roll = p.roll; perspective = p.perspective
        depthOfFieldEnabled = p.depthOfFieldEnabled; blurRadius = p.blurRadius; focusSize = p.focusSize
        focusSoftness = p.focusSoftness; radialAmount = p.radialAmount; depthBlur = p.depthBlur
        vignetteEnabled = p.vignetteEnabled; vignette = p.vignette
    }

    static let presets: [(name: String, settings: EffectSettings)] = [
        ("Cinematic tilt", EffectSettings()),
        ("Subtle", {
            var s = EffectSettings()
            s.zoom = 1.7; s.pitch = 9; s.yaw = 7; s.roll = -2
            s.blurRadius = 10; s.focusSize = 0.45; s.depthBlur = 0.35; s.vignette = 0.2
            return s
        }()),
        ("Dramatic", {
            var s = EffectSettings()
            s.zoom = 2.9; s.pitch = 30; s.yaw = 22; s.roll = -10; s.perspective = 0.85
            s.blurRadius = 20; s.focusSize = 0.28; s.focusSoftness = 0.4; s.depthBlur = 0.65; s.vignette = 0.45
            return s
        }()),
        ("Flat zoom (no tilt)", {
            var s = EffectSettings()
            s.zoom = 2.0; s.pitch = 0; s.yaw = 0; s.roll = 0
            s.depthOfFieldEnabled = false; s.vignetteEnabled = false
            return s
        }()),
        ("Overview", {
            var s = EffectSettings()
            s.zoom = 0.85; s.pitch = 16; s.yaw = -18; s.roll = 4
            s.blurRadius = 12; s.focusSize = 0.5; s.radialAmount = 0.5; s.depthBlur = 0.5
            return s
        }()),
    ]
}

struct OutputSettings: Codable, Equatable {
    enum Aspect: String, Codable, CaseIterable, Identifiable {
        case wide = "16:9", wide10 = "16:10", classic = "4:3", square = "1:1", portrait = "4:5", vertical = "9:16"
        var id: String { rawValue }
        var fileTag: String { rawValue.replacingOccurrences(of: ":", with: "x") }
        var ratio: Double {
            switch self {
            case .wide: 16.0 / 9
            case .wide10: 16.0 / 10
            case .classic: 4.0 / 3
            case .square: 1
            case .portrait: 4.0 / 5
            case .vertical: 9.0 / 16
            }
        }
    }

    enum Codec: String, Codable, CaseIterable, Identifiable {
        case h264 = "H.264", hevc = "HEVC"
        var id: String { rawValue }
    }

    var aspect: Aspect = .wide          // preview + main export format
    var alsoExport: [Aspect] = []       // extra formats rendered from the same take
    var shortSide = 1080                // 1080 / 1440 / 2160
    var fps = 60
    var codec: Codec = .h264
    var openEditorAfterRecording = true
    var hideWhileRecording = false      // hide windows, Dock icon and menu bar icon while recording
    var quickExport = false             // export with the current look as soon as recording stops

    var exportAspects: [Aspect] { [aspect] + alsoExport.filter { $0 != aspect } }

    var size: CGSize { size(for: aspect) }

    func size(for aspect: Aspect, shortSide: Int? = nil) -> CGSize {
        let short = Double(shortSide ?? self.shortSide)
        let (w, h) = aspect.ratio >= 1 ? (short * aspect.ratio, short) : (short, short / aspect.ratio)
        return CGSize(width: (w / 2).rounded() * 2, height: (h / 2).rounded() * 2)
    }
}

enum Store {
    /// Loads saved values on top of `defaults`, so settings added in later versions keep their defaults.
    static func load<T: Codable>(_ key: String, default defaults: T) -> T {
        guard let data = UserDefaults.standard.data(forKey: key) else { return defaults }
        return decode(data, over: defaults) ?? defaults
    }

    static func save<T: Encodable>(_ value: T, _ key: String) {
        if let data = try? JSONEncoder().encode(value) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func decode<T: Codable>(_ data: Data, over defaults: T) -> T? {
        guard let base = try? JSONSerialization.jsonObject(with: JSONEncoder().encode(defaults)) as? [String: Any],
              let saved = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let merged = try? JSONSerialization.data(withJSONObject: base.merging(saved) { _, new in new })
        else { return nil }
        return try? JSONDecoder().decode(T.self, from: merged)
    }
}
