'use strict';
const { EasyAccess, ownMoves, VERSION } = require('./core');
const LogPage = require('./log-page');
const { translator } = require('./i18n');
const { t } = require('./kit/i18n');
const { makeLayer } = require('./kit/record');
const G = require('./kit/gauges');
const BG = require('./bg');
const seat = require('./seat-image');
const Runtime = require('./runtime');
// the HMI's back arrow column (x 0..84 of the 1920 px screen): the photo starts right of it, where the menu does
const HMI_LEFT = 84, TAB_BAR = 38;

async function start(ctx, options) {
    const opts = options || {}, translate = translator(opts.language), tr = (value) => translate(t(value));
    const runtime = ctx.background || Runtime.start(ctx, opts);
    const { client, comfortLog, auto, demo } = runtime;
    const moves = ownMoves(client);
    const easy = new EasyAccess(client);
    // Native/Iterio renderers do not accept the upstream OP_IMAGE upload.
    // Cache the photo as gradient columns, as Storage does for its background.
    const pixels = seat.pixels();
    const seatWidth = 220, seatHeight = 330;
    const seatLayer = makeLayer(seatWidth, seatHeight, (r) => {
        for (let x = 0; x < seatWidth; x += 1) {
            for (let top = 0; top < seatHeight; top += 60) {
                const height = Math.min(60, seatHeight - top), stops = [];
                // Pixel-resolution bands, each within the GPU's 64-stop limit.
                for (let k = 0; k <= height; k++) {
                    const y = k;
                    const sx = Math.min(seat.w - 1, Math.floor(x * seat.w / seatWidth));
                    const sy = Math.min(seat.h - 1, Math.floor((top + y) * seat.h / seatHeight));
                    const offset = (sy * seat.w + sx) * 4;
                    stops.push([y / height, [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]]]);
                }
                if (stops.some((stop) => stop[1][3] > 0)) r.gradientRect(x, top, 1, height, stops);
            }
        }
    });
    let axis = 'SLV', last = '', rendering = null, closed = false, page = 0;
    let paused = false, frozen = [], logPage = 0, logPages = 1, statusAt = 0, statusReading = false;
    let appLogs = auto.enabled();
    function hold() { frozen = comfortLog.lines(120, tr, appLogs).slice(); paused = true; }
    const axes = ['SLV', 'SHV', 'LNV', 'SNV', 'KHV'];
    const labels = { SLV: ['◀', '▶', 'Fore / aft'], SHV: ['▼', '▲', 'Height'],
        LNV: ['◀', '▶', 'Backrest'], SNV: ['▼', '▲', 'Cushion'], KHV: ['▼', '▲', 'Headrest'] };
    function foreground() {
        const on = demo || (!!ctx.ui.isVisible('MAIN') && (!ctx.ui.hasFocus || ctx.ui.hasFocus('MAIN')));
        if (easy.foreground !== on) {
            easy.setForeground(on);
            if (!on) moves.stop().catch(() => {});   // never Comfort's own door moves
        }
    }
    async function act(fn) {
        foreground();
        try { await fn(); } catch (e) { easy.message = e.message; }
        last = ''; await render();
    }
    function cycleAxis() {
        const supported = client.state ? client.state.seats.axes[easy.selectedSeat] : [];
        const list = axes.filter((a) => supported.indexOf(a) >= 0);
        axis = list[(list.indexOf(axis) + 1) % list.length] || 'SLV';
    }
    const actions = {
        BTN_IGNITION_M1: () => {
            const on = !auto.enabled();
            runtime.settings.set('ignitionM1', on);
            runtime.settings.set('m1OffSeen', false);
            appLogs = true;
            auto.cancel('M1 cancelled: option changed');
            comfortLog.add([on ? 'Ignition M1 enabled: next power cycle' : 'Ignition M1 disabled']);
        },
        BTN_DRIVER: () => { easy.selectSeat('driver'); page = 0; },
        BTN_PASSENGER: () => { easy.selectSeat('passenger'); page = 1; },
        BTN_LOGS: () => { page = 2; },
        BTN_LOG_SOURCE: () => { appLogs = !appLogs; paused = false; logPage = 0; },
        BTN_LOG_HOLD: () => { if (paused) { paused = false; logPage = 0; } else hold(); },
        BTN_LOG_OLDER: () => { if (!paused) hold(); logPage = Math.min(logPage + 1, logPages - 1); },
        BTN_LOG_NEWER: () => { logPage = Math.max(0, logPage - 1); },
        BTN_LOG_REFRESH: async () => { await easy.refresh(); if (!demo) await comfortLog.poll(true); },
        BTN_REFRESH: () => easy.refresh(), BTN_AUTO: () => easy.toggle(), BTN_AXIS: cycleAxis,
        BTN_MINUS: () => easy.jog(axis, -1), BTN_PLUS: () => easy.jog(axis, 1),
        BTN_SAVE: () => easy.armMemorySave(), BTN_M1: () => easy.memory(0),
        BTN_M2: () => easy.memory(1), BTN_M3: () => easy.memory(2),
        BTN_EXIT_SAVE: () => easy.save(easy.selectedSeat), BTN_EXIT: () => easy.move(easy.selectedSeat),
        BTN_ROOM: () => easy.makeRoom(), BTN_STOP: () => easy.stop(),
    };
    Object.keys(actions).forEach((id) => {
        const fn = actions[id];
        if (/^BTN_(MINUS|PLUS|SAVE|M[123]|EXIT|EXIT_SAVE|ROOM|STOP)$/.test(id)) actions[id] = () => {
            auto.cancel('M1 cancelled: manual control'); return fn();
        };
        ctx.ui.onClick(id, () => act(actions[id]));
        if (ctx.hideButton) ctx.hideButton(id);
    });
    function render(force) {
        if (closed) return Promise.resolve();
        if (rendering) return rendering;
        const state = client.state, who = easy.selectedSeat;
        const logLines = page === 2 ? (paused ? frozen : comfortLog.lines(120, tr, appLogs)) : comfortLog.lines(4, tr, auto.enabled());
        const signature = JSON.stringify([state, client.at, who, easy.message, easy.pending, easy.foreground, easy.saveMemory, axis, logLines, page, paused, logPage, comfortLog.source(), auto.enabled(), appLogs]);
        if (!force && signature === last) return Promise.resolve();
        last = signature;
        const cv = ctx.canvas(1600, 520).clear('#11161c');
        const theme = Object.assign({}, ctx.theme(), { sel: '#e6404a' });
        const frame = () => G.frame(cv, theme, [tr('운전석'), tr('조수석'), tr('Logs')], page,
            demo ? [{ text: tr('PREVIEW'), color: '#f3bc56' }] : []);
        if (page === 2) {
            logPages = LogPage.draw(cv, { state, at: client.at, version: VERSION, source: appLogs ? 'app' : comfortLog.source(),
                lines: logLines, paused, page: logPage }, tr, (id, label, x, y, w, h, enabled, selected) => {
                cv.roundRect(x, y, w, h, 12, selected ? '#6b3941' : '#27323f');
                cv.text(tr(label), x + w / 2, y + 29, 21, enabled ? '#ffffff' : '#657483', { align: 'center', literal: true });
                if (enabled) cv.target(x, y, w, h, () => act(actions[id]), id, 12);
            });
            frame();
            rendering = Promise.resolve(ctx.ui.image('MAIN_GFX', cv)).then(() => { rendering = null; }, (e) => { rendering = null; throw e; });
            return rendering;
        }
        // full-screen placement: the page's left edge lies under the HMI's back arrow column, so the photo
        // starts where the menu does (the column's edge) and under the tab bar, not cut by the column
        const place = cv.place, left = place && place.full ? Math.max(0, Math.ceil((HMI_LEFT - place.ox) / place.scale)) : 0;
        BG.paint(cv, 1600, 520, left, TAB_BAR);
        // Lighter veil than before so the BMW Coding photo shows, as on Cluster Redline's settings screen.
        cv.fillRect(left, TAB_BAR, 1600 - left, 520 - TAB_BAR, [7, 11, 17, 105]);
        // BMW Coding mark in the free space between the seat and the automatic Easy Access switch.
        const autoWidth = cv.textWidth ? cv.textWidth(tr('자동 Easy Access'), 23, { literal: true }) : 230;
        BG.mark(cv, Math.min(1238, 1440 - autoWidth - 28), 100);
        cv.blit(seatLayer, 650, 48);
        const stationary = state ? (state.parked ? tr('정차') : tr('주행 중')) : tr('상태 없음');
        cv.fillRect(38, 62, 4, 25, '#e6404a');
        cv.text(tr(who === 'driver' ? '운전석' : '조수석') + ' · ' + stationary, 58, 83, 23, '#dbe2e9', { literal: true });
        const ready = easy.foreground && !!state && !easy.pending;
        function button(id, label, x, y, w, h, enabled, selected, fn) {
            const color = id === 'BTN_STOP' ? '#b51d2c' : selected ? '#5e3039' : '#20262c';
            const circle = w === h, radius = circle ? h / 2 : 14;
            const featured = id === 'BTN_EXIT_SAVE' || id === 'BTN_ROOM';
            cv.card(x, y, w, h, radius, [[0, enabled ? (featured ? '#44383f' : '#3d4146') : '#22262b'], [0.5, enabled ? color : '#1a1f26'], [1, enabled ? '#10151a' : '#181d23']]);
            cv.strokeRoundRect(x, y, w, h, radius, 1, id === 'BTN_STOP' || featured ? '#cf4c57' : enabled ? '#8a8d91' : '#39434f');
            const ink = enabled ? '#ffffff' : '#7a8592';
            if (/^[◀▶▲▼]$/.test(label)) {
                const cx = x + w / 2, cy = y + h / 2;
                const points = label === '◀' ? [[6, -10], [-6, 0], [6, 10]] : label === '▶' ? [[-6, -10], [6, 0], [-6, 10]] :
                    label === '▲' ? [[-10, 6], [0, -6], [10, 6]] : [[-10, -6], [0, 6], [10, -6]];
                cv.line(cx + points[0][0], cy + points[0][1], cx + points[1][0], cy + points[1][1], 3, ink);
                cv.line(cx + points[1][0], cy + points[1][1], cx + points[2][0], cy + points[2][1], 3, ink);
            } else cv.text(tr(label), x + w / 2, y + h / 2 + 8, featured ? 24 : 21, ink, { align: 'center', literal: true });
            if (enabled) cv.target(x, y, w, h, () => act(fn || actions[id]), id, radius);
        }
        cv.text(tr('자동 Easy Access'), 1440, 76, 23, '#dbe2e9', { align: 'right', literal: true });
        const automatic = state && state.settings.easyExit;
        cv.card(1460, 49, 91, 40, 20, [[0, automatic ? '#f24954' : '#676b70'], [1, automatic ? '#920f20' : '#25292f']]);
        cv.roundRect(automatic ? 1516 : 1466, 53, 32, 32, 16, '#f7f7f7');
        if (ready) cv.target(1160, 45, 400, 48, () => act(actions.BTN_AUTO), 'BTN_AUTO', 20);
        button('BTN_IGNITION_M1', tr('Ignition M1') + ': ' + tr(auto.enabled() ? 'On' : 'Off'), 1200, 115, 350, 46,
            ready && who === 'driver', auto.enabled());
        const controls = [ ['KHV', 470, 135], ['LNV', 994, 160], ['SNV', 255, 300], ['SHV', 440, 285], ['SLV', 995, 310] ];
        controls.forEach((row) => {
            const a = row[0], x = row[1], y = row[2];
            const supported = state && state.seats.axes[who].indexOf(a) >= 0;
            const enabled = ready && supported && !easy.actionReady(who, false);
            cv.text(tr(labels[a][2]), x + 61, y - 13, 21, '#d4dce5', { align: 'center', literal: true });
            const jog = (dir) => { auto.cancel('M1 cancelled: manual control'); return easy.jog(a, dir); };
            button(a + '_MINUS', labels[a][0], x, y, 54, 54, enabled, false, () => jog(-1));
            button(a + '_PLUS', labels[a][1], x + 68, y, 54, 54, enabled, false, () => jog(1));
        });
        const memory = ready && !easy.actionReady(who, true);
        cv.fillRect(28, 445, 1544, 1, [230, 235, 242, 65]);
        ['M1', 'M2', 'M3'].forEach((label, i) => button('BTN_' + label, label, 55 + i * 155, 462, 140, 46, memory, false));
        button('BTN_SAVE', 'Save memory', 540, 462, 200, 46, memory, easy.saveMemory);
        button('BTN_EXIT_SAVE', 'Save exit', 200, 387, 555, 50, memory, false);
        button('BTN_EXIT', 'Easy Access', 765, 462, 270, 46, memory && state.seats.exit[who], false);
        button('BTN_ROOM', state && state.seats.roomOut ? 'Return passenger' : 'Make room', 785, 387, 555, 50,
            memory && who === 'passenger', false);
        button('BTN_REFRESH', 'Refresh', 1060, 462, 210, 46, !easy.pending, false);
        button('BTN_STOP', 'STOP', 1295, 462, 240, 46, easy.foreground, false);
        // Comfort's log: under the page where the screen has room below it (the car's full-screen layout),
        // else in the free space under the status line
        const fit = (text, size, width) => {
            let v = text;
            while (v.length > 4 && cv.textWidth && cv.textWidth(v, size, { literal: true }) > width) v = v.slice(0, -2);
            return v === text ? v : v + '…';
        };
        const extra = cv.extra || 0, logTitle = tr('Comfort 로그') + (comfortLog.source() === 'journal' ? '' : ' · ' + tr('상태 변화'));
        if (extra >= 30) {
            const shown = logLines.slice(-2);
            cv.fillRect(left + 16, 524, 1584 - left - 16, 1, [230, 235, 242, 60]);
            cv.text(logTitle, 1572, 542, 14, '#8d97a4', { align: 'right', literal: true });
            shown.forEach((line, i) => cv.text(fit(line, 15, 1240), left + 28, 542 + i * 20, 15, '#b8c2cc', { literal: true }));
        } else {
            cv.text(logTitle, 58, 146, 14, '#8d97a4', { literal: true });
            logLines.forEach((line, i) => cv.text(fit(line, 14, 370), 58, 168 + i * 19, 14, '#b8c2cc', { literal: true }));
        }
        const message = tr(easy.message);
        const clipped = message.length > 58 ? message.slice(0, 55) + '…' : message;
        cv.text(clipped, 58, 112, 17, '#c2ccd7', { literal: true });
        frame();
        rendering = Promise.resolve(ctx.ui.image('MAIN_GFX', cv)).then(() => { rendering = null; }, (e) => { rendering = null; throw e; });
        return rendering;
    }
    easy.on('change', () => { render().catch((e) => ctx.log.error(e)); });
    ctx.onTab((index) => act(actions[index === 2 ? 'BTN_LOGS' : index === 1 ? 'BTN_PASSENGER' : 'BTN_DRIVER']));
    ctx.onLayout(() => render(true));
    if (ctx.ui.onVisible) ctx.ui.onVisible((name) => {
        if (name === 'MAIN') { foreground(); last = ''; render(); }
    });
    if (ctx.ui.onFocus) ctx.ui.onFocus((name) => { if (name === 'MAIN') foreground(); });
    const loop = ctx.loop('MAIN', 4, () => {
        foreground();
        if (easy.foreground) comfortLog.poll().catch(() => {});   // the journal at most every 3 s, while shown
        if (page === 2 && easy.foreground && !easy.pending && !statusReading && Date.now() - statusAt > 2000) {
            statusAt = Date.now(); statusReading = true;
            client.refresh().catch((e) => comfortLog.add(['Status read failed', e.message]))
                .then(() => { statusReading = false; });
        }
        return render();
    });
    async function close() {
        closed = true; if (loop && loop.stop) loop.stop();
        comfortLog.flush();
        await moves.stop().catch(() => {}); runtime.close();
    }
    if (ctx.app && ctx.app.on) ctx.app.on('shutdown', close);
    foreground();
    await render(true);
    await easy.refresh().catch(() => {});
    return { easy, client, render, close, demo, comfortLog, auto };
}
module.exports = { start };
