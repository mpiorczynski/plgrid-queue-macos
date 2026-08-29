import Foundation

 /// Friendly label lookup for Slurm job states.
public enum StateNames {
    public static let map: [String: String] = [
        "R": "Running",
        "PD": "Pending",
        "CG": "Completing",
        "CF": "Configuring",
        "CD": "Completed",
        "CA": "Cancelled",
        "F": "Failed",
        "TO": "Timeout",
        "NF": "Node Fail",
        "PR": "Preempted",
        "S": "Suspended",
        "ST": "Stopped",
        "RH": "Requeue Hold",
        "RS": "Requeue Special",
        "RQ": "Requeued",
        "RF": "Requeued Fed",
        "OOM": "Out of Memory",
    ]

    /// Returns the friendly label for a state code, or the raw code if unknown.
    public static func name(for state: String) -> String {
        map[state] ?? state
    }
}

/// A single Slurm job as parsed from `squeue --me`.
public struct Job: Identifiable {
    public let host: String
    public let jobId: String
    public let partition: String
    public let name: String
    public let user: String
    public let state: String
    public let time: String
    public let nodes: String
    public let reasonOrNode: String
    public let isRunning: Bool
    public let isQueued: Bool

    public var id: String { "\(host)-\(jobId)" }

    public var stateName: String { StateNames.name(for: state) }

    /// The "address" (machine-readable id) used when copying to the clipboard.
    /// Ported from `slurmService.js` / `indicator.js`: only the numeric job id.
    public var clipboardID: String { jobId }

    public init(
        host: String,
        jobId: String,
        partition: String,
        name: String,
        user: String,
        state: String,
        time: String,
        nodes: String,
        reasonOrNode: String,
        isRunning: Bool,
        isQueued: Bool
    ) {
        self.host = host
        self.jobId = jobId
        self.partition = partition
        self.name = name
        self.user = user
        self.state = state
        self.time = time
        self.nodes = nodes
        self.reasonOrNode = reasonOrNode
        self.isRunning = isRunning
        self.isQueued = isQueued
    }
}

/// Parses the stdout of `squeue --me -o '%i|%P|%j|%u|%t|%M|%D|%R'` for a given host.
///
/// Supports both the pipe-delimited format (full job names) and the legacy
/// whitespace-separated output. Mirrors `parseSqueueOutput` in the original
/// GNOME `slurmService.js`.
public enum SqueueParser {
    public static func parse(stdout: String, host: String) -> [Job] {
        guard !stdout.isEmpty else { return [] }

        let lines = stdout.split(whereSeparator: \.isNewline)
        var jobs: [Job] = []

        for rawLine in lines {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.isEmpty { continue }

            let isPiped = line.contains("|")
            let tokens = isPiped
                ? line.split(separator: "|", omittingEmptySubsequences: false).map { String($0) }
                : line.split(separator: " ", omittingEmptySubsequences: true).map { String($0) }
            guard tokens.count >= 7 else { continue }

            // Skip header lines by checking the leading token, not a substring
            // match, so a job name containing "JOBID"/"PARTITION" is not dropped.
            if tokens[0].uppercased() == "JOBID" {
                continue
            }

            let jobId = String(tokens[0])
            let partition = (isPiped ? tokens[1] : String(tokens[1]))
                .replacingOccurrences(of: #"(\*+)$"#, with: "", options: .regularExpression)
            let name = String(tokens[2])
            let user = String(tokens[3])
            let state = String(tokens[4]).uppercased()
            let time = String(tokens[5])
            let nodes = String(tokens[6])
            let reasonOrNode = tokens.dropFirst(7).joined(separator: isPiped ? "|" : " ")

            let runningStates: Set<String> = ["R", "CG", "CF"]
            let queuedStates: Set<String> = ["PD", "Q", "RH", "RS", "RQ", "RF"]

            jobs.append(Job(
                host: host,
                jobId: jobId,
                partition: partition,
                name: name,
                user: user,
                state: state,
                time: time,
                nodes: nodes,
                reasonOrNode: reasonOrNode,
                isRunning: runningStates.contains(state),
                isQueued: queuedStates.contains(state)
            ))
        }

        return jobs
    }
}
