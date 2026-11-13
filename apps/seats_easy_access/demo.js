'use strict';
const EventEmitter = require('events');
const { stateOf } = require('./core');

// No network/socket imports: preview controls never contact a vehicle service.
class DemoClient extends EventEmitter {
    constructor() {
        super(); this.at = Date.now();
        const axes = ['SLV', 'SHV', 'LNV', 'SNV', 'KHV'];
        this.state = stateOf({ state: { parked: true, carOn: true, settings: { easyExit: false }, seats: {
            axes: { driver: axes, passenger: axes },
            pos: { driver: { SLV: 100, SHV: 100, LNV: 100, SNV: 100, KHV: 100 },
                passenger: { SLV: 100, SHV: 100, LNV: 100, SNV: 100, KHV: 100 } },
            moving: null, job: null, exit: { driver: true, passenger: true },
            pre: { driver: false, passenger: false }, roomOut: false,
        } } });
    }
    async refresh() { this.at = Date.now(); this.emit('state', this.state); return this.state; }
    async send(command) {
        if (command.op === 'set') this.state.settings.easyExit = command.settings.easyExit;
        if (command.op === 'gentleman') this.state.seats.roomOut = !this.state.seats.roomOut;
        if (command.op === 'exit' && command.save) this.state.seats.exit[command.seat] = true;
        if (command.op === 'jog') this.state.seats.pos[command.seat][command.axis] += command.dir;
        this.emit('state', this.state);
    }
    close() {}
}
module.exports = { DemoClient };
