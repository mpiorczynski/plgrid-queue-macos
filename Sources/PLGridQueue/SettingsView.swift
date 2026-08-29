import SwiftUI

/// Preferences window. Ports the settings from the original GNOME `prefs.js`
/// (hosts, refresh interval, connect timeout, show-icon) using a macOS-native
/// `Settings` scene, and adds a launch-at-login toggle.
struct SettingsView: View {
    @ObservedObject var settings: SettingsStore
    let appDelegate: AppDelegate

    @State private var hostsDraft: String = ""

    var body: some View {
        TabView {
            clusterSettings
                .tabItem { Label("General", systemImage: "list.bullet.rectangle") }
        }
        .frame(width: 420)
        .padding(20)
        .onAppear {
            hostsDraft = settings.hosts.joined(separator: ", ")
        }
        .onDisappear {
            saveHosts()
        }
        .onChange(of: settings.hostsRaw) { _ in
            // Keep draft in sync if the store changes externally.
            hostsDraft = settings.hosts.joined(separator: ", ")
        }
    }

    private var clusterSettings: some View {
        Form {
            Section {
                TextField("SSH Host Aliases", text: $hostsDraft)
                    .onSubmit { saveHosts() }
                Text("Comma-separated PLGrid cluster host aliases matching your ~/.ssh/config.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } header: {
                Text("Cluster Configuration")
            }

            Section {
                Stepper(value: $settings.refreshInterval, in: 30...3600, step: 30) {
                    LabeledContent {
                        Text("\(settings.refreshInterval) sec")
                    } label: {
                        Text("Refresh Interval")
                    }
                }
                Text("Interval between squeue queries. Minimum 30s.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Stepper(value: $settings.connectTimeout, in: 2...30, step: 1) {
                    LabeledContent {
                        Text("\(settings.connectTimeout) sec")
                    } label: {
                        Text("SSH Connection Timeout")
                    }
                }
                Text("Timeout for each single SSH command attempt.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } header: {
                Text("Polling and Connection")
            }

            Section {
                Toggle("Show Icon in Menu Bar", isOn: $settings.showIcon)
                Toggle("Launch at Login", isOn: $settings.launchAtLogin)
                    .onChange(of: settings.launchAtLogin) { newValue in
                        appDelegate.applyLaunchAtLogin(newValue)
                    }
            } header: {
                Text("Appearance & Startup")
            }
        }
        .formStyle(.grouped)
    }

    private func saveHosts() {
        let parsed = hostsDraft
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        settings.hostsRaw = (parsed.isEmpty ? ["athena", "helios"] : parsed).joined(separator: ", ")
    }
}
