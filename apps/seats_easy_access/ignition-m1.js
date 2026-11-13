'use strict';
// One driver M1 recall per observed power cycle. No timers survive a lost connection.
class IgnitionM1 {
    constructor(client, settings, log, options) {
        const o = options || {};
        this.client = client; this.settings = settings; this.log = log;
        this.now = o.now || Date.now;
        // Capture before the screen's manual-move tracker wraps send. A screen hide must not stop this recall.
        this.send = client.send.bind(client);
        this.pending = null; this.busy = false;
        this.lastPower = null;
        client.on('state', (s) => this.observe(s));
        client.on('lost', () => { this.cancel('M1 cancelled: Comfort disconnected'); this.lastPower = null; });
        if (settings.onChange) settings.onChange((key) => {
            if (key === 'ignitionM1' && !this.enabled()) this.cancel('M1 cancelled: option off');
        });
    }
    enabled() { return this.settings.get('ignitionM1') === true; }
    cancel(reason) {
        if (this.pending) { this.pending = null; this.log.add([reason]); }
    }
    observe(s) {
        if (!s.carOn) {
            this.cancel('M1 cancelled: power off');
            if (this.enabled() && this.settings.get('m1OffSeen') !== true) this.settings.set('m1OffSeen', true);
        } else if (this.lastPower !== true) {
            const offSeen = this.settings.get('m1OffSeen') === true;
            if (offSeen) this.settings.set('m1OffSeen', false);
            if (this.enabled() && offSeen) {
                const now = this.now();
                this.pending = { due: now + 15000, deadline: now + 45000, idleAt: null, waiting: false };
                this.log.add(['M1 power-on detected: waiting 15 seconds']);
            }
        }
        this.lastPower = s.carOn;
        if (!this.pending) return;
        if (!s.parked) return this.cancel('M1 cancelled: car not stationary');
        if (s.seats.job || s.seats.moving) this.pending.idleAt = null;
        else if (this.pending.idleAt === null) this.pending.idleAt = this.now();
    }
    async tick() {
        if (!this.pending || this.busy) return;
        if (!this.enabled()) return this.cancel('M1 cancelled: option off');
        const p = this.pending, now = this.now();
        if (now > p.deadline) return this.cancel('M1 cancelled: readiness timeout');
        if (now < p.due) return;
        this.busy = true;
        try {
            const s = await this.client.refresh();
            if (this.pending !== p || !this.enabled()) return;
            if (!s.carOn || !s.parked) return this.cancel('M1 cancelled: power or stationary condition changed');
            if (this.now() > p.deadline) return this.cancel('M1 cancelled: readiness timeout');
            if (s.seats.job || s.seats.moving || p.idleAt === null || this.now() - p.idleAt < 3000) {
                if (!p.waiting) { p.waiting = true; this.log.add(['M1 waiting for Comfort seat job to finish']); }
                return;
            }
            if (!s.seats.memory1.driver) return this.cancel('M1 cancelled: save driver M1 first');
            if (!s.seats.axes.driver.length || !Object.keys(s.seats.pos.driver).length)
                return this.cancel('M1 cancelled: driver position unavailable');
            this.pending = null; // consume before sending: errors must not cause repeated movement commands
            this.log.add(['M1 calling driver memory']);
            await this.send({ op: 'memory', seat: 'driver', slot: 0, save: false });
            this.log.add(['M1 command sent (arrival not confirmed)']);
        } catch (e) {
            this.cancel('M1 cancelled: status unavailable');
            this.log.add(['M1 request failed', e.message]);
        } finally { this.busy = false; }
    }
}
module.exports = { IgnitionM1 };
