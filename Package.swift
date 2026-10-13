// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "Glideshot",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "Glideshot", path: "Sources/Glideshot")
    ]
)
