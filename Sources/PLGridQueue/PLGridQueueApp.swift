import AppKit
import SwiftUI

import PLGridQueueCore

@main
struct PLGridQueueApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var settings = SettingsStore()
    @StateObject private var model = QueueModel()

    init() {
        appDelegate.configure(model: model, settings: settings)
    }

    var body: some Scene {
        MenuBarExtra {
            QueueMenuView(model: model, settings: settings)
        } label: {
            Label {
                Text(model.menuBarText)
            } icon: {
                if settings.showIcon {
                    Image(systemName: "list.bullet.rectangle")
                }
            }
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(settings: settings, appDelegate: appDelegate)
        }
    }
}
