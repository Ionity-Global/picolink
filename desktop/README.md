# PicoLink Console

Electron + React companion for the IONITY PicoLink dongle. Talks to the
dongle's CDC port via **Web Serial** — no native modules, fully offline
after install.

```bash
npm install     # one-time (only step that needs internet)
npm start       # build UI + launch
npm run dist    # package installers (NSIS/portable, AppImage/deb)
```

Features: auto-detect + auto-reconnect (VID 2E8A / PID 986A), live log
stream mirrored to `userData/logs/picolink-YYYY-MM-DD.log`, radio ON/OFF
switch, USB detach, stats, tray control, log filter/export.
