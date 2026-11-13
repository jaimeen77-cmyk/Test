'use strict';
const assert = require('assert');
const EventEmitter = require('events');
const { EasyAccess, ownMoves, stateOf, validCommand } = require('../core');
const { ComfortLog, journalLines } = require('../comfort-log');
const { translator } = require('../i18n');
const { run } = require('../ui');
const fs = require('fs');
const path = require('path');

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
    const english = translator('en'), korean = translator('ko');
    assert.equal(translator()('운전석'), 'Driver'); // source fallback defaults to English
    assert.equal(korean('운전석'), '운전석');
    assert.equal(english('조수석 M2 호출을 요청했습니다.'), 'Passenger M2 recall requested.');
    assert.equal(english('운전석 하차 위치를 저장했습니다.'), 'Driver exit position saved.');
    for (const name of ['core.js', 'ui.js']) {
        const source = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
        const literals = source.match(/'[^'\n]*[가-힣][^'\n]*'/g) || [];
        literals.forEach((literal) => assert.ok(!/[가-힣]/.test(english(literal.slice(1, -1))), literal));
    }
    for (const language of ['en', 'ko']) {
        const labels = {}, components = {};
        const names = ['MAIN', 'STATUS', 'SELECTED', 'SELECT_DRIVER', 'SELECT_PASSENGER', 'AUTO', 'DRIVER', 'PASSENGER', 'VEHICLE', 'MAKE_ROOM', 'STOP'];
        names.forEach((name) => {
            const c = components[name] = new EventEmitter();
            c.setValue = async (row, cell, value) => { labels[name] = value; };
            c.setProperty = async () => {}; c.updateResources = async () => {};
        });
        const rhmi = new EventEmitter(); rhmi.getByName = (name) => components[name];
        rhmi.mapEntryState = async () => {};
        class OnlineApp extends EventEmitter {
            constructor() { super(); this.rhmiApplication = rhmi; }
            async start() {} async registerActive() {} async initialized() {}
        }
        const client = new FakeClient();
        const ui = await run({ language, sdk: { OnlineApp }, client, noExit: true,
            description: { application: { entryPoints: [{ uuid: 'test-entry' }] } } });
        try {
            ui.easy.setForeground(true); ui.easy.selectSeat('passenger');
            assert.equal(labels.SELECT_PASSENGER, language === 'en' ? '● Passenger' : '● 조수석');
            assert.equal(labels.MAKE_ROOM, language === 'en' ? 'Make room · Move passenger seat forward' : 'Make room · 조수석 공간 확보');
            client.state.seats.roomOut = true; client.emit('state');
            assert.equal(labels.MAKE_ROOM, language === 'en' ? 'Make room · Return passenger seat' : 'Make room · 조수석 원위치 복귀');
            ui.easy.message = '요청 실패: Comfort is not connected'; ui.easy.emit('change');
            assert.equal(labels.STATUS, language === 'en' ? 'Request failed: Comfort is not connected' : '요청 실패: Comfort is not connected');
            if (language === 'en') Object.values(labels).forEach((label) => assert.ok(!/[가-힣]/.test(label), label));
        } finally { await ui.close(); }
    }
    assert.equal(stateOf({}), null);
    const state = stateOf(raw());
    assert.equal(state.settings.easyExit, false);
    assert.deepStrictEqual(state.seats.axes.driver, ['SLV', 'LNV']);
    assert.equal(validCommand({ op: 'exit', seat: 'driver', save: true }), true);
    assert.equal(validCommand({ op: 'jog', seat: 'driver', axis: 'SLV', dir: 1 }), true);
    assert.equal(validCommand({ op: 'memory', seat: 'driver', slot: 0, save: false }), true);
    assert.equal(validCommand({ op: 'memory', seat: 'driver', slot: 4, save: false }), false);
    assert.equal(validCommand({ op: 'set', settings: { easyExit: true } }), true);

    const client = new FakeClient(), easy = new EasyAccess(client);
    easy.setForeground(true);
    easy.selectSeat('passenger');
    assert.equal(easy.selectedSeat, 'passenger');
    easy.pending = true;
    assert.throws(() => easy.selectSeat('driver'), /요청/);
    easy.pending = false;
    easy.selectSeat('driver');
    await easy.refresh();
    await easy.save('driver');
    assert.equal(client.state.seats.exit.driver, true);
    await easy.toggle();
    assert.equal(client.state.settings.easyExit, true);
    await easy.move('driver');
    await easy.jog('SLV', 1);
    easy.armMemorySave();
    await easy.memory(0);
    await easy.memory(1);
    await easy.stop();
    assert.deepStrictEqual(client.sent.filter((q) => q.op !== 'get'), [
        { op: 'exit', seat: 'driver', save: true },
        { op: 'set', settings: { easyExit: true } },
        { op: 'exit', seat: 'driver', save: false },
        { op: 'jog', seat: 'driver', axis: 'SLV', dir: 1 },
        { op: 'stop' },
        { op: 'memory', seat: 'driver', slot: 0, save: true },
        { op: 'memory', seat: 'driver', slot: 1, save: false },
        { op: 'stop' },
    ]);

    client.state.parked = false;
    await assert.rejects(easy.save('driver'), /정차/);
    client.state.parked = true;
    client.state.seats.pos.passenger = {};
    await assert.rejects(easy.save('passenger'), /위치 센서/);
    easy.setForeground(false);
    await assert.rejects(easy.move('driver'), /활성화/);
    const roomClient = new FakeClient(), room = new EasyAccess(roomClient);
    room.setForeground(true);
    await assert.rejects(room.makeRoom(), /조수석 탭/);
    room.selectSeat('passenger');
    await room.makeRoom();
    roomClient.state.seats.roomOut = true;
    await room.makeRoom();
    assert.match(room.message, /복귀/);
    assert.equal(roomClient.sent.filter((q) => q.op === 'gentleman').length, 2);
    roomClient.state.parked = false;
    await assert.rejects(room.makeRoom(), /정차/);
    roomClient.state.parked = true;
    roomClient.state.seats.job = 'memory';
    await assert.rejects(room.makeRoom(), /움직이는/);
    roomClient.state.seats.job = null;
    roomClient.state.seats.pos.passenger = {};
    await assert.rejects(room.makeRoom(), /위치 센서/);
    assert.equal(roomClient.sent.filter((q) => q.op === 'gentleman').length, 2);
    assert.equal(stateOf({ state: Object.assign(raw().state, { seats: Object.assign(raw().state.seats, { roomOut: true }) }) }).seats.roomOut, true);
    // Comfort's own door moves (easy exit out / back) must survive the app leaving the screen or shutting down.
    let clock = 0;
    const doorClient = new FakeClient(), moves = ownMoves(doorClient, () => clock);
    const stops = () => doorClient.sent.filter((q) => q.op === 'stop').length;
    doorClient.state.seats.job = 'back'; doorClient.emit('state', doorClient.state);
    await moves.stop();
    assert.equal(stops(), 0, 'a door move Comfort started is never stopped by leaving the screen');
    doorClient.state.seats.job = null; doorClient.emit('state', doorClient.state);
    await doorClient.send({ op: 'memory', seat: 'driver', slot: 0, save: false });
    doorClient.state.seats.job = 'memory'; doorClient.emit('state', doorClient.state);
    await moves.stop();
    assert.equal(stops(), 1, 'a move this app asked for is stopped when the app leaves');
    doorClient.state.seats.job = null; doorClient.emit('state', doorClient.state);
    doorClient.state.seats.job = 'back'; doorClient.emit('state', doorClient.state);
    await moves.stop();
    assert.equal(stops(), 1, 'after the app\'s move ended, a later door move is left alone');
    doorClient.state.seats.job = null; doorClient.emit('state', doorClient.state);
    await doorClient.send({ op: 'gentleman' });           // Comfort ignored it (e.g. not parked)
    clock += 5000;
    doorClient.state.seats.job = 'back'; doorClient.emit('state', doorClient.state);
    await moves.stop();
    assert.equal(stops(), 1, 'a request Comfort never acted on expires');
    // Comfort's log under the page: its journal where readable, else the status changes the app sees
    assert.deepStrictEqual(journalLines('Nov 13 23:01:02 mgu node[812]: car on (0000000000080000)\nnoise\n'),
        ['23:01:02 car on (0000000000080000)']);
    let t = 0, calls = 0;
    const logClient = new FakeClient();
    const denied = new ComfortLog(logClient, { size: 8, now: () => t, exec: (f, a, o, cb) => { calls++; cb(new Error('permission')); } });
    logClient.emit('state', logClient.state);
    await denied.poll(); t += 3500; await denied.poll(); t += 3500; await denied.poll();
    assert.equal(calls, 2, 'two failed reads, then the journal is left alone');
    assert.equal(denied.source(), 'status');
    logClient.state.carOn = false; logClient.emit('state', logClient.state);
    logClient.state.seats.pre.driver = true; logClient.emit('state', logClient.state);
    logClient.state.carOn = true; logClient.state.seats.job = 'back'; logClient.state.seats.jobSeat = 'driver'; logClient.emit('state', logClient.state);
    logClient.state.seats.job = null; logClient.state.seats.jobSeat = null; logClient.state.seats.pre.driver = false; logClient.emit('state', logClient.state);
    const shown = denied.lines(8, english).join('\n');
    ['Comfort connected', 'car off', 'Driver · waiting to move back', 'car on', 'Driver · moving back to driving position',
        'Driver · seat move ended', 'Driver · moved back'].forEach((w) => assert.ok(shown.includes(w), w + ' in\n' + shown));
    const read = new ComfortLog(new FakeClient(), { now: () => t,
        exec: (f, a, o, cb) => { assert.equal(f, 'journalctl'); assert.ok(a.includes('iteriodev-comfort')); cb(null, 'Nov 13 23:05:00 mgu node[812]: driver door closed, car on\n'); } });
    assert.equal(await read.poll(), true);
    assert.equal(read.source(), 'journal');
    assert.deepStrictEqual(read.lines(2), ['23:05:00 driver door closed, car on']);
    assert.equal(new ComfortLog(new FakeClient(), { journal: false }).source(), 'status');
    const os = require('os');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'seats-log-cache-'));
    const cache = path.join(folder, 'diagnostics.json');
    try {
        const first = new ComfortLog(new FakeClient(), { file: cache, journal: false, size: 12 });
        first.add(['driver', '복귀 대기 (하차 전 위치 기억)']);
        const restored = new ComfortLog(new FakeClient(), { file: cache, journal: false, size: 12 });
        assert.ok(restored.lines(12, english).join('\n').includes('waiting to move back'));
        for (let i = 0; i < 30; i++) restored.add(['event ' + i]);
        assert.equal(restored.events.length, 12);
        assert.equal(JSON.parse(fs.readFileSync(cache)).events.length, 12);
    } finally { fs.unlinkSync(cache); fs.rmdirSync(folder); }
    console.log('PASS Seats Easy Access core checks, Make room guards, door moves left to Comfort and Comfort log');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
