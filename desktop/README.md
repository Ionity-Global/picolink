# PicoLink Console

Electron + React companion for the IONITY PicoLink dongle. Talks to the
dongle's CDC port via **Web Serial** and to nearby BLE peripherals via
**Web Bluetooth** — both routed by the OS through the PicoLink radio. No
native modules; fully offline after one install.

```bash
npm install     # one-time (only step that needs internet)
npm start       # build UI + launch
npm run dist    # package installers (NSIS/portable, AppImage/deb)
```

## Tabs

- **Dashboard** — radio state, TX/RX + drop counters, core temp, device
  identity, and **AEDI Insight**: an on-device heuristic engine that reads
  live WiFi + BLE + Classic + thermal telemetry and reports the RF
  environment with a 0-100 score (no cloud, fully offline).
- **BLE** — scan for BLE peripherals, pick one, and connect over GATT:
  reads battery, manufacturer/model, and lists services. Also shows the
  ambient BLE advertisers the dongle hears passively.
- **Bluetooth** — Classic (BR/EDR) devices the radio hears during a Windows
  inquiry, plus a "Pair in Windows" button (pairing is an OS action that
  uses this dongle as the adapter).
- **WiFi Radar** — every network in range with signal bars, dBm, channel.
- **Logs** — live device log stream, filter, follow, export; mirrored to
  `userData/logs/picolink-YYYY-MM-DD.log`.

## Staying current

Header → **check updates**: when the machine is online, the app runs
`git pull` + `npm install` and offers a one-click relaunch. The dongle
itself updates hands-free — the Console can reboot it into the bootloader
with the `BOOTLOADER` serial command (firmware v1.1.3+).

Auto-detects the dongle (VID 2E8A / PID 986A) and auto-reconnects on hotplug.
