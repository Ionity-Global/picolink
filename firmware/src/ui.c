/** IONITY PicoLink — OLED user interface (SH1107 128x64) */
#include <stdio.h>
#include <string.h>
#include "pico/stdlib.h"
#include "picolink.h"
#include "oled.h"
#include "ui.h"
#include "logbuf.h"
#include "font.h"

typedef enum { SCR_STATUS = 0, SCR_LOGS, SCR_ABOUT, SCR_COUNT } screen_t;

static screen_t screen = SCR_STATUS;
static bool display_on = true;
static absolute_time_t next_render;
static uint32_t last_log_seq;

/* 2x scaled text for headlines */
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
    next_render = 0;   /* render now */
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

    char l1[24], l2[24];
    snprintf(l1, sizeof(l1), "USB %s   APP %s",
             g_pl.usb_mounted ? "OK" : "--",
             g_pl.cdc_connected ? "OK" : "--");
    snprintf(l2, sizeof(l2), "T%lu R%lu D%lu",
             (unsigned long)g_pl.tx_pkts, (unsigned long)g_pl.rx_pkts,
             (unsigned long)g_pl.drops);
    oled_text(4, 38, l1);
    oled_text(4, 48, l2);
    oled_hline(0, 127, 58, true);
    oled_text(4, 58, "K0 radio  K1 screen");
}

static void render_logs(void) {
    header("LOGS");
    for (int i = 0; i < 6; i++) {
        const char *l = log_get(5 - i);
        if (!l) continue;
        char t[22];
        /* skip the "[  123.456] " timestamp for screen width */
        const char *msg = strchr(l, ']');
        msg = msg ? msg + 2 : l;
        strncpy(t, msg, 21); t[21] = 0;
        oled_text(0, 12 + i * 9, t);
    }
}

static void render_about(void) {
    header("ABOUT");
    oled_text(2, 14, PICOLINK_PRODUCT);
    char v[24];
    snprintf(v, sizeof(v), "v%s  %s", PICOLINK_VERSION, g_pl.board);
    oled_text(2, 24, v);
    oled_text(2, 34, "S/N:");
    oled_text(26, 34, g_pl.serial);
    oled_text(2, 46, "ionity.today");
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
        case SCR_LOGS:   render_logs();   break;
        case SCR_ABOUT:  render_about();  break;
        default: break;
    }
    oled_flush();
}
