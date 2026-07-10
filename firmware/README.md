# PicoLink firmware

RP2040/RP2350 firmware: transparent CYW43439-HCI ↔ USB-BTH bridge +
SH1107 OLED UI + CDC log console + read-only FAT12 installer disk.

Prebuilt: [`prebuilt/ionity-picolink-pico_w.uf2`](prebuilt/) — hold BOOTSEL,
plug in, copy the file onto `RPI-RP2`.

Build:

```bash
export PICO_SDK_PATH=~/pico-sdk    # SDK ≥ 2.0 (+ tinyusb/cyw43-driver/btstack/lwip submodules)
cmake -S . -B build -GNinja -DPICO_BOARD=pico_w   # or pico2_w
ninja -C build                      # → build/ionity_picolink.uf2
```

Layout: `src/hci_bridge.c` (the dongle core), `src/usb_descriptors.c`
(BTH+CDC+MSC composite), `src/oled.c`/`ui.c` (display), `src/control.c`
(serial protocol), `src/msc_disk.c` (onboard installer drive),
`src/logbuf.c` (ring log). Notes in `../docs/`.
