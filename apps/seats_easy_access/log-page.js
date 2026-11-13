'use strict';
function wrap(cv, lines, width) {
    const rows = [];
    lines.forEach((value) => {
        let text = String(value).slice(0, 1000);
        while (text) {
            let end = text.length;
            while (end > 1 && cv.textWidth(text.slice(0, end), 20, { literal: true }) > width) end--;
            if (end < text.length) {
                const space = text.lastIndexOf(' ', end);
                if (space > end / 2) end = space;
            }
            rows.push(text.slice(0, end)); text = text.slice(end).trim();
        }
    });
    return rows;
}
function draw(cv, model, tr, button) {
    const state = model.state, seats = state && state.seats;
    const value = (v) => v === null || v === undefined ? tr('Unknown') : tr(v ? 'On' : 'Off');
    cv.roundRect(18, 48, 1564, 466, 14, [10, 15, 22, 238]);
    cv.text(tr('Easy Access logs') + ' · v' + model.version, 42, 83, 25, '#ffffff', { literal: true });
    const source = model.source === 'journal' ? tr('Comfort journal') : model.source === 'app' ? tr('App status and M1 events') : tr('Journal unavailable · status events only');
    cv.text(source, 1550, 81, 17, '#aab8c8', { align: 'right', literal: true });
    cv.text(tr('Power') + ': ' + value(state && state.carOn) + '     ' + tr('Stationary') + ': ' + value(state && state.parked) +
        '     ' + tr('Automatic Easy Access') + ': ' + value(state && state.settings.easyExit) +
        '     ' + tr('Job') + ': ' + (seats && seats.job || tr('Idle')), 42, 117, 21, '#dce5ef', { literal: true });
    const pending = (who) => !seats ? tr('Unknown') : seats.pre[who] ? tr('Pending') : tr('None');
    cv.text(tr('Driver return') + ': ' + pending('driver') + '     ' + tr('Passenger return') + ': ' + pending('passenger') +
        '     ' + tr('Last status') + ': ' + (model.at ? new Date(model.at).toTimeString().slice(0, 8) : '--:--:--'),
    42, 150, 21, '#dce5ef', { literal: true });
    cv.fillRect(42, 165, 1510, 1, '#495562');
    const rows = wrap(cv, model.lines, 1490), pages = Math.max(1, Math.ceil(rows.length / 9));
    const page = Math.min(model.page, pages - 1), end = rows.length - page * 9;
    const visible = rows.slice(Math.max(0, end - 9), end);
    if (!visible.length) visible.push(tr('Waiting for Comfort events…'));
    visible.forEach((line, index) => cv.text(line, 46, 196 + index * 28, 20, '#e6edf5', { literal: true }));
    button('BTN_LOG_HOLD', model.paused ? 'Resume' : 'Pause for photo', 44, 460, 335, 44, true, model.paused);
    button('BTN_LOG_OLDER', 'Older', 400, 460, 200, 44, page < pages - 1, false);
    button('BTN_LOG_NEWER', 'Newer', 620, 460, 200, 44, page > 0, false);
    button('BTN_LOG_REFRESH', 'Refresh logs', 840, 460, 250, 44, true, false);
    button('BTN_LOG_SOURCE', 'Log source', 1110, 460, 210, 44, true, false);
    cv.text(String(page + 1) + ' / ' + pages + '  ·  ' + tr(model.paused ? 'Paused' : 'Live'), 1530, 488, 20,
        model.paused ? '#f4bf64' : '#a5dcc0', { align: 'right', literal: true });
    return pages;
}
module.exports = { draw, wrap };
