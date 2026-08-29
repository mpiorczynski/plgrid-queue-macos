import Foundation
import SwiftUI

/// Persists user preferences. Replaces the GNOME `gschema` + GSettings keys
/// (`hosts`, `refresh-interval`, `connect-timeout`, `show-icon`, plus a new
/// `launch-at-login` toggle and `panel` keys are dropped as they do not apply).
final class SettingsStore: ObservableObject {
    @AppStorage("hosts", store: SettingsStore.userDefaults)
    var hostsRaw: String = "athena, helios"

    @AppStorage("refreshInterval", store: SettingsStore.userDefaults)
    var refreshInterval: Int = 60

    @AppStorage("connectTimeout", store: SettingsStore.userDefaults)
    var connectTimeout: Int = 5

    @AppStorage("showIcon", store: SettingsStore.userDefaults)
    var showIcon: Bool = true

    @AppStorage("launchAtLogin", store: SettingsStore.userDefaults)
    var launchAtLogin: Bool = false

    /// The list of host aliases parsed from the comma-separated string.
    var hosts: [String] {
        let parsed = hostsRaw
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return parsed.isEmpty ? ["athena", "helios"] : parsed
    }

    /// Effective refresh interval, clamped to the UI minimum of 30 seconds
    /// (mirrors the GNOME extension which uses `Math.max(10, ...)`).
    var effectiveRefreshInterval: Int {
        max(30, refreshInterval)
    }

    /// Effective connect timeout, clamped to the UI minimum of 2 seconds.
    var effectiveConnectTimeout: Int {
        max(2, connectTimeout)
    }

    static var userDefaults: UserDefaults {
        // Use standard defaults; a custom suite is used only if needed.
        .standard
    }
}
