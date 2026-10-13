import AVFoundation

func hostNow() -> CMTime {
    CMClockGetTime(CMClockGetHostTimeClock())
}

private func writerError(_ message: String) -> NSError {
    NSError(domain: "Glideshot", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

/// Writes ScreenCaptureKit frames as-is (full resolution, no effect) into a fragmented .mov,
/// so a crash or force quit still leaves a playable file.
final class RawTakeWriter {
    private let writer: AVAssetWriter
    private let input: AVAssetWriterInput
    private let start: CMTime
    private var lastPTS = CMTime.invalid
    private let lock = NSLock()
    private var dropped = 0

    var droppedFrames: Int { lock.sync { dropped } }

    init(url: URL, width: Int, height: Int, start: CMTime) throws {
        self.start = start
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        writer.movieFragmentInterval = CMTime(seconds: 1, preferredTimescale: 600)

        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: Int(Double(width * height) * 60 * 0.12),
                AVVideoExpectedSourceFrameRateKey: 60,
            ],
        ]
        input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = true
        guard writer.canAdd(input) else { throw writerError("Can't configure the screen encoder.") }
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? writerError("Can't start writing the take.") }
        writer.startSession(atSourceTime: start)
    }

    /// Call from one queue only.
    func append(_ sample: CMSampleBuffer) {
        let pts = sample.presentationTimeStamp
        guard writer.status == .writing, pts >= start, !lastPTS.isValid || pts > lastPTS else { return }
        guard input.isReadyForMoreMediaData else {
            lock.sync { dropped += 1 }
            return
        }
        if input.append(sample) { lastPTS = pts }
    }

    /// Re-stamps a frame, e.g. to repeat the last screen image at the very start or end of a take.
    func append(_ sample: CMSampleBuffer, at time: CMTime) {
        var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: time, decodeTimeStamp: .invalid)
        var copy: CMSampleBuffer?
        CMSampleBufferCreateCopyWithNewTiming(
            allocator: nil, sampleBuffer: sample, sampleTimingEntryCount: 1, sampleTimingArray: &timing, sampleBufferOut: &copy)
        if let copy { append(copy) }
    }

    func finish(at end: CMTime, _ completion: @escaping (Error?) -> Void) {
        guard writer.status == .writing else { return completion(writer.error) }
        input.markAsFinished()
        writer.endSession(atSourceTime: max(end, lastPTS.isValid ? lastPTS : start))
        let writer = self.writer
        writer.finishWriting { completion(writer.status == .completed ? nil : writer.error) }
    }
}

/// Encodes rendered frames into the final MP4.
final class VideoWriter {
    let url: URL
    private let writer: AVAssetWriter
    private let input: AVAssetWriterInput
    private let adaptor: AVAssetWriterInputPixelBufferAdaptor

    init(url: URL, size: CGSize, fps: Int, codec: OutputSettings.Codec) throws {
        self.url = url
        writer = try AVAssetWriter(outputURL: url, fileType: .mp4)

        let bitsPerPixel = codec == .hevc ? 0.1 : 0.16
        let settings: [String: Any] = [
            AVVideoCodecKey: codec == .hevc ? AVVideoCodecType.hevc : AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height),
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: Int(size.width * size.height * Double(fps) * bitsPerPixel),
                AVVideoExpectedSourceFrameRateKey: fps,
                AVVideoMaxKeyFrameIntervalKey: fps * 2,
            ],
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
        ]
        input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = false
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
        guard writer.canAdd(input) else { throw writerError("Can't configure the video encoder.") }
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? writerError("Can't start writing.") }
        writer.startSession(atSourceTime: .zero)
    }

    /// Blocks until the encoder takes the frame (offline export, so no frames are dropped).
    func append(_ buffer: CVPixelBuffer, at time: CMTime) throws {
        while !input.isReadyForMoreMediaData {
            guard writer.status == .writing else { throw writer.error ?? writerError("Encoder stopped.") }
            usleep(1000)
        }
        guard adaptor.append(buffer, withPresentationTime: time) else {
            throw writer.error ?? writerError("Couldn't encode a frame.")
        }
    }

    func finish() throws {
        input.markAsFinished()
        let done = DispatchSemaphore(value: 0)
        writer.finishWriting { done.signal() }
        done.wait()
        if writer.status != .completed { throw writer.error ?? writerError("Couldn't finish the video.") }
    }

    func cancel() {
        writer.cancelWriting()
        try? FileManager.default.removeItem(at: url)
    }
}

/// Pool of IOSurface-backed BGRA buffers for rendering.
func makePixelBufferPool(size: CGSize, minimumCount: Int = 6) -> CVPixelBufferPool? {
    let attrs: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: Int(size.width),
        kCVPixelBufferHeightKey as String: Int(size.height),
        kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
        kCVPixelBufferMetalCompatibilityKey as String: true,
    ]
    var pool: CVPixelBufferPool?
    CVPixelBufferPoolCreate(nil, [kCVPixelBufferPoolMinimumBufferCountKey as String: minimumCount] as CFDictionary,
                            attrs as CFDictionary, &pool)
    return pool
}
