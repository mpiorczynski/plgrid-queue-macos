import Foundation

import PLGridQueueCore

/// Minimal assertion helpers used by the standalone test runner.
/// Runs in a bare-swift environment (Command Line Tools, no full Xcode), so
/// XCTest is unavailable; this mirrors the original project's plain
/// `gjs -m test/*.js` scripts that print and throw on failure.
enum Assert {
    static var passed = 0
    static var failed = 0

    static func equal<T: Equatable>(_ actual: T, _ expected: T, _ message: String,
                                    file: String = #file, line: Int = #line) {
        if actual == expected {
            passed += 1
        } else {
            failed += 1
            print("  FAIL (\(file):\(line)): \(message)")
            print("    Expected: \(expected)")
            print("    Actual:   \(actual)")
        }
    }

    static func `true`(_ condition: Bool, _ message: String, file: String = #file, line: Int = #line) {
        if condition {
            passed += 1
        } else {
            failed += 1
            print("  FAIL (\(file):\(line)): \(message)")
        }
    }

    static func `false`(_ condition: Bool, _ message: String, file: String = #file, line: Int = #line) {
        `true`(!condition, message, file: file, line: line)
    }

    static func summary() {
        print("\n\(passed) passed, \(failed) failed")
        if failed > 0 {
            exit(1)
        }
        print("✓ ALL TESTS PASSED!")
    }
}

func job(host: String, id: String, state: String, isRunning: Bool, isQueued: Bool) -> Job {
    Job(
        host: host,
        jobId: id,
        partition: "plgrid-gp",
        name: "job-\(id)",
        user: "plguser",
        state: state,
        time: "0:00",
        nodes: "1",
        reasonOrNode: "",
        isRunning: isRunning,
        isQueued: isQueued
    )
}

func testParser() {
    print("--- Test: Parser with multiple job types ---")
    let sample = """
                 JOBID PARTITION     NAME     USER ST       TIME  NODES NODELIST(REASON)
                3072233 plgrid-gp reinforc plguser  PD       0:00      1 (Priority)
                3072234 plgrid-gp training plguser  R        1:23:45   2 r12c01b01,r12c01b02
                3072235 plgrid    data_prep plguser  CG       0:12      1 r10c01b05
                3072236 plgrid    eval      plguser  CF       0:01      1 r10c01b06
                3072237 plgrid    failed    plguser  F        0:00      1 (NonZeroExitCode)
    """
    let jobs = SqueueParser.parse(stdout: sample, host: "athena")
    Assert.equal(jobs.count, 5, "Should parse 5 jobs")
    Assert.equal(jobs.filter(\.isRunning).count, 3, "Expected 3 running (R, CG, CF)")
    Assert.equal(jobs.filter(\.isQueued).count, 1, "Expected 1 queued (PD)")
    Assert.equal(jobs[0].partition, "plgrid-gp", "Partition parsed")
    Assert.equal(jobs[1].stateName, "Running", "State friendly name")
}

func testParserEmpty() {
    print("--- Test: Empty squeue output ---")
    let header = "             JOBID PARTITION     NAME     USER ST       TIME  NODES NODELIST(REASON)\n"
    Assert.equal(SqueueParser.parse(stdout: header, host: "helios").count, 0, "Header-only = 0 jobs")
    Assert.equal(SqueueParser.parse(stdout: "", host: "helios").count, 0, "Empty string = 0 jobs")
}

func testParserPiped() {
    print("--- Test: Piped squeue format (full job names) ---")
    let pipedSample = """
    JOBID|PARTITION|NAME|USER|ST|TIME|NODES|NODELIST(REASON)
    3072240|plgrid-gp*|reinforcement-training-job-with-a-very-long-name|plguser|R|2:30:00|4|n1,n2,n3,n4
    3072241|plgrid-gp*|short|plguser|PD|0:00|1|(Priority)
    """
    let jobs = SqueueParser.parse(stdout: pipedSample, host: "athena")
    Assert.equal(jobs.count, 2, "Should parse 2 piped jobs")
    Assert.equal(jobs[0].name, "reinforcement-training-job-with-a-very-long-name", "Full job name")
    Assert.equal(jobs[0].partition, "plgrid-gp", "Default-partition star stripped")
    Assert.equal(jobs[0].reasonOrNode, "n1,n2,n3,n4", "Nodelist captured as reasonOrNode")
    Assert.true(jobs[0].isRunning, "Piped R should be running")
    Assert.true(jobs[1].isQueued, "Piped PD should be queued")
}

func testAggregation() {
    print("--- Test: Aggregation across hosts ---")
    let athenaRunning = job(host: "athena", id: "1", state: "R", isRunning: true, isQueued: false)
    let athenaQueued = job(host: "athena", id: "2", state: "PD", isRunning: false, isQueued: true)
    let heliosRunning = job(host: "helios", id: "3", state: "CG", isRunning: true, isQueued: false)

    let status = QueueStatus(
        hosts: [
            HostResult(host: "athena", ok: true, error: nil, jobs: [athenaRunning, athenaQueued]),
            HostResult(host: "helios", ok: true, error: nil, jobs: [heliosRunning]),
        ],
        runningTotal: 2,
        queuedTotal: 1,
        hasErrors: false,
        timestamp: Date()
    )
    Assert.equal(status.runningTotal, 2, "Running total")
    Assert.equal(status.queuedTotal, 1, "Queued total")
    Assert.false(status.isUnknown, "Healthy status not unknown")
}

func testUnknownState() {
    print("--- Test: isUnknown when all hosts fail ---")
    let allFailed = QueueStatus(
        hosts: [
            HostResult(host: "athena", ok: false, error: "boom", jobs: []),
            HostResult(host: "helios", ok: false, error: "boom", jobs: []),
        ],
        runningTotal: 0,
        queuedTotal: 0,
        hasErrors: true,
        timestamp: Date()
    )
    Assert.true(allFailed.isUnknown, "All hosts failed -> show R: ? Q: ?")

    let partial = QueueStatus(
        hosts: [
            HostResult(host: "athena", ok: true, error: nil, jobs: []),
            HostResult(host: "helios", ok: false, error: "boom", jobs: []),
        ],
        runningTotal: 0,
        queuedTotal: 0,
        hasErrors: true,
        timestamp: Date()
    )
    Assert.false(partial.isUnknown, "One host OK -> not unknown")
}

func testStateNames() {
    print("--- Test: State name lookup ---")
    Assert.equal(StateNames.name(for: "R"), "Running", "R -> Running")
    Assert.equal(StateNames.name(for: "PD"), "Pending", "PD -> Pending")
    Assert.equal(StateNames.name(for: "CD"), "Completed", "CD -> Completed")
    Assert.equal(StateNames.name(for: "ZZ"), "ZZ", "Unknown falls back to raw code")
}

testParser()
testParserEmpty()
testParserPiped()
testAggregation()
testUnknownState()
testStateNames()

Assert.summary()
