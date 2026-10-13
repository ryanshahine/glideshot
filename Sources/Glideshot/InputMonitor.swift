import AppKit
import CoreImage
import QuartzCore

/// A cursor image, rasterized at high resolution so it stays sharp when the camera zooms in.
struct CursorSprite {
    let image: CIImage
    let pixelsPerPoint: Double
    let size: CGSize       // points
    let hotSpot: CGPoint   // points from the top-left
}

/// Samples the system cursor's appearance (arrow, I-beam, hand, …) a few times per second.
final class CursorLibrary {
    private struct Entry {
        let sprite: CursorSprite
        let png: Data
    }

    private let lock = NSLock()
    private var entries: [Int: Entry] = [:]
    private var idsByHash: [UInt64: Int] = [:]
    private var current = 0
    private var timer: Timer?

    init() {
        add(NSCursor.arrow, hash: 0)  // id 0 is always the arrow, used as a fallback
    }

    var currentID: Int { lock.sync { current } }

    func sprite(_ id: Int) -> CursorSprite? {
        lock.sync { entries[id]?.sprite ?? entries[0]?.sprite }
    }

    func startSampling() {
        guard timer == nil else { return }
        let t = Timer(timeInterval: 1.0 / 15, repeats: true) { [weak self] _ in self?.sample() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    /// Writes PNGs for the given ids and returns their descriptions for the track.
    func export(ids: Set<Int>, to folder: URL) -> [Track.Cursor] {
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let snapshot = lock.sync { entries }
        return ids.union([0]).sorted().compactMap { id in
            guard let e = snapshot[id] else { return nil }
            let file = "cursor-\(id).png"
            try? e.png.write(to: folder.appendingPathComponent(file))
            return Track.Cursor(id: id, file: file, width: e.sprite.size.width, height: e.sprite.size.height,
                                hotX: e.sprite.hotSpot.x, hotY: e.sprite.hotSpot.y)
        }
    }

    private func sample() {
        guard let cursor = NSCursor.currentSystem, let tiff = cursor.image.tiffRepresentation else { return }
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325  // FNV-1a over the image bytes + hot spot
        tiff.withUnsafeBytes { bytes in
            for b in bytes { hash = (hash ^ UInt64(b)) &* 0x100_0000_01b3 }
        }
        hash ^= UInt64(cursor.hotSpot.x * 100) << 32 ^ UInt64(cursor.hotSpot.y * 100)
        if let id = lock.sync({ idsByHash[hash] }) {
            lock.sync { current = id }
        } else {
            add(cursor, hash: hash)
        }
    }

    private func add(_ cursor: NSCursor, hash: UInt64) {
        let size = cursor.image.size
        guard size.width > 0, size.height > 0 else { return }
        let scale = 4.0
        guard let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: Int(size.width * scale), pixelsHigh: Int(size.height * scale),
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)
        else { return }
        rep.size = size
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSGraphicsContext.current?.imageInterpolation = .high
        cursor.image.draw(in: NSRect(origin: .zero, size: size))
        NSGraphicsContext.restoreGraphicsState()
        guard let cg = rep.cgImage, let png = rep.representation(using: .png, properties: [:]) else { return }

        let sprite = CursorSprite(image: CIImage(cgImage: cg), pixelsPerPoint: scale, size: size, hotSpot: cursor.hotSpot)
        lock.sync {
            let id = hash == 0 ? 0 : (entries.keys.max() ?? 0) + 1
            entries[id] = Entry(sprite: sprite, png: png)
            idsByHash[hash] = id
            current = id
        }
    }
}

/// Samples the mouse, clicks and typing at 60 Hz without needing any extra permission,
/// for the live camera and (while recording) the take's track.
final class InputMonitor {
    struct Snapshot {
        var time: Double
        var point = CGPoint(x: 0.5, y: 0.5)  // normalized, top-left origin
        var onDisplay = true
        var down = false
        var cursorID = 0
        var lastActivity = -Double.infinity
        var recentClicks: [Track.Click] = []  // host-time stamped
    }

