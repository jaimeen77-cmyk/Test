# Seats Easy Access

English is the default. Add the source overlay to an existing iDrive app kit:

```sh
python tools/install-overlay.py ../idrive7-apps --apps seats_easy_access
```

Inside that target project:

```sh
python kit/tools/build.py seats_easy_access
python kit/tools/make_kit.py seats_easy_access
# Korean:
python kit/tools/make_kit.py seats_easy_access --language ko
```

MGU Store offers **Seats Easy Access (English)** (`seats_easy_access`) and **시트 Easy Access (한국어)** (`seats_easy_access_ko`). Both provide driver/passenger controls, memories, Easy Access and Make room. Install the original Comfort tool separately from IterioDev/car-apps.

Version 0.6.5 adds an opt-in **Ignition M1** button on the driver page (off by default). Save the desired driver M1 first. After an observed off→on cycle, the app waits 5 seconds, refreshes status and calls driver M1 once, only while stationary with saved M1/position data and after Comfort has been idle for at least 1 second. A busy service can defer the call up to 30 seconds from power-on. Driving, power-off, connection loss, manual controls, STOP or disabling the option cancels a waiting call; failed commands are not retried. The target is the fixed driver M1, not the position before exit. Passenger memories are unaffected.

The app autostarts and monitors Comfort with the screen hidden. A stopped app process cannot observe events. Observed power-off is retained across process restarts; launching on an already-on car without an observed off, or enabling the option, never initiates a recall. Comfort's original automation remains in place. M1 does not clear Comfort's pending-return flag. Vehicle execution still needs validation.

The **Logs** tab shows power, stationary, job and pending-return status. With Ignition M1 enabled, app status/M1 events are selected by default; **Log source** switches to Comfort journal when readable. A sent command does not confirm arrival. Reproduce the return issue, open Logs, press **Pause for photo**, and photograph the whole screen. Use **Older** for earlier pages. Logging continues while the list is paused. Recent history is retained across app restarts, but status events cannot be observed while the app is stopped or disconnected.

The shared canvas runtime also works in `node kit/tools/emu.js seats_easy_access`. The PC preview uses a socket-free demo client and displays a PREVIEW badge; it never sends commands to a vehicle. Driver/passenger tabs, circular adjustment controls, memories and Make room are interactive in the emulator.

The default existing app ID is now English; choose the Korean listing to keep a Korean UI. Vehicle hardware and position sensors determine supported functions. Real vehicle installation and motion have not been validated here.
