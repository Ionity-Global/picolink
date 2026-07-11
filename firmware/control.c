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
    char buf[288];
    const char *r = (g_pl.radio == RADIO_ON) ? "on" :
                    (g_pl.radio == RADIO_OFF) ? "off" : "detached";
    wifi_net_t best;
    bool has_best = wifi_scan_get(0, &best);
    snprintf(buf, sizeof(buf),
        "STAT {\"radio\":\"%s\",\"usb\":%s,\"tx_pkts\":%lu,\"rx_pkts\":%lu,"
        "\"tx_bytes\":%lu,\"rx_bytes\":%lu,\"drops\":%lu,\"uptime_ms\":%lu,"
        "\"temp_c\":%.1f,\"wifi_nets\":%d,\"bt\":%d,\"ble\":%d,"
        "\"wifi_best\":\"%s\",\"wifi_best_rssi\":%d}",
        r, g_pl.usb_mounted ? "true" : "false",
        (unsigned long)g_pl.tx_pkts, (unsigned long)g_pl.rx_pkts,
        (unsigned long)g_pl.tx_bytes, (unsigned long)g_pl.rx_bytes,
        (unsigned long)g_pl.drops,
        (unsigned long)to_ms_since_boot(get_absolute_time()),
        (double)picolink_core_temp_c(),
        wifi_scan_count(), btmon_count(BT_CLASSIC), btmon_count(BT_LE),
        has_best ? best.ssid : "",
        has_best ? best.rssi : 0);
    reply(buf);
}

static void send_wifi(void) {
    tud_cdc_write_str("WIFI {\"nets\":[");
    wifi_net_t n;
    for (int i = 0; wifi_scan_get(i, &n); i++) {
        char item[96];
        snprintf(item, sizeof(item), "%s{\"ssid\":\"%s\",\"rssi\":%d,\"ch\":%u}",
                 i ? "," : "", n.ssid, n.rssi, n.channel);
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
        char item[176];
        int n = snprintf(item, sizeof(item),
            "%s{\"addr\":\"%02X:%02X:%02X:%02X:%02X:%02X\",\"name\":\"%s\","
            "\"rssi\":%d,\"dist_m\":%.1f,\"seen_ms\":%lu",
            i ? "," : "",
            d.addr[0], d.addr[1], d.addr[2], d.addr[3], d.addr[4], d.addr[5],
            d.name, d.rssi, (double)btmon_distance_m(d.rssi),
            (unsigned long)d.seen_ms);
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

static void handle_line(char *cmd) {
    for (char *p = cmd; *p; p++) *p = (char)toupper((unsigned char)*p);

    if (!strcmp(cmd, "HELLO"))        { send_id(); }
    else if (!strcmp(cmd, "STATUS"))  { send_status(); }
    else if (!strcmp(cmd, "WIFI"))    { send_wifi(); }
    else if (!strcmp(cmd, "BT") || !strcmp(cmd, "BTLIST"))   { send_devs(BT_CLASSIC, "BTLIST"); }
    else if (!strcmp(cmd, "BLE") || !strcmp(cmd, "BLELIST")) { send_devs(BT_LE, "BLELIST"); }
    else if (!strcmp(cmd, "PING"))    { reply("PONG"); }
    else if (!strcmp(cmd, "BT ON"))   { picolink_request_radio(true);  reply("OK BT ON"); }
    else if (!strcmp(cmd, "BT OFF"))  { picolink_request_radio(false); reply("OK BT OFF"); }
    else if (!strcmp(cmd, "DETACH"))  { reply("OK DETACH"); picolink_request_detach_toggle(); }
    else if (!strcmp(cmd, "BOOTLOADER")) {
        reply("OK BOOTLOADER");
        sleep_ms(100);
        reset_usb_boot(0, 0);
    }
    else if (cmd[0])                  { reply("ERR unknown command"); }
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
