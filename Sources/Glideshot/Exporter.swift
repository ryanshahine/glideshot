import AVFoundation
import CoreImage

/// Thread-safe cancel flag.
final class CancelFlag {
    private let lock = NSLock()
    private var cancelled = false
    var isCancelled: Bool { lock.sync { cancelled } }
    func cancel() { lock.sync { cancelled = true } }
}

enum Exporter {
    /// Renders every requested format of a take. Runs synchronously; call off the main thread.
    static func exportAll(take: Take, settings: EffectSettings, output: OutputSettings,
                          progress: @escaping (Double) -> Void, cancel: CancelFlag) throws -> [URL] {
        let track = try take.loadTrack()
        let aspects = output.exportAspects
        var urls: [URL] = []
        for (n, aspect) in aspects.enumerated() {
            let url = take.exportURL(for: aspect)
            try export(take: take, track: track, settings: settings, output: output, aspect: aspect, to: url,
                       progress: { progress((Double(n) + $0) / Double(aspects.count)) }, cancel: cancel)
            urls.append(url)
        }
        return urls
    }

    static func export(take: Take, track: Track, settings: EffectSettings, output: OutputSettings,
                       aspect: OutputSettings.Aspect, to url: URL,
                       progress: (Double) -> Void, cancel: CancelFlag) throws {
        let asset = AVURLAsset(url: take.videoURL)
        guard let videoTrack = asset.tracks(withMediaType: .video).first else {
            throw NSError(domain: "Glideshot", code: 10, userInfo: [NSLocalizedDescriptionKey: "The take has no video."])
        }
        let reader = try AVAssetReader(asset: asset)
        let readerOutput = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
            kCVPixelBufferMetalCompatibilityKey as String: true,
        ])
        readerOutput.alwaysCopiesSampleData = false
        reader.add(readerOutput)
        guard reader.startReading() else {
            throw reader.error ?? NSError(domain: "Glideshot", code: 11, userInfo: [NSLocalizedDescriptionKey: "Can't read the take."])
        }
        defer { reader.cancelReading() }

        var current = readerOutput.copyNextSampleBuffer()
        var next = readerOutput.copyNextSampleBuffer()
        guard let first = current?.imageBuffer else {
            throw NSError(domain: "Glideshot", code: 12, userInfo: [NSLocalizedDescriptionKey: "The take is empty."])
        }

        let src = CGSize(width: CVPixelBufferGetWidth(first), height: CVPixelBufferGetHeight(first))
        let outSize = output.size(for: aspect)
        let fps = Double(output.fps)
        let path = CameraPath(track: track, settings: settings, sourceSize: src, outputSize: outSize)
        let sprites = take.loadSprites(track)
        let pointScale = src.width / max(track.displayWidth, 1)
        let renderer = EffectRenderer()
        guard let pool = makePixelBufferPool(size: outSize) else {
            throw NSError(domain: "Glideshot", code: 13, userInfo: [NSLocalizedDescriptionKey: "Out of memory."])
        }
        let writer = try VideoWriter(url: url, size: outSize, fps: output.fps, codec: output.codec)
        if ProcessInfo.processInfo.environment["GLIDESHOT_DEBUG"] != nil {
            print("source", src, "track", track.samples.count, "samples, sprites", sprites.keys.sorted())
            for t in stride(from: 0.0, through: track.duration, by: 0.5) {
                let f = path.state(at: t), m = track.sample(at: t)
                print(String(format: "t=%.1f mouse=(%.2f,%.2f) focus=(%.2f,%.2f) zoom=%.2f cursor=(%.2f,%.2f) a=%.2f",
                             t, m.x, m.y, f.camera.focus.x / src.width, 1 - f.camera.focus.y / src.height, f.camera.zoom,
                             f.cursor.x / src.width, 1 - f.cursor.y / src.height, f.cursorAlpha))
            }
        }

        let count = max(1, Int(track.duration * fps))
        do {
            for i in 0..<count {
                if cancel.isCancelled { throw CancellationError() }
                try autoreleasepool {
                    let t = Double(i) / fps
                    while let n = next, videoTime(n, track) <= t + 0.001 {
                        current = n
                        next = readerOutput.copyNextSampleBuffer()
                    }
                    guard let frame = current?.imageBuffer else { return }
                    let states = path.motionSamples(at: t, fps: fps, maxSamples: 8)
                    let image = renderer.compose(
                        source: CIImage(cvPixelBuffer: frame), frames: states, settings: settings, outputSize: outSize,
                        sprite: { sprites[$0] ?? sprites[0] }, pointScale: pointScale)
                    var buffer: CVPixelBuffer?
                    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
                    guard let buffer else { return }
                    renderer.render(image, to: buffer)
                    try writer.append(buffer, at: CMTime(value: CMTimeValue(i), timescale: CMTimeScale(output.fps)))
                }
                if i % 15 == 0 { progress(Double(i) / Double(count)) }
            }
            try writer.finish()
            progress(1)
        } catch {
            writer.cancel()
            throw error
        }
    }

    /// Take-relative time of a decoded frame (handles files that keep host-clock timestamps).
    static func videoTime(_ sample: CMSampleBuffer, _ track: Track) -> Double {
        let pts = sample.presentationTimeStamp.seconds
        return track.hostStart > 1 && pts > track.hostStart * 0.5 ? pts - track.hostStart : pts
    }
}
