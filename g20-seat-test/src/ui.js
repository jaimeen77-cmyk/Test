'use strict';
const fs = require('fs');
const path = require('path');
const { ComfortClient, SeatTest, VERSION, bounded } = require('./core');
const { VehicleReader } = require('./vehicle');

async function run(options) {
    const opts = options || {}, sdk = opts.sdk || require('oap-sdk');
    const app = new sdk.OnlineApp();
    const dataDir = opts.dataDir || process.cwd();
    const client = opts.client || new ComfortClient();
    const vehicle = opts.vehicle || new VehicleReader(require('./kit/signals'));
    const test = new SeatTest(client, vehicle);
    const logFile = path.join(dataDir, 'seat-test.log');
    client.record = (event, data) => test.record(event, data);
    function log(message) {
        try {
            if (fs.existsSync(logFile) && fs.statSync(logFile).size > 65536) fs.renameSync(logFile, logFile + '.1');
            fs.appendFileSync(logFile, new Date().toISOString() + ' ' + message + '\n');
        } catch (_) {}
    }
    const active = () => Promise.resolve(app.registerActive()).catch((e) => log('registerActive: ' + e.message));
    app.on('appStatusProxyReady', active);
    let rhmi, main, timer = null, refreshPending = false, closing = false;
    let visible = false, focused = false;
    function foreground() { test.setForeground(visible && focused); }
    async function close() {
        if (closing) return;
        closing = true; clearInterval(timer); test.setForeground(false);
        await bounded(test.stop('app shutdown'), 1200, 'stop timeout').catch((e) => log(e.message));
        client.close();
    }
    app.on('shutdown', () => close().then(() => { if (!opts.noExit) process.exit(0); }));
    await app.start(); await active();
    rhmi = app.rhmiApplication;
    if (!rhmi) { log('SDK created no RHMI screen; check SDK configuration and Store install log.'); return { app: app, test: test, close: close }; }
    const comp = (name) => rhmi.getByName(name);
    const pendingText = {};
    function text(name, value, cell) {
        const c = comp(name), key = name + ':' + (cell || 'Text'), s = String(value);
        if (!c || pendingText[key] === s) return;
        pendingText[key] = s;
        Promise.resolve(c.setValue(0, cell || 'Text', s, 'Text')).catch((e) => { delete pendingText[key]; log('UI: ' + e.message); });
    }
    function enable(name, value) {
        const c = comp(name); if (c) Promise.resolve(c.setProperty('Enabled', value ? 1 : 0, 'UInt')).catch((e) => log(e.message));
    }
    const positions = (who) => {
        const s = client.state && client.state.seats;
        if (!s) return 'No Comfort status';
        if (!s.axes[who].length) return 'No axes reported';
        return s.axes[who].map((axis) => axis + (s.pos[who][axis] === undefined ? ': motor only' : ':' + s.pos[who][axis])).join('  ');
    };
    function draw() {
        if (test.armedUntil && test.armedUntil <= Date.now()) test.disarm('Read-only: confirmation expired.');
        text('STATUS', test.message);
        text('DRIVER', positions('driver'), 'Text2ndCol');
        text('PASSENGER', positions('passenger'), 'Text2ndCol');
        text('VEHICLE', test.sample ? test.sample.speedKmh + ' km/h / ' + test.sample.stage + ' / age ' +
            Math.max(0, Date.now() - test.sample.at) + 'ms' : 'Unknown (movement locked)', 'Text2ndCol');
        text('MODE', test.moving ? 'Move requested' : test.armedUntil > Date.now() ? 'One test enabled' : 'Read-only', 'Text2ndCol');
        enable('ARM', !test.policy(false));
        enable('PLUS', !test.policy(true)); enable('MINUS', !test.policy(true));
    }
    function action(name, fn) {
        const c = comp(name); if (c) c.on('action', () => Promise.resolve().then(fn).catch((e) => {
            if (!test.failedStop) test.message = e.message;
            test.record('action_error', { action: name, message: e.message }); log(name + ': ' + e.message); draw();
        }));
    }
    async function refresh() {
        if (refreshPending || test.moving || closing) return;
        refreshPending = true;
        try { await test.refresh(); } finally { refreshPending = false; draw(); }
    }
    action('REFRESH', refresh);
    action('ARM', () => test.arm());
    action('PLUS', () => test.pulse(1)); action('MINUS', () => test.pulse(-1));
    action('STOP', () => test.stop('STOP button', true));
    action('SAVE', () => {
        const file = path.join(dataDir, 'seat-test-report.json');
        fs.writeFileSync(file + '.tmp', JSON.stringify(test.report(), null, 2) + '\n');
        fs.renameSync(file + '.tmp', file);
        test.message = 'Report saved: seat-test-report.json'; log('report saved in app data folder'); draw();
    });
    test.on('change', draw);
    main = comp('MAIN');
    if (main) {
        main.on('visible', (event) => { visible = !!(event && event.visible); if (!visible) focused = false; foreground(); if (test.foreground) refresh(); });
        main.on('focus', (event) => { focused = !!(event && event.focus === true); foreground(); if (test.foreground) refresh(); });
    }
    rhmi.on('applicationStackChanged', (stack) => {
        const shown = !!stack && Object.prototype.hasOwnProperty.call(stack, 'ROOT_APP');
        const ids = [].concat.apply([], Object.keys(stack || {}).map((k) => stack[k] || []));
        const here = shown && main && main.getId && ids.indexOf(main.getId()) >= 0;
        visible = !!here; if (!visible) focused = false; foreground();
        Promise.resolve(shown ? app.registerHmiVisible() : app.unregisterHmiVisible()).catch((e) => log(e.message));
    });
    let entries = [];
    try {
        const root = path.resolve(__dirname, '..', '..');
        const desc = opts.description || JSON.parse(fs.readFileSync(path.join(root, 'rhmiData', 'application.json'), 'utf8'));
        entries = desc.application.entryPoints.map((e) => e.uuid);
    } catch (e) { log('entry description: ' + e.message); }
    async function open(uuid) {
        if (!uuid || !main) return;
        await bounded(rhmi.mapEntryState(uuid, main), 3000, 'entry mapping timeout');
        if (main.updateResources) await bounded(main.updateResources(), 3000, 'screen resources timeout');
        await bounded(rhmi.openEntryState(uuid), 3000, 'entry opening timeout');
        // Opening is not proof of foreground focus: only observed HMI events can enable a test.
        refresh();
    }
    app.on('entryPointExecute', (uuid) => open(uuid).catch((e) => log(e.message)));
    await bounded(Promise.all(entries.map((id) => rhmi.mapEntryState(id, main))), 3000, 'initial mapping timeout').catch((e) => log(e.message));
    if (main && main.updateResources) await bounded(main.updateResources(), 3000, 'initial screen timeout').catch((e) => log(e.message));
    draw();
    await app.initialized();
    const last = app.getLastExecutedEntryPointUuid && app.getLastExecutedEntryPointUuid();
    if (last && ['ENTRY_POINT', 'BOOKMARK', 'LUM'].indexOf(String(app.startReason)) >= 0) open(last).catch((e) => log(e.message));
    timer = setInterval(() => { draw(); if (test.foreground && !test.moving) refresh(); }, 1000);
    log('Seat Test ' + VERSION + ' initialized; no movement requested');
    return { app: app, test: test, close: close };
}
module.exports = { run };
