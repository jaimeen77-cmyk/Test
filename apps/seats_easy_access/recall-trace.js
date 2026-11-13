'use strict';
// Read-only evidence for manual and automatic driver M1. Never interprets job-end as arrival.
function snapshot(pos) {
    return Object.keys(pos || {}).sort().map((axis) => axis + '=' + pos[axis]).join(' ') || '?';
}
class RecallTrace {
    constructor(client, log, options) {
        this.log = log; this.now = options && options.now || Date.now; this.active = null;
        const send = client.send.bind(client);
        client.send = (q) => {
            if (q.op === 'memory' && q.seat === 'driver' && q.slot === 0 && q.save === false) {
                const s = client.state && client.state.seats;
                this.active = { at: this.now(), seen: false, changed: false, before: Object.assign({}, s && s.pos.driver) };
                log.add(['M1 reported position before', snapshot(s && s.pos.driver)]);
                log.add(['M1 stored target', snapshot(s && s.m1Target && s.m1Target.driver)]);
            }
            return send(q).catch((e) => { if (q.op === 'memory') this.active = null; throw e; });
        };
        client.on('state', (s) => this.observe(s));
        client.on('lost', () => {
            if (this.active) log.add(['M1 outcome unknown: Comfort disconnected']);
            this.active = null;
        });
    }
    observe(s) {
        const a = this.active; if (!a) return;
        const pos = s.seats.pos.driver;
        if (Object.keys(a.before).some((axis) => typeof pos[axis] === 'number' && pos[axis] !== a.before[axis])) a.changed = true;
        const running = s.seats.job === 'memory' && s.seats.jobSeat === 'driver';
        if (running) a.seen = true;
        else if (a.seen) {
            this.log.add([a.changed ? 'M1 job ended: reported position changed' : 'M1 job ended: no reported position change']);
            this.log.add(['M1 reported position after', snapshot(pos)]);
            this.active = null;
        } else if (this.now() - a.at > 10000) {
            this.log.add(['M1 outcome unknown: no memory job observed']); this.active = null;
        }
    }
}
module.exports = { RecallTrace, snapshot };
