#!/usr/bin/env bash
# IONITY PicoLink — flash helper (Linux)
# Hold BOOTSEL while plugging the Pico in, then run this.
# Auto-detects the board: RPI-RP2 = Pico W, RP2350 = Pico 2 W.
set -euo pipefail
DIR="$(dirname "$0")/../firmware/prebuilt"

echo "[*] Waiting for a Pico boot drive (hold BOOTSEL while plugging in)..."
for _ in $(seq 120); do
  LINE=$(lsblk -o LABEL,MOUNTPOINT,PATH -nr 2>/dev/null | awk '$1=="RPI-RP2" || $1=="RP2350" {print; exit}')
  if [ -n "${LINE:-}" ]; then
    LABEL=$(echo "$LINE" | awk '{print $1}')
    MNT=$(echo "$LINE" | awk '{print $2}')
    DEV=$(echo "$LINE" | awk '{print $3}')
    if [ -z "$MNT" ] || [ "$MNT" = "$DEV" ]; then
      udisksctl mount -b "$DEV" >/dev/null 2>&1 || true
      MNT=$(lsblk -o LABEL,MOUNTPOINT -nr | awk -v l="$LABEL" '$1==l {print $2; exit}')
    fi
    if [ -n "$MNT" ]; then
      UF2="ionity-picolink-pico_w.uf2"
      [ "$LABEL" = "RP2350" ] && UF2="ionity-picolink-pico2_w.uf2"
      echo "[*] $LABEL board at $MNT — flashing $UF2"
      cp "$DIR/$UF2" "$MNT/"
      sync
      echo "[✓] Flashed — dongle rebooting as IONITY PicoLink"
      exit 0
    fi
  fi
  sleep 1
done
echo "No Pico boot drive appeared (RPI-RP2 / RP2350)." >&2
exit 1
