import AppKit
import AVFoundation
import CoreImage
import SwiftUI

/// Pulls decoded frames from the player and renders the styled preview on its own queue.
final class EditorRenderLoop {
    weak var layer: CALayer?
    var onTime: ((Double) -> Void)?

    private let queue = DispatchQueue(label: "glideshot.editor", qos: .userInteractive)
    private let lock = NSLock()
    private let renderer = EffectRenderer()
    private let videoOutput: AVPlayerItemVideoOutput
    private let track: Track
    private let sprites: [Int: CursorSprite]

    // Guarded by `lock`.
    private var settings: EffectSettings
    private var output: OutputSettings
    private var playing = false
    private var dirty = true
    private var previewInFlight = false

    // Queue state.
    private var timer: DispatchSourceTimer?
    private var latest: CVPixelBuffer?
    private var path: CameraPath?
    private var lastTime = -1.0
    private var pool: CVPixelBufferPool?
    private var poolSize = CGSize.zero
    private var recentBuffers: [CVPixelBuffer] = []

    init(videoOutput: AVPlayerItemVideoOutput, track: Track, sprites: [Int: CursorSprite],
         settings: EffectSettings, output: OutputSettings) {
        self.videoOutput = videoOutput
        self.track = track
        self.sprites = sprites
        self.settings = settings
        self.output = output
    }

    func start() {
        queue.async {
            guard self.timer == nil else { return }
            let t = DispatchSource.makeTimerSource(flags: .strict, queue: self.queue)
            t.schedule(deadline: .now(), repeating: 1.0 / 60, leeway: .microseconds(500))
            t.setEventHandler { [weak self] in self?.tick() }
            t.resume()
            self.timer = t
        }
    }

    func stop() {
        queue.async {
            self.timer?.cancel()
            self.timer = nil
        }
    }

    func update(settings: EffectSettings, output: OutputSettings) {
        lock.sync {
            self.settings = settings
            self.output = output
            dirty = true
        }
    }

    func setPlaying(_ playing: Bool) {
        lock.sync { self.playing = playing }
    }

    private func tick() {
        let itemTime = videoOutput.itemTime(forHostTime: CACurrentMediaTime())
        var newFrame = false
        if videoOutput.hasNewPixelBuffer(forItemTime: itemTime),
           let buffer = videoOutput.copyPixelBuffer(forItemTime: itemTime, itemTimeForDisplay: nil) {
            latest = buffer
            newFrame = true
        }
        guard let frame = latest else { return }
        let t = itemTime.isValid ? max(0, itemTime.seconds) : max(lastTime, 0)

        let (s, out, changed, isPlaying) = lock.sync { () -> (EffectSettings, OutputSettings, Bool, Bool) in
            defer { dirty = false }
            return (settings, output, dirty, playing)
        }
        if !newFrame && !changed && abs(t - lastTime) < 1e-4 { return }
        lastTime = t

        let src = CGSize(width: CVPixelBufferGetWidth(frame), height: CVPixelBufferGetHeight(frame))
        let outSize = out.size(for: out.aspect, shortSide: min(out.shortSide, 1080))
        if changed || path == nil || path?.sourceSize != src || path?.outputSize != outSize {
            path = CameraPath(track: track, settings: s, sourceSize: src, outputSize: outSize)
        }
        guard let path else { return }

        if poolSize != outSize || pool == nil {
            pool = makePixelBufferPool(size: outSize, minimumCount: 8)
            poolSize = outSize
            recentBuffers.removeAll()
        }
        guard let pool else { return }
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
        guard let buffer else { return }

        let states = path.motionSamples(at: t, fps: Double(out.fps), maxSamples: isPlaying ? 3 : 8)
        let image = renderer.compose(
            source: CIImage(cvPixelBuffer: frame), frames: states, settings: s, outputSize: outSize,
            sprite: { [sprites] in sprites[$0] ?? sprites[0] }, pointScale: src.width / max(track.displayWidth, 1))
        renderer.render(image, to: buffer)
        push(buffer)
        onTime?(t)
    }

