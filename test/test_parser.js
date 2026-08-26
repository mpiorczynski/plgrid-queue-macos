import { parseSqueueOutput, SlurmService } from '../slurmService.js';

const sample = `             JOBID PARTITION     NAME     USER ST       TIME  NODES NODELIST(REASON)
           3072233 plgrid-gp reinforc plguser  PD       0:00      1 (Priority)
           3072234 plgrid-gp training plguser  R        1:23:45   2 r12c01b01,r12c01b02
           3072235 plgrid    data_prep plguser  CG       0:12      1 r10c01b05
`;

const jobs = parseSqueueOutput(sample, 'athena');
console.log(`Parsed ${jobs.length} jobs.`);

if (jobs.length !== 3) {
    throw new Error(`Expected 3 jobs, got ${jobs.length}`);
}

const running = jobs.filter(j => j.isRunning);
const queued = jobs.filter(j => j.isQueued);

if (running.length !== 2) {
    throw new Error(`Expected 2 running jobs (R and CG), got ${running.length}`);
}

if (queued.length !== 1) {
    throw new Error(`Expected 1 queued job (PD), got ${queued.length}`);
}

console.log('✓ All parser test assertions passed!');
