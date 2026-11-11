'use strict';
const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { ComfortClient, SeatTest, stateOf } = require('../src/core');
const { VehicleReader, stage, selection } = require('../src/vehicle');
const { run } = require('../src/ui');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
function state() { return { parked: true, settings: { easyExit: false }, seats: { axes: { driver: ['SLV'], passenger: ['SLV'] },
    pos: { driver: { SLV: 33100 }, passenger: { SLV: 33200 } }, moving: null, job: null, automatic: false,
    exit: { driver: false, passenger: false }, pre: { driver: false, passenger: false } } }; }
class FakeClient extends EventEmitter {
    constructor() { super(); this.state = state(); this.at = Date.now(); this.sent = []; this.failStop = false; this.failMove = false; }
    async refresh() { this.sent.push({ op: 'get' }); this.at = Date.now(); return this.state; }
    async send(q) {
        this.sent.push(q);
        if (this.failStop && q.op === 'stop') throw new Error('lost');
        if (this.failMove && q.op === 'jog') throw new Error('write failed');
    }
    close() {}
}
function fixture() {
    const client = new FakeClient();
    const vehicle = { readFresh: async () => ({ speedKmh: 0, stage: 'P', at: Date.now(), elapsedMs: 5 }) };
    const test = new SeatTest(client, vehicle); test.setForeground(true);
    return { client: client, vehicle: vehicle, test: test };
}
const jogs = (client) => client.sent.filter((q) => q.op === 'jog');