    let cursors = CursorLibrary()

    private let queue = DispatchQueue(label: "glideshot.input", qos: .userInteractive)
    private let lock = NSLock()
    private var timer: DispatchSourceTimer?
    private var displayID = CGMainDisplayID()
    private var snapshot = Snapshot(time: CACurrentMediaTime())
    private var lastSample = CACurrentMediaTime()
    private var recording: Track?
    private var usedCursors: Set<Int> = []

    func start() {
        cursors.startSampling()
        guard timer == nil else { return }
        let t = DispatchSource.makeTimerSource(flags: .strict, queue: queue)
        t.schedule(deadline: .now(), repeating: 1.0 / 60, leeway: .microseconds(500))
        t.setEventHandler { [weak self] in self?.sample() }
        t.resume()
        timer = t
    }

    func setDisplay(_ id: CGDirectDisplayID) {
        lock.sync { displayID = id }
    }

    func current() -> Snapshot {
        lock.sync { snapshot }
    }

    func beginRecording(hostStart: Double) {
        let bounds = CGDisplayBounds(lock.sync { displayID })
        lock.sync {
            recording = Track(displayWidth: bounds.width, displayHeight: bounds.height, hostStart: hostStart)
            usedCursors = [snapshot.cursorID]
        }
    }

    func endRecording(hostEnd: Double, cursorFolder: URL) -> Track? {
        guard var track = lock.sync({ () -> Track? in
            defer { recording = nil }
            return recording
        }) else { return nil }
        track.duration = max(0, hostEnd - track.hostStart)
        track.cursors = cursors.export(ids: lock.sync { usedCursors }, to: cursorFolder)
        return track
    }

    private func sample() {
        let now = CACurrentMediaTime()
        let elapsed = now - lastSample
        lastSample = now

        let bounds = CGDisplayBounds(lock.sync { displayID })
        let loc = CGEvent(source: nil)?.location ?? CGPoint(x: bounds.midX, y: bounds.midY)
        let point = CGPoint(x: (loc.x - bounds.minX) / bounds.width, y: (loc.y - bounds.minY) / bounds.height)
        let onDisplay = bounds.insetBy(dx: -1, dy: -1).contains(loc)

        let source = CGEventSourceStateID.combinedSessionState
        let down = CGEventSource.buttonState(source, button: .left) || CGEventSource.buttonState(source, button: .right)
        let sinceClick = min(CGEventSource.secondsSinceLastEventType(source, eventType: .leftMouseDown),
                             CGEventSource.secondsSinceLastEventType(source, eventType: .rightMouseDown))
        let sinceKey = CGEventSource.secondsSinceLastEventType(source, eventType: .keyDown)
        let cursorID = cursors.currentID

        lock.sync {
            snapshot.time = now
            snapshot.point = point
            snapshot.onDisplay = onDisplay
            snapshot.down = down
            snapshot.cursorID = cursorID
            snapshot.recentClicks.removeAll { now - $0.t > 1 }

            var click: Track.Click?
            if sinceClick < elapsed && onDisplay {
                click = Track.Click(t: now - sinceClick, x: point.x, y: point.y)
                snapshot.recentClicks.append(click!)
                snapshot.lastActivity = now - sinceClick
            }
            let keyPressed = sinceKey < elapsed
            if keyPressed { snapshot.lastActivity = max(snapshot.lastActivity, now - sinceKey) }

            // Mutate in place (no copy of the growing arrays).
            guard let start = recording?.hostStart else { return }
            recording?.samples.append(Track.Sample(t: now - start, x: point.x, y: point.y, on: onDisplay, down: down, c: cursorID))
            if let click { recording?.clicks.append(Track.Click(t: click.t - start, x: click.x, y: click.y)) }
            if keyPressed { recording?.keys.append(now - sinceKey - start) }
            usedCursors.insert(cursorID)
        }
    }
}
