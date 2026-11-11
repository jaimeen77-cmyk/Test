'use strict';
const { bounded } = require('./core');
const SPEED = 'de.bmw.infotainment.vehicle.Vehicle2';
const GEAR = 'de.bmw.infrastructure.VehicleInformation';

function stage(value) {
    return { P: 'P', R: 'R', N: 'N', D: 'D', 1: 'P', 2: 'R', 3: 'N', 4: 'D' }[value] || null;
}
function selection(value) {
    return value === 'P' || value === 3 ? 'P' : value === 'R' || value === 2 ? 'R' :
        value === 'N' || value === 1 ? 'N' : null; // NP / N_OR_P is deliberately insufficient
}
class VehicleReader {
    constructor(signals) { this.signals = signals; this.proxies = null; this.pending = null; }
    async init() {
        if (this.proxies) return;
        if (!this.pending) this.pending = Promise.all([this.signals.proxy(SPEED, '1'), this.signals.proxy(GEAR, '1')])
            .then((p) => { this.proxies = p; }, (e) => { this.pending = null; throw e; });
        await bounded(this.pending, 3000, 'Vehicle interfaces are unavailable');
    }
    read(proxy, field) {
        return bounded(new Promise((resolve, reject) => setImmediate(() => {
            try {
                if (proxy.isAvailable && !proxy.isAvailable()) throw new Error('Vehicle provider unavailable');
                Promise.resolve(proxy.getValue(field, 900)).then(resolve, reject);
            } catch (e) { reject(e); }
        })), 1100, 'Vehicle read timeout');
    }
    async readFresh() {
        await this.init();
        const started = Date.now();
        const result = await Promise.all([
            this.read(this.proxies[0], 'statusCarSpeed2'),
            this.read(this.proxies[1], 'statusGearboxDrive').then((v) => stage(v && v.statusActualStageDrive), () => null)
                .then((s) => s || this.read(this.proxies[1], 'DataPowerTrain2').then((v) => selection(v && v.statusGearSelectionDrive))),
        ]);
        const raw = result[0] && result[0].speedVehicleCentreOfGravity;
        if (typeof raw !== 'number' || !isFinite(raw) || raw < 0 || raw >= 65535) throw new Error('Vehicle speed is unknown');
        if (!result[1]) throw new Error('P is unknown (N_OR_P is not P)');
        const at = Date.now(), elapsed = at - started;
        if (elapsed > 1500 || elapsed < 0) throw new Error('Vehicle response too slow for a movement test');
        return { speedKmh: raw / 64, stage: result[1], at: at, elapsedMs: elapsed, source: 'SOME/IP getter responses' };
    }
}
module.exports = { VehicleReader, stage, selection };
