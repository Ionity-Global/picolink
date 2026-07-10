/**
 * IONITY PicoLink — onboard "IONITY" installer disk (read-only FAT12 ramdisk)
 *
 * Mounts on every OS with README + one-click companion installers that pull
 * the desktop console straight from the Git repo.
 */
#include <string.h>
#include "tusb.h"
#include "picolink.h"

#define SECTOR_SZ   512
#define SECTORS     64                 /* 32 KB volume                     */
#define ROOT_ENTRIES 16
#define DATA_START   3                 /* 0 boot, 1 FAT, 2 root            */

static uint8_t disk[SECTORS * SECTOR_SZ];
static bool disk_built;

/* ------------------------- file contents ------------------------------ */

static const char readme_txt[] =
"=========================================================\r\n"
"  IONITY PicoLink - USB Bluetooth / BLE dongle\r\n"
"  (c) 2026 Ionity Global (Pty) Ltd - www.ionity.today\r\n"
"=========================================================\r\n"
"\r\n"
"Your PC already has Bluetooth now!\r\n"
"\r\n"
"This dongle enumerates as a standard USB Bluetooth radio.\r\n"
"Windows 10/11 and Linux load their built-in drivers\r\n"
"automatically - no download needed.\r\n"
"\r\n"
"  Windows : Settings > Bluetooth & devices\r\n"
"  Linux   : bluetoothctl  (BlueZ / btusb)\r\n"
"\r\n"
"OPTIONAL - PicoLink Console (logs, on/off, stats):\r\n"
"  Windows : double-click INSTALL.CMD on this drive\r\n"
"  Linux   : bash install.sh\r\n"
"Both fetch the app from the official repo:\r\n"
"  https://github.com/Ionity-Global/picolink\r\n"
"\r\n"
"Buttons on the dongle:\r\n"
"  KEY0 short = radio on/off      KEY0 long = USB detach\r\n"
"  KEY1 short = next screen       KEY1 long = display off\r\n"
"\r\n"
"POLICY 986 AED\r\n";

static const char install_cmd[] =
"@echo off\r\n"
"title IONITY PicoLink Console installer\r\n"
"echo(\r\n"
"echo  IONITY PicoLink - Console installer\r\n"
"echo  ===================================\r\n"
"echo(\r\n"
"where git >nul 2>nul || (echo [!] Git is required: https://git-scm.com & start https://git-scm.com/download/win & pause & exit /b 1)\r\n"
"where npm >nul 2>nul || (echo [!] Node.js is required: https://nodejs.org & start https://nodejs.org & pause & exit /b 1)\r\n"
"set DEST=%USERPROFILE%\\IONITY\\picolink\r\n"
"if exist \"%DEST%\\.git\" (\r\n"
"  echo [*] Updating existing install...\r\n"
"  git -C \"%DEST%\" pull --ff-only\r\n"
") else (\r\n"
"  echo [*] Cloning PicoLink...\r\n"
"  git clone https://github.com/Ionity-Global/picolink \"%DEST%\"\r\n"
")\r\n"
"cd /d \"%DEST%\\desktop\"\r\n"
"echo [*] Installing dependencies (one-time, then fully offline)...\r\n"
"call npm install --no-audit --no-fund\r\n"
"echo [*] Launching PicoLink Console...\r\n"
"call npm start\r\n"
"pause\r\n";

static const char install_sh[] =
"#!/usr/bin/env bash\r\n"
"# IONITY PicoLink Console installer (Linux)\r\n"
"set -e\r\n"
"command -v git >/dev/null || { echo '[!] git required'; exit 1; }\r\n"
"command -v npm >/dev/null || { echo '[!] nodejs/npm required'; exit 1; }\r\n"
"DEST=\"$HOME/IONITY/picolink\"\r\n"
"if [ -d \"$DEST/.git\" ]; then git -C \"$DEST\" pull --ff-only; else\r\n"
"  mkdir -p \"$(dirname \"$DEST\")\"; git clone https://github.com/Ionity-Global/picolink \"$DEST\"; fi\r\n"
"# udev rule so the log console works without root\r\n"
"if [ -d /etc/udev/rules.d ] && [ ! -f /etc/udev/rules.d/99-ionity-picolink.rules ]; then\r\n"
"  sudo cp \"$DEST/scripts/udev/99-ionity-picolink.rules\" /etc/udev/rules.d/ 2>/dev/null && sudo udevadm control --reload || true\r\n"
"fi\r\n"
"cd \"$DEST/desktop\" && npm install --no-audit --no-fund && npm start\r\n";

static const char ionity_url[] =
"[InternetShortcut]\r\n"
"URL=https://github.com/Ionity-Global/picolink\r\n";

/* ------------------------- FAT12 builder ------------------------------ */

static void set_fat12(uint8_t *fat, uint16_t cluster, uint16_t value) {
    uint32_t i = cluster + (cluster / 2);          /* *1.5 */
    if (cluster & 1) {
        fat[i]     = (uint8_t)((fat[i] & 0x0F) | ((value << 4) & 0xF0));
        fat[i + 1] = (uint8_t)(value >> 4);
    } else {
        fat[i]     = (uint8_t)(value & 0xFF);
        fat[i + 1] = (uint8_t)((fat[i + 1] & 0xF0) | ((value >> 8) & 0x0F));
    }
}

static uint16_t next_cluster = 2;
static int      next_root    = 1;      /* entry 0 = volume label           */

