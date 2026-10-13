import AppKit
import Combine

/// The menu bar item: an aperture icon normally, a red dot with the elapsed time while recording.
/// The menu lists every action with its global shortcut so people can learn them.
@MainActor
final class StatusBarController: NSObject, NSMenuDelegate {
    static let shared = StatusBarController()

    private var item: NSStatusItem?
    private var timer: Timer?
    private var observers: Set<AnyCancellable> = []

    private let shortcut: NSEvent.ModifierFlags = [.control, .option, .command]

    private lazy var recordingDot: NSImage = {
        let image = NSImage(size: NSSize(width: 12, height: 12), flipped: false) { rect in
            NSColor.systemRed.setFill()
            NSBezierPath(ovalIn: rect.insetBy(dx: 1.5, dy: 1.5)).fill()
            return true
        }
        image.isTemplate = false  // keep it red
        return image
    }()

    private lazy var idleIcon: NSImage? = {
        let image = NSImage(systemSymbolName: "camera.aperture", accessibilityDescription: "Glideshot")
        image?.isTemplate = true
        return image
    }()

    func install() {
        guard item == nil else { return }
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        self.item = item

        let model = AppModel.shared
        // @Published fires before the value changes; hop to the next run loop turn to read the new state.
        model.$isRecording.combineLatest(model.$hiddenWhileRecording)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.refresh() } }
            .store(in: &observers)
        refresh()
        if ProcessInfo.processInfo.environment["GLIDESHOT_DEBUG"] != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                NSLog("status item visible: %@ frame: %@ image: %@", "\(item.isVisible)",
                      NSStringFromRect(item.button?.window?.frame ?? .zero), "\(item.button?.image != nil)")
            }
        }
    }

    private func refresh() {
        let model = AppModel.shared
        item?.isVisible = !model.hiddenWhileRecording
        guard let button = item?.button else { return }

        if model.isRecording {
            button.image = recordingDot
            button.imagePosition = .imageLeading
            updateElapsed()
            if timer == nil {
                let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
                    MainActor.assumeIsolated { self?.updateElapsed() }
                }
                RunLoop.main.add(t, forMode: .common)
                timer = t
            }
        } else {
            timer?.invalidate()
            timer = nil
            button.image = idleIcon
            button.title = ""
        }
    }

    private func updateElapsed() {
        guard let button = item?.button else { return }
        button.attributedTitle = NSAttributedString(
            string: " " + elapsedText(),
            attributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: NSFont.systemFontSize, weight: .medium)])
    }

    private func elapsedText() -> String {
        let t = Int(Date().timeIntervalSince(AppModel.shared.recordingStart ?? Date()))
        return String(format: "%d:%02d", t / 60, t % 60)
    }

    // MARK: Menu

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let model = AppModel.shared

        if model.isRecording {
            let status = NSMenuItem(title: "Recording · \(elapsedText())", action: nil, keyEquivalent: "")
            status.image = recordingDot
            status.isEnabled = false
            menu.addItem(status)
            menu.addItem(.separator())
        }

        let record = add(to: menu, model.isRecording ? "Stop Recording" : "Start Recording", #selector(toggleRecording), key: "r")
        record.isEnabled = !model.isSaving && !model.needsPermission
        add(to: menu, model.settings.mode == .follow ? "Lock Camera at Mouse" : "Follow Mouse", #selector(toggleLock), key: "l")
        add(to: menu, "Zoom In", #selector(zoomIn), key: "=")
        add(to: menu, "Zoom Out", #selector(zoomOut), key: "-")

        menu.addItem(.separator())
        let hide = add(to: menu, "Hide Glideshot While Recording", #selector(toggleHide))
        hide.state = model.output.hideWhileRecording ? .on : .off
        hide.toolTip = "Hides the windows, Dock icon and this menu bar icon while recording. Stop with ⌃⌥⌘R."

        menu.addItem(.separator())
        if !model.recentTakes.isEmpty { add(to: menu, "Edit Last Take", #selector(editLastTake)) }
        add(to: menu, "Show Glideshot", #selector(showMain))
        menu.addItem(.separator())
        let version = NSMenuItem(title: "Glideshot \(Updates.currentVersion)", action: nil, keyEquivalent: "")
        version.isEnabled = false
        menu.addItem(version)
        add(to: menu, "Check for Updates…", #selector(checkForUpdates))
        menu.addItem(.separator())
        add(to: menu, "Quit Glideshot", #selector(quit), key: "q", modifiers: [.command])
    }

    @discardableResult
    private func add(to menu: NSMenu, _ title: String, _ action: Selector, key: String = "",
                     modifiers: NSEvent.ModifierFlags? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.keyEquivalentModifierMask = key.isEmpty ? [] : (modifiers ?? shortcut)
        item.target = self
        menu.addItem(item)
        return item
    }

    @objc private func toggleRecording() { AppModel.shared.toggleRecording() }
    @objc private func toggleLock() { AppModel.shared.toggleLock() }
    @objc private func zoomIn() { AppModel.shared.nudgeZoom(0.25) }
    @objc private func zoomOut() { AppModel.shared.nudgeZoom(-0.25) }
    @objc private func toggleHide() { AppModel.shared.output.hideWhileRecording.toggle() }
    @objc private func showMain() { AppModel.shared.showMainWindow() }
    @objc private func checkForUpdates() { Updates.check() }
    @objc private func quit() { NSApp.terminate(nil) }

    @objc private func editLastTake() {
        if let take = AppModel.shared.recentTakes.first { AppModel.shared.openEditor(take) }
    }
}
