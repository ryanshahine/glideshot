import AVFoundation
import CoreImage
import QuartzCore
import ScreenCaptureKit

extension NSLock {
    func sync<T>(_ body: () throws -> T) rethrows -> T {
        lock()
        defer { unlock() }
        return try body()
    }
}

/// Captures a display with ScreenCaptureKit (without the system cursor), shows a live preview with the
/// camera effect, and records raw takes: the untouched screen video plus a mouse/click/typing track.
final class CaptureEngine: NSObject, SCStreamOutput, SCStreamDelegate {
    weak var previewLayer: CALayer?
    var onStreamStopped: ((Error) -> Void)?

    let input = InputMonitor()
    private let renderer = EffectRenderer()
    private let captureQueue = DispatchQueue(label: "glideshot.capture", qos: .userInteractive)
    private let renderQueue = DispatchQueue(label: "glideshot.render", qos: .userInteractive)

    // Shared state, guarded by `lock`.
    private let lock = NSLock()
    private var stream: SCStream?
    private var latestSample: CMSampleBuffer?
    private var settings = EffectSettings()
    private var output = OutputSettings()
    private var previewInFlight = false
    private var rawWriter: RawTakeWriter?
    private var recordingTake: Take?
    private var displayPointsWidth = 1.0

    // Render-queue state.
    private var timer: DispatchSourceTimer?
    private var pool: CVPixelBufferPool?
    private var poolSize = CGSize.zero
    private var director: Director?
    private var lastTick: CFTimeInterval = 0
    private var lastActivitySeen = -Double.infinity
    private var recentBuffers: [CVPixelBuffer] = []
    private var lastRenderKey = ""
    private var lastRenderSettings: EffectSettings?
    private var previewVisible = true  // guarded by `lock`
    private var mouseHistory: [(t: Double, p: CGPoint)] = []

    var isCapturing: Bool { lock.sync { stream != nil } }

    /// The preview only renders while its window is actually on screen.
    func setPreviewVisible(_ visible: Bool) {
        lock.sync { previewVisible = visible }
    }
    var droppedFrames: Int { lock.sync { rawWriter?.droppedFrames ?? 0 } }

    func update(settings: EffectSettings) {
        lock.sync { self.settings = settings }
    }

    func update(output: OutputSettings) {
        lock.sync { self.output = output }
    }

    // MARK: Capture

    func startCapture(display: SCDisplay, excluding apps: [SCRunningApplication]) async throws {
        await stopCapture()

        let filter = SCContentFilter(display: display, excludingApplications: apps, exceptingWindows: [])
        let mode = CGDisplayCopyDisplayMode(display.displayID)
        let config = SCStreamConfiguration()
        config.width = mode?.pixelWidth ?? display.width * 2
        config.height = mode?.pixelHeight ?? display.height * 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.colorSpaceName = CGColorSpace.sRGB
        config.queueDepth = 6
        config.showsCursor = false  // Glideshot draws its own, sharp cursor

        let newStream = SCStream(filter: filter, configuration: config, delegate: self)
        try newStream.addStreamOutput(self, type: .screen, sampleHandlerQueue: captureQueue)
        try await newStream.startCapture()

        input.setDisplay(display.displayID)
        input.start()
        lock.sync {
            stream = newStream
            latestSample = nil
            displayPointsWidth = CGDisplayBounds(display.displayID).width
        }
        renderQueue.async {
            self.director = nil
            if self.timer == nil { self.startTimer() }
        }
    }

