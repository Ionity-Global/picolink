# IONITY PicoLink — Console serial protocol

The second USB interface is a plain CDC ACM serial port (any baud; 115200
conventional). Line-based, `\n`-terminated, ASCII. This is what the PicoLink
Console speaks; you can also drive it with PuTTY / `screen /dev/ttyACM0`.

## Commands (host → dongle)

| Command | Reply | Effect |
|---|---|---|
| `HELLO` | `ID {json}` | identify device |
| `STATUS` | `STAT {json}` | snapshot now |
| `BT ON` / `BT OFF` | `OK BT ON/OFF` | soft radio gate (+ HCI reset on off) |
| `DETACH` | `OK DETACH` | full USB detach; press KEY0 long or send again after reattach |
| `BOOTLOADER` | `OK BOOTLOADER` | reboot into the UF2 bootloader (`RPI-RP2`/`RP2350` drive) — hands-free firmware updates, no BOOTSEL button |
| `PING` | `PONG` | liveness |

## Unsolicited (dongle → host)

| Line | Meaning |
|---|---|
| `LOG [ 12.345] message` | every on-device log line (also shown on OLED) |
| `STAT {...}` | pushed every 2 s while a console is attached |

## `STAT` payload

```json
{
  "radio": "on|off|detached",
  "usb": true,
  "tx_pkts": 123, "rx_pkts": 456,
  "tx_bytes": 7890, "rx_bytes": 12345,
  "drops": 0,
  "uptime_ms": 987654
}
```

`tx_*` = controller→host (events/ACL in), `rx_*` = host→controller
(commands/ACL out), `drops` = packets discarded while the radio is gated
off, over-size, or on a stalled USB lane.

## `ID` payload

```json
{
  "product": "IONITY PicoLink",
  "version": "1.0.0",
  "board": "pico_w",
  "serial": "E66038B7134F8C29",
  "url": "https://github.com/Ionity-Global/picolink"
}
```

## The Bluetooth interface

Interface 0 is **not** part of this protocol — it is a standard USB
Bluetooth HCI transport (USB class E0/01/01, Bluetooth Core spec Vol 4
Part B). The host OS talks raw HCI to the CYW43439 through it; PicoLink
just bridges packets and counts them.
