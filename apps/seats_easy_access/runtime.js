'use strict';
const fs = require('fs');
const path = require('path');
const { ComfortClient } = require('./core');
const { DemoClient } = require('./demo');
const { ComfortLog } = require('./comfort-log');
const { IgnitionM1 } = require('./ignition-m1');
function start(ctx, options) {
    const o = options || {};
    const demo = o.demo === undefined ? !fs.existsSync('/etc/oap/someip/someip-interfaces.json') : o.demo;
    const client = o.client || (demo ? new DemoClient() : new ComfortClient());
    const settings = ctx.settings || { get() { return false; }, set() {} };
    const log = new ComfortLog(client, { journal: !demo, size: 120,
        file: !demo && ctx.dataDir ? path.join(ctx.dataDir, 'seats-diagnostics.json') : null });
    const auto = new IgnitionM1(client, settings, log, { now: o.now });
    let closed = false, reading = false;
    async function poll() {
        if (closed || reading) return;
        reading = true;
        try { await client.refresh(); await auto.tick(); }
        catch (_) {} // lost/status failures are recorded without restarting or moving a seat
        finally { reading = false; }
    }
    // Independent of the visible-page loop: keep receiving power events while the screen is hidden.
    const timer = setInterval(poll, 1000);
    if (timer.unref) timer.unref();
    function close() {
        if (closed) return;
        closed = true; clearInterval(timer); auto.cancel('M1 cancelled: app shutdown'); log.flush(); client.close();
    }
    if (ctx.app && ctx.app.on) ctx.app.on('shutdown', close);
    poll();
    return { client, settings, comfortLog: log, auto, demo, close, poll };
}
module.exports = { start };
