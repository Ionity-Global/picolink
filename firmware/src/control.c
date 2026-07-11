/**
 * IONITY PicoLink — CDC serial control protocol (docs/PROTOCOL.md)
 *   HELLO / STATUS / WIFI / BT / BLE / BT ON / BT OFF / DETACH / BOOTLOADER / PING
 * Unsolicited: LOG lines + STAT every 2 s.
 */
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include "pico/stdlib.h"
#include "pico/bootrom.h"
#include "tusb.h"
#include "picolink.h"
#include "hci_bridge.h"
#include "logbuf.h"
#include "control.h"
#include "wifi_scan.h"
#include "btmon.h"

static char line[128];
static uint32_t line_len;
static absolute_time_t next_stat;

static void reply(const char *s) {
    tud_cdc_write_str(s);
    tud_cdc_write_str("\r\n");
    tud_cdc_write_flush();
}

static void send_status(void) {
    char buf[384];
    const char *r = (g_pl.radio == RADIO_ON) ? "on" :
                    (g_pl.radio == RADIO_OFF) ? "off" : "detached";
    wifi_net_t best;
    bool has_best = wifi_scan_get(0, &best);
    btmon_presence_t pr = btmon_presence();
    int link = wifi_link_status();
    const char *linkstr = link == 3 ? "up" : link == 2 ? "noip" : link == 1 ? "join" :
                          link == -1 ? "fail" : link == -2 ? "nonet" : link == -3 ? "badauth" : "down";
    snprintf(buf, sizeof(buf),
        "STAT {\"radio\":\"%s\",\"usb\":%s,\"tx_pkts\":%lu,\"rx_pkts\":%lu,"
        "\"tx_bytes\":%lu,\"rx_bytes\":%lu,\"drops\":%lu,\"uptime_ms\":%lu,"
        "\"temp_c\":%.1f,\"wifi_nets\":%d,\"bt\":%d,\"ble\":%d,"
        "\"near\":%d,\"moving\":%d,\"wifi_link\":\"%s\",\"wifi_join\":\"%s\","
        "\"wifi_best\":\"%s\",\"wifi_best_rssi\":%d}",
        r, g_pl.usb_mounted ? "true" : "false",
        (unsigned long)g_pl.tx_pkts, (unsigned long)g_pl.rx_pkts,
        (unsigned long)g_pl.tx_bytes, (unsigned long)g_pl.rx_bytes,
        (unsigned long)g_pl.drops,
        (unsigned long)to_ms_since_boot(get_absolute_time()),
        (double)picolink_core_temp_c(),
        wifi_scan_count(), btmon_count(BT_CLASSIC), btmon_count(BT_LE),
        pr.near, pr.moving, linkstr, wifi_join_ssid(),
        has_best ? best.ssid : "",
        has_best ? best.rssi : 0);
    reply(buf);
}

/* CYW43 auth_mode bits: 0=open, bit0 WEP, bit1 WPA, bit2 WPA2, bit3 WPA3(SAE) */
static const char *wifi_sec(uint8_t a) {
    if (a == 0)      return "open";
    if (a & 0x08)    return "wpa3";
    if (a & 0x04)    return "wpa2";
    if (a & 0x02)    return "wpa";
    if (a & 0x01)    return "wep";
    return "sec";
}

static void send_wifi(void) {
    tud_cdc_write_str("WIFI {\"nets\":[");
    wifi_net_t n;
    for (int i = 0; wifi_scan_get(i, &n); i++) {
        char item[144];
        snprintf(item, sizeof(item),
            "%s{\"ssid\":\"%s\",\"rssi\":%d,\"ch\":%u,\"sec\":\"%s\","
            "\"bssid\":\"%02X:%02X:%02X:%02X:%02X:%02X\"}",
            i ? "," : "", n.ssid, n.rssi, n.channel, wifi_sec(n.auth),
            n.bssid[0], n.bssid[1], n.bssid[2], n.bssid[3], n.bssid[4], n.bssid[5]);
        tud_cdc_write_str(item);
        tud_cdc_write_flush();
    }
    tud_cdc_write_str("]}\r\n");
    tud_cdc_write_flush();
}

/* stream a Classic or BLE device table as JSON, with board+serial context */
static void send_devs(bt_kind_t kind, const char *tag) {
    char head[96];
    snprintf(head, sizeof(head),
        "%s {\"board\":\"%s\",\"serial\":\"%s\",\"count\":%d,\"devs\":[",
        tag, g_pl.board, g_pl.serial, btmon_count(kind));
    tud_cdc_write_str(head);
    tud_cdc_write_flush();

    bt_dev_t d;
    for (int i = 0; btmon_get(kind, i, &d); i++) {
        char item[224];
        int n = snprintf(item, sizeof(item),
            "%s{\"addr\":\"%02X:%02X:%02X:%02X:%02X:%02X\",\"name\":\"%s\","
            "\"rssi\":%d,\"dist_m\":%.1f,\"seen_ms\":%lu,\"first_ms\":%lu,"
            "\"hits\":%u,\"moving\":%s,\"cat\":\"%s\"",
            i ? "," : "",
            d.addr[0], d.addr[1], d.addr[2], d.addr[3], d.addr[4], d.addr[5],
            d.name, d.rssi, (double)btmon_distance_m(d.rssi),
            (unsigned long)d.seen_ms, (unsigned long)d.first_ms,
            d.hits, d.moving ? "true" : "false", d.cat);
        if (kind == BT_CLASSIC)
            n += snprintf(item + n, sizeof(item) - n, ",\"cod\":\"0x%06lX\"}", (unsigned long)d.cls);
        else
            n += snprintf(item + n, sizeof(item) - n, ",\"atype\":\"%s\"}",
                          d.addr_type ? "random" : "public");
        tud_cdc_write_str(item);
        tud_cdc_write_flush();
    }
    tud_cdc_write_str("]}\r\n");
    tud_cdc_write_flush();
}

