// Exports real macOS icons (file types, Apple apps for the Dock, Finder sidebar symbols) as PNGs.
// Usage: swiftc -O scripts/export-macos-icons.swift -o /tmp/export-icons && /tmp/export-icons public/macos
import AppKit
import UniformTypeIdentifiers

_ = NSApplication.shared
let out = URL(fileURLWithPath: CommandLine.arguments[1])
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

func save(_ image: NSImage, _ name: String, _ px: Int) {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = NSSize(width: px, height: px)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.imageInterpolation = .high
  image.draw(in: NSRect(x: 0, y: 0, width: px, height: px), from: .zero, operation: .copy, fraction: 1)
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: out.appendingPathComponent("\(name).png"))
}

// Finder file icons (shown at ~20-60 px, zoomed by the camera).
let types: [(String, UTType?)] = [
  ("folder", .folder), ("mp4", .mpeg4Movie), ("png", .png), ("txt", .plainText),
  ("xlsx", UTType("org.openxmlformats.spreadsheetml.sheet")), ("mov", .quickTimeMovie),
  ("key", UTType("com.apple.iwork.keynote.key")), ("md", UTType(filenameExtension: "md")), ("zip", .zip),
  ("m4a", .mpeg4Audio), ("heic", .heic), ("pdf", .pdf),
]
for (name, type) in types {
  guard let type else { print("missing type", name); continue }
  save(NSWorkspace.shared.icon(for: type), "file-\(name)", 160)
}

// Dock: Apple's own apps only.
let apps: [(String, String)] = [
  ("finder", "/System/Library/CoreServices/Finder.app"), ("apps", "/System/Applications/Apps.app"),
  ("safari", "/Applications/Safari.app"), ("messages", "/System/Applications/Messages.app"),
  ("mail", "/System/Applications/Mail.app"), ("maps", "/System/Applications/Maps.app"),
  ("photos", "/System/Applications/Photos.app"), ("facetime", "/System/Applications/FaceTime.app"),
  ("calendar", "/System/Applications/Calendar.app"), ("notes", "/System/Applications/Notes.app"),
  ("music", "/System/Applications/Music.app"), ("appstore", "/System/Applications/App Store.app"),
  ("settings", "/System/Applications/System Settings.app"),
]
for (name, path) in apps {
  // Resolve aliases/symlinks (Safari lives in a cryptex) so there is no alias badge.
  let real = URL(fileURLWithPath: path).resolvingSymlinksInPath().path
  save(NSWorkspace.shared.icon(forFile: real), "app-\(name)", 192)
}
if let trash = NSImage(contentsOfFile: "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/TrashIcon.icns") {
  save(trash, "app-trash", 192)
}

// Finder sidebar glyphs, tinted like the sidebar.
let symbols: [(String, String)] = [
  ("recents", "clock"), ("applications", "a.square"), ("desktop", "menubar.dock.rectangle"), ("documents", "doc"),
  ("downloads", "arrow.down.circle"), ("folder", "folder"), ("icloud", "icloud"), ("shared", "folder.badge.person.crop"),
  ("drive", "internaldrive"), ("network", "network"),
]
for (name, symbol) in symbols {
  guard let base = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)?
    .withSymbolConfiguration(.init(pointSize: 44, weight: .regular)) else { print("missing symbol", symbol); continue }
  let tinted = NSImage(size: NSSize(width: 64, height: 64), flipped: false) { rect in
    let s = base.size, k = min(52 / s.width, 52 / s.height)
    let r = NSRect(x: (64 - s.width * k) / 2, y: (64 - s.height * k) / 2, width: s.width * k, height: s.height * k)
    base.draw(in: r)
    NSColor(srgbRed: 0, green: 0.478, blue: 1, alpha: 1).set()
    r.fill(using: .sourceAtop)
    return true
  }
  save(tinted, "side-\(name)", 64)
}
print("done")
