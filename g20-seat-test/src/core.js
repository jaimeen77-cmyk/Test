'use strict';

// Original test client. Uses the published Comfort JSON protocol; contains no Comfort implementation.
const EventEmitter = require('events');
const net = require('net');
const SOCKET = '/run/iteriodev-comfort/ctl.sock';
const VERSION = '0.1.0';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function bounded(promise, ms, message) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message || 'timeout')), ms);
        Promise.resolve(promise).then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
}

function finite(n) { return typeof n === 'number' && isFinite(n); }
function stateOf(message) {
    const s = message && message.state, seats = s && s.seats;
    if (!seats || !seats.axes || !seats.pos) return null;
    const clean = { parked: s.parked === true, seats: {
        axes: {}, pos: {}, moving: seats.moving === null ? null : { active: true },
        job: seats.job === null ? null : 'busy-or-unknown',
        automatic: true,
    } };
    const preClear = seats.pre && seats.pre.driver === false && seats.pre.passenger === false;
    const exitClear = seats.exit && seats.exit.driver === false && seats.exit.passenger === false;
    if (preClear && (exitClear || s.settings && s.settings.easyExit === false)) clean.seats.automatic = false;
    for (const who of ['driver', 'passenger']) {
        if (!Array.isArray(seats.axes[who]) || typeof seats.pos[who] !== 'object' || !seats.pos[who]) return null;
        clean.seats.axes[who] = seats.axes[who].filter((a) => typeof a === 'string' && /^[A-Z]{3}$/.test(a));
        clean.seats.pos[who] = {};
        clean.seats.axes[who].forEach((a) => {
            if (finite(seats.pos[who][a])) clean.seats.pos[who][a] = seats.pos[who][a];
        });
    }
    return clean;
}

