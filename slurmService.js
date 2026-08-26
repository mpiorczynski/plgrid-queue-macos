/**
 * slurmService.js
 *
 * Query Slurm squeue via single SSH command executions and parse results.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * Friendly label lookup for Slurm job states.
 */
export const STATE_NAMES = {
    'R': 'Running',
    'PD': 'Pending',
    'CG': 'Completing',
    'CF': 'Configuring',
    'CD': 'Completed',
    'CA': 'Cancelled',
    'F': 'Failed',
    'TO': 'Timeout',
    'NF': 'Node Fail',
    'PR': 'Preempted',
    'S': 'Suspended',
    'ST': 'Stopped',
    'RH': 'Requeue Hold',
    'RS': 'Requeue Special',
    'RQ': 'Requeued',
    'OOM': 'Out of Memory',
};

/**
 * Parse stdout of `squeue --me -o '%i|%P|%j|%u|%t|%M|%D|%R'` for a given host.
 *
 * Example line:
 *              3072233|plgrid-gp|reinforcement-training|plguser|PD|0:00|1|(Priority)
 *
 * Also keeps legacy support for the default whitespace-separated squeue output.
 *
 * @param {string} stdout - Output from squeue
 * @param {string} host - Host name alias
 * @returns {Array<Object>} List of parsed job objects
 */
export function parseSqueueOutput(stdout, host) {
    if (!stdout) return [];

    const lines = stdout.trim().split('\n');
    const jobs = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Skip header lines
        if (line.includes('JOBID') && line.includes('PARTITION')) {
            continue;
        }

        const isPiped = line.includes('|');
        const tokens = isPiped ? line.split('|') : line.split(/\s+/);
        if (tokens.length >= 7) {
            const jobId = tokens[0];
            const partition = isPiped ? tokens[1].replace(/\*$/, '') : tokens[1];
            const name = tokens[2];
            const user = tokens[3];
            const state = tokens[4].toUpperCase();
            const time = tokens[5];
            const nodes = tokens[6];
            const reasonOrNode = tokens.slice(7).join(isPiped ? '|' : ' ') || '';

            const isRunning = ['R', 'CG', 'CF'].includes(state);
            const isQueued = ['PD', 'Q', 'RH', 'RS', 'RQ', 'RF'].includes(state);
            const stateName = STATE_NAMES[state] || state;

            jobs.push({
                host,
                jobId,
                partition,
                name,
                user,
                state,
                stateName,
                time,
                nodes,
                reasonOrNode,
                isRunning,
                isQueued,
            });
        }
    }

    return jobs;
}

/**
 * SlurmService executes non-persistent, one-off SSH commands to fetch queue status.
 */
export class SlurmService {
    constructor() {
        this._inFlightCancellable = null;
    }

    /**
     * Query a single host via SSH `squeue --me`.
     *
     * @param {string} host - Host name alias (from ~/.ssh/config)
     * @param {number} timeoutSec - SSH connection timeout in seconds
     * @param {Gio.Cancellable|null} cancellable - Optional cancellable
     * @returns {Promise<Object>} Host result object
     */
    async queryHost(host, timeoutSec = 5, cancellable = null) {
        return new Promise((resolve) => {
            try {
                const proc = new Gio.Subprocess({
                    argv: [
                        'ssh',
                        '-o', 'BatchMode=yes',
                        '-o', `ConnectTimeout=${timeoutSec}`,
                        host,
                        `squeue --me -o '%i|%P|%j|%u|%t|%M|%D|%R'`,
                    ],
                    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
                });
                proc.init(cancellable);

                proc.communicate_utf8_async(null, cancellable, (subprocess, res) => {
                    try {
                        const [ok, stdout, stderr] = subprocess.communicate_utf8_finish(res);
                        const exitCode = subprocess.get_exit_status();

                        if (exitCode !== 0) {
                            const errMsg = (stderr && stderr.trim()) || `SSH exited with code ${exitCode}`;
                            resolve({
                                host,
                                ok: false,
                                error: errMsg,
                                jobs: [],
                                runningCount: 0,
                                queuedCount: 0,
                            });
                            return;
                        }

                        const jobs = parseSqueueOutput(stdout || '', host);
                        const runningCount = jobs.filter((j) => j.isRunning).length;
                        const queuedCount = jobs.filter((j) => j.isQueued).length;

                        resolve({
                            host,
                            ok: true,
                            error: null,
                            jobs,
                            runningCount,
                            queuedCount,
                        });
                    } catch (e) {
                        resolve({
                            host,
                            ok: false,
                            error: e.message,
                            jobs: [],
                            runningCount: 0,
                            queuedCount: 0,
                        });
                    }
                });
            } catch (e) {
                resolve({
                    host,
                    ok: false,
                    error: e.message,
                    jobs: [],
                    runningCount: 0,
                    queuedCount: 0,
                });
            }
        });
    }

    /**
     * Query all configured hosts concurrently.
     *
     * @param {Array<string>} hosts - List of host names
     * @param {number} timeoutSec - SSH connection timeout in seconds
     * @returns {Promise<Object>} Aggregated status object
     */
    async queryAll(hosts, timeoutSec = 5) {
        this.cancelInFlight();
        this._inFlightCancellable = new Gio.Cancellable();

        const results = await Promise.all(
            hosts.map((host) => this.queryHost(host, timeoutSec, this._inFlightCancellable))
        );

        this._inFlightCancellable = null;

        let runningTotal = 0;
        let queuedTotal = 0;
        let allJobs = [];
        let hasErrors = false;

        for (const res of results) {
            if (res.ok) {
                runningTotal += res.runningCount;
                queuedTotal += res.queuedCount;
                allJobs = allJobs.concat(res.jobs);
            } else {
                hasErrors = true;
            }
        }

        return {
            hosts: results,
            runningTotal,
            queuedTotal,
            allJobs,
            hasErrors,
            timestamp: new Date(),
        };
    }

    /**
     * Cancel any currently running SSH requests.
     */
    cancelInFlight() {
        if (this._inFlightCancellable && !this._inFlightCancellable.is_cancelled()) {
            this._inFlightCancellable.cancel();
            this._inFlightCancellable = null;
        }
    }
}
