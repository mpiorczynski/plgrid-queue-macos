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
    /// Incremented on every restart/stop so a cancelled refresh task can tell
    /// whether its state cleanup is still authoritative (i.e. no newer refresh
    /// has since been started that it would otherwise clobber).
    private var generation = 0

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
        generation += 1
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
        let gen = generation

        refreshTask = Task { @MainActor [service, weak self] in
            // Always clear the pending refresh state, including when the task
            // is cancelled, so the spinner stops and future refreshes can run.
            // Guard against clobbering a newer refresh started by a restart:
            // a changed generation means a restart has taken over ownership.
            defer {
                if let self, self.generation == gen {
                    self.isRefreshing = false
                    self.refreshTask = nil
                }
            }

            let result = await service.queryAll(hosts: hosts, timeoutSec: timeout)
            guard !Task.isCancelled, let self else { return }
            self.status = result
            self.lastError = result.hasErrors ? "Some clusters unreachable" : nil
        }
    }

    private func observeSettings(_ settings: SettingsStore) {
        // Observe DidChange (post-willSet) so we read fresh values when
        // restarting, rather than the pre-change state that objectWillChange
        // would expose. Reading the published values from the main queue keeps
        // the subscription in sync with SwiftUI's mutation ordering.
        settingsCancellable = settings.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                DispatchQueue.main.async {
                    self.restart(settings: settings)
                }
            }
    }

    private func schedulePolling(settings: SettingsStore) {
        pollTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                // Re-read the interval on every iteration so changes take
                // effect without requiring a full restart of the loop.
                let interval = TimeInterval(settings.effectiveRefreshInterval)
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
                guard !Task.isCancelled, let self else { break }
                self.refresh(settings: settings)
            }
        }
    }
}
