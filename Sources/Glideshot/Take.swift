import AppKit
import CoreImage

/// Mouse/click/typing timeline recorded alongside the raw screen video.
/// Positions are normalized (0...1) from the top-left of the captured display; times are seconds from the take start.
/// Only *that* a key was pressed is stored, never which key.
struct Track: Codable {
    struct Sample: Codable {
        var t: Double
        var x: Double
        var y: Double
        var on: Bool       // mouse is on the captured display
        var down: Bool     // a mouse button is held
        var c: Int         // cursor sprite id
    }

    struct Click: Codable {
        var t: Double
        var x: Double
        var y: Double
    }

    struct Cursor: Codable {
        var id: Int
        var file: String
        var width: Double   // points
        var height: Double
        var hotX: Double    // points from the top-left
        var hotY: Double
    }

    var displayWidth: Double    // points
    var displayHeight: Double
    var hostStart: Double       // host clock seconds at t = 0
    var duration: Double = 0
    var samples: [Sample] = []
    var clicks: [Click] = []
    var keys: [Double] = []
    var cursors: [Cursor] = []

    func sample(at t: Double) -> Sample {
        guard let first = samples.first, let last = samples.last else {
            return Sample(t: t, x: 0.5, y: 0.5, on: true, down: false, c: 0)
        }
        if t <= first.t { return first }
        if t >= last.t { return last }
        var lo = 0, hi = samples.count - 1
        while hi - lo > 1 {
            let mid = (lo + hi) / 2
            if samples[mid].t <= t { lo = mid } else { hi = mid }
        }
        let a = samples[lo], b = samples[hi]
        var s = a
        s.t = t
        if a.on && b.on {
            let f = (t - a.t) / max(b.t - a.t, 1e-6)
            s.x = a.x + (b.x - a.x) * f
            s.y = a.y + (b.y - a.y) * f
        }
        return s
    }

    /// A click or key press with time in (from, to].
    func hasActivity(after from: Double, upTo to: Double) -> Bool {
        let k = Track.firstIndex(count: keys.count, after: from) { keys[$0] }
        if k < keys.count && keys[k] <= to { return true }
        let c = Track.firstIndex(count: clicks.count, after: from) { clicks[$0].t }
        return c < clicks.count && clicks[c].t <= to
    }

    func clicks(after from: Double, upTo to: Double) -> [Click] {
        var i = Track.firstIndex(count: clicks.count, after: from) { clicks[$0].t }
        var result: [Click] = []
        while i < clicks.count && clicks[i].t <= to {
            result.append(clicks[i])
            i += 1
        }
        return result
    }

    /// First index whose time is > value, in a list sorted by time.
    private static func firstIndex(count: Int, after value: Double, time: (Int) -> Double) -> Int {
        var lo = 0, hi = count
        while lo < hi {
            let mid = (lo + hi) / 2
            if time(mid) <= value { lo = mid + 1 } else { hi = mid }
        }
        return lo
    }
}

/// A recorded take: a folder with the raw screen video, the input track, cursor images and the take's look.
struct Take: Identifiable, Hashable {
    let folder: URL
    var id: URL { folder }
    var name: String { folder.lastPathComponent }
    var videoURL: URL { folder.appendingPathComponent("screen.mov") }
    var trackURL: URL { folder.appendingPathComponent("track.json") }
    var lookURL: URL { folder.appendingPathComponent("look.json") }
    var cursorsFolder: URL { folder.appendingPathComponent("cursors", isDirectory: true) }

    static var outputFolder: URL {
        if let custom = ProcessInfo.processInfo.environment["GLIDESHOT_OUTPUT"] {
            return URL(fileURLWithPath: custom, isDirectory: true)
        }
        return FileManager.default.urls(for: .moviesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Glideshot", isDirectory: true)
    }

    static var libraryFolder: URL { outputFolder.appendingPathComponent("Takes", isDirectory: true) }

    static func makeNew() throws -> Take {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd 'at' HH.mm.ss"
        let folder = libraryFolder.appendingPathComponent("Take \(formatter.string(from: Date()))", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return Take(folder: folder)
    }

    static func recent(limit: Int = 8) -> [Take] {
        let fm = FileManager.default
        let folders = (try? fm.contentsOfDirectory(
            at: libraryFolder, includingPropertiesForKeys: [.creationDateKey], options: [.skipsHiddenFiles])) ?? []
        return folders
            .map { Take(folder: $0) }
            .filter { fm.fileExists(atPath: $0.trackURL.path) && fm.fileExists(atPath: $0.videoURL.path) }
            .sorted { $0.name > $1.name }
            .prefix(limit)
            .map { $0 }
    }

    func loadTrack() throws -> Track {
        try JSONDecoder().decode(Track.self, from: Data(contentsOf: trackURL))
    }

    func loadLook(default defaults: EffectSettings) -> EffectSettings {
        guard let data = try? Data(contentsOf: lookURL) else { return defaults }
        return Store.decode(data, over: defaults) ?? defaults
    }

    func saveLook(_ settings: EffectSettings) {
        if let data = try? JSONEncoder().encode(settings) { try? data.write(to: lookURL) }
    }

    func loadSprites(_ track: Track) -> [Int: CursorSprite] {
        var sprites: [Int: CursorSprite] = [:]
        for c in track.cursors {
            guard let image = CIImage(contentsOf: cursorsFolder.appendingPathComponent(c.file)) else { continue }
            sprites[c.id] = CursorSprite(
                image: image,
                pixelsPerPoint: image.extent.width / max(c.width, 1),
                size: CGSize(width: c.width, height: c.height),
                hotSpot: CGPoint(x: c.hotX, y: c.hotY))
        }
        return sprites
    }

    /// A file next to the takes that doesn't overwrite an earlier export.
    func exportURL(for aspect: OutputSettings.Aspect) -> URL {
        let base = "\(name.replacingOccurrences(of: "Take ", with: "Glideshot ")) \(aspect.fileTag)"
        var url = Take.outputFolder.appendingPathComponent("\(base).mp4")
        var n = 2
        while FileManager.default.fileExists(atPath: url.path) {
            url = Take.outputFolder.appendingPathComponent("\(base) \(n).mp4")
            n += 1
        }
        return url
    }
}
