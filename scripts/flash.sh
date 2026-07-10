#!/usr/bin/env bash
# IONITY PicoLink — flash helper (Linux)
# Hold BOOTSEL while plugging the Pico W in, then run this.
set -euo pipefail
UF2="$(dirname "$0")/../firmware/prebuilt/ionity-picolink-pico_w.uf2"
[ -f "$UF2" ] || { echo "UF2 not found: $UF2"; exit 1; }

echo "[*] Waiting for RPI-RP2 drive (hold BOOTSEL while plugging in)..."
for _ in $(seq 60); do
  MNT=$(lsblk -o LABEL,MOUNTPOINT -nr 2>/dev/null | awk '$1=="RPI-RP2"{print $2}' | head -1)
  if [ -n "${MNT:-}" ]; then
    cp "$UF2" "$MNT/"
    sync
    echo "[✓] Flashed — dongle rebooting as IONITY PicoLink"
    exit 0
  fi
  # not auto-mounted? try udisks
  DEV=$(lsblk -o LABEL,PATH -nr 2>/dev/null | awk '$1=="RPI-RP2"{print $2}' | head -1)
  if [ -n "${DEV:-}" ]; then udisksctl mount -b "$DEV" >/dev/null 2>&1 || true; fi
  sleep 1
done
echo "RPI-RP2 drive never appeared." >&2
exit 1
