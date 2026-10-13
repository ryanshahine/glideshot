import CoreImage
import SwiftUI

@main
struct GlideshotApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel.shared

    init() {
        if CommandLine.arguments.contains("--render-test") {
            CommandLineTools.renderTest()
            exit(0)
        }
        if CommandLine.arguments.contains("--export") {
            exit(CommandLineTools.export() ? 0 : 1)
        }
    }

    var body: some Scene {
        Window("Glideshot", id: "main") {
            ContentView()
                .environmentObject(model)
                .frame(minWidth: 1000, minHeight: 620)
        }
    }
}

enum CommandLineTools {
    /// `Glideshot --render-test input.png output.png [focusX focusY]` renders one frame with the
    /// saved/default settings, so the look can be checked without screen capture.
    static func renderTest() {
        let args = CommandLine.arguments
        guard let i = args.firstIndex(of: "--render-test"), args.count > i + 2,
              let input = CIImage(contentsOf: URL(fileURLWithPath: args[i + 1]))
        else {
            print("usage: Glideshot --render-test input.png output.png [focusX focusY]")
            return
        }
        let source = input.transformed(by: CGAffineTransform(translationX: -input.extent.minX, y: -input.extent.minY))
        let fx = args.count > i + 4 ? Double(args[i + 3]) ?? 0.5 : 0.5
        let fy = args.count > i + 4 ? Double(args[i + 4]) ?? 0.5 : 0.5
        let s = Store.load("effect", default: EffectSettings())
        let out = Store.load("output", default: OutputSettings()).size
        let focus = CGPoint(x: fx * source.extent.width, y: (1 - fy) * source.extent.height)
        var frame = FrameState()
        frame.camera = CameraState(focus: focus, zoom: s.zoom, pitch: s.pitch, yaw: s.yaw, roll: s.roll)
        frame.cursor = focus
        let renderer = EffectRenderer()
        let arrow = CursorLibrary()
        let pointScale = 2.0
        let image = renderer.compose(source: source, frame: frame, settings: s, outputSize: out,
                                     sprite: { arrow.sprite($0) }, pointScale: pointScale)
        if ProcessInfo.processInfo.environment["GLIDESHOT_BENCH"] != nil {
            var buffer: CVPixelBuffer?
            CVPixelBufferCreate(nil, Int(out.width), Int(out.height), kCVPixelFormatType_32BGRA,
                                [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &buffer)
            let start = Date()
            for n in 0..<120 {
                var f = frame
                f.camera.focus.x += Double(n) * 3  // moving camera, like following the mouse
                renderer.render(renderer.compose(source: source, frame: f, settings: s, outputSize: out,
                                                 sprite: { arrow.sprite($0) }, pointScale: pointScale), to: buffer!)
            }
            print(String(format: "%.1f ms/frame", Date().timeIntervalSince(start) / 120 * 1000))
        }
        do {
            try renderer.context.writePNGRepresentation(
                of: image, to: URL(fileURLWithPath: args[i + 2]), format: .RGBA8, colorSpace: renderer.colorSpace)
            print("wrote \(args[i + 2])")
        } catch {
            print("failed: \(error)")
        }
    }

    /// `Glideshot --export <take folder>` renders a take with its saved look and the saved export settings.
    static func export() -> Bool {
        let args = CommandLine.arguments
        guard let i = args.firstIndex(of: "--export"), args.count > i + 1 else {
            print("usage: Glideshot --export <take folder>")
            return false
        }
        let take = Take(folder: URL(fileURLWithPath: args[i + 1]))
        // GLIDESHOT_DEFAULTS=1 ignores your saved settings (useful for testing).
        let useDefaults = ProcessInfo.processInfo.environment["GLIDESHOT_DEFAULTS"] != nil
        let settings = take.loadLook(default: useDefaults ? EffectSettings() : Store.load("effect", default: EffectSettings()))
        var output = useDefaults ? OutputSettings() : Store.load("output", default: OutputSettings())
        if let aspect = ProcessInfo.processInfo.environment["GLIDESHOT_ASPECT"].flatMap(OutputSettings.Aspect.init(rawValue:)) {
            output.aspect = aspect
            output.alsoExport = []
        }
        let start = Date()
        do {
            let urls = try Exporter.exportAll(take: take, settings: settings, output: output, progress: { _ in }, cancel: CancelFlag())
            print(String(format: "exported in %.1fs:", Date().timeIntervalSince(start)))
            urls.forEach { print($0.path) }
            return true
        } catch {
            print("export failed: \(error.localizedDescription)")
            return false
        }
    }
}