    func stopCapture() async {
        let old = lock.sync { () -> SCStream? in
            defer { stream = nil }
            return stream
        }
        try? await old?.stopCapture()
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false)
                as? [[SCStreamFrameInfo: Any]],
              let rawStatus = attachments.first?[.status] as? Int,
              SCFrameStatus(rawValue: rawStatus) == .complete,
              sampleBuffer.imageBuffer != nil
        else { return }
        let writer = lock.sync { () -> RawTakeWriter? in
            latestSample = sampleBuffer
            return rawWriter
        }
        writer?.append(sampleBuffer)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        let wasCurrent = lock.sync { () -> Bool in
            guard self.stream === stream else { return false }
            self.stream = nil
            return true
        }
        if wasCurrent { onStreamStopped?(error) }
    }

    // MARK: Recording

    var isRecording: Bool { lock.sync { rawWriter != nil } }

    func startRecording(into take: Take) throws {
        guard let sample = lock.sync({ latestSample }), let frame = sample.imageBuffer else {
            throw NSError(domain: "Glideshot", code: 3, userInfo: [NSLocalizedDescriptionKey: "No screen image yet."])
        }
        let start = hostNow()
        let writer = try RawTakeWriter(
            url: take.videoURL, width: CVPixelBufferGetWidth(frame), height: CVPixelBufferGetHeight(frame), start: start)
        input.beginRecording(hostStart: start.seconds)
        captureQueue.sync {
            // Start with the current screen image, even if nothing on screen changes for a while.
            writer.append(sample, at: start)
            lock.sync {
                rawWriter = writer
                recordingTake = take
            }
        }
    }

    /// Finishes the video and writes the track. Completion runs on an arbitrary queue.
    func stopRecording(_ completion: @escaping (Result<Take, Error>) -> Void) {
        let end = hostNow()
        var writer: RawTakeWriter?
        var take: Take?
        captureQueue.sync {
            lock.sync {
                writer = rawWriter
                take = recordingTake
                rawWriter = nil
                recordingTake = nil
            }
            if let writer, let last = lock.sync({ latestSample }) { writer.append(last, at: end) }
        }
        guard let writer, let take else { return }

        let track = input.endRecording(hostEnd: end.seconds, cursorFolder: take.cursorsFolder)
        if let track, let data = try? JSONEncoder().encode(track) { try? data.write(to: take.trackURL) }
        take.saveLook(lock.sync { settings })

        writer.finish(at: end) { error in
            if let error { completion(.failure(error)) } else { completion(.success(take)) }
        }
    }

    // MARK: Live preview

    private func startTimer() {
        let t = DispatchSource.makeTimerSource(flags: .strict, queue: renderQueue)
        t.schedule(deadline: .now(), repeating: 1.0 / 60, leeway: .microseconds(500))
        t.setEventHandler { [weak self] in self?.tick() }
        t.resume()
        timer = t
    }

    private func tick() {
        let (sample, s, out, pointsWidth, visible) = lock.sync {
            (latestSample, settings, output, displayPointsWidth, previewVisible)
        }
        let now = CACurrentMediaTime()
        guard visible, let frame = sample?.imageBuffer else {
            lastTick = now
            return
        }
        let dt = min(max(now - lastTick, 0.001), 0.1)
        lastTick = now

        let src = CGSize(width: CVPixelBufferGetWidth(frame), height: CVPixelBufferGetHeight(frame))
        let outSize = out.size(for: out.aspect, shortSide: min(out.shortSide, 1080))  // preview resolution
        if director?.sourceSize != src || director?.outputSize != outSize {
            director = Director(sourceSize: src, outputSize: outSize)
        }

        let snap = input.current()
        let mouse = CameraPath.point(x: snap.point.x, y: snap.point.y, src)
        let ripples = snap.recentClicks.map {
            Ripple(point: CameraPath.point(x: $0.x, y: $0.y, src), age: now - $0.t)
        }
        // Live has no future, so the zoom reacts to how far the mouse just travelled.
        mouseHistory.append((now, mouse))
        mouseHistory.removeAll { now - $0.t > 0.6 }
        func travel(last window: Double) -> Double {
            mouseHistory.filter { now - $0.t <= window }
                .map { hypot($0.p.x - mouse.x, $0.p.y - mouse.y) }.max() ?? 0
        }
        let directorInput = DirectorInput(
            time: now, mouse: mouse, onScreen: snap.onDisplay, aim: mouse, aimOnScreen: snap.onDisplay,
            buttonDown: snap.down, activity: snap.lastActivity > lastActivitySeen,
            travelSoon: travel(last: 0.3), travelNearby: travel(last: 0.6),
            cursorID: snap.cursorID, ripples: ripples)
        lastActivitySeen = snap.lastActivity
        var state = director!.step(directorInput, settings: s, dt: dt)
        TimeEffects.apply(&state, t: now, duration: nil, settings: s, sourceSize: src)

        // Same screen image, same camera, same settings as last frame? Then there's nothing to redraw.
        let c = state.camera
        let values = [c.focus.x, c.focus.y, c.zoom * 100, c.pitch, c.yaw, c.roll, state.cursor.x, state.cursor.y,
                      state.cursorAlpha * 100, state.focusPoint.x, state.focusPoint.y]
            + state.ripples.map(\.age)
        let key = "\(UInt(bitPattern: Unmanaged.passUnretained(frame).toOpaque()))|\(outSize)|"
            + values.map { String(Int(($0 * 10).rounded())) }.joined(separator: ",")
        if key == lastRenderKey && s == lastRenderSettings { return }
        lastRenderKey = key
        lastRenderSettings = s

        if poolSize != outSize || pool == nil {
            pool = makePixelBufferPool(size: outSize, minimumCount: 8)
            poolSize = outSize
            recentBuffers.removeAll()
        }
        guard let pool else { return }
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
        guard let buffer else { return }

        let pointScale = src.width / max(pointsWidth, 1)  // source pixels per screen point
        let image = renderer.compose(
            source: CIImage(cvPixelBuffer: frame), frame: state, settings: s, outputSize: outSize,
            sprite: { [input] in input.cursors.sprite($0) }, pointScale: pointScale)
        renderer.render(image, to: buffer)
        pushPreview(buffer)
    }

    private func pushPreview(_ buffer: CVPixelBuffer) {
        // Keep a few frames alive so the pool doesn't overwrite the surface the preview is showing.
        recentBuffers.append(buffer)
        if recentBuffers.count > 3 { recentBuffers.removeFirst() }

        guard let surface = CVPixelBufferGetIOSurface(buffer)?.takeUnretainedValue() else { return }
        let busy = lock.sync { () -> Bool in
            defer { previewInFlight = true }
            return previewInFlight
        }
        if busy { return }
        DispatchQueue.main.async { [weak self] in
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            self?.previewLayer?.contents = surface
            CATransaction.commit()
            self?.lock.sync { self?.previewInFlight = false }
        }
    }
}
