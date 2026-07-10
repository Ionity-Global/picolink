/**
 * IONITY PicoLink — WiFi RADAR
 *
 * Passive AP scanner on the CYW43439, running concurrently with the
 * Bluetooth HCI bridge (the combo chip handles BT/WiFi coexistence).
 * No lwip, no joining — we only listen and rank what's on the air.
 */
#include <string.h>
#include <stdio.h>
#include "pico/stdlib.h"
#include "pico/critical_section.h"
#include "pico/cyw43_arch.h"
#include "cyw43.h"
#include "picolink.h"
#include "wifi_scan.h"
#include "logbuf.h"

#define SCAN_PERIOD_MS   8000
#define NET_TTL_MS      30000

static wifi_net_t nets[WIFI_MAX_NETS];
static critical_section_t lock;
static absolute_time_t next_scan;
static uint32_t generation;
static bool ready;
static int last_logged_count = -1;

/* ---- scan result callback: runs in the cyw43 async context ---- */
static int scan_cb(void *env, const cyw43_ev_scan_result_t *r) {
    (void)env;
    if (!r || r->ssid_len == 0) return 0;

    uint32_t now = to_ms_since_boot(get_absolute_time());
    critical_section_enter_blocking(&lock);

    int slot = -1, weakest = -1;
    int16_t weakest_rssi = 127;
    for (int i = 0; i < WIFI_MAX_NETS; i++) {
        if (nets[i].used && memcmp(nets[i].bssid, r->bssid, 6) == 0) { slot = i; break; }
        if (!nets[i].used && slot < 0) slot = i;
        if (nets[i].used && nets[i].rssi < weakest_rssi) { weakest_rssi = nets[i].rssi; weakest = i; }
    }
    if (slot < 0 && weakest >= 0 && r->rssi > weakest_rssi) slot = weakest;

    if (slot >= 0) {
        wifi_net_t *n = &nets[slot];
        n->used = true;
        uint8_t len = r->ssid_len > 32 ? 32 : r->ssid_len;
        memcpy(n->ssid, r->ssid, len);
        n->ssid[len] = 0;
        for (uint8_t i = 0; i < len; i++) {
            if (n->ssid[i] < 0x20 || n->ssid[i] > 0x7E || n->ssid[i] == '"' || n->ssid[i] == '\\') {
                n->ssid[i] = '?';
            }
        }
        n->rssi = r->rssi;
        n->channel = (uint8_t)r->channel;
        memcpy(n->bssid, r->bssid, 6);
        n->seen_ms = now;
        generation++;
    }

    critical_section_exit(&lock);
    return 0;
}

void wifi_scan_init(void) {
    critical_section_init(&lock);
    memset(nets, 0, sizeof(nets));
    cyw43_wifi_set_up(&cyw43_state, CYW43_ITF_STA, true, CYW43_COUNTRY_WORLDWIDE);
    ready = true;
    next_scan = make_timeout_time_ms(1500);
    logf_pl("WiFi RADAR armed");
}

void wifi_scan_task(void) {
    if (!ready) return;
    if (!time_reached(next_scan)) return;
    next_scan = make_timeout_time_ms(SCAN_PERIOD_MS);

    uint32_t now = to_ms_since_boot(get_absolute_time());
    critical_section_enter_blocking(&lock);
    for (int i = 0; i < WIFI_MAX_NETS; i++) {
        if (nets[i].used && (now - nets[i].seen_ms) > NET_TTL_MS) {
            nets[i].used = false;
            generation++;
        }
    }
    critical_section_exit(&lock);

    if (!cyw43_wifi_scan_active(&cyw43_state)) {
        cyw43_wifi_scan_options_t opts;
        memset(&opts, 0, sizeof(opts));
        CYW43_THREAD_ENTER
        int err = cyw43_wifi_scan(&cyw43_state, &opts, NULL, scan_cb);
        CYW43_THREAD_EXIT
        if (err) {
            logf_pl("WiFi scan err %d", err);
        } else {
            int c = wifi_scan_count();
            if (c != last_logged_count) {
                last_logged_count = c;
                wifi_net_t best;
                if (wifi_scan_get(0, &best)) {
                    logf_pl("WiFi: %d nets, top %s %ddBm ch%u",
                            c, best.ssid, best.rssi, best.channel);
                } else {
                    logf_pl("WiFi: scanning...");
                }
            }
        }
    }
}

int wifi_scan_count(void) {
    int c = 0;
    critical_section_enter_blocking(&lock);
    for (int i = 0; i < WIFI_MAX_NETS; i++) if (nets[i].used) c++;
    critical_section_exit(&lock);
    return c;
}

bool wifi_scan_get(int rank, wifi_net_t *out) {
    bool ok = false;
    critical_section_enter_blocking(&lock);
    wifi_net_t tmp[WIFI_MAX_NETS];
    int c = 0;
    for (int i = 0; i < WIFI_MAX_NETS; i++) if (nets[i].used) tmp[c++] = nets[i];
    for (int i = 1; i < c; i++) {
        wifi_net_t k = tmp[i];
        int j = i - 1;
        while (j >= 0 && tmp[j].rssi < k.rssi) { tmp[j + 1] = tmp[j]; j--; }
        tmp[j + 1] = k;
    }
    if (rank >= 0 && rank < c) { *out = tmp[rank]; ok = true; }
    critical_section_exit(&lock);
    return ok;
}

void wifi_scan_insight(char *buf, int len) {
    int per_ch[15] = {0};
    int total = 0;
    critical_section_enter_blocking(&lock);
    for (int i = 0; i < WIFI_MAX_NETS; i++) {
        if (nets[i].used) {
            total++;
            if (nets[i].channel >= 1 && nets[i].channel <= 14) per_ch[nets[i].channel]++;
        }
    }
    critical_section_exit(&lock);

    if (total == 0) { snprintf(buf, (size_t)len, "listening..."); return; }

    int busy_ch = 1, busy_n = -1;
    for (int ch = 1; ch <= 14; ch++) {
        if (per_ch[ch] > busy_n) { busy_n = per_ch[ch]; busy_ch = ch; }
    }
    int best_ch = 1, best_n = per_ch[1];
    if (per_ch[6]  < best_n) { best_n = per_ch[6];  best_ch = 6; }
    if (per_ch[11] < best_n) { best_n = per_ch[11]; best_ch = 11; }

    if (busy_n >= 3 && best_ch != busy_ch) {
        snprintf(buf, (size_t)len, "ch%d busy(x%d) try ch%d", busy_ch, busy_n, best_ch);
    } else {
        snprintf(buf, (size_t)len, "air OK  quietest ch%d", best_ch);
    }
}

uint32_t wifi_scan_generation(void) { return generation; }