static void send_id(void) {
    char buf[256];
    snprintf(buf, sizeof(buf),
        "ID {\"product\":\"%s\",\"version\":\"%s\",\"board\":\"%s\","
        "\"display\":\"%s\",\"serial\":\"%s\",\"url\":\"%s\"}",
        PICOLINK_PRODUCT, PICOLINK_VERSION, g_pl.board,
        PICOLINK_DISPLAY, g_pl.serial, PICOLINK_URL);
    reply(buf);
}

/* case-insensitive keyword compare on the first token(s) */
static bool kw(const char *cmd, const char *k) {
    while (*k) { if (toupper((unsigned char)*cmd++) != *k++) return false; }
    return *cmd == 0 || *cmd == ' ';
}

/* WIFI JOIN "<ssid>" "<pass>"  — quotes optional; preserves case */
static void wifi_join_cmd(char *args) {
    char ssid[33] = {0}, pass[65] = {0};
    /* accept  JOIN "ssid" "pass"  or  JOIN ssid pass */
    char *p = args;
    while (*p == ' ') p++;
    for (int f = 0; f < 2 && *p; f++) {
        char *dst = f == 0 ? ssid : pass;
        int cap = f == 0 ? 32 : 64, n = 0;
        if (*p == '"') { p++; while (*p && *p != '"' && n < cap) dst[n++] = *p++; if (*p == '"') p++; }
        else { while (*p && *p != ' ' && n < cap) dst[n++] = *p++; }
        dst[n] = 0;
        while (*p == ' ') p++;
    }
    if (!ssid[0]) { reply("ERR WIFI JOIN needs an SSID"); return; }
    wifi_join(ssid, pass);
    reply("OK WIFI JOIN");
}

static void handle_line(char *cmd) {
    if      (kw(cmd, "HELLO"))      send_id();
    else if (kw(cmd, "STATUS"))     send_status();
    else if (kw(cmd, "BTLIST") || !strcasecmp(cmd, "BT")) send_devs(BT_CLASSIC, "BTLIST");
    else if (kw(cmd, "BLELIST") || !strcasecmp(cmd, "BLE")) send_devs(BT_LE, "BLELIST");
    else if (kw(cmd, "PING"))       reply("PONG");
    else if (kw(cmd, "WIFI JOIN"))  wifi_join_cmd(cmd + 9);
    else if (kw(cmd, "WIFI LEAVE")) { wifi_leave(); reply("OK WIFI LEAVE"); }
    else if (kw(cmd, "WIFI"))       send_wifi();        /* bare WIFI = scan list */
    else if (kw(cmd, "BT ON"))      { picolink_request_radio(true);  reply("OK BT ON"); }
    else if (kw(cmd, "BT OFF"))     { picolink_request_radio(false); reply("OK BT OFF"); }
    else if (kw(cmd, "DETACH"))     { reply("OK DETACH"); picolink_request_detach_toggle(); }
    else if (kw(cmd, "BOOTLOADER")) { reply("OK BOOTLOADER"); sleep_ms(100); reset_usb_boot(0, 0); }
    else if (cmd[0])                reply("ERR unknown command");
}

/* emit an intruder alert line (called from main loop as the queue drains) */
void control_emit_alert(const void *devp) {
    const bt_dev_t *d = (const bt_dev_t *)devp;
    char buf[176];
    snprintf(buf, sizeof(buf),
        "ALERT {\"kind\":\"%s\",\"addr\":\"%02X:%02X:%02X:%02X:%02X:%02X\","
        "\"name\":\"%s\",\"rssi\":%d,\"dist_m\":%.1f,\"uptime_ms\":%lu}",
        d->kind == BT_LE ? "ble" : "classic",
        d->addr[0], d->addr[1], d->addr[2], d->addr[3], d->addr[4], d->addr[5],
        d->name, d->rssi, (double)btmon_distance_m(d->rssi),
        (unsigned long)to_ms_since_boot(get_absolute_time()));
    reply(buf);
}

void control_task(void) {
    g_pl.cdc_connected = tud_cdc_connected();

    while (tud_cdc_available()) {
        int32_t c = tud_cdc_read_char();
        if (c < 0) break;
        if (c == '\r' || c == '\n') {
            if (line_len) {
                line[line_len] = 0;
                handle_line(line);
                line_len = 0;
            }
        } else if (line_len < sizeof(line) - 1) {
            line[line_len++] = (char)c;
        } else {
            line_len = 0;
        }
    }

    if (g_pl.cdc_connected && time_reached(next_stat)) {
        next_stat = make_timeout_time_ms(2000);
        send_status();
    }
}
