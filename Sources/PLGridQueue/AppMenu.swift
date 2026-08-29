import AppKit
import ServiceManagement
import SwiftUI

import PLGridQueueCore

/// App lifecycle adapter. Ensures the app runs as a menu-bar accessory with no
/// dock icon, manages launch-at-login registration on macOS 13+, and starts the
/// queue polling loop once the app finishes launching.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var model: QueueModel?
    private var settings: SettingsStore?
    private var settingsWindowController: NSWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        if let model, let settings {
            model.start(settings: settings)
        }
        // Apply the persisted launch-at-login preference, but only when it is
        // actually enabled so we don't unnecessarily unregister on every launch.
        if let settings, settings.launchAtLogin {
            applyLaunchAtLogin(true)
        }
    }

    /// A menu-bar accessory must stay alive even when all of its windows
    /// (e.g. the Settings window) are closed.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    /// Called by the SwiftUI app to provide dependencies for startup.
    func configure(model: QueueModel, settings: SettingsStore) {
        self.model = model
        self.settings = settings
    }

    /// Presents the preferences window. Uses an explicit AppKit window instead
    /// of the SwiftUI `Settings` scene, because the responder-chain action that
    /// opens that scene is unreliable for this menu-bar accessory.
    func showSettings() {
        let window: NSWindow
        if let existing = settingsWindowController?.window {
            window = existing
        } else {
            guard let settings else { return }
            let hosting = NSHostingController(
                rootView: SettingsView(settings: settings, appDelegate: self)
            )
            let created = NSWindow(contentViewController: hosting)
            created.title = "PLGrid Queue Preferences"
            created.styleMask = [.titled, .closable, .miniaturizable]
            created.setContentSize(NSSize(width: 460, height: 420))
            created.isReleasedWhenClosed = false
            created.center()

            let controller = NSWindowController(window: created)
            settingsWindowController = controller
            window = created
        }

        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        // Accessory apps sometimes still keep the window behind; force it to
        // the front unconditionally.
        window.orderFrontRegardless()
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