    private func push(_ buffer: CVPixelBuffer) {
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
            self?.layer?.contents = surface
            CATransaction.commit()
            self?.lock.sync { self?.previewInFlight = false }
        }
    }
}

/// Playback position, kept separate so the 60 Hz playhead doesn't redraw the whole editor.
@MainActor
final class PlaybackClock: ObservableObject {
    @Published var time = 0.0
}

@MainActor
final class EditorModel: ObservableObject {
    let take: Take
    let track: Track
    let player: AVPlayer
    let loop: EditorRenderLoop

    @Published var settings: EffectSettings {
        didSet {
            guard settings != oldValue else { return }
            take.saveLook(settings)
            loop.update(settings: settings, output: output)
        }
    }

    @Published var output: OutputSettings {
        didSet {
            guard output != oldValue else { return }
            loop.update(settings: settings, output: output)
        }
    }

    let clock = PlaybackClock()
    var time: Double { clock.time }
    @Published private(set) var isPlaying = false
    @Published private(set) var isExporting = false
    @Published private(set) var exportProgress = 0.0
    @Published private(set) var exportStatus = ""

    var duration: Double { max(track.duration, 0.01) }
    let clickMarks: [Double]
    let typingMarks: [Double]

    private var cancelFlag = CancelFlag()
    private var endObserver: NSObjectProtocol?

    init(take: Take, defaultSettings: EffectSettings, output: OutputSettings) throws {
        self.take = take
        let track = try take.loadTrack()
        let look = take.loadLook(default: defaultSettings)
        self.track = track
        settings = look
        self.output = output

        let item = AVPlayerItem(url: take.videoURL)
        let videoOutput = AVPlayerItemVideoOutput(pixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
            kCVPixelBufferMetalCompatibilityKey as String: true,
        ])
        item.add(videoOutput)
        player = AVPlayer(playerItem: item)
        player.actionAtItemEnd = .pause
        loop = EditorRenderLoop(videoOutput: videoOutput, track: track, sprites: take.loadSprites(track),
                                settings: look, output: output)

        let d = max(track.duration, 0.01)
        clickMarks = track.clicks.map { $0.t / d }
        var marks: [Double] = []
        for k in track.keys where marks.last.map({ k / d - $0 > 0.002 }) ?? true { marks.append(k / d) }
        typingMarks = marks

