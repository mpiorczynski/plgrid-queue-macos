import { SlurmService } from '../slurmService.js';

const service = new SlurmService();

console.log('--- Testing single host: athena only ---');
const athenaOnly = await service.queryAll(['athena'], 5);
console.log(`Hosts queried: ${athenaOnly.hosts.map(h => h.host).join(', ')}`);
console.log(`Running Total: ${athenaOnly.runningTotal}, Queued Total: ${athenaOnly.queuedTotal}, HasErrors: ${athenaOnly.hasErrors}`);
if (athenaOnly.hosts.length !== 1 || athenaOnly.hosts[0].host !== 'athena') {
    throw new Error('Single host athena query failed');
}

console.log('--- Testing single host: helios only ---');
const heliosOnly = await service.queryAll(['helios'], 5);
console.log(`Hosts queried: ${heliosOnly.hosts.map(h => h.host).join(', ')}`);
console.log(`Running Total: ${heliosOnly.runningTotal}, Queued Total: ${heliosOnly.queuedTotal}, HasErrors: ${heliosOnly.hasErrors}`);
if (heliosOnly.hosts.length !== 1 || heliosOnly.hosts[0].host !== 'helios') {
    throw new Error('Single host helios query failed');
}

console.log('--- Testing partial access: athena valid + unreachable host ---');
const mixed = await service.queryAll(['athena', 'unreachable-host-xyz'], 2);
console.log(`Running Total: ${mixed.runningTotal}, Queued Total: ${mixed.queuedTotal}, HasErrors: ${mixed.hasErrors}`);
console.log(`Athena OK: ${mixed.hosts[0].ok}, Unreachable OK: ${mixed.hosts[1].ok}`);
if (mixed.hosts[0].ok !== true || mixed.hosts[1].ok !== false) {
    throw new Error('Mixed query error handling failed');
}

console.log('\n✓ Single-host and partial-access tests passed!');
