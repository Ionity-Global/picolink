/** IONITY PicoLink — OLED user interface (SH1107 128x64) */
#include <stdio.h>
#include <string.h>
#include "pico/stdlib.h"
#include "picolink.h"
#include "oled.h"
#include "ui.h"
#include "logbuf.h"
#include "font.h"
#include "wifi_scan.h"

typedef enum { SCR_STATUS = 0, SCR_WIFI, SCR_LOGS, SCR_ABOUT, SCR_COUNT } screen_t;

static screen_t screen = SCR_STATUS;
static bool display_on = true;
static absolute_time_t next_render;
static uint32_t last_log_seq;

static int wifi_rank;
static absolute_time_t next_net_hop;

static void draw_char2(int x, int y, char ch) {
    if (ch < 0x20 || ch > 0x7F) ch = '?';
    const uint8_t *g = font5x7[ch - 0x20];
    for (int cx = 0; cx < 5; cx++) {
        for (int cy = 0; cy < 7; cy++) {
            if ((g[cx] >> cy) & 1) {
                oled_fill_rect(x + cx * 2, y + cy * 2, 2, 2, true);
            }
        }
    }
}

static void text2(int x, int y, const char *s) {
    while (*s) { draw_char2(x, y, *s++); x += 12; }
}

void ui_init(void) {
    oled_init();
    oled_clear();
    text2(22, 10, "IONITY");
    oled_text(28, 32, "P i c o L i n k");
    oled_hline(14, 113, 46, true);
    oled_text(16, 52, "BT+BLE USB Dongle");
    oled_flush();
}

void ui_next_screen(void) {
    screen = (screen_t)((screen + 1) % SCR_COUNT);
    next_render = 0;
}

void ui_toggle_display(void) {
    display_on = !display_on;
    oled_power(display_on);
}

static void header(const char *title) {
    oled_fill_rect(0, 0, 128, 10, true);
    oled_text_inv(2, 1, title);
}

static void render_status(void) {
    header("IONITY PicoLink");

    const char *r = (g_pl.radio == RADIO_ON) ? "ON" :
                    (g_pl.radio == RADIO_OFF) ? "OFF" : "USB-OFF";
    text2(4, 16, "BT:");
    text2(44, 16, r);

    char l1[24], l2[24], l3[24];
    snprintf(l1, sizeof(l1), "USB %s   APP %s",
             g_pl.usb_mounted ? "OK" : "--",
             g_pl.cdc_connected ? "OK" : "--");
    snprintf(l2, sizeof(l2), "T%lu R%lu D%lu",
             (unsigned long)g_pl.tx_pkts, (unsigned long)g_pl.rx_pkts,
             (unsigned long)g_pl.drops);
    snprintf(l3, sizeof(l3), "CORE %.1fC  WIFI %d", (double)picolink_core_temp_c(),
             wifi_scan_count());
    oled_text(4, 36, l1);
    oled_text(4, 46, l2);
    oled_hline(0, 127, 55, true);
    oled_text(4, 57, l3);
}

static void draw_bars(int x, int y_base, int16_t rssi) {
    int lvl = rssi >= -50 ? 5 : rssi >= -60 ? 4 : rssi >= -70 ? 3 : rssi >= -80 ? 2 : 1;
    for (int b = 0; b < 5; b++) {
        int h = 3 + b * 3;
        int bx = x + b * 6;
        if (b < lvl) oled_fill_rect(bx, y_base - h, 4, h, true);
        else {
            oled_hline(bx, bx + 3, y_base - h, true);
            oled_hline(bx, bx + 3, y_base - 1, true);
            for (int yy = y_base - h; yy < y_base; yy++) {
                oled_pixel(bx, yy, true);
                oled_pixel(bx + 3, yy, true);
            }
        }
    }
}

static void render_wifi(void) {
    int count = wifi_scan_count();
    char h[24];
    snprintf(h, sizeof(h), "WiFi RADAR    %2d nets", count);
    header(h);

    wifi_net_t n;
    if (count == 0 || !wifi_scan_get(wifi_rank % (count ? count : 1), &n)) {
        oled_text(16, 26, "scanning the air");
        oled_text(40, 38, ". . .");
    } else {
        if (time_reached(next_net_hop)) {
            next_net_hop = make_timeout_time_ms(2500);
            wifi_rank = (wifi_rank + 1) % count;
        }

        char ssid[22];
        strncpy(ssid, n.ssid, 21); ssid[21] = 0;
        oled_text(2, 13, ssid);

        draw_bars(4, 44, n.rssi);

        char big[10];
        snprintf(big, sizeof(big), "%d", n.rssi);
        text2(44, 28, big);
        oled_text(44 + (int)strlen(big) * 12 + 2, 35, "dBm");

        char meta[24];
        snprintf(meta, sizeof(meta), "ch%-2u  #%d/%d", n.channel, (wifi_rank % count) + 1, count);
        oled_text(2, 48, meta);
    }

    oled_hline(0, 127, 55, true);
    char ins[22];
    wifi_scan_insight(ins, sizeof(ins));
    oled_text(2, 57, ins);
}

static void render_logs(void) {
    header("LOGS");
    for (int i = 0; i < 6; i++) {
        const char *l = log_get(5 - i);
        if (!l) continue;
        char t[22];
        const char *msg = strchr(l, ']');
        msg = msg ? msg + 2 : l;
        strncpy(t, msg, 21); t[21] = 0;
        oled_text(0, 12 + i * 9, t);
    }
}

static void render_about(void) {
    header("ABOUT");
    oled_text(2, 13, PICOLINK_PRODUCT);
    char v[24];
    snprintf(v, sizeof(v), "v%s  %s", PICOLINK_VERSION, g_pl.board);
    oled_text(2, 23, v);
    oled_text(2, 33, "Waveshare OLED 1.3");
    oled_text(2, 43, "S/N:");
    oled_text(26, 43, g_pl.serial);
    oled_hline(0, 127, 53, true);
    oled_text(2, 56, "(c)2026 Ionity Global");
}

void ui_task(void) {
    if (!display_on) return;
    bool logs_changed = (screen == SCR_LOGS) && (log_seq() != last_log_seq);
    if (!time_reached(next_render) && !logs_changed) return;
    next_render = make_timeout_time_ms(250);
    last_log_seq = log_seq();

    oled_clear();
    switch (screen) {
        case SCR_STATUS: render_status(); break;
        case SCR_WIFI:   render_wifi();   break;
        case SCR_LOGS:   render_logs();   break;
        case SCR_ABOUT:  render_about();  break;
        default: break;
    }
    oled_flush();
}
