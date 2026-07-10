# IONITY PicoLink — FAQ

**Q: Where do I download the driver?**
Nowhere — that's the point. PicoLink enumerates as a *standard USB Bluetooth
radio* (class `E0/01/01`). Windows 10/11 binds its inbox `BTHUSB` driver and
Linux binds `btusb` automatically. The "IONITY" drive that mounts alongside
carries the optional Console installer, not a driver.

**Q: Windows shows the Bluetooth toggle but pairing fails.**
Unplug/replug once (or KEY0 long-press twice) so Windows re-reads the radio.
Check the OLED: radio must say **ON**. Then Settings → Bluetooth → Add device.

**Q: Linux doesn't show a controller.**
`lsusb` should list `2e8a:986a`. Then `dmesg | grep -i bluetooth` — you should
see btusb claim it. `bluetoothctl list` shows the controller. If your distro
lacks BlueZ: `sudo apt install bluez`.

**Q: Does audio (headphones/HFP) work?**
A2DP music **works** (it streams over ACL). Call audio / headset microphone
(SCO/eSCO over USB ISO endpoints) is **not bridged in v1** — the ISO
alt-settings are declared with count 0. HFP hands-free profile will connect
but without voice. Roadmap item.

**Q: My original Pico (non-W) shows the UI but no Bluetooth.**
Correct — only the Pico W / Pico 2 W have the CYW43439 radio. The firmware
logs `BT core init failed` and keeps the screen/logs running.

**Q: The console app can't find the dongle (Linux).**
Install the udev rule: `sudo cp scripts/udev/99-ionity-picolink.rules
/etc/udev/rules.d/ && sudo udevadm control --reload` then replug.

**Q: Is it really offline after install?**
Yes. `npm install` is the only step that touches the network. The Console
loads everything from disk, and the dongle needs no host software at all.

**Q: OLED image is mirrored / flipped.**
Panel batches differ — rebuild with `-DCMAKE_C_FLAGS="-DOLED_ROTATE_180=1"`
(see docs/HARDWARE.md).

**Q: What does "Detach USB" do vs the radio toggle?**
Radio OFF keeps the dongle enumerated but silences Bluetooth (host sees a
dead radio). **Detach** electrically simulates unplugging the whole dongle —
the cleanest "off" a host can observe — and reattaches on the next press.

**Q: Which OSes are supported?**
Windows 10/11, any Linux with BlueZ ≥ 5.x. macOS loads its Bluetooth stack
for external HCI dongles only with SIP tricks — not supported (the Console
itself runs fine).

**Q: How do I update?**
`git pull` + re-run `scripts/install.*`, or re-flash the newest UF2 from
Releases. The dongle's INSTALL scripts always pull the latest from Git.
