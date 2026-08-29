import AppKit
import SwiftUI

import PLGridQueueCore

/// The dropdown menu contents shown under the menu bar icon. Ports the menu
/// structure from the original GNOME `indicator.js` (`_rebuildMenuContents`,
/// `_buildHostSection`, `_buildJobItem`).
struct QueueMenuView: View {
    @ObservedObject var model: QueueModel
    @ObservedObject var settings: SettingsStore

    @State private var copiedMessage: String?

    private let hostEmojis: [String: String] = [
        "helios": "☀️",
        "athena": "🦉",
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            content
            Divider()
            footer
        }
        .fixedSize()
        .frame(minWidth: 240)
        .padding(.vertical, 4)
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("PLGrid Slurm Queue")
                .font(.headline)
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .padding(.bottom, 6)
    }

    private var subtitle: String {
        let hostDistinct = (model.status?.hosts ?? []).map { $0.host }
        let hostNames = (hostDistinct.isEmpty ? settings.hosts : hostDistinct).joined(separator: ", ")
        let time = Self.formatTime(model.status?.timestamp)
        return "\(hostNames) • Updated at \(time)"
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if let status = model.status {
            ForEach(status.hosts, id: \.host) { hostResult in
                hostSection(hostResult)
            }
        } else {
            Text(model.isRefreshing ? "Fetching queue data..." : "No data")
                .font(.callout)
                .foregroundStyle(.secondary)
                .padding(10)
        }
    }

    @ViewBuilder
    private func hostSection(_ hostResult: HostResult) -> some View {
        HStack(spacing: 6) {
            hostIcon(hostResult)
            Text(HostResult.capitalizedName(of: hostResult))
                .font(.headline)
            Spacer()
            Text(hostStatusText(hostResult))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)

        if !hostResult.ok {
            Text(hostResult.error ?? "Could not connect to host via SSH.")
                .font(.caption)
                .foregroundStyle(.red)
                .padding(.horizontal, 10)
                .padding(.bottom, 4)
        } else if hostResult.jobs.isEmpty {
            Text("No active jobs")
                .font(.callout)
                .italic()
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.bottom, 4)
        } else {
            ForEach(hostResult.jobs) { job in
                jobRow(job)
            }
        }
    }

    @ViewBuilder
    private func hostIcon(_ hostResult: HostResult) -> some View {
        if hostResult.ok, let emoji = hostEmojis[hostResult.host.lowercased()] {
            Text(emoji)
        } else if hostResult.ok {
            Image(systemName: "desktopcomputer")
        } else {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Color.orange)
        }
    }

    private func hostStatusText(_ hostResult: HostResult) -> String {
        if hostResult.ok {
            return "(\(hostResult.runningCount) R, \(hostResult.queuedCount) Q)"
        }
        return "(Connection Error)"
    }

    private func jobRow(_ job: Job) -> some View {
        Button {
            copyJobID(job)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    stateBadge(job)
                    Text(job.name)
                        .font(.callout.weight(.semibold))
                        .lineLimit(1)
                    Spacer()
                    Text("#\(job.jobId)")
                        .font(.callout.monospaced())
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: 6) {
                    chip(job.partition)
                    chip("⏱ \(job.time)")
                    if !job.reasonOrNode.isEmpty {
                        chip(job.isRunning ? "📍 \(job.reasonOrNode)" : "⏳ \(job.reasonOrNode)")
                    }
                }
            }
            .padding(.vertical, 3)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 10)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func stateBadge(_ job: Job) -> some View {
        let color = badgeColor(job)
        Text("[\(job.state)]")
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(color.opacity(0.25))
            .foregroundStyle(color)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(color.opacity(0.6), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    private func badgeColor(_ job: Job) -> Color {
        if job.isRunning { return .green }
        if job.isQueued { return .orange }
        return .gray
    }

    private func chip(_ text: String) -> some View {
        Text(text)
            .font(.caption2)
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(Color.secondary.opacity(0.15))
            .clipShape(RoundedRectangle(cornerRadius: 3))
    }

    // MARK: - Footer

    private var footer: some View {
        HStack {
            Text("Slurm Monitor")
                .font(.caption)
                .foregroundStyle(.secondary)

            Spacer()

            if let copied = copiedMessage {
                Text(copied)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .transition(.opacity)
            }

            Button {
                model.refresh(settings: settings)
            } label: {
                Image(systemName: model.isRefreshing ? "arrow.clockwise.circle" : "arrow.clockwise")
                    .rotationEffect(.degrees(model.isRefreshing ? 360 : 0))
                    .animation(model.isRefreshing ? .linear(duration: 1).repeatForever(autoreverses: false) : .default,
                               value: model.isRefreshing)
            }
            .buttonStyle(.borderless)
            .disabled(model.isRefreshing)
            .help("Refresh now")

            Button {
                openSettingsWindow()
            } label: {
                Image(systemName: "gearshape")
            }
            .buttonStyle(.borderless)
            .help("Settings")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
    }

    /// Copies only the numeric job id to the clipboard, keeping the menu open.
    /// Mirrors `_copyJobToClipboard` from the original `indicator.js`.
    private func copyJobID(_ job: Job) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(job.clipboardID, forType: .string)

        withAnimation {
            copiedMessage = "ID copied to clipboard"
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            withAnimation {
                copiedMessage = nil
            }
        }
    }

    private func openSettingsWindow() {
        // macOS 13 does not expose the `openSettings` environment action, so
        // route through the AppKit responder chain to the settings scene.
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }

    // MARK: - Formatting helpers

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    private static func formatTime(_ date: Date?) -> String {
        guard let date else { return "--:--:--" }
        return timeFormatter.string(from: date)
    }
}

private extension HostResult {
    static func capitalizedName(of result: HostResult) -> String {
        result.host.capitalized
    }
}
