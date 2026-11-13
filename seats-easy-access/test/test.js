'use strict';
const assert = require('assert');
const EventEmitter = require('events');
const { EasyAccess, stateOf, validCommand } = require('../src/core');

function raw(overrides) {
    const value = { state: { parked: true, carOn: true, settings: { easyExit: false }, seats: {
        axes: { driver: ['SLV', 'LNV'], passenger: ['SLV'] },
        pos: { driver: { SLV: 100, LNV: 200 }, passenger: { SLV: 300 } },
        exit: { driver: false, passenger: false }, pre: { driver: false, passenger: false },
        moving: null, job: null, jobSeat: null, wheel: true,
    } } };
    return Object.assign(value.state, overrides || {}) && value;
}
class FakeClient extends EventEmitter {
    constructor() { super(); this.state = stateOf(raw()); this.sent = []; }
    async refresh() { this.sent.push({ op: 'get' }); this.emit('state', this.state); return this.state; }
    async send(message) {
        assert.ok(validCommand(message)); this.sent.push(message);
        if (message.op === 'set') this.state.settings.easyExit = message.settings.easyExit;
        if (message.op === 'exit' && message.save) this.state.seats.exit[message.seat] = true;
    }
    close() {}
}

(async () => {
    assert.equal(stateOf({}), null);
    const state = stateOf(raw());
    assert.equal(state.settings.easyExit, false);
    assert.deepStrictEqual(state.seats.axes.driver, ['SLV', 'LNV']);
    assert.equal(validCommand({ op: 'exit', seat: 'driver', save: true }), true);
    assert.equal(validCommand({ op: 'jog', seat: 'driver', axis: 'SLV', dir: 1 }), false);
    assert.equal(validCommand({ op: 'set', settings: { easyExit: true } }), true);

    const client = new FakeClient(), easy = new EasyAccess(client);
    easy.setForeground(true);
    await easy.refresh();
    await easy.save('driver');
    assert.equal(client.state.seats.exit.driver, true);
    await easy.toggle();
    assert.equal(client.state.settings.easyExit, true);
    await easy.move('driver');
    await easy.stop();
    assert.deepStrictEqual(client.sent.filter((q) => q.op !== 'get'), [
        { op: 'exit', seat: 'driver', save: true },
        { op: 'set', settings: { easyExit: true } },
        { op: 'exit', seat: 'driver', save: false },
        { op: 'stop' },
    ]);

    client.state.parked = false;
    await assert.rejects(easy.save('driver'), /정차/);
    client.state.parked = true;
    client.state.seats.pos.passenger = {};
    await assert.rejects(easy.save('passenger'), /위치 센서/);
    easy.setForeground(false);
    await assert.rejects(easy.move('driver'), /활성화/);
    console.log('PASS Seats Easy Access core checks');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
