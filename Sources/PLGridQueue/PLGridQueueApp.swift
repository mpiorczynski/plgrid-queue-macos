import AppKit
import SwiftUI

import PLGridQueueCore

@main
struct PLGridQueueApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var settings: SettingsStore
    @StateObject private var model: QueueModel

    init() {
        // Create the model and settings exactly once and reuse the same
        // instances for both SwiftUI's StateObjects and the app delegate. This
        // avoids reading a @StateObject in init(), which would yield throwaway
        // instances that are never the ones bound to the views, leaving the
        // delegate to start polling the wrong objects.
        let settings = SettingsStore()
        let model = QueueModel()
        _settings = StateObject(wrappedValue: settings)
        _model = StateObject(wrappedValue: model)
        appDelegate.configure(model: model, settings: settings)
    }

    var body: some Scene {
        MenuBarExtra {
            QueueMenuView(model: model, settings: settings, appDelegate: appDelegate)
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
