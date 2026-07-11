<p align="center">
  <img src="assets/ionity-logo.png" alt="IONITY" width="220"/>
</p>

<h1 align="center">IONITY PicoLink</h1>
<p align="center"><strong>Turn a Raspberry Pi Pico W into a plug-and-play USB Bluetooth Classic + BLE dongle — with an OLED status display, on-device logs, and a cross-platform companion console.</strong></p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#hardware">Hardware</a> ·
  <a href="docs/PROTOCOL.md">Protocol</a> ·
  <a href="docs/FAQ.md">FAQ</a>
</p>

---

## What is this?

**PicoLink** is firmware + desktop software that turns a **Raspberry Pi Pico W / Pico 2 W** fitted with a **Waveshare Pico-OLED-1.3** display into a fully working **USB Bluetooth dongle** for any Windows or Linux PC.

Plug it in and the PC gains **Bluetooth Classic (BR/EDR) and Bluetooth Low Energy (BLE)** — pair keyboards, mice, headphones*, phones, and BLE sensors exactly as if you'd bought a commercial dongle.

| | |
|---|---|
| 🔵 **Native drivers, zero install** | PicoLink enumerates as a *standard USB Bluetooth HCI radio* (USB class `E0/01/01`). Windows 10/11 loads its inbox `BTHUSB` driver and Linux loads `btusb` automatically — the "driver" ships inside every modern OS, triggered the moment you plug in. |
| 🖥️ **OLED status screen** | Live radio state, host OS link, TX/RX packet counters, and a scrolling log — right on the dongle. |
| 🎛️ **Two-button control** | KEY0 toggles the radio ON/OFF (long-press = full USB detach). KEY1 cycles Status / WiFi Radar / BT Monitor / Logs / About screens. |
| 📡 **WiFi RADAR + BT Monitor** | Beside bridging Bluetooth, the dongle passively scans the air: every nearby WiFi network (SSID, dBm, channel + congestion advice) and every Bluetooth Classic/BLE device it hears (name, RSSI, distance estimate) — shown on the OLED and in the app. |
| 📜 **Logs everywhere** | Ring-buffered logs on-device, streamed over a built-in USB serial port, and mirrored + saved to disk by the companion app on Windows and Linux. |
| 📦 **Onboard installer** | The dongle also mounts a tiny **IONITY** USB drive containing `INSTALL.CMD` / `install.sh` — double-click to fetch and set up the companion console straight from this repo. |
| ⚛️ **PicoLink Console** | Electron + React companion app (Windows/Linux). Tabbed: **Dashboard** (with AEDI Insight RF scoring), **BLE** (Web Bluetooth scan/connect/GATT), **Bluetooth Classic**, **WiFi Radar**, **Logs**. Auto-detect, one-click self-update, fully offline after install. |

<sub>*Audio (SCO/HFP) is not bridged in v1 — see [FAQ](docs/FAQ.md).</sub>

---

## Why this architecture is the "best way"

There are three ways to give a PC Bluetooth through a microcontroller. PicoLink uses the only one that needs **no custom drivers at all**:

```
┌────────────────────────── IONITY PicoLink dongle ──────────────────────────┐
│                                                                            │
│   CYW43439 radio ◄── SPI/HCI ──► RP2040 bridge ◄── USB ──► Host PC         │
│   (BT 5.2: BR/EDR + BLE)          │        │                               │
│                                   │        ├─ IF0/1  USB Bluetooth HCI ────┼──► Windows BTHUSB / Linux btusb (native)
│   SH1107 OLED + 2 keys ◄──────────┤        ├─ IF2/3  CDC serial (logs/ctl)─┼──► PicoLink Console (Electron+React)
│                                   │        └─ IF4    MSC "IONITY" drive ───┼──► Onboard installer & docs
└────────────────────────────────────────────────────────────────────────────┘
```

The RP2040 does **no Bluetooth processing** — it is a transparent, low-latency **HCI transport bridge** between the CYW43439 radio and the host. The host's own Bluetooth stack (Windows/BlueZ) does the pairing, profiles, and encryption. That's exactly how commercial USB dongles work, which is why everything "just works".

---

## Quick Start

### 1 · Flash the firmware

1. Hold **BOOTSEL** on the Pico W and plug it into USB — a drive called `RPI-RP2` appears.
2. Copy [`firmware/prebuilt/ionity-picolink-pico_w.uf2`](firmware/prebuilt/) onto it. The Pico reboots as **IONITY PicoLink**.

Or use the helper: `scripts/flash.ps1` (Windows) / `scripts/flash.sh` (Linux).

### 2 · Plug in — Bluetooth is live

- **Windows**: Settings → Bluetooth & devices → toggle appears automatically (inbox driver, no download).
- **Linux**: `bluetoothctl list` shows the new controller (`btusb`/BlueZ, no download).

### 3 · Install the PicoLink Console (optional but recommended)

From the **IONITY drive** that mounts with the dongle, run `INSTALL-WINDOWS.cmd` or `install-linux.sh` — or manually:

```bash
git clone https://github.com/Ionity-Global/picolink.git
cd picolink/desktop
npm install
npm start          # dev
npm run dist       # build a real installer (offline-capable)
```

The Console runs 100 % locally/offline after installation and auto-reconnects to the dongle.

---

## Hardware

| Part | Notes |
|---|---|
| Raspberry Pi **Pico W** or **Pico 2 W** | CYW43439 provides the Bluetooth 5.2 radio. A non-W Pico has **no radio** and cannot be a dongle (the UI/logs still run). |
| **Waveshare Pico-OLED-1.3** | 128×64 SH1107 over SPI + two keys (KEY0=GP15, KEY1=GP17). Pinout in [docs/HARDWARE.md](docs/HARDWARE.md). |

## Repository layout

```
firmware/   RP2040 C firmware (pico-sdk + TinyUSB BTH/CDC/MSC composite)
desktop/    PicoLink Console — Electron + React companion app
scripts/    install / flash helpers (Windows + Linux), udev rules
docs/       hardware, serial protocol, FAQ
assets/     IONITY brand assets (© Ionity Global — rights reserved)
.github/    CI: firmware UF2 builds + desktop packaging
```

## Building the firmware yourself

```bash
export PICO_SDK_PATH=/path/to/pico-sdk     # SDK ≥ 2.0 with submodules
cmake -S firmware -B build -DPICO_BOARD=pico_w -GNinja
ninja -C build
# → build/ionity_picolink.uf2
```

CI builds the UF2 for `pico_w` and `pico2_w` on every push (see Actions artifacts / Releases).

---

## License & branding

Code: [MIT](LICENSE). IONITY names, logos and marks are the property of **Ionity Global (Pty) Ltd** — rights reserved; see [NOTICE](NOTICE).

<p align="center"><sub>© 2026 Ionity Global (Pty) Ltd · www.ionity.today · Built with ❤ by AEDI Engineering</sub></p>
