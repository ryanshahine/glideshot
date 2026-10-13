import AppKit

/// "Check for Updates…": asks GitHub for the latest release and offers to open it.
/// Glideshot only goes online when someone chooses this, and only to read the latest version number.
@MainActor
enum Updates {
    static let repo = "ryanshahine/glideshot"
    static let releasesURL = URL(string: "https://github.com/\(repo)/releases")!

    static var currentVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    private static var checking = false

    static func check() {
        guard !checking else { return }
        checking = true
        Task {
            let result = await latestRelease()
            checking = false
            show(result)
        }
    }

    private struct Release: Decodable {
        let tag_name: String
        let html_url: URL
    }

    private static func latestRelease() async -> Result<Release, Error> {
        var request = URLRequest(url: URL(string: "https://api.github.com/repos/\(repo)/releases/latest")!)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            return .success(try JSONDecoder().decode(Release.self, from: data))
        } catch {
            return .failure(error)
        }
    }

    private static func show(_ result: Result<Release, Error>) {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        switch result {
        case .success(let release) where isNewer(release.tag_name, than: currentVersion):
            alert.messageText = "Glideshot \(version(fromTag: release.tag_name)) is available"
            alert.informativeText = "You have version \(currentVersion). Download the new version and replace Glideshot in your Applications folder."
            alert.addButton(withTitle: "Download")
            alert.addButton(withTitle: "Later")
            if alert.runModal() == .alertFirstButtonReturn { NSWorkspace.shared.open(release.html_url) }
        case .success:
            alert.messageText = "Glideshot is up to date"
            alert.informativeText = "Version \(currentVersion) is the latest version."
            alert.runModal()
        case .failure:
            alert.messageText = "Couldn't check for updates"
            alert.informativeText = "GitHub couldn't be reached. The latest version is always on the releases page."
            alert.addButton(withTitle: "Open Releases")
            alert.addButton(withTitle: "OK")
            if alert.runModal() == .alertFirstButtonReturn { NSWorkspace.shared.open(releasesURL) }
        }
    }

    /// "v1.2.0" → "1.2.0"
    static func version(fromTag tag: String) -> String {
        tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
    }

    /// Compares dotted version numbers: "v0.10.0" is newer than "0.9.2", "0.2" equals "0.2.0".
    static func isNewer(_ tag: String, than current: String) -> Bool {
        let a = numbers(version(fromTag: tag)), b = numbers(current)
        for i in 0..<max(a.count, b.count) {
            let x = i < a.count ? a[i] : 0, y = i < b.count ? b[i] : 0
            if x != y { return x > y }
        }
        return false
    }

    private static func numbers(_ version: String) -> [Int] {
        version.split(separator: ".").map { Int($0.prefix(while: \.isNumber)) ?? 0 }
    }
}
