// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PLGridQueue",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .target(
            name: "PLGridQueueCore",
            path: "Sources/PLGridQueueCore"
        ),
        .executableTarget(
            name: "PLGridQueue",
            dependencies: ["PLGridQueueCore"],
            path: "Sources/PLGridQueue"
        ),
        .executableTarget(
            name: "PLGridQueueTestRunner",
            dependencies: ["PLGridQueueCore"],
            path: "Tests/PLGridQueueTestRunner"
        ),
    ]
)
