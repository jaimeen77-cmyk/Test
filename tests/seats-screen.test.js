'use strict';
// Runs the real packaged canvas controller with the shared recording engine.
const assert = require('assert');
const path = require('path');
const EventEmitter = require('events');
const net = require('net');
const js = path.resolve(process.argv[2], 'source/javascript');
const record = require(path.join(js, 'kit/record'));
const themes = require(path.join(js, 'kit/themes'));
const { start } = require(path.join(js, 'screen'));
const handlers = {}, frames = [];
let tab, focus = true, focused;
const originalConnection = net.createConnection;
let connections = 0;
net.createConnection = () => { connections++; throw new Error('Preview must never open a vehicle socket'); };
(async () => {
    const values = {};
    const ctx = {
        settings: { get(k) { return values[k]; }, set(k, v) { values[k] = v; } },
        app: new EventEmitter(), theme: () => themes.theme('dark'), log: { error(e) { throw e; } },
        canvas: (w, h) => {
            const cv = new record.Recorder(w, h), text = cv.text;
            cv.capturedText = [];
            cv.text = function (value) { this.capturedText.push(String(value)); return text.apply(this, arguments); };
            return cv;
        }, hideButton() {}, onLayout() {},
        onTab(fn) { tab = fn; }, loop() { return { stop() {} }; },
        ui: { onClick(name, fn) { handlers[name] = fn; }, isVisible: () => true, hasFocus: () => focus,
            onVisible() {}, onFocus(fn) { focused = fn; }, async image(name, cv) {
                assert.equal(name, 'MAIN_GFX'); frames.push(cv);
            } },
    };
    const screen = await start(ctx, { demo: true });
    assert.equal(connections, 0);
    try {
        assert.ok(frames.length > 0, 'must draw without a Comfort service');
        assert.ok(frames[0].words().length > 100, 'frame must contain real graphics');
        assert.ok(record.layerById.size >= 2, 'seat and backdrop layers must be present');
        for (const layer of record.layerById.values()) {
            const words = layer.words;
            for (let i = 0; i < words.length;) {
                assert.equal(words[i++], record.OP.GRAD);
                const stops = words[i + 4];
                assert.ok(stops > 0 && stops <= 64, 'native renderer gradient-stop limit');
                i += 5 + stops * 2;
            }
        }
        assert.ok(!frames[frames.length - 1].targets.some((t) => t.key === 'BTN_ROOM'));
        await tab(1);
        assert.equal(screen.easy.selectedSeat, 'passenger');
        assert.ok(frames[frames.length - 1].targets.some((t) => t.key === 'BTN_ROOM'));
        await handlers.BTN_ROOM(); assert.equal(screen.client.state.seats.roomOut, true);
        await handlers.BTN_ROOM(); assert.equal(screen.client.state.seats.roomOut, false);
        await handlers.BTN_AUTO(); assert.equal(screen.client.state.settings.easyExit, true);
        await tab(0);
        await handlers.BTN_IGNITION_M1(); assert.equal(screen.auto.enabled(), true);
        assert.equal(screen.auto.pending, null, 'enabling does not move a seat');
        await handlers.BTN_IGNITION_M1(); assert.equal(screen.auto.enabled(), false);
        await tab(1);
        await handlers.BTN_MINUS(); assert.equal(screen.client.state.seats.pos.passenger.SLV, 99);
        await handlers.BTN_SAVE(); assert.equal(screen.easy.saveMemory, true);
        await handlers.BTN_M1(); assert.equal(screen.easy.saveMemory, false);
        await handlers.BTN_STOP();
        for (let i = 0; i < 25; i++) screen.comfortLog.add(['test event ' + i]);
        await tab(2);
        const logKeys = frames[frames.length - 1].targets.map((t) => t.key);
        assert.ok(logKeys.includes('BTN_LOG_HOLD') && logKeys.includes('BTN_LOG_OLDER'));
        assert.ok(!logKeys.includes('BTN_ROOM') && !logKeys.includes('BTN_STOP'), 'log page contains no movement targets');
        await handlers.BTN_LOG_HOLD();
        await handlers.BTN_LOG_OLDER();
        assert.ok(frames[frames.length - 1].targets.some((t) => t.key === 'BTN_LOG_NEWER'));
        screen.comfortLog.add(['ZXQ_42']);
        await handlers.BTN_LOG_NEWER();
        assert.ok(!frames[frames.length - 1].capturedText.join('\n').includes('ZXQ_42'));
        await handlers.BTN_LOG_HOLD();
        assert.ok(frames[frames.length - 1].capturedText.join('\n').includes('ZXQ_42'));
        await tab(0);
        assert.equal(screen.easy.selectedSeat, 'driver');
        assert.ok(frames.length > 5);
        assert.equal(connections, 0);
    } finally { await screen.close(); }
    // Comfort's own way back after easy exit (job 'back') must survive the app leaving the screen and shutting down;
    // a move the app asked for is still stopped then.
    const { DemoClient } = require(path.join(js, 'demo'));
    class Recording extends DemoClient {
        constructor() { super(); this.sent = []; }
        async send(command) { this.sent.push(command); return super.send(command); }
    }
    const car = new Recording(), stops = () => car.sent.filter((q) => q.op === 'stop').length;
    focus = true;
    const real = await start(ctx, { demo: false, client: car });
    car.state.seats.job = 'back'; car.emit('state', car.state);
    focus = false; focused('MAIN');
    assert.equal(stops(), 0, 'leaving the screen must not stop Comfort\'s way back');
    focus = true; focused('MAIN');
    car.state.seats.job = null; car.emit('state', car.state);
    await handlers.BTN_M2();
    car.state.seats.job = 'memory'; car.emit('state', car.state);
    focus = false; focused('MAIN');
    assert.equal(stops(), 1, 'leaving the screen stops a move the app asked for');
    car.state.seats.job = 'back'; car.emit('state', car.state);
    await real.close();
    assert.equal(stops(), 1, 'shutting down must not stop Comfort\'s way back');
    assert.equal(connections, 0);
    console.log('PASS packaged canvas, compatible seat graphics, tabs, Make room, memory, stop, socket-free preview and door moves left to Comfort');
})().catch((e) => { console.error(e); process.exitCode = 1; }).then(() => { net.createConnection = originalConnection; });