class ComfortClient extends EventEmitter {
    constructor(socketPath, record) {
        super();
        this.path = socketPath || SOCKET;
        this.record = record || function () {};
        this.socket = null;
        this.connecting = null;
        this.state = null;
        this.at = 0;
    }
    async connect() {
        if (this.socket && !this.socket.destroyed) return;
        if (this.connecting) return this.connecting;
        this.connecting = new Promise((resolve, reject) => {
            let buffer = '', connected = false;
            const socket = net.createConnection(this.path);
            const timer = setTimeout(() => socket.destroy(new Error('Comfort connection timeout')), 1500);
            socket.setEncoding('utf8');
            socket.on('connect', () => { connected = true; clearTimeout(timer); this.socket = socket; resolve(); });
            socket.on('data', (chunk) => {
                buffer += chunk;
                if (buffer.length > 65536) { socket.destroy(new Error('oversized Comfort response')); return; }
                let at;
                while ((at = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
                    let packet;
                    try { packet = JSON.parse(line); } catch (_) { continue; }
                    const state = stateOf(packet);
                    if (state) { this.state = state; this.at = Date.now(); this.emit('state', state); }
                }
            });
            socket.on('error', (e) => { this.record('comfort_error', { message: e.message }); if (!connected) reject(e); });
            socket.on('close', () => {
                clearTimeout(timer);
                if (!connected) reject(new Error('Comfort disconnected before connection'));
                if (this.socket === socket) this.socket = null;
                this.state = null; this.at = 0; this.emit('lost');
            });
        });
        try { await this.connecting; } finally { this.connecting = null; }
    }
    send(message) {
        const valid = message && ((message.op === 'get' || message.op === 'stop') && Object.keys(message).length === 1 ||
            message.op === 'jog' && message.seat === 'passenger' && message.axis === 'SLV' &&
            (message.dir === 1 || message.dir === -1) && Object.keys(message).length === 4);
        if (!valid) return Promise.reject(new Error('command outside test scope'));
        if (!this.socket || this.socket.destroyed) return Promise.reject(new Error('Comfort is not connected'));
        const socket = this.socket;
        return bounded(new Promise((resolve, reject) => {
            socket.write(JSON.stringify(message) + '\n', (e) => e ? reject(e) : resolve());
        }), 500, 'Comfort write timeout');
    }
    async refresh() {
        await this.connect();
        return new Promise((resolve, reject) => {
            const done = (error, value) => { clearTimeout(timer); this.removeListener('state', state); this.removeListener('lost', lost); error ? reject(error) : resolve(value); };
            const state = (value) => done(null, value);
            const lost = () => done(new Error('Comfort disconnected'));
            const timer = setTimeout(() => done(new Error('No valid Comfort status')), 1500);
            this.once('state', state); this.once('lost', lost);
            this.send({ op: 'get' }).catch((e) => done(e));
        });
    }
    close() { if (this.socket) this.socket.destroy(); }
}

class SeatTest extends EventEmitter {
    constructor(client, vehicle, options) {
        super();
        this.client = client; this.vehicle = vehicle;
        this.now = options && options.now || Date.now;
        this.entries = [];
        this.foreground = false;
        this.armedUntil = 0;
        this.generation = 0;
        this.moving = false;
        this.cooldownUntil = 0;
        this.failedStop = false;
        this.message = 'Read-only. Refresh status first.';
        this.sample = null;
        client.on('lost', () => { this.disarm('Comfort disconnected'); if (this.moving) this.stop('connection lost'); this.emit('change'); });
        client.on('state', () => this.emit('change'));
    }
    record(event, details) {
        this.entries.push({ time: new Date(this.now()).toISOString(), event: event, details: details || {} });
        if (this.entries.length > 160) this.entries.shift();
    }
    disarm(reason) { this.generation++; this.armedUntil = 0; if (reason) this.message = reason; }
    setForeground(on) {
        this.foreground = !!on;
        if (!on) { this.disarm('Read-only: screen left or covered.'); if (this.moving) this.stop('screen left'); }
        this.emit('change');
    }
    policy(requireArm) {
        const now = this.now(), s = this.client.state, v = this.sample;
        if (!this.foreground) return 'Keep Seat Test in the foreground';
        if (this.failedStop) return 'STOP delivery failed; movement is locked for this app session';
        if (this.moving) return 'A test is already running';
        if (now < this.cooldownUntil) return 'Wait before another test';
        if (!s || now - this.client.at > 1500) return 'Refresh Comfort status';
        if (!s.parked) return 'Comfort does not report the car standing';
        if (s.seats.moving !== null || s.seats.job !== null) return 'Comfort is busy';
        if (s.seats.automatic !== false) return 'Disable existing Easy exit and clear pending returns before testing';
        if (s.seats.axes.passenger.indexOf('SLV') < 0) return 'Passenger fore/aft axis not reported';
        if (!v || !finite(v.speedKmh) || now - v.at > 1500 || v.elapsedMs > 1500 || v.elapsedMs < 0) return 'Fresh vehicle speed and P are required';
        if (v.speedKmh !== 0 || v.stage !== 'P') return 'Vehicle must report zero speed and P';
        if (requireArm && this.armedUntil <= now) return 'Confirm an empty passenger seat first';
        return null;
    }
    async refresh() {
        if (this.moving) throw new Error('Wait for the test to stop');
        const generation = this.generation;
        const results = await Promise.all([
            this.client.refresh().then(() => null, (e) => 'Comfort: ' + e.message),
            this.vehicle.readFresh().then((v) => { if (this.generation === generation) this.sample = v; return null; },
                (e) => { this.sample = null; return 'Vehicle: ' + e.message; }),
        ]);
        const failures = results.filter(Boolean);
        if (this.generation === generation) this.message = failures.length ? failures.join(' / ') :
            this.armedUntil > this.now() ? 'Empty seat confirmed. One test enabled.' : 'Status received. Movement remains locked.';
        this.record('refresh', { errors: failures, vehicle: this.sample, seats: this.client.state && this.client.state.seats });
        this.emit('change');
        return failures;
    }
    async arm() {
        const generation = this.generation;
        await this.refresh();
        if (generation !== this.generation) throw new Error('Confirmation cancelled');
        const blocked = this.policy(false);
        if (blocked) { this.message = blocked; this.emit('change'); throw new Error(blocked); }
        this.armedUntil = this.now() + 15000;
        this.message = 'One test enabled for 15s. Passenger seat must be empty.';
        this.record('armed_empty_seat_confirmed');
        this.emit('change');
    }
    async pulse(direction) {
        if (direction !== 1 && direction !== -1) throw new Error('Invalid direction');
        const before = this.policy(true);
        if (before) throw new Error(before);
        const generation = this.generation, expires = this.armedUntil;
        this.armedUntil = 0; // one shot, including a failed attempt; never persist arming
        this.message = 'Checking zero speed and P again...'; this.emit('change');
        try {
            const results = await Promise.all([this.vehicle.readFresh(), this.client.refresh()]);
            if (generation !== this.generation || expires <= this.now()) throw new Error('Test cancelled or confirmation expired');
            this.sample = results[0];
            const blocked = this.policy(false);
            if (blocked) throw new Error(blocked);
            this.moving = true;
            this.message = 'Short move requested. STOP is available.';
            this.record('move_requested', { seat: 'passenger', axis: 'SLV', direction: direction, vehicle: this.sample });
            // One jog only. Never renew Comfort's hold lease. STOP is scheduled before the write is awaited.
            this.stopTimer = setTimeout(() => this.stop('pulse timer'), 250);
            this.emit('change');
            await this.client.send({ op: 'jog', seat: 'passenger', axis: 'SLV', dir: direction });
        } catch (e) {
            if (this.moving) await this.stop('request error');
            this.disarm(this.failedStop ? 'STOP delivery failed. Use the seat switch; movement is locked.' : 'Read-only: ' + e.message);
            this.record('move_blocked', { message: e.message }); this.emit('change');
            throw e;
        }
    }
    async stop(reason, explicit) {
        const owned = this.moving;
        this.disarm();
        clearTimeout(this.stopTimer);
        if (this.stopping) return this.stopping;
        if (!owned && !explicit) return;
        this.moving = false;
        this.cooldownUntil = this.now() + 3000;
        this.message = 'STOP requested. Check that the seat has stopped.';
        this.emit('change');
        this.stopping = (async () => {
            let sent = 0;
            for (let i = 0; i < 3; i++) {
                try { await this.client.send({ op: 'stop' }); sent++; }
                catch (e) { this.record('stop_write_failed', { message: e.message }); }
                if (i < 2) await sleep(100);
            }
            this.record('stop_requested', { reason: reason, writes: sent, physicalStopVerified: false });
            if (!sent) { this.failedStop = true; this.message = 'STOP delivery failed. Use the seat switch; do not retry movement.'; }
            this.emit('change');
        })();
        try { await this.stopping; } finally { this.stopping = null; }
    }
    report() { return { app: 'g20_seat_test', version: VERSION, realCarVerified: false, vehicle: this.sample,
        comfort: this.client.state, message: this.message, events: this.entries.slice() }; }
}

module.exports = { ComfortClient, SeatTest, stateOf, bounded, VERSION, SOCKET };
