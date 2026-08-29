import Foundation

/// Result of querying a single host via SSH.
public struct HostResult {
    public let host: String
    public let ok: Bool
    public let error: String?
    public let jobs: [Job]

    public var runningCount: Int { jobs.filter(\.isRunning).count }
    public var queuedCount: Int { jobs.filter(\.isQueued).count }

    public init(host: String, ok: Bool, error: String?, jobs: [Job]) {
        self.host = host
        self.ok = ok
        self.error = error
        self.jobs = jobs
    }
}

/// Aggregated status across all configured hosts.
public struct QueueStatus {
    public let hosts: [HostResult]
    public let runningTotal: Int
    public let queuedTotal: Int
    public let hasErrors: Bool
    public let timestamp: Date

    public init(hosts: [HostResult], runningTotal: Int, queuedTotal: Int, hasErrors: Bool, timestamp: Date) {
        self.hosts = hosts
        self.runningTotal = runningTotal
        self.queuedTotal = queuedTotal
        self.hasErrors = hasErrors
        self.timestamp = timestamp
    }

    /// True when every host failed to connect.
    public var allHostsFailed: Bool {
        hosts.allSatisfy { !$0.ok }
    }

    /// True when there was at least one error and there are no jobs/numbers,
    /// so the menu bar should show the unknown marker.
    public var isUnknown: Bool {
        hasErrors && runningTotal == 0 && queuedTotal == 0 && allHostsFailed
    }
}

/// Executes non-persistent, one-off SSH commands to fetch Slurm queue status.
/// Mirrors `SlurmService` in the original GNOME `slurmService.js`.
public final class SlurmService {
    public init() {}

    private let lock = NSLock()
    private var runningProcesses: [Process] = []

    /// Query a single host via `ssh ... "squeue --me"`.
    ///
    /// - Parameters:
    ///   - host: SSH host alias (from `~/.ssh/config`).
    ///   - timeoutSec: SSH command timeout in seconds.
    /// - Returns: A `HostResult` describing success/failure and parsed jobs.
    public func queryHost(host: String, timeoutSec: Int = 5, sshBinary: String = "/usr/bin/ssh") async -> HostResult {
        let args = [
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=\(timeoutSec)",
            host,
            "squeue --me -o '%i|%P|%j|%u|%t|%M|%D|%R'",
        ]

        do {
            let output = try await runProcess(binary: sshBinary, args: args, timeoutSec: timeoutSec)
            let jobs = SqueueParser.parse(stdout: output.stdout, host: host)
            return HostResult(host: host, ok: true, error: nil, jobs: jobs)
        } catch {
            let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            return HostResult(host: host, ok: false, error: message, jobs: [])
        }
    }

    /// Query all configured hosts concurrently.
    ///
    /// - Parameters:
    ///   - hosts: List of host names.
    ///   - timeoutSec: SSH connection timeout in seconds.
    /// - Returns: An aggregated `QueueStatus`.
    public func queryAll(hosts: [String], timeoutSec: Int = 5, sshBinary: String = "/usr/bin/ssh") async -> QueueStatus {
        var results: [HostResult] = []
        await withTaskGroup(of: HostResult?.self) { group in
            for host in hosts {
                group.addTask { await self.queryHost(host: host, timeoutSec: timeoutSec, sshBinary: sshBinary) }
            }
            for await result in group {
                if let result { results.append(result) }
            }
        }

        var runningTotal = 0
        var queuedTotal = 0
        var allJobs: [Job] = []
        var hasErrors = false

        for res in results {
            if res.ok {
                runningTotal += res.runningCount
                queuedTotal += res.queuedCount
                allJobs.append(contentsOf: res.jobs)
            } else {
                hasErrors = true
            }
        }

        return QueueStatus(
            hosts: results,
            runningTotal: runningTotal,
            queuedTotal: queuedTotal,
            hasErrors: hasErrors,
            timestamp: Date()
        )
    }

    /// Cancel any currently running SSH request.
    public func cancelInFlight() {
        lock.lock()
        let processes = runningProcesses
        runningProcesses.removeAll()
        lock.unlock()
        processes.forEach { $0.terminate() }
    }

    // MARK: - Process execution

    private struct ProcessOutput {
        let stdout: String
        let stderr: String
    }

    private enum ProcessError: LocalizedError {
        case nonZeroExit(Int32, String)
        case timeout

        var errorDescription: String? {
            switch self {
            case .nonZeroExit(let code, let stderr):
                let message = stderr.trimmingCharacters(in: .whitespacesAndNewlines)
                return message.isEmpty ? "SSH exited with code \(code)" : message
            case .timeout:
                return "SSH timed out"
            }
        }
    }

    private func runProcess(binary: String, args: [String], timeoutSec: Int) async throws -> ProcessOutput {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binary)
        process.arguments = args

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        register(process)
        defer { unregister(process) }

        try process.run()

        async let stdoutData = drain(pipe: stdoutPipe.fileHandleForReading)
        async let stderrData = drain(pipe: stderrPipe.fileHandleForReading)

        let timedOut = await waitForExit(process, timeoutSec: timeoutSec)
        if timedOut {
            throw ProcessError.timeout
        }

        let stdout = String(data: await stdoutData, encoding: .utf8) ?? ""
        let stderr = String(data: await stderrData, encoding: .utf8) ?? ""
        let status = process.terminationStatus

        guard status == 0 else {
            throw ProcessError.nonZeroExit(status, stderr)
        }

        return ProcessOutput(stdout: stdout, stderr: stderr)
    }

    /// Awaits process termination, enforcing a hard timeout in seconds. On
    /// timeout the process is terminated. Returns `true` if the timeout elapsed
    /// before the process exited on its own.
    private func waitForExit(_ process: Process, timeoutSec: Int) async -> Bool {
        await withCheckedContinuation { continuation in
            let semaphore = DispatchSemaphore(value: 0)
            process.terminationHandler = { _ in semaphore.signal() }

            DispatchQueue.global(qos: .utility).async {
                let timedOut = semaphore.wait(timeout: .now() + .seconds(timeoutSec)) == .timedOut
                if timedOut {
                    process.terminate()
                }
                continuation.resume(returning: timedOut)
            }
        }
    }

    private func register(_ process: Process) {
        lock.lock()
        runningProcesses.append(process)
        lock.unlock()
    }

    private func unregister(_ process: Process) {
        lock.lock()
        runningProcesses.removeAll { $0 === process }
        lock.unlock()
    }

    private func drain(pipe: FileHandle) async -> Data {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .utility).async {
                let data = pipe.readDataToEndOfFile()
                continuation.resume(returning: data)
            }
        }
    }
}
