import Combine
import Foundation
import SwiftUI

import PLGridQueueCore

/// Holds the fetched queue state and manages the polling timer. Mirrors the
/// refresh/timer logic from the original GNOME `indicator.js`.
@MainActor
final class QueueModel: ObservableObject {
    @Published private(set) var status: QueueStatus?
    @Published private(set) var isRefreshing = false
    @Published var lastError: String?

    private let service = SlurmService()
    private var refreshTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var settingsCancellable: AnyCancellable?
    private var pollingStarted = false

    /// The text shown in the menu bar: `R: {n}  Q: {m}`, or `R: ?  Q: ?` on
    /// total connection failure (mirrors `_updateUI` in `indicator.js`).
    var menuBarText: String {
        if let status, status.isUnknown {
            return "R: ?  Q: ?"
        }
        guard let status else { return "R: -  Q: -" }
        return "R: \(status.runningTotal)  Q: \(status.queuedTotal)"
    }

    /// Starts the initial refresh and the polling loop, and observes the
    /// settings so that polling restarts whenever a relevant value changes.
    /// Replacing an existing loop is safe to call multiple times.
    func start(settings: SettingsStore) {
        guard !pollingStarted else { return }
        pollingStarted = true

        observeSettings(settings)

        refresh(settings: settings)
        schedulePolling(settings: settings)
    }

    /// Stops polling and cancels any in-flight refresh.
    func stop() {
        pollingStarted = false
        settingsCancellable?.cancel()
        settingsCancellable = nil
        pollTask?.cancel()
        pollTask = nil
        refreshTask?.cancel()
        refreshTask = nil
    }

    /// Restarts polling, typically after settings changed or on demand.
    func restart(settings: SettingsStore) {
        stop()
        service.cancelInFlight()
        start(settings: settings)
    }

    /// Performs a single refresh of all hosts, if one is not already running.
    func refresh(settings: SettingsStore) {
        guard refreshTask == nil else { return }
        isRefreshing = true

        let hosts = settings.hosts
        let timeout = settings.effectiveConnectTimeout

        refreshTask = Task { @MainActor [service, weak self] in
            guard let self else { return }
            let result = await service.queryAll(hosts: hosts, timeoutSec: timeout)
            guard !Task.isCancelled else { return }
            self.status = result
            self.lastError = result.hasErrors ? "Some clusters unreachable" : nil
            self.isRefreshing = false
            self.refreshTask = nil
        }
    }

    private func observeSettings(_ settings: SettingsStore) {
        settingsCancellable = settings.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                guard let self else { return }
                self.restart(settings: settings)
            }
    }

    private func schedulePolling(settings: SettingsStore) {
        let interval = TimeInterval(settings.effectiveRefreshInterval)
        pollTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
                guard !Task.isCancelled, let self else { break }
                self.refresh(settings: settings)
            }
        }
    }
}
