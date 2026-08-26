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

console.log('--- Piped squeue format (full job names) ---');
const pipedSample = `JOBID|PARTITION|NAME|USER|ST|TIME|NODES|NODELIST(REASON)
3072240|plgrid-gp*|reinforcement-training-job-with-a-very-long-name|plguser|R|2:30:00|4|n1,n2,n3,n4
3072241|plgrid-gp*|short|plguser|PD|0:00|1|(Priority)
`;

const pipedJobs = parseSqueueOutput(pipedSample, 'athena');
console.log(`Parsed ${pipedJobs.length} piped jobs.`);

if (pipedJobs.length !== 2) {
    throw new Error(`Expected 2 piped jobs, got ${pipedJobs.length}`);
}

if (pipedJobs[0].name !== 'reinforcement-training-job-with-a-very-long-name') {
    throw new Error(`Expected full job name, got '${pipedJobs[0].name}'`);
}

if (pipedJobs[0].partition !== 'plgrid-gp') {
    throw new Error(`Expected default-partition star stripped, got '${pipedJobs[0].partition}'`);
}

if (pipedJobs[0].reasonOrNode !== 'n1,n2,n3,n4') {
    throw new Error(`Expected nodelist in reasonOrNode, got '${pipedJobs[0].reasonOrNode}'`);
}

if (!pipedJobs[0].isRunning || !pipedJobs[1].isQueued) {
    throw new Error('Piped state flags wrong');
}

console.log('✓ All piped-format parser assertions passed!');
