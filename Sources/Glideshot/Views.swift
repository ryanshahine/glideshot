import AppKit
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 12) {
                LayerView { model.engine.previewLayer = $0 }
                    .aspectRatio(model.output.size.width / model.output.size.height, contentMode: .fit)
                    .background(Color.black)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(.white.opacity(0.08)))
                    .overlay { if model.needsPermission { PermissionOverlay() } }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                StatusBar()
            }
            .padding(16)
            Divider()
            Form {
                RecordingSection()
                ExportSection(output: $model.output)
                TakesSection()
                LookControls(settings: $model.settings, context: .live, lockAtMouse: model.lockAtMouse)
            }
            .formStyle(.grouped)
            .frame(width: 340)
        }
        .task { model.bootstrap() }
        .onAppear { model.openMainWindow = { [openWindow] in openWindow(id: "main") } }
    }
}

struct StatusBar: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        HStack(spacing: 12) {
            Button(action: model.toggleRecording) {
                Label(model.isRecording ? "Stop" : "Record", systemImage: model.isRecording ? "stop.fill" : "record.circle")
                    .frame(minWidth: 80)
            }
            .controlSize(.large)
            .tint(model.isRecording ? .red : .accentColor)
            .buttonStyle(.borderedProminent)
            .disabled(model.needsPermission || model.isSaving)

            if let start = model.recordingStart {
                TimelineView(.periodic(from: start, by: 0.5)) { context in
                    let t = Int(context.date.timeIntervalSince(start))
                    Text(String(format: "● %02d:%02d", t / 60, t % 60))
                        .monospacedDigit()
                        .foregroundStyle(.red)
                }
            }
            if model.isRecording && model.droppedFrames > 0 {
                Label("\(model.droppedFrames) dropped frames", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .help("The encoder couldn't keep up. Close heavy apps or lower the display resolution.")
            }
            if let p = model.quickExportProgress {
                ProgressView(value: p).frame(width: 100)
            }
            Text(model.status).foregroundStyle(.secondary).lineLimit(1)
            Spacer()
            Text("⌃⌥⌘R record · ⌃⌥⌘L lock · ⌃⌥⌘ +/− zoom")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }
}

struct PermissionOverlay: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "rectangle.dashed.badge.record").font(.system(size: 34))
            Text("Glideshot needs Screen Recording permission").font(.headline)
            Text("Enable Glideshot in System Settings → Privacy & Security → Screen & System Audio Recording, then retry.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 360)
            HStack {
                Button("Open System Settings", action: model.openPrivacySettings)
                Button("Retry", action: model.restartCapture)
            }
        }
        .padding(24)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

struct RecordingSection: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        Section("Recording") {
            Picker("Display", selection: Binding(get: { model.displayID }, set: { model.selectDisplay($0) })) {
                ForEach(model.displays, id: \.displayID) { Text(model.displayName($0)).tag($0.displayID) }
            }
            .disabled(model.isRecording)
            Toggle("Open editor after recording", isOn: $model.output.openEditorAfterRecording)
            Toggle("Quick export after recording", isOn: $model.output.quickExport)
            Toggle("Hide Glideshot while recording", isOn: $model.output.hideWhileRecording)
                .help("Hides the windows, Dock icon and menu bar icon while recording. Stop with ⌃⌥⌘R.")
            if model.output.hideWhileRecording {
                Caption("Stop recording with ⌃⌥⌘R.")
            }
            Caption("Takes are recorded raw, so you can restyle them in the editor afterwards.")
        }
    }
}

struct ExportSection: View {
    @Binding var output: OutputSettings

    var body: some View {
        Section("Format") {
            Picker("Aspect", selection: $output.aspect) {
                ForEach(OutputSettings.Aspect.allCases) { Text($0.rawValue).tag($0) }
            }
            DisclosureGroup("Also export as…") {
                ForEach(OutputSettings.Aspect.allCases.filter { $0 != output.aspect }) { aspect in
                    Toggle(aspect.rawValue, isOn: Binding(
                        get: { output.alsoExport.contains(aspect) },
                        set: { on in
                            output.alsoExport.removeAll { $0 == aspect }
                            if on { output.alsoExport.append(aspect) }
                        }))
                }
            }
            Picker("Resolution", selection: $output.shortSide) {
                Text("1080p").tag(1080)
                Text("1440p").tag(1440)
                Text("4K").tag(2160)
            }
            Picker("Frame rate", selection: $output.fps) {
                Text("30 fps").tag(30)
                Text("60 fps").tag(60)
            }
            Picker("Codec", selection: $output.codec) {
                ForEach(OutputSettings.Codec.allCases) { Text($0.rawValue).tag($0) }
            }
        }
    }
}

