'use strict';
const assert = require('assert');
const EventEmitter = require('events');
const { RecallTrace } = require('../recall-trace');
const { stateOf } = require('../core');
(async () => {
    let now = 1000;
    const client = new EventEmitter(), logs = [], sent = [];
    client.state = stateOf({ state: { carOn: true, parked: true, seats: {
        axes: { driver: ['SLV', 'LNV'], passenger: [] }, pos: { driver: { SLV: 100, LNV: 200 } },
        memories: { driver: [{ SLV: 300, LNV: 200, KHV: 'bad' }] }, job: null,
    } } });
    client.send = async (q) => { sent.push(q); };
    new RecallTrace(client, { add: (p) => logs.push(p.join(' ')) }, { now: () => now });
    const command = { op: 'memory', seat: 'driver', slot: 0, save: false };
    assert.deepStrictEqual(client.state.seats.m1Target.driver, { SLV: 300, LNV: 200 });
    await client.send(command);
    assert.ok(logs.some((l) => l.includes('stored target') && l.includes('SLV=300')));
    client.state.seats.job = 'memory'; client.state.seats.jobSeat = 'driver'; client.emit('state', client.state);
    client.state.seats.job = null; client.emit('state', client.state);
    assert.ok(logs.some((l) => l.includes('no reported position change')));
    await client.send(command);
    client.state.seats.job = 'memory'; client.emit('state', client.state);
    client.state.seats.pos.driver.SLV = 300; client.emit('state', client.state);
    client.state.seats.job = null; client.emit('state', client.state);
    assert.ok(logs.some((l) => l.includes('reported position changed')));
    assert.ok(logs.some((l) => l.includes('position after') && l.includes('SLV=300')));
    await client.send(command); now += 10001; client.emit('state', client.state);
    assert.ok(logs.some((l) => l.includes('no memory job observed')));
    assert.deepStrictEqual(sent, [command, command, command], 'diagnostics send no extra commands');
    console.log('PASS M1 trace: sanitized target, unchanged/changed counters, unobserved outcome and no extra motion');
})().catch((e) => { console.error(e); process.exitCode = 1; });
