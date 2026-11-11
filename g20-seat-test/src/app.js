'use strict';
require('./ui').run().catch((e) => {
    console.error('Seat Test startup failed: ' + (e.stack || e));
    // Stay idle for the platform to stop the app instead of repeatedly crashing it.
    setInterval(function () {}, 30000);
});
