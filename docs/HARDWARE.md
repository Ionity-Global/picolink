# IONITY PicoLink — Hardware

## Bill of materials

| Part | Qty | Note |
|---|---|---|
| Raspberry Pi **Pico W** (or Pico 2 W) | 1 | CYW43439 = Bluetooth 5.2 radio (BR/EDR + BLE). A plain Pico has **no radio**. |
| Waveshare **Pico-OLED-1.3** | 1 | 128×64 SH1107, SPI, 2 keys. Plugs straight onto the Pico headers. |

## Pin map (fixed by the Waveshare hat)

| Signal | GPIO | Note |
|---|---|---|
| OLED SCK  | GP10 | SPI1 |
| OLED MOSI | GP11 | SPI1 |
| OLED CS   | GP9  | |
| OLED DC   | GP8  | |
| OLED RST  | GP12 | |
| KEY0      | GP15 | active-low, pull-up |
| KEY1      | GP17 | active-low, pull-up |

The CYW43439 radio is wired internally on the Pico W (SPI via PIO); no external pins used.

## Controls

| Input | Action |
|---|---|
| KEY0 short | Radio **ON/OFF** (soft gate + HCI reset) |
| KEY0 long (≥0.7 s) | **USB detach / reattach** — host sees a clean unplug |
| KEY1 short | Next screen (Status → Logs → About) |
| KEY1 long | OLED display on/off |

## Screens

1. **Status** — radio state, USB + Console link, TX/RX/drop counters
2. **Logs** — last 6 on-device log lines (full history via the Console)
3. **About** — version, board, serial, ionity.today

## Display orientation

If your unit renders mirrored or upside-down (panel batches differ), rebuild with:

```bash
cmake -S firmware -B build -DPICO_BOARD=pico_w -DCMAKE_C_FLAGS="-DOLED_ROTATE_180=1"
```

## USB identity

| Field | Value |
|---|---|
| VID | `0x2E8A` (Raspberry Pi) |
| PID | `0x986A` (IONITY PicoLink — Policy 986 AED) |
| Interface 0 | Bluetooth HCI — class `E0/01/01` → Windows `BTHUSB`, Linux `btusb` |
| Interfaces 1–2 | CDC ACM — log/control console |
| Interface 3 | Mass storage — read-only "IONITY" installer disk |

Power draw is well under the 250 mA declared in the config descriptor.
