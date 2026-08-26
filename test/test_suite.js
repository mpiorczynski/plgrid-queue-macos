import { parseSqueueOutput, SlurmService, STATE_NAMES } from '../slurmService.js';

console.log('--- Test 1: Slurm Service Parser with multiple job types ---');
const sampleSlurmOutput = `             JOBID PARTITION     NAME     USER ST       TIME  NODES NODELIST(REASON)
           3072233 plgrid-gp reinforc plgjpnie PD       0:00      1 (Priority)
           3072234 plgrid-gp training plgjpnie R        1:23:45   2 r12c01b01,r12c01b02
           3072235 plgrid    data_prep plgjpnie CG       0:12      1 r10c01b05
           3072236 plgrid    eval      plgjpnie CF       0:01      1 r10c01b06
           3072237 plgrid    failed    plgjpnie F        0:00      1 (NonZeroExitCode)
`;

const parsedJobs = parseSqueueOutput(sampleSlurmOutput, 'athena');
console.log(`Parsed ${parsedJobs.length} jobs.`);
if (parsedJobs.length !== 5) throw new Error(`Expected 5 jobs, got ${parsedJobs.length}`);

const running = parsedJobs.filter(j => j.isRunning);
const queued = parsedJobs.filter(j => j.isQueued);

console.log(`Running jobs: ${running.length} (expected 3: R, CG, CF)`);
if (running.length !== 3) throw new Error(`Expected 3 running jobs, got ${running.length}`);

console.log(`Queued jobs: ${queued.length} (expected 1: PD)`);
if (queued.length !== 1) throw new Error(`Expected 1 queued job, got ${queued.length}`);

console.log('--- Test 2: Empty squeue output ---');
const emptyJobs = parseSqueueOutput('             JOBID PARTITION     NAME     USER ST       TIME  NODES NODELIST(REASON)\n', 'helios');
if (emptyJobs.length !== 0) throw new Error(`Expected 0 jobs for empty squeue, got ${emptyJobs.length}`);

console.log('--- Test 3: Null / empty string output ---');
const nullJobs = parseSqueueOutput('', 'helios');
if (nullJobs.length !== 0) throw new Error(`Expected 0 jobs for empty string, got ${nullJobs.length}`);

console.log('--- Test 4: Real SSH query on Athena & Helios ---');
const service = new SlurmService();
const results = await service.queryAll(['athena', 'helios'], 5);
console.log(`Query finished. Timestamp: ${results.timestamp}`);
console.log(`Running Total: ${results.runningTotal}, Queued Total: ${results.queuedTotal}, HasErrors: ${results.hasErrors}`);
for (const h of results.hosts) {
    console.log(`- ${h.host}: OK=${h.ok}, Running=${h.runningCount}, Queued=${h.queuedCount}`);
    for (const j of h.jobs) {
        console.log(`    [${j.state}] #${j.jobId} ${j.name} (${j.partition}) - ${j.time} - ${j.reasonOrNode}`);
    }
}

console.log('\n✓ ALL TESTS PASSED SUCCESSFULLY!');
