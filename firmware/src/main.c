/**
 * ═══════════════════════════════════════════════════════════════════
 *  IONITY PicoLink — USB Bluetooth/BLE dongle firmware
 *  © 2026 Ionity Global (Pty) Ltd · www.ionity.today · POLICY 986 AED
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Raspberry Pi Pico W (+ Waveshare Pico-OLED-1.3) →
 *  standard USB Bluetooth HCI dongle + CDC log console + installer disk.
 */
#include <stdio.h>
#include <string.h>
#include "pico/stdlib.h"
#include "pico/unique_id.h"
#include "pico/cyw43_arch.h"
#include "tusb.h"

#include "picolink.h"
#include "hci_bridge.h"
#include "oled.h"
#include "ui.h"
#include "buttons.h"
#include "logbuf.h"
#include "control.h"

picolink_state_t g_pl;

static volatile bool req_detach_toggle;
static volatile int  req_radio = -1;    /* -1 none, 0 off, 1 on */

void picolink_request_radio(bool on)      { req_radio = on ? 1 : 0; }
void picolink_request_detach_toggle(void) { req_detach_toggle = true; }

/* ---- TinyUSB device callbacks ---- */
void tud_mount_cb(void)   { g_pl.usb_mounted = true;  logf_pl("USB host connected"); }
void tud_umount_cb(void)  { g_pl.usb_mounted = false; logf_pl("USB host disconnected"); }
void tud_suspend_cb(bool remote_wakeup_en) { (void)remote_wakeup_en; logf_pl("USB suspended"); }
void tud_resume_cb(void)  { logf_pl("USB resumed"); }

static void apply_requests(void) {
    if (req_radio >= 0) {
        bool on = req_radio == 1;
        req_radio = -1;
        if (g_pl.radio != RADIO_DETACHED) {
            hci_bridge_set_enabled(on);
        }
    }
    if (req_detach_toggle) {
        req_detach_toggle = false;
        if (g_pl.radio == RADIO_DETACHED) {
            tud_connect();
            g_pl.radio = hci_bridge_enabled() ? RADIO_ON : RADIO_OFF;
            logf_pl("USB reattached");
        } else {
            tud_disconnect();
            g_pl.radio = RADIO_DETACHED;
            logf_pl("USB detached (soft unplug)");
        }
    }
}

static void handle_buttons(void) {
    switch (buttons_poll()) {
        case BTN_KEY0_SHORT:
            if (g_pl.radio == RADIO_DETACHED) break;
            picolink_request_radio(!hci_bridge_enabled());
            break;
        case BTN_KEY0_LONG:  picolink_request_detach_toggle(); break;
        case BTN_KEY1_SHORT: ui_next_screen(); break;
        case BTN_KEY1_LONG:  ui_toggle_display(); break;
        default: break;
    }
}

int main(void) {
    memset(&g_pl, 0, sizeof(g_pl));
    g_pl.radio = RADIO_ON;
#ifdef PICOLINK_BOARD
    strncpy(g_pl.board, PICOLINK_BOARD, sizeof(g_pl.board) - 1);
#else
    strncpy(g_pl.board, "pico_w", sizeof(g_pl.board) - 1);
#endif
    pico_get_unique_board_id_string(g_pl.serial, sizeof(g_pl.serial));

    log_init();
    logf_pl("%s v%s", PICOLINK_PRODUCT, PICOLINK_VERSION);

    buttons_init();
    ui_init();                       /* splash */

    /* Radio core */
    if (cyw43_arch_init() != 0) {
        logf_pl("FATAL: cyw43 init failed");
    }

    /* USB device (BTH + CDC + MSC composite) */
    tusb_init();

    sleep_ms(600);                   /* let the splash breathe */

    bool bt_ok = hci_bridge_init();
    if (!bt_ok) {
        g_pl.radio = RADIO_OFF;
        logf_pl("Radio unavailable - check board=Pico W");
    }
    logf_pl("Ready. Waiting for host...");

    while (true) {
        tud_task();                  /* USB device stack             */
        hci_bridge_task();           /* radio -> host pump           */
        control_task();              /* CDC command protocol         */
        log_pump_cdc();              /* stream logs to console app   */
        handle_buttons();
        apply_requests();
        ui_task();                   /* OLED refresh                 */
    }
}
