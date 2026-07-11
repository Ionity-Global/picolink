/**
 * IONITY PicoLink — USB Bluetooth/BLE dongle firmware
 * © 2026 Ionity Global (Pty) Ltd · www.ionity.today · POLICY 986 AED
 */
#include <stdio.h>
#include <string.h>
#include "pico/stdlib.h"
#include "pico/unique_id.h"
#include "pico/cyw43_arch.h"
#include "hardware/adc.h"
#include "tusb.h"

#include "picolink.h"
#include "hci_bridge.h"
#include "oled.h"
#include "ui.h"
#include "buttons.h"
#include "logbuf.h"
#include "control.h"
#include "wifi_scan.h"
#include "btmon.h"

picolink_state_t g_pl;

static volatile bool req_detach_toggle;
static volatile int  req_radio = -1;

void picolink_request_radio(bool on)      { req_radio = on ? 1 : 0; }
void picolink_request_detach_toggle(void) { req_detach_toggle = true; }

float picolink_core_temp_c(void) {
    adc_select_input(4);
    uint16_t raw = adc_read();
    float v = raw * 3.3f / 4096.0f;
    return 27.0f - (v - 0.706f) / 0.001721f;
}

void tud_mount_cb(void)   { g_pl.usb_mounted = true;  logf_pl("USB host connected"); }
void tud_umount_cb(void)  { g_pl.usb_mounted = false; logf_pl("USB host disconnected"); }
void tud_suspend_cb(bool remote_wakeup_en) { (void)remote_wakeup_en; logf_pl("USB suspended"); }
void tud_resume_cb(void)  { logf_pl("USB resumed"); }

static void apply_requests(void) {
    if (req_radio >= 0) {
        bool on = req_radio == 1;
        req_radio = -1;
        if (g_pl.radio != RADIO_DETACHED) hci_bridge_set_enabled(on);
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

static bool cyw43_ok;
static void led_task(void) {
    if (!cyw43_ok) return;
    static absolute_time_t next;
    static bool on;
    uint32_t period = (g_pl.radio == RADIO_ON) ? 0 :
                      (g_pl.radio == RADIO_OFF) ? 500 : 150;
    if (period == 0) {
        if (!on) { cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, true); on = true; }
        return;
    }
    if (time_reached(next)) {
        next = make_timeout_time_ms(period);
        on = !on;
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, on);
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

    adc_init();
    adc_set_temp_sensor_enabled(true);

    buttons_init();
    btmon_init();
    ui_init();

    bool bt_ok = false;
    if (cyw43_arch_init() != 0) {
        logf_pl("FATAL: cyw43 init failed");
    } else {
        cyw43_ok = true;
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, true);
        bt_ok = hci_bridge_init();
    }
    if (!bt_ok) {
        g_pl.radio = RADIO_OFF;
        logf_pl("Radio unavailable - check W board");
    } else {
        wifi_scan_init();
    }

    tusb_init();
    logf_pl("Ready. Waiting for host...");

    while (true) {
        tud_task();
        hci_bridge_task();
        control_task();
        log_pump_cdc();
        wifi_scan_task();
        btmon_expire();

        /* drain intruder alerts: notify the console + flash the OLED */
        bt_dev_t alert;
        while (btmon_take_alert(&alert)) {
            control_emit_alert(&alert);
            ui_flash_alert(alert.name[0] ? alert.name : "new device");
        }
        handle_buttons();
        apply_requests();
        led_task();
        ui_task();
    }
}