        loop.onTime = { [weak self] t in
            DispatchQueue.main.async { self?.clock.time = t }
        }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.setPlaying(false) }
        }
        loop.start()
        player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
    }

    func close() {
        player.pause()
        loop.stop()
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    }

    func togglePlay() {
        if isPlaying {
            player.pause()
            setPlaying(false)
        } else {
            if time >= duration - 0.05 { seek(to: 0) }
            player.play()
            setPlaying(true)
        }
    }

    func seek(to t: Double) {
        let clamped = min(max(t, 0), duration)
        clock.time = clamped
        player.seek(to: CMTime(seconds: clamped, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
    }

    private func setPlaying(_ playing: Bool) {
        isPlaying = playing
        loop.setPlaying(playing)
    }

    func export() {
        guard !isExporting else { return }
        isExporting = true
        exportProgress = 0
        exportStatus = "Exporting…"
        let flag = CancelFlag()
        cancelFlag = flag
        let (take, settings, output) = (self.take, self.settings, self.output)
        AppModel.shared.exportStarted()
        Task.detached(priority: .userInitiated) { [weak self] in
            let result = Result {
                try Exporter.exportAll(take: take, settings: settings, output: output, progress: { p in
                    DispatchQueue.main.async { self?.exportProgress = p }
                }, cancel: flag)
            }
            await MainActor.run {
                AppModel.shared.exportFinished()
                guard let self else { return }
                self.isExporting = false
                switch result {
                case .success(let urls):
                    self.exportStatus = urls.count == 1 ? "Saved \(urls[0].lastPathComponent)" : "Saved \(urls.count) videos"
                    NSWorkspace.shared.activateFileViewerSelecting(urls)
                case .failure(let error):
                    self.exportStatus = error is CancellationError ? "Export cancelled" : "Export failed: \(error.localizedDescription)"
                }
            }
        }
    }

    func cancelExport() {
        cancelFlag.cancel()
    }
}

struct EditorView: View {
    @ObservedObject var model: EditorModel

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 12) {
                LayerView { model.loop.layer = $0 }
                    .aspectRatio(model.output.size.width / model.output.size.height, contentMode: .fit)
                    .background(Color.black)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(.white.opacity(0.08)))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                TimelineBar(model: model, clock: model.clock)
                HStack(spacing: 12) {
                    Button(action: model.togglePlay) {
                        Image(systemName: model.isPlaying ? "pause.fill" : "play.fill").frame(width: 18)
                    }
                    .keyboardShortcut(.space, modifiers: [])
                    TimeLabel(clock: model.clock, duration: model.duration)
                    Spacer()
                    if model.isExporting {
                        ProgressView(value: model.exportProgress).frame(width: 160)
                        Text("\(Int(model.exportProgress * 100))%").monospacedDigit().foregroundStyle(.secondary)
                        Button("Cancel", action: model.cancelExport)
                    } else if !model.exportStatus.isEmpty {
                        Text(model.exportStatus).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Button(action: model.export) {
                        Label("Export", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isExporting)
                }
            }
            .padding(16)
            Divider()
            Form {
                ExportSection(output: $model.output)
                Section {
                    Button("Use the main window's look") { model.settings = AppModel.shared.settings }
                    Button("Make this look the default") { AppModel.shared.settings = model.settings }
                }
                LookControls(settings: $model.settings, context: .editor)
            }
            .formStyle(.grouped)
            .frame(width: 340)
        }
        .frame(minWidth: 1000, minHeight: 640)
    }

}

struct TimeLabel: View {
    @ObservedObject var clock: PlaybackClock
    let duration: Double

    var body: some View {
        Text("\(format(clock.time)) / \(format(duration))")
            .monospacedDigit()
            .foregroundStyle(.secondary)
    }

    private func format(_ t: Double) -> String {
        let s = Int(t.rounded(.down))
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

/// Scrubbable timeline with click (dots) and typing (ticks) markers.
struct TimelineBar: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var clock: PlaybackClock

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                let progress = min(max(clock.time / model.duration, 0), 1)
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(0.08))
                    RoundedRectangle(cornerRadius: 6).fill(Color.accentColor.opacity(0.18)).frame(width: w * progress)
                    Canvas { ctx, size in
                        for m in model.typingMarks {
                            ctx.fill(Path(CGRect(x: m * size.width - 0.5, y: size.height - 10, width: 1.5, height: 7)),
                                     with: .color(.secondary))
                        }
                        for m in model.clickMarks {
                            ctx.fill(Path(ellipseIn: CGRect(x: m * size.width - 3, y: size.height / 2 - 6, width: 6, height: 6)),
                                     with: .color(.orange))
                        }
                    }
                    Rectangle().fill(Color.accentColor).frame(width: 2, height: h).offset(x: w * progress - 1)
                }
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).onChanged { v in
                    model.seek(to: min(max(v.location.x / w, 0), 1) * model.duration)
                })
            }
            .frame(height: 40)
            HStack(spacing: 12) {
                Label("clicks", systemImage: "circle.fill").foregroundStyle(.orange)
                Label("typing", systemImage: "line.3.horizontal").foregroundStyle(.secondary)
            }
            .font(.caption)
            .labelStyle(.titleAndIcon)
        }
    }
}
