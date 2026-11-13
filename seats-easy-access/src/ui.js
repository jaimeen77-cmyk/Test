'use strict';
const { ComfortClient, EasyAccess, VERSION, bounded } = require('./core');

async function run(options) {
    const opts = options || {}, sdk = opts.sdk || require('oap-sdk');
    const app = new sdk.OnlineApp();
    const client = opts.client || new ComfortClient();
    const easy = new EasyAccess(client);
    const active = () => Promise.resolve(app.registerActive()).catch(() => {});
    app.on('appStatusProxyReady', active);
    let main, timer, closing = false, visible = false, focused = false;

    async function close() {
        if (closing) return;
        closing = true; clearInterval(timer); easy.setForeground(false);
        await bounded(client.send({ op: 'stop' }), 900, 'stop timeout').catch(() => {});
        client.close();
    }
    app.on('shutdown', () => close().then(() => { if (!opts.noExit) process.exit(0); }));
    await app.start(); await active();
    const rhmi = app.rhmiApplication;
    if (!rhmi) return { app: app, easy: easy, close: close };
    const comp = (name) => rhmi.getByName(name);
    const cache = {};
    function text(name, value, cell) {
        const c = comp(name), key = name + ':' + (cell || 'Text'), string = String(value);
        if (!c || cache[key] === string) return;
        cache[key] = string;
        Promise.resolve(c.setValue(0, cell || 'Text', string, 'Text')).catch(() => { delete cache[key]; });
    }
    function enable(name, value) {
        const c = comp(name);
        if (c) Promise.resolve(c.setProperty('Enabled', value ? 1 : 0, 'UInt')).catch(() => {});
    }
    function seatText(who) {
        const state = easy.state();
        if (!state) return '상태 없음';
        const axes = state.seats.axes[who];
        if (!axes.length) return '지원되는 시트 모듈 없음';
        const exit = state.seats.exit[who] ? '하차 위치 저장됨' : '하차 위치 미저장';
        return exit + ' · ' + axes.join('/');
    }
    function draw() {
        const state = easy.state();
        const moving = state && (state.seats.moving || state.seats.job);
        text('STATUS', easy.message);
        text('AUTO', state ? (state.settings.easyExit ? '켜짐' : '꺼짐') : '확인 필요', 'Text2ndCol');
        text('DRIVER', seatText('driver'), 'Text2ndCol');
        text('PASSENGER', seatText('passenger'), 'Text2ndCol');
        text('VEHICLE', state ? (state.parked ? '정차' : '주행 중') + (moving ? ' · 시트 이동 중' : '') : '알 수 없음', 'Text2ndCol');
        const ready = easy.foreground && !!state && !easy.pending;
        enable('AUTO_TOGGLE', ready);
        enable('DRIVER_SAVE', ready && !easy.actionReady('driver', true));
        enable('DRIVER_MOVE', ready && state.seats.exit.driver && !easy.actionReady('driver', true));
        enable('PASSENGER_SAVE', ready && !easy.actionReady('passenger', true));
        enable('PASSENGER_MOVE', ready && state.seats.exit.passenger && !easy.actionReady('passenger', true));
        enable('STOP', easy.foreground && !!state);
    }
    function action(name, handler) {
        const c = comp(name);
        if (c) c.on('action', () => Promise.resolve().then(handler).catch((error) => {
            easy.message = error.message; easy.emit('change');
        }));
    }
    action('REFRESH', () => easy.refresh());
    action('AUTO_TOGGLE', () => easy.toggle());
    action('DRIVER_SAVE', () => easy.save('driver'));
    action('DRIVER_MOVE', () => easy.move('driver'));
    action('PASSENGER_SAVE', () => easy.save('passenger'));
    action('PASSENGER_MOVE', () => easy.move('passenger'));
    action('STOP', () => easy.stop());
    easy.on('change', draw);

    function foreground() {
        easy.setForeground(visible && focused);
        if (easy.foreground && !easy.pending) easy.refresh().catch(() => {});
    }
    main = comp('MAIN');
    if (main) {
        main.on('visible', (event) => { visible = !!(event && event.visible); if (!visible) focused = false; foreground(); });
        main.on('focus', (event) => { focused = !!(event && event.focus === true); foreground(); });
    }
    rhmi.on('applicationStackChanged', (stack) => {
        const shown = !!stack && Object.prototype.hasOwnProperty.call(stack, 'ROOT_APP');
        Promise.resolve(shown ? app.registerHmiVisible() : app.unregisterHmiVisible()).catch(() => {});
    });
    const description = opts.description || require('../rhmiData/application.json');
    const entries = description.application.entryPoints.map((entry) => entry.uuid);
    async function open(uuid) {
        if (!uuid || !main) return;
        await bounded(rhmi.mapEntryState(uuid, main), 3000, 'entry mapping timeout');
        if (main.updateResources) await bounded(main.updateResources(), 3000, 'resource timeout');
        await bounded(rhmi.openEntryState(uuid), 3000, 'entry opening timeout');
    }
    app.on('entryPointExecute', (uuid) => open(uuid).catch(() => {}));
    await Promise.all(entries.map((id) => rhmi.mapEntryState(id, main))).catch(() => {});
    if (main && main.updateResources) await main.updateResources().catch(() => {});
    draw(); await app.initialized();
    const last = app.getLastExecutedEntryPointUuid && app.getLastExecutedEntryPointUuid();
    if (last && ['ENTRY_POINT', 'BOOKMARK', 'LUM'].indexOf(String(app.startReason)) >= 0) open(last).catch(() => {});
    timer = setInterval(() => draw(), 1000);
    return { app: app, easy: easy, close: close, version: VERSION };
}
module.exports = { run };
