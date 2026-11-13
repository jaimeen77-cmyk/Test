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
    const ctx = {
        app: new EventEmitter(), theme: () => themes.theme('dark'), log: { error(e) { throw e; } },
        canvas: (w, h) => new record.Recorder(w, h), hideButton() {}, onLayout() {},
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
        await handlers.BTN_MINUS(); assert.equal(screen.client.state.seats.pos.passenger.SLV, 99);
        await handlers.BTN_SAVE(); assert.equal(screen.easy.saveMemory, true);
        await handlers.BTN_M1(); assert.equal(screen.easy.saveMemory, false);
        await handlers.BTN_STOP();
        assert.ok(frames.length > 5);
        assert.equal(connections, 0);
        console.log('PASS packaged canvas, compatible seat graphics, tabs, Make room, memory, stop, and socket-free preview');
    } finally { await screen.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; }).then(() => { net.createConnection = originalConnection; });