(async () => {
    await check('construction and refresh never send a movement', async () => {
        const f = fixture(); assert.equal(f.client.sent.length, 0);
        await f.test.refresh(); assert.deepStrictEqual(f.client.sent, [{ op: 'get' }]);
        await assert.rejects(f.test.pulse(1)); assert.equal(jogs(f.client).length, 0);
    });
    await check('unknown P, nonzero speed, no focus, missing axis and busy service block arming', async () => {
        for (const kind of ['gear', 'speed', 'unknown', 'focus', 'axis', 'busy', 'parked']) {
            const f = fixture();
            if (kind === 'gear') f.vehicle.readFresh = async () => ({ speedKmh: 0, stage: 'N', at: Date.now(), elapsedMs: 5 });
            if (kind === 'speed') f.vehicle.readFresh = async () => ({ speedKmh: 0.01, stage: 'P', at: Date.now(), elapsedMs: 5 });
            if (kind === 'unknown') f.vehicle.readFresh = async () => { throw new Error('no vehicle data'); };
            if (kind === 'focus') f.test.setForeground(false);
            if (kind === 'axis') f.client.state.seats.axes.passenger = [];
            if (kind === 'busy') f.client.state.seats.job = 'memory';
            if (kind === 'parked') f.client.state.parked = false;
            await assert.rejects(f.test.arm(), undefined, kind); assert.equal(jogs(f.client).length, 0);
        }
    });
    await check('a confirmation permits one passenger SLV request and three timed STOP requests', async () => {
        const f = fixture(); await f.test.arm(); await f.test.pulse(-1);
        await pause(550);
        assert.deepStrictEqual(jogs(f.client), [{ op: 'jog', seat: 'passenger', axis: 'SLV', dir: -1 }]);
        assert.equal(f.client.sent.filter((q) => q.op === 'stop').length, 3);
        assert.equal(f.test.moving, false); assert.equal(f.test.armedUntil, 0);
        await assert.rejects(f.test.pulse(1));
        assert.equal(f.test.report().events.filter((e) => e.event === 'stop_requested')[0].details.physicalStopVerified, false);
    });
    await check('changed P on the second read blocks the command', async () => {
        const f = fixture(); await f.test.arm();
        f.vehicle.readFresh = async () => ({ speedKmh: 0, stage: 'D', at: Date.now(), elapsedMs: 5 });
        await assert.rejects(f.test.pulse(1)); assert.equal(jogs(f.client).length, 0);
    });
    await check('STOP cancels a command waiting for vehicle data', async () => {
        const f = fixture(); await f.test.arm(); let release;
        f.vehicle.readFresh = () => new Promise((r) => { release = r; });
        const attempt = f.test.pulse(1); const rejected = assert.rejects(attempt);
        const stopped = f.test.stop('manual stop', true);
        release({ speedKmh: 0, stage: 'P', at: Date.now(), elapsedMs: 5 });
        await stopped; await rejected; assert.equal(jogs(f.client).length, 0);
    });
    await check('screen loss requests STOP and removes the confirmation', async () => {
        const f = fixture(); await f.test.arm(); await f.test.pulse(1);
        f.test.setForeground(false); await pause(300);
        assert.equal(f.test.armedUntil, 0); assert.equal(f.test.moving, false);
        assert.equal(f.client.sent.filter((q) => q.op === 'stop').length, 3);
    });
    await check('STOP delivery failure locks further movement for the session', async () => {
        const f = fixture(); await f.test.arm(); f.client.failStop = true; await f.test.pulse(1);
        await pause(550); assert.equal(f.test.failedStop, true);
        f.client.failStop = false; f.test.cooldownUntil = 0;
        await assert.rejects(f.test.arm()); assert.equal(jogs(f.client).length, 1);
    });
    await check('failed move write still attempts STOP', async () => {
        const f = fixture(); await f.test.arm(); f.client.failMove = true;
        await assert.rejects(f.test.pulse(1));
        assert.equal(f.client.sent.filter((q) => q.op === 'stop').length, 3);
    });
    await check('stale state or vehicle data cannot authorize movement', async () => {
        const f = fixture(); await f.test.arm(); f.test.sample.at -= 2000;
        await assert.rejects(f.test.pulse(1)); assert.equal(jogs(f.client).length, 0);
        await f.test.arm(); f.client.at -= 2000;
        await assert.rejects(f.test.pulse(1)); assert.equal(jogs(f.client).length, 0);
    });
    await check('unknown service fields fail closed; unrelated private state is omitted', async () => {
        assert.equal(stateOf({ state: { seats: {} } }), null);
        const raw = state(); delete raw.seats.job; raw.vin = 'not-for-report';
        const clean = stateOf({ state: raw }); assert.equal(clean.seats.job, 'busy-or-unknown');
        assert.equal(JSON.stringify(clean).indexOf('not-for-report'), -1);
    });
    await check('existing automatic exit or a pending automatic return blocks testing', async () => {
        const raw = state(); raw.settings.easyExit = true; raw.seats.exit.driver = true;
        const f = fixture(); f.client.state = stateOf({ state: raw });
        await assert.rejects(f.test.arm()); assert.equal(jogs(f.client).length, 0);
        raw.settings.easyExit = false; raw.seats.pre.passenger = true;
        f.client.state = stateOf({ state: raw }); await assert.rejects(f.test.arm());
        delete raw.seats.pre; f.client.state = stateOf({ state: raw }); await assert.rejects(f.test.arm());
    });
    await check('native vehicle reads distinguish P from N_OR_P and reject speed sentinels', async () => {
        assert.equal(stage(1), 'P'); assert.equal(stage('N_OR_P'), null); assert.equal(selection('NP'), null);
        let rawSpeed = 0, rawGear = 1;
        const speed = { getValue: async () => ({ speedVehicleCentreOfGravity: rawSpeed }) };
        const gear = { getValue: async () => ({ statusActualStageDrive: rawGear, statusGearSelectionDrive: 'NP' }) };
        const v = new VehicleReader({ proxy: async (name) => name.indexOf('Vehicle2') >= 0 ? speed : gear });
        assert.equal((await v.readFresh()).stage, 'P');
        rawGear = 'N_OR_P'; await assert.rejects(v.readFresh());
        rawGear = 1; rawSpeed = 65535; await assert.rejects(v.readFresh());
    });
    await check('real Unix-socket client handles split lines and limits the command surface', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seat-socket-')), file = path.join(dir, 'ctl.sock'), received = [];
        const server = net.createServer((socket) => {
            let pending = '';
            socket.on('data', (d) => {
                pending += d;
                let n;
                while ((n = pending.indexOf('\n')) >= 0) {
                    received.push(JSON.parse(pending.slice(0, n))); pending = pending.slice(n + 1);
                    const response = JSON.stringify({ state: state() }) + '\n';
                    socket.write('not-json\n' + response.slice(0, 9)); setImmediate(() => socket.write(response.slice(9)));
                }
            });
        });
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(file, resolve); });
        const c = new ComfortClient(file);
        try {
            await c.refresh(); assert.equal(c.state.seats.pos.passenger.SLV, 33200);
            await assert.rejects(c.send({ op: 'jog', seat: 'driver', axis: 'SLV', dir: 1 }));
            await assert.rejects(c.send({ op: 'memory', seat: 'passenger', slot: 0 }));
            assert.deepStrictEqual(received, [{ op: 'get' }]);
        } finally { c.close(); await new Promise((r) => server.close(r)); if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); }
    });
    await check('SDK lifecycle smoke test initializes a mapped native screen with movement disabled', async () => {
        const comps = {}, enabled = {};
        ['MAIN', 'STATUS', 'MODE', 'DRIVER', 'PASSENGER', 'VEHICLE', 'REFRESH', 'ARM', 'PLUS', 'MINUS', 'STOP', 'SAVE'].forEach((name) => {
            const c = comps[name] = new EventEmitter(); c.getId = () => 1;
            c.setValue = async () => {}; c.setProperty = async (key, val) => { if (key === 'Enabled') enabled[name] = val; };
            c.updateResources = async () => {};
        });
        const rhmi = new EventEmitter(); rhmi.getByName = (name) => comps[name];
        const mapped = []; rhmi.mapEntryState = async (id) => mapped.push(id); rhmi.openEntryState = async () => {};
        class OnlineApp extends EventEmitter {
            constructor() { super(); this.rhmiApplication = rhmi; }
            async start() {} async registerActive() {} async initialized() { this.ready = true; }
            async registerHmiVisible() {} async unregisterHmiVisible() {}
        }
        const f = fixture(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seat-ui-'));
        const ui = await run({ sdk: { OnlineApp: OnlineApp }, client: f.client, vehicle: f.vehicle,
            dataDir: dir, noExit: true, description: { application: { entryPoints: [{ uuid: 'entry' }] } } });
        try {
            assert.equal(ui.app.ready, true); assert.ok(mapped.indexOf('entry') >= 0);
            assert.equal(enabled.PLUS, 0); assert.equal(enabled.MINUS, 0); assert.equal(jogs(f.client).length, 0);
            comps.MAIN.emit('visible', { visible: true });
            assert.equal(ui.test.foreground, false, 'visibility alone is not focus');
            comps.MAIN.emit('focus', { focus: true }); assert.equal(ui.test.foreground, true);
            comps.MAIN.emit('focus', { focus: false }); rhmi.emit('applicationStackChanged', { ROOT_APP: [1] });
            assert.equal(ui.test.foreground, false, 'stack cannot override lost focus');
            await pause(20); comps.SAVE.emit('action'); await pause(20);
            const report = JSON.parse(fs.readFileSync(path.join(dir, 'seat-test-report.json'), 'utf8'));
            assert.equal(report.realCarVerified, false); assert.equal(jogs(f.client).length, 0);
        } finally { await ui.close(); for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file)); fs.rmdirSync(dir); }
    });
    console.log('\n' + passed + ' checks passed. All vehicle and movement responses were simulated.');
})().catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
