'use strict';
// Read-only observer. The only Comfort command it can transmit is {op:'get'}.
const fs = require('fs');
const net = require('net');
const cp = require('child_process');
const crypto = require('crypto');

function snapshot(packet) {
    const s = packet && packet.state, seats = s && s.seats;
    if (!s || !seats) return null;
    const out = { parked: s.parked === true, carOn: s.carOn === true,
        easyExit: s.settings && typeof s.settings.easyExit === 'boolean' ? s.settings.easyExit : null,
        job: typeof seats.job === 'string' ? seats.job.slice(0, 80) : null,
        jobSeat: seats.jobSeat === 'driver' || seats.jobSeat === 'passenger' ? seats.jobSeat : null,
        moving: seats.moving ? { seat: seats.moving.seat, axis: seats.moving.axis } : null,
        seats: {} };
    ['driver', 'passenger'].forEach((who) => {
        const pos = {};
        ['SLV', 'SHV', 'LNV', 'SNV', 'KHV'].forEach((a) => {
            const value = seats.pos && seats.pos[who] && seats.pos[who][a];
            if (typeof value === 'number' && isFinite(value)) pos[a] = value;
        });
        out.seats[who] = { exitSaved: !!(seats.exit && seats.exit[who]),
            returnPending: !!(seats.pre && seats.pre[who]), pos };
    });
    return out;
}
function emitDefault(record) { process.stdout.write(JSON.stringify(record) + '\n'); }

function observe(options) {
    const o = options || {}, emit = o.emit || emitDefault;
    const duration = o.durationMs || 180000, interval = o.intervalMs || 1000;
    let socket, retry, poll, end, last = '', lastEmit = 0, ended = false;
    const record = (type, data) => emit(Object.assign({ time: new Date().toISOString(), type }, data));
    record('observer_start', { durationMs: duration, readOnly: true, command: 'get' });
    return new Promise((resolve) => {
        function connect() {
            if (ended) return;
            let buffer = '';
            socket = net.createConnection(o.socketPath || '/run/iteriodev-comfort/ctl.sock');
            socket.setEncoding('utf8');
            socket.on('connect', () => {
                record('connected');
                const get = () => { if (!socket.destroyed) socket.write('{"op":"get"}\n'); };
                get(); poll = setInterval(get, interval);
            });
            socket.on('data', (chunk) => {
                buffer += chunk;
                if (buffer.length > 1048576) { record('oversized_response'); socket.destroy(); return; }
                let newline;
                while ((newline = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
                    let value;
                    try { value = snapshot(JSON.parse(line)); } catch (_) { continue; }
                    if (!value) continue;
                    const encoded = JSON.stringify(value), now = Date.now();
                    if (encoded !== last || now - lastEmit >= 5000) {
                        record('state', value); last = encoded; lastEmit = now;
                    }
                }
            });
            socket.on('error', (e) => record('socket_error', { message: e.message }));
            socket.on('close', () => {
                clearInterval(poll);
                record('disconnected');
                if (!ended) retry = setTimeout(connect, interval);
            });
        }
        function finish() {
            ended = true; clearTimeout(retry); clearInterval(poll); clearTimeout(end);
            if (socket) socket.destroy();
            record('observer_end'); resolve();
        }
        connect(); end = setTimeout(finish, duration);
    });
}

function journal(phase) {
    const result = cp.spawnSync('journalctl', ['-u', 'iteriodev-comfort.service', '--since', '15 minutes ago',
        '--no-pager', '-n', '600', '-o', 'short-iso'], { encoding: 'utf8', timeout: 10000, maxBuffer: 1048576 });
    emitDefault({ time: new Date().toISOString(), type: 'comfort_journal', phase, exit: result.status,
        error: result.error && result.error.message, text: result.stdout || result.stderr || '' });
}
function metadata() {
    let digest = null, settings = null, version = null;
    try { version = JSON.parse(fs.readFileSync('/var/opt/iteriodev-comfort/current/component.json', 'utf8')).version; } catch (_) {}
    try { digest = crypto.createHash('sha256').update(fs.readFileSync('/var/opt/iteriodev-comfort/current/comfort.js')).digest('hex'); } catch (_) {}
    try {
        const d = JSON.parse(fs.readFileSync('/var/opt/iteriodev-comfort/data.json', 'utf8'));
        settings = { easyExit: d.settings && d.settings.easyExit,
            driverReturnSaved: !!(d.pre && d.pre.driver), passengerReturnSaved: !!(d.pre && d.pre.passenger) };
    } catch (_) {}
    emitDefault({ time: new Date().toISOString(), type: 'metadata', comfortVersion: version, comfortSha256: digest, settings });
}
function appLogs(phase) {
    const home = '/var/opt/public/oap';
    let folders = [];
    try { folders = fs.readdirSync(home).filter((name) => /^oap_\d+$/.test(name)); } catch (_) {}
    folders.forEach((folder) => {
        let pkg;
        try { pkg = JSON.parse(fs.readFileSync(home + '/' + folder + '/source/package.json', 'utf8')); } catch (_) { return; }
        if (!/^seats_easy_access(?:_ko)?\d*$/.test(pkg.name || '')) return;
        ['.log.1', '.log'].forEach((suffix) => {
            let fd;
            try {
                fd = fs.openSync(home + '/' + folder + '/data/' + pkg.name + suffix, 'r');
                const size = fs.fstatSync(fd).size, n = Math.min(size, 65536), bytes = Buffer.alloc(n);
                fs.readSync(fd, bytes, 0, n, size - n);
                emitDefault({ time: new Date().toISOString(), type: 'seats_app_log', phase,
                    app: pkg.name, version: pkg.version, suffix, text: bytes.toString('utf8') });
            } catch (_) {} finally { if (fd !== undefined) fs.closeSync(fd); }
        });
    });
}
async function main(args) {
    const seconds = args[0] === '--seconds' ? Number(args[1]) : 180;
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 900) throw new Error('Duration must be 10..900 seconds');
    metadata(); journal('before'); appLogs('before');
    await observe({ durationMs: seconds * 1000 });
    journal('after'); appLogs('after'); metadata();
}
if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { observe, snapshot };
