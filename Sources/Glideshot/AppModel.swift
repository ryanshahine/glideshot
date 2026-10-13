import AppKit
import Carbon.HIToolbox
import ScreenCaptureKit
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    /// The live look, and the default look for new takes.
    @Published var settings: EffectSettings {
        didSet {
            guard settings != oldValue else { return }
            engine.update(settings: settings)
            Store.save(settings, "effect")
        }
    }

    @Published var output: OutputSettings {
        didSet {
            guard output != oldValue else { return }
            engine.update(output: output)
            Store.save(output, "output")
            if output.hideWhileRecording && !oldValue.hideWhileRecording {
                DispatchQueue.main.async { self.showHideWhileRecordingTip() }
            }
        }
    }

    @Published private(set) var displays: [SCDisplay] = []
    @Published private(set) var displayID: CGDirectDisplayID = CGMainDisplayID()
    @Published private(set) var isRecording = false
    @Published private(set) var hiddenWhileRecording = false
    @Published private(set) var isSaving = false
    @Published private(set) var recordingStart: Date?
    @Published private(set) var droppedFrames = 0
    @Published private(set) var needsPermission = false
    @Published private(set) var status = "Starting…"
    @Published private(set) var recentTakes: [Take] = []
    @Published private(set) var activeExports = 0
    @Published private(set) var quickExportProgress: Double?

    let engine = CaptureEngine()
    private var captureTask: Task<Void, Never>?
    private var restartWork: DispatchWorkItem?
    private var dropTimer: Timer?
    private var editorWindows: [URL: NSWindow] = [:]
    private var editorDelegates: [URL: EditorWindowDelegate] = [:]
    private var recordHotKeyAvailable = false
    /// Set by the main window so it can be reopened from the menu bar.
    var openMainWindow: (() -> Void)?

    private init() {
        settings = Store.load("effect", default: EffectSettings())
        output = Store.load("output", default: OutputSettings())
        engine.update(settings: settings)
        engine.update(output: output)
        recentTakes = Take.recent()

        engine.onStreamStopped = { [weak self] error in
            DispatchQueue.main.async { self?.captureStopped(error) }
        }
        let ws = NSWorkspace.shared.notificationCenter
        ws.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.scheduleRestart(after: 1.5) }
        }
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, !self.isRecording else { return }
                self.scheduleRestart(after: 1)
            }
        }

        recordHotKeyAvailable = HotKeys.shared.register(keyCode: kVK_ANSI_R) { [weak self] in self?.toggleRecording() }
        // Pause the live preview whenever its window isn't visible (minimized, covered, hidden, other Space).
        NotificationCenter.default.addObserver(
            forName: NSWindow.didChangeOcclusionStateNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.updatePreviewVisibility() }
        }
        NotificationCenter.default.addObserver(
            forName: NSApplication.didHideNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.updatePreviewVisibility() }
        }

        HotKeys.shared.register(keyCode: kVK_ANSI_L) { [weak self] in self?.toggleLock() }
        HotKeys.shared.register(keyCode: kVK_ANSI_Equal) { [weak self] in self?.nudgeZoom(0.25) }
        HotKeys.shared.register(keyCode: kVK_ANSI_Minus) { [weak self] in self?.nudgeZoom(-0.25) }
    }

    // MARK: Capture

    func bootstrap() {
        if !CGPreflightScreenCaptureAccess() { CGRequestScreenCaptureAccess() }
        restartCapture()
        if let path = ProcessInfo.processInfo.environment["GLIDESHOT_OPEN_TAKE"] {
            openEditor(Take(folder: URL(fileURLWithPath: path)))
        }
    }

    func selectDisplay(_ id: CGDirectDisplayID) {
        guard id != displayID, !isRecording else { return }
        displayID = id
        restartCapture()
    }

    func restartCapture() {
        captureTask?.cancel()
        captureTask = Task {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                guard !Task.isCancelled else { return }
                displays = content.displays
                guard let display = content.displays.first(where: { $0.displayID == displayID }) ?? content.displays.first else {
                    status = "No display found"
                    return
                }
                displayID = display.displayID
                // Leave our own windows out of the recording (otherwise the preview films itself).
                let ownApp = content.applications.filter { $0.bundleIdentifier == Bundle.main.bundleIdentifier }
                try await engine.startCapture(display: display, excluding: ownApp)
                needsPermission = false
                if !isRecording && !isSaving { status = "Live" }
            } catch {
                needsPermission = !CGPreflightScreenCaptureAccess()
                status = needsPermission ? "Screen Recording permission needed" : error.localizedDescription
            }
        }
    }

    private func scheduleRestart(after delay: Double) {
        restartWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.restartCapture() }
        restartWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    /// Sleep, display changes or system interruptions: save what was recorded and reconnect.
    private func captureStopped(_ error: Error) {
        if isRecording {
            stopRecording(openEditor: true)
            status = "Capture was interrupted, the take was saved. Reconnecting…"
        } else {
            status = "Capture interrupted, reconnecting…"
        }
        scheduleRestart(after: 2)
    }

    // MARK: Recording

    func toggleRecording() {
        if isRecording { stopRecording(openEditor: output.openEditorAfterRecording) } else { startRecording() }
    }

    func startRecording() {
        guard !isRecording, !isSaving else { return }
        do {
            let take = try Take.makeNew()
            try engine.startRecording(into: take)
            isRecording = true
            recordingStart = Date()
            droppedFrames = 0
            status = "Recording"
            if output.hideWhileRecording {
                if recordHotKeyAvailable {
                    setHiddenWhileRecording(true)
                } else {
                    // Without the shortcut there'd be no way to stop, so stay visible.
                    status = "Recording (⌃⌥⌘R is taken by another app, so Glideshot stays visible)"
                }
            }
            dropTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.droppedFrames = self.engine.droppedFrames
                }
            }
        } catch {
            status = "Couldn't start recording: \(error.localizedDescription)"
        }
    }

    func stopRecording(openEditor: Bool, then done: (() -> Void)? = nil) {
        guard isRecording else {
            done?()
            return
        }
        isRecording = false
        isSaving = true
        recordingStart = nil
        setHiddenWhileRecording(false)
        dropTimer?.invalidate()
        status = "Saving take…"
        let quickExport = output.quickExport
        engine.stopRecording { result in
            DispatchQueue.main.async {
                self.isSaving = false
                self.recentTakes = Take.recent()
                switch result {
                case .success(let take):
                    self.status = "Saved \(take.name)"
                    if openEditor { self.openEditor(take) }
                    if quickExport { self.quickExport(take) }
                case .failure(let error):
                    self.status = "Saving failed: \(error.localizedDescription)"
                }
                done?()
            }
        }
    }

    private func quickExport(_ take: Take) {
        let settings = take.loadLook(default: self.settings)
        let output = self.output
        exportStarted()
        quickExportProgress = 0
        Task.detached(priority: .userInitiated) { [weak self] in
            let result = Result {
                try Exporter.exportAll(take: take, settings: settings, output: output, progress: { p in
                    DispatchQueue.main.async { self?.quickExportProgress = p }
                }, cancel: CancelFlag())
            }
            await MainActor.run {
                guard let self else { return }
                self.exportFinished()
                self.quickExportProgress = nil
                switch result {
                case .success(let urls):
                    self.status = "Exported \(urls.map(\.lastPathComponent).joined(separator: ", "))"
                    NSWorkspace.shared.activateFileViewerSelecting(urls)
                case .failure(let error):
                    self.status = "Export failed: \(error.localizedDescription)"
                }
            }
        }
    }

    func waitUntilSaved(_ done: @escaping () -> Void) {
        if !isSaving { return done() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.waitUntilSaved(done) }
    }

    // MARK: Hide while recording

    private func setHiddenWhileRecording(_ hidden: Bool) {
        guard hidden != hiddenWhileRecording else { return }
        hiddenWhileRecording = hidden
        if hidden {
            NSApp.hide(nil)
            NSApp.setActivationPolicy(.accessory)  // removes the Dock icon
        } else {
            NSApp.setActivationPolicy(.regular)
            NSApp.unhide(nil)
        }
    }

    /// Escape hatch: opening Glideshot again (Spotlight, Finder) while hidden brings it back.
    func revealWhileRecording() {
        setHiddenWhileRecording(false)
        showMainWindow()
    }

    func showMainWindow() {
        NSApp.activate(ignoringOtherApps: true)
        if let open = openMainWindow {
            open()
        } else {
            NSApp.windows.first { $0.title == "Glideshot" }?.makeKeyAndOrderFront(nil)
        }
    }

    func showHideWhileRecordingTip() {
        let key = "hideWhileRecordingTipSuppressed"
        guard !UserDefaults.standard.bool(forKey: key) else { return }
        let alert = NSAlert()
        alert.messageText = "Stop recording with ⌃⌥⌘R"
        alert.informativeText = """
            While recording, Glideshot hides its windows, Dock icon and menu bar icon so they stay out of your video.

            To stop, press Control-Option-Command-R (⌃⌥⌘R).

            Forgot the shortcut? Open Glideshot again from Spotlight or your Applications folder to bring it back.
            """
        alert.showsSuppressionButton = true
        alert.suppressionButton?.title = "Don't show this again"
        alert.suppressionButton?.state = .off
        alert.addButton(withTitle: "Got It")
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
        if alert.suppressionButton?.state == .on { UserDefaults.standard.set(true, forKey: key) }
    }

    func updatePreviewVisibility() {
        let visible = !NSApp.isHidden && NSApp.windows.contains {
            $0.title == "Glideshot" && $0.isVisible && $0.occlusionState.contains(.visible)
        }
        engine.setPreviewVisible(visible)
    }

    func exportStarted() { activeExports += 1 }
    func exportFinished() { activeExports = max(0, activeExports - 1) }

    // MARK: Takes & editor

    func openEditor(_ take: Take) {
        if let window = editorWindows[take.folder] {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        do {
            let model = try EditorModel(take: take, defaultSettings: settings, output: output)
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 1320, height: 840),
                styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            window.title = "\(take.name) — Glideshot Editor"
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: EditorView(model: model))
            window.center()
            let delegate = EditorWindowDelegate { [weak self] in
                model.close()
                self?.editorWindows[take.folder] = nil
                self?.editorDelegates[take.folder] = nil
            }
            window.delegate = delegate
            editorWindows[take.folder] = window
            editorDelegates[take.folder] = delegate
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        } catch {
            status = "Couldn't open \(take.name): \(error.localizedDescription)"
        }
    }

    func openTakePanel() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.directoryURL = Take.libraryFolder
        panel.prompt = "Open Take"
        if panel.runModal() == .OK, let url = panel.url { openEditor(Take(folder: url)) }
    }

    func showTakesInFinder() {
        try? FileManager.default.createDirectory(at: Take.libraryFolder, withIntermediateDirectories: true)
        NSWorkspace.shared.open(Take.outputFolder)
    }

    // MARK: Camera shortcuts

    /// Follow → lock the camera where the mouse is now. Locked → follow again.
    func toggleLock() {
        if settings.mode == .follow {
            lockAtMouse()
            settings.mode = .locked
        } else {
            settings.mode = .follow
        }
    }

    func lockAtMouse() {
        let p = engine.input.current().point
        settings.lockedX = min(max(p.x, 0), 1)
        settings.lockedY = min(max(p.y, 0), 1)
    }

    func nudgeZoom(_ delta: Double) {
        settings.zoom = min(max(settings.zoom + delta, 0.5), 6)
    }

    func openPrivacySettings() {
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!)
    }

    func displayName(_ display: SCDisplay) -> String {
        let screen = NSScreen.screens.first {
            ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == display.displayID
        }
        return "\(screen?.localizedName ?? "Display \(display.displayID)") (\(display.width)×\(display.height))"
    }
}

final class EditorWindowDelegate: NSObject, NSWindowDelegate {
    private let onClose: () -> Void

    init(onClose: @escaping () -> Void) {
        self.onClose = onClose
    }

    func windowWillClose(_ notification: Notification) {
        onClose()
    }
}

/// Finishes a running recording before quitting, so the take is never lost.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        let model = AppModel.shared
        if model.activeExports > 0 {
            let alert = NSAlert()
            alert.messageText = "An export is still running"
            alert.informativeText = "Quitting now stops the export and leaves an unfinished video."
            alert.addButton(withTitle: "Keep Exporting")
            alert.addButton(withTitle: "Quit Anyway")
            if alert.runModal() == .alertFirstButtonReturn { return .terminateCancel }
        }
        guard model.isRecording || model.isSaving else { return .terminateNow }
        if model.isRecording { model.stopRecording(openEditor: false) }
        DispatchQueue.main.async {
            model.waitUntilSaved { sender.reply(toApplicationShouldTerminate: true) }
        }
        return .terminateLater
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        StatusBarController.shared.install()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        let model = AppModel.shared
        if model.hiddenWhileRecording {
            model.revealWhileRecording()
            return false
        }
        if !flag {
            model.showMainWindow()
            return false
        }
        return true
    }
}