struct TakesSection: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        Section("Takes") {
            if model.recentTakes.isEmpty {
                Caption("Your recordings will show up here.")
            }
            ForEach(model.recentTakes) { take in
                HStack {
                    Text(take.name.replacingOccurrences(of: "Take ", with: "")).lineLimit(1)
                    Spacer()
                    Button("Edit") { model.openEditor(take) }
                }
            }
            HStack {
                Button("Open Take…", action: model.openTakePanel)
                Button("Show in Finder", action: model.showTakesInFinder)
            }
        }
    }
}

/// All look and camera controls. Shared by the live window and the editor.
struct LookControls: View {
    enum Context { case live, editor }

    @Binding var settings: EffectSettings
    let context: Context
    var lockAtMouse: (() -> Void)?

    private var editorOnlyNote: String? {
        context == .live ? "Applies in the editor and exports." : nil
    }

    var body: some View {
        Section("Camera") {
            Picker("Mode", selection: $settings.mode) {
                ForEach(EffectSettings.Mode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            if settings.mode == .locked {
                SliderRow(title: "Lock X", value: $settings.lockedX, range: 0...1)
                SliderRow(title: "Lock Y", value: $settings.lockedY, range: 0...1)
                if let lockAtMouse { Button("Lock at current mouse position", action: lockAtMouse) }
            } else {
                SliderRow(title: "Smoothing", value: $settings.smoothing, range: 0...0.98, format: settings.smoothing < 0.01 ? "Off" : "%.2f")
            }
            SliderRow(title: "Zoom", value: $settings.zoom, range: 0.5...6, format: "%.2f×")
            SliderRow(title: "Frame X", value: $settings.framingX, range: 0.1...0.9)
            SliderRow(title: "Frame Y", value: $settings.framingY, range: 0.1...0.9)
            Toggle("Keep inside screen", isOn: $settings.keepInBounds)
        }

        Section("Camera direction") {
            FeatureToggle("Dead zone", isOn: $settings.deadZoneEnabled,
                          help: "Small mouse movements don't move the camera.") {
                SliderRow(title: "Size", value: $settings.deadZoneSize, range: 0.03...0.4)
                Toggle("Settle on the mouse when it stops", isOn: $settings.settleOnRest)
            }
            FeatureToggle("Look ahead", isOn: $settings.lookAheadEnabled,
                          help: "The camera starts moving before the mouse does.", note: editorOnlyNote) {
                SliderRow(title: "Anticipation", value: $settings.lookAhead, range: 0.05...1, format: "%.2f s")
            }
            FeatureToggle("Zoom in on clicks & typing", isOn: $settings.zoomOnActivity) {
                SliderRow(title: "Extra zoom", value: $settings.activityZoom, range: 0.05...1, format: "+%.0f", scale: 100, unit: "%")
            }
            Toggle("Zoom out on fast moves", isOn: $settings.zoomOutOnFastMove)
            FeatureToggle("Pull back when idle", isOn: $settings.pullBackWhenIdle) {
                SliderRow(title: "After", value: $settings.idleSeconds, range: 1...15, format: "%.0f s")
            }
            FeatureToggle("Handheld drift", isOn: $settings.driftEnabled, help: "A slow, subtle float so locked shots feel alive.") {
                SliderRow(title: "Amount", value: $settings.driftAmount, range: 0.1...1.5)
            }
            FeatureToggle("Intro: ease in from flat", isOn: $settings.introEnabled, note: editorOnlyNote) {
                SliderRow(title: "Duration", value: $settings.introDuration, range: 0.3...4, format: "%.1f s")
            }
            FeatureToggle("Outro: ease out to flat", isOn: $settings.outroEnabled, note: editorOnlyNote) {
                SliderRow(title: "Duration", value: $settings.outroDuration, range: 0.3...4, format: "%.1f s")
            }
        }

        Section("Angle") {
            SliderRow(title: "Tilt (pitch)", value: $settings.pitch, range: -45...45, format: "%.0f°")
            SliderRow(title: "Turn (yaw)", value: $settings.yaw, range: -45...45, format: "%.0f°")
            SliderRow(title: "Rotate (roll)", value: $settings.roll, range: -30...30, format: "%.0f°")
            SliderRow(title: "Perspective", value: $settings.perspective, range: 0...1)
        }

        Section("Focus & blur") {
            FeatureToggle("Depth of field", isOn: $settings.depthOfFieldEnabled) {
                Toggle("Focus follows cursor", isOn: $settings.focusFollowsCursor)
                SliderRow(title: "Blur amount", value: $settings.blurRadius, range: 1...40, format: "%.0f px")
                SliderRow(title: "Sharp area", value: $settings.focusSize, range: 0...1)
                SliderRow(title: "Falloff", value: $settings.focusSoftness, range: 0.02...1)
                SliderRow(title: "Radial blur", value: $settings.radialAmount, range: 0...1)
                SliderRow(title: "Depth blur", value: $settings.depthBlur, range: 0...1)
            }
            FeatureToggle("Motion blur", isOn: $settings.motionBlurEnabled,
                          help: "Blurs fast camera moves like a real shutter.", note: editorOnlyNote) {
                SliderRow(title: "Shutter", value: $settings.motionBlurAmount, range: 0.1...1, format: "%.0f°", scale: 360)
            }
        }

        Section("Cursor") {
            FeatureToggle("Show cursor", isOn: $settings.cursorVisible) {
                SliderRow(title: "Size", value: $settings.cursorScale, range: 0.6...4, format: "%.1f×")
                Toggle("Smooth movement", isOn: $settings.cursorSmoothing)
                Toggle("Click ripples", isOn: $settings.clickRipples)
                FeatureToggle("Hide when idle", isOn: $settings.hideIdleCursor) {
                    SliderRow(title: "After", value: $settings.cursorIdleSeconds, range: 0.5...10, format: "%.1f s")
                }
            }
        }

        Section("Look") {
            SliderRow(title: "Screen corners", value: $settings.cornerRadius, range: 0...120, format: "%.0f px")
            FeatureToggle("Vignette", isOn: $settings.vignetteEnabled) {
                SliderRow(title: "Strength", value: $settings.vignette, range: 0.05...1)
            }
            ColorPicker("Background", selection: backgroundColor, supportsOpacity: false)
        }

        Section("Presets") {
            ForEach(EffectSettings.presets, id: \.name) { preset in
                Button(preset.name) { settings.applyLook(from: preset.settings) }
            }
            Caption("Presets change the angle, zoom and blur, and keep your camera and cursor options.")
        }
    }

    private var backgroundColor: Binding<Color> {
        Binding(
            get: {
                let b = settings.background
                return Color(.sRGB, red: b.r, green: b.g, blue: b.b)
            },
            set: { color in
                let ns = NSColor(color).usingColorSpace(.sRGB) ?? .black
                settings.background = RGB(r: ns.redComponent, g: ns.greenComponent, b: ns.blueComponent)
            })
    }
}

/// A switch whose options only show while it's on.
struct FeatureToggle<Content: View>: View {
    let title: String
    @Binding var isOn: Bool
    var help: String?
    var note: String?
    @ViewBuilder var content: () -> Content

    init(_ title: String, isOn: Binding<Bool>, help: String? = nil, note: String? = nil,
         @ViewBuilder content: @escaping () -> Content = { EmptyView() }) {
        self.title = title
        _isOn = isOn
        self.help = help
        self.note = note
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(title, isOn: $isOn.animation(.easeOut(duration: 0.15)))
                .help(help ?? "")
            if let note { Caption(note) }
            if isOn {
                content().padding(.leading, 12)
            }
        }
    }
}

struct Caption: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.caption).foregroundStyle(.secondary)
    }
}

struct SliderRow: View {
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    var format = "%.2f"
    var scale = 1.0
    var unit = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(title)
                Spacer()
                Text(String(format: format, value * scale) + unit).monospacedDigit().foregroundStyle(.secondary)
            }
            Slider(value: $value, in: range)
        }
    }
}

/// Layer-hosting view; the renderers put IOSurfaces straight into its layer.
struct LayerView: NSViewRepresentable {
    let onLayer: (CALayer) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        let layer = CALayer()
        layer.contentsGravity = .resizeAspect
        layer.backgroundColor = NSColor.black.cgColor
        view.layer = layer
        view.wantsLayer = true
        onLayer(layer)
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}
