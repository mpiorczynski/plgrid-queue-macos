import AppKit
import ServiceManagement
import SwiftUI

import PLGridQueueCore

/// App lifecycle adapter. Ensures the app runs as a menu-bar accessory with no
/// dock icon, manages launch-at-login registration on macOS 13+, and starts the
/// queue polling loop once the app finishes launching.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private weak var model: QueueModel?
    private var settings: SettingsStore?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        if let model, let settings {
            model.start(settings: settings)
        }
        applyLaunchAtLogin(SettingsStore().launchAtLogin)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    /// Called by the SwiftUI app to provide dependencies for startup.
    func configure(model: QueueModel, settings: SettingsStore) {
        self.model = model
        self.settings = settings
    }

    /// Registers or deregisters the app to launch at login via SMAppService.
    /// Falls back silently on platforms below macOS 13.
    func applyLaunchAtLogin(_ enabled: Bool) {
        guard #available(macOS 13.0, *) else { return }
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            NSLog("PLGridQueue: failed to update launch-at-login: \(error)")
        }
    }
}
