#!/usr/bin/env bash
# IONITY PicoLink — one-shot initiation from Git (Linux)
# Usage: bash install.sh
set -euo pipefail

REPO="https://github.com/Ionity-Global/picolink"
DEST="$HOME/IONITY/picolink"

echo
echo "  IONITY PicoLink — initiation"
echo "  ============================"

command -v git >/dev/null || { echo "[!] git required (sudo apt install git)"; exit 1; }
command -v npm >/dev/null || { echo "[!] nodejs/npm required (sudo apt install nodejs npm)"; exit 1; }

if [ -d "$DEST/.git" ]; then
  echo "[*] Updating existing clone..."
  git -C "$DEST" pull --ff-only
else
  echo "[*] Cloning $REPO"
  mkdir -p "$(dirname "$DEST")"
  git clone "$REPO" "$DEST"
fi

# ---- udev rule: serial console access without root ----
if [ -d /etc/udev/rules.d ] && [ ! -f /etc/udev/rules.d/99-ionity-picolink.rules ]; then
  echo "[*] Installing udev rule (needs sudo)..."
  sudo cp "$DEST/scripts/udev/99-ionity-picolink.rules" /etc/udev/rules.d/ \
    && sudo udevadm control --reload && sudo udevadm trigger || true
fi

# ---- Desktop console (offline after this) ----
cd "$DEST/desktop"
echo "[*] Installing Console dependencies (one-time)..."
npm install --no-audit --no-fund

# ---- .desktop launcher ----
APPS="$HOME/.local/share/applications"
mkdir -p "$APPS"
cat > "$APPS/ionity-picolink.desktop" <<EOF
[Desktop Entry]
Name=IONITY PicoLink Console
Comment=USB Bluetooth/BLE dongle console
Exec=bash -c 'cd "$DEST/desktop" && npm start'
Icon=$DEST/desktop/assets/icon.png
Terminal=false
Type=Application
Categories=Utility;
EOF
echo "[*] App launcher installed."

# ---- Optional: flash if a Pico is in BOOTSEL mode ----
RP2=$(lsblk -o LABEL,MOUNTPOINT -nr 2>/dev/null | awk '$1=="RPI-RP2"{print $2}' | head -1)
if [ -n "${RP2:-}" ]; then
  echo "[*] Pico in BOOTSEL detected at $RP2 — flashing PicoLink..."
  cp "$DEST/firmware/prebuilt/ionity-picolink-pico_w.uf2" "$RP2/"
  echo "[✓] Firmware flashed."
else
  echo "[i] To flash: hold BOOTSEL while plugging in, then run scripts/flash.sh"
fi

echo
echo "[✓] Done. Bluetooth works the moment the dongle is plugged in."
echo "    Launch 'IONITY PicoLink Console' from your app menu, or: cd $DEST/desktop && npm start"
