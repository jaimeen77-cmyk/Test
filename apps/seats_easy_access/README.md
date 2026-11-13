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

Version 0.6.4 adds a **Logs** tab with power, stationary, job and pending-return status. Reproduce the return issue, open Logs, press **Pause for photo**, and photograph the whole screen. Use **Older** for earlier pages. Logging continues while the list is paused. Comfort journal is shown when readable; otherwise the app shows observed status changes. Recent history is retained across app restarts, but status events cannot be observed while the app is stopped or disconnected.

The shared canvas runtime also works in `node kit/tools/emu.js seats_easy_access`. The PC preview uses a socket-free demo client and displays a PREVIEW badge; it never sends commands to a vehicle. Driver/passenger tabs, circular adjustment controls, memories and Make room are interactive in the emulator.

The default existing app ID is now English; choose the Korean listing to keep a Korean UI. Vehicle hardware and position sensors determine supported functions. Real vehicle installation and motion have not been validated here.