static void add_file(const char name[11], const char *data, uint32_t size) {
    uint8_t *fat  = &disk[1 * SECTOR_SZ];
    uint8_t *root = &disk[2 * SECTOR_SZ];
    uint16_t first = next_cluster;
    uint32_t clusters = (size + SECTOR_SZ - 1) / SECTOR_SZ;
    if (clusters == 0) clusters = 1;

    for (uint32_t i = 0; i < clusters; i++) {
        uint16_t c = next_cluster++;
        uint32_t sector = DATA_START + (c - 2);
        uint32_t chunk = (i == clusters - 1) ? (size - i * SECTOR_SZ) : SECTOR_SZ;
        memcpy(&disk[sector * SECTOR_SZ], data + i * SECTOR_SZ, chunk);
        set_fat12(fat, c, (i == clusters - 1) ? 0xFFF : (uint16_t)(c + 1));
    }

    uint8_t *e = &root[next_root++ * 32];
    memcpy(e, name, 11);
    e[11] = 0x21;                       /* read-only + archive             */
    e[26] = (uint8_t)(first & 0xFF);    /* first cluster lo                */
    e[27] = (uint8_t)(first >> 8);
    e[28] = (uint8_t)(size & 0xFF);
    e[29] = (uint8_t)((size >> 8) & 0xFF);
    e[30] = (uint8_t)((size >> 16) & 0xFF);
    e[31] = (uint8_t)((size >> 24) & 0xFF);
}

static void build_disk(void) {
    if (disk_built) return;
    disk_built = true;
    memset(disk, 0, sizeof(disk));

    uint8_t *bs = disk;
    /* jump + OEM */
    bs[0] = 0xEB; bs[1] = 0x3C; bs[2] = 0x90;
    memcpy(&bs[3], "IONITY  ", 8);
    bs[11] = SECTOR_SZ & 0xFF; bs[12] = SECTOR_SZ >> 8;   /* bytes/sector  */
    bs[13] = 1;                                           /* sec/cluster   */
    bs[14] = 1; bs[15] = 0;                               /* reserved      */
    bs[16] = 1;                                           /* FATs          */
    bs[17] = ROOT_ENTRIES; bs[18] = 0;                    /* root entries  */
    bs[19] = SECTORS & 0xFF; bs[20] = SECTORS >> 8;       /* total sectors */
    bs[21] = 0xF8;                                        /* media         */
    bs[22] = 1; bs[23] = 0;                               /* FAT sectors   */
    bs[24] = 1; bs[26] = 1;                               /* CHS dummy     */
    bs[38] = 0x29;                                        /* ext boot sig  */
    bs[39] = 0x86; bs[40] = 0x09; bs[41] = 0x20; bs[42] = 0x26;  /* vol id */
    memcpy(&bs[43], "IONITY     ", 11);
    memcpy(&bs[54], "FAT12   ", 8);
    bs[510] = 0x55; bs[511] = 0xAA;

    /* FAT header entries */
    uint8_t *fat = &disk[1 * SECTOR_SZ];
    fat[0] = 0xF8; fat[1] = 0xFF; fat[2] = 0xFF;

    /* volume label as root entry 0 */
    uint8_t *root = &disk[2 * SECTOR_SZ];
    memcpy(root, "IONITY     ", 11);
    root[11] = 0x08;

    add_file("README  TXT", readme_txt,  sizeof(readme_txt) - 1);
    add_file("INSTALL CMD", install_cmd, sizeof(install_cmd) - 1);
    add_file("INSTALL SH ", install_sh,  sizeof(install_sh) - 1);
    add_file("IONITY  URL", ionity_url,  sizeof(ionity_url) - 1);
}

/* ------------------------- MSC callbacks ------------------------------ */

void tud_msc_inquiry_cb(uint8_t lun, uint8_t vendor_id[8], uint8_t product_id[16], uint8_t product_rev[4]) {
    (void)lun;
    memcpy(vendor_id,  "IONITY  ", 8);
    memcpy(product_id, "PicoLink Disk   ", 16);
    memcpy(product_rev, "1.0 ", 4);
}

bool tud_msc_test_unit_ready_cb(uint8_t lun) {
    (void)lun;
    build_disk();
    return true;
}

void tud_msc_capacity_cb(uint8_t lun, uint32_t *block_count, uint16_t *block_size) {
    (void)lun;
    *block_count = SECTORS;
    *block_size  = SECTOR_SZ;
}

bool tud_msc_start_stop_cb(uint8_t lun, uint8_t power_condition, bool start, bool load_eject) {
    (void)lun; (void)power_condition; (void)start; (void)load_eject;
    return true;
}

int32_t tud_msc_read10_cb(uint8_t lun, uint32_t lba, uint32_t offset, void *buffer, uint32_t bufsize) {
    (void)lun;
    build_disk();
    if (lba >= SECTORS) return -1;
    uint32_t addr = lba * SECTOR_SZ + offset;
    if (addr + bufsize > sizeof(disk)) bufsize = sizeof(disk) - addr;
    memcpy(buffer, &disk[addr], bufsize);
    return (int32_t)bufsize;
}

bool tud_msc_is_writable_cb(uint8_t lun) {
    (void)lun;
    return false;
}

int32_t tud_msc_write10_cb(uint8_t lun, uint32_t lba, uint32_t offset, uint8_t *buffer, uint32_t bufsize) {
    (void)lun; (void)lba; (void)offset; (void)buffer; (void)bufsize;
    return -1;   /* read-only */
}

int32_t tud_msc_scsi_cb(uint8_t lun, uint8_t const scsi_cmd[16], void *buffer, uint16_t bufsize) {
    (void)lun; (void)buffer; (void)bufsize;
    switch (scsi_cmd[0]) {
        default:
            tud_msc_set_sense(lun, SCSI_SENSE_ILLEGAL_REQUEST, 0x20, 0x00);
            return -1;
    }
}
