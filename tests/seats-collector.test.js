'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { observe, snapshot } = require('../tools/collect-seats');
(async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'seats-observer-'));
    const socket = path.join(folder, 'ctl.sock'), commands = [], records = [];
    let n = 0;
    const server = net.createServer((client) => {
        let buffer = '';
        client.on('data', (data) => {
            buffer += data;
            let newline;
            while ((newline = buffer.indexOf('\n')) >= 0) {
                commands.push(JSON.parse(buffer.slice(0, newline))); buffer = buffer.slice(newline + 1);
                client.write(JSON.stringify({ state: { vin: 'MUST_NOT_COLLECT', parked: true, carOn: ++n > 1,
                    seats: { pre: { driver: true }, pos: { driver: { SLV: n } }, job: n > 1 ? 'back' : null } } }) + '\n');
            }
        });
    });
    await new Promise((resolve) => server.listen(socket, resolve));
    try {
        await observe({ socketPath: socket, durationMs: 180, intervalMs: 20, emit: (r) => records.push(r) });
        assert.ok(commands.length >= 2);
        assert.ok(commands.every((q) => JSON.stringify(q) === '{"op":"get"}'));
        assert.ok(records.some((r) => r.type === 'state' && r.carOn && r.job === 'back'));
        assert.ok(records.some((r) => r.type === 'state' && r.seats.driver.returnPending));
        assert.ok(!JSON.stringify(records).includes('MUST_NOT_COLLECT'));
        assert.equal(snapshot({}), null);
        console.log('PASS read-only observer: get only, state transitions, pending return, bounded duration and VIN omission');
    } finally { await new Promise((r) => server.close(r)); if (fs.existsSync(socket)) fs.unlinkSync(socket); fs.rmdirSync(folder); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
