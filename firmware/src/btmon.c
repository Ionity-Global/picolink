/**
 * IONITY PicoLink — Bluetooth monitor (HCI event snooping)
 * Parses events per Bluetooth Core spec Vol 4 Part E §7.7, then derives
 * presence, motion and intruder alerts. Passive: reads only what the host's
 * own inquiry/scan already pushes through the bridge.
 */
#include <string.h>
#include <stdio.h>
#include <math.h>
#include "pico/stdlib.h"
#include "pico/critical_section.h"
#include "btmon.h"
#include "logbuf.h"
#include "picolink.h"

/* HCI event codes */
#define EVT_INQUIRY_RESULT           0x02
#define EVT_INQUIRY_RESULT_RSSI      0x22
#define EVT_EXT_INQUIRY_RESULT       0x2F
#define EVT_LE_META                  0x3E
#define LE_ADVERTISING_REPORT        0x02
#define LE_EXT_ADVERTISING_REPORT    0x0D

#define DEV_TTL_MS      30000
#define BASELINE_MS     15000    /* warm-up: no intruder alerts before this  */
#define SIGHT_LOG_MS     4000    /* per-device throttle for sighting logs    */
#define ALERTQ           8

static bt_dev_t devs[BTMON_MAX];
static critical_section_t lock;
static uint32_t generation;
static uint32_t boot_ms;

/* intruder alert ring */
static bt_dev_t alertq[ALERTQ];
static volatile int aq_head, aq_tail;

void btmon_init(void) {
    critical_section_init(&lock);
    memset(devs, 0, sizeof(devs));
    boot_ms = to_ms_since_boot(get_absolute_time());
    aq_head = aq_tail = 0;
}

float btmon_distance_m(int8_t rssi) {
    const float tx = -59.0f, n = 2.0f;
    float d = powf(10.0f, ((float)tx - (float)rssi) / (10.0f * n));
    if (d < 0.1f) d = 0.1f;
    if (d > 99.0f) d = 99.0f;
    return d;
}

static bt_dev_t *slot_for(bt_kind_t kind, const uint8_t addr[6]) {
    int free_i = -1, evict = -1;
    int32_t evict_score = 0x7fffffff;
    uint32_t now = to_ms_since_boot(get_absolute_time());
    for (int i = 0; i < BTMON_MAX; i++) {
        if (devs[i].used && devs[i].kind == kind && memcmp(devs[i].addr, addr, 6) == 0)
            return &devs[i];
        if (!devs[i].used && free_i < 0) free_i = i;
        if (devs[i].used) {
            int32_t age = (int32_t)(now - devs[i].seen_ms);
            int32_t score = devs[i].rssi - age / 1000;
            if (score < evict_score) { evict_score = score; evict = i; }
        }
    }
    if (free_i >= 0) return &devs[free_i];
    return evict >= 0 ? &devs[evict] : &devs[0];
}

static void set_addr_be(uint8_t out[6], const uint8_t le[6]) {
    for (int i = 0; i < 6; i++) out[i] = le[5 - i];
}

static void extract_name(const uint8_t *d, int len, char *name) {
    int i = 0;
    while (i < len) {
        int flen = d[i];
        if (flen == 0 || i + 1 + flen > len) break;
        uint8_t type = d[i + 1];
        if (type == 0x09 || type == 0x08) {
            int nlen = flen - 1;
            if (nlen > BTMON_NAME_LEN - 1) nlen = BTMON_NAME_LEN - 1;
            for (int k = 0; k < nlen; k++) {
                uint8_t c = d[i + 2 + k];
                name[k] = (c >= 0x20 && c < 0x7F) ? (char)c : '?';
            }
            name[nlen] = 0;
            return;
        }
        i += 1 + flen;
    }
}

static void queue_alert(const bt_dev_t *e) {
    int nxt = (aq_head + 1) % ALERTQ;
    if (nxt == aq_tail) return;         /* full — drop */
    alertq[aq_head] = *e;
    aq_head = nxt;
}

/* classify an AD/EIR blob by well-known tracker/beacon signatures */
static void extract_cat(const uint8_t *d, int len, char *cat) {
    cat[0] = 0;
    int i = 0;
    while (i < len) {
        int flen = d[i];
        if (flen == 0 || i + 1 + flen > len) break;
        uint8_t type = d[i + 1];
        const uint8_t *v = &d[i + 2];
        int vlen = flen - 1;
        if ((type == 0x02 || type == 0x03) && vlen >= 2) {   /* 16-bit service UUIDs */
            for (int k = 0; k + 1 < vlen; k += 2) {
                uint16_t u = v[k] | (v[k + 1] << 8);
                if (u == 0xFEED || u == 0xFEEC) { strcpy(cat, "tile"); return; }
                if (u == 0xFD5A)                { strcpy(cat, "smarttag"); return; }
                if (u == 0xFEAA)                { strcpy(cat, "eddystone"); return; }
            }
        } else if (type == 0x16 && vlen >= 2) {              /* service data */
            uint16_t u = v[0] | (v[1] << 8);
            if (u == 0xFEED || u == 0xFEEC) { strcpy(cat, "tile"); return; }
            if (u == 0xFD5A)                { strcpy(cat, "smarttag"); return; }
            if (u == 0xFEAA)                { strcpy(cat, "eddystone"); return; }
        } else if (type == 0xFF && vlen >= 2) {              /* manufacturer specific */
            uint16_t co = v[0] | (v[1] << 8);
            if (co == 0x004C) {                              /* Apple */
                if (vlen >= 4 && v[2] == 0x02 && v[3] == 0x15) { strcpy(cat, "ibeacon"); return; }
                if (vlen >= 3 && (v[2] == 0x12 || v[2] == 0x07 || v[2] == 0x19)) { strcpy(cat, "findmy"); return; }
                strcpy(cat, "apple"); return;
            }
            if (co == 0x0075) { strcpy(cat, "samsung"); return; }
            if (co == 0x0006) { strcpy(cat, "mswift"); return; }
            if (co == 0x00E0) { strcpy(cat, "google"); return; }
        }
        i += 1 + flen;
    }
}

static void record(bt_kind_t kind, const uint8_t addr_le[6], int8_t rssi,
                   uint32_t cls, uint8_t addr_type, const uint8_t *ad, int adlen) {
    uint32_t now = to_ms_since_boot(get_absolute_time());
    critical_section_enter_blocking(&lock);
    bt_dev_t *e = slot_for(kind, (const uint8_t[6]){addr_le[5],addr_le[4],addr_le[3],addr_le[2],addr_le[1],addr_le[0]});
    bool is_new = !e->used || e->kind != kind;

    if (is_new) {
        memset(e, 0, sizeof(*e));
        e->used = true;
        e->kind = kind;
        set_addr_be(e->addr, addr_le);
        e->first_ms = now;
        e->rssi_min = 127; e->rssi_max = -128;
    }
    e->rssi = rssi;
    if (rssi < e->rssi_min) e->rssi_min = rssi;
    if (rssi > e->rssi_max) e->rssi_max = rssi;
    e->moving = (e->rssi_max - e->rssi_min) >= BTMON_MOVE_DB;
    e->hits++;
    if (cls) e->cls = cls;
    e->addr_type = addr_type;
    e->seen_ms = now;
    if (ad && adlen > 0) {
        char nm[BTMON_NAME_LEN] = {0};
        extract_name(ad, adlen, nm);
        if (nm[0]) strncpy(e->name, nm, BTMON_NAME_LEN - 1);
        char ct[12] = {0};
        extract_cat(ad, adlen, ct);
        if (ct[0]) strncpy(e->cat, ct, sizeof(e->cat) - 1);
    }
    /* decay the rolling window so motion reflects recent movement */
    if (e->hits % 16 == 0) { e->rssi_min = rssi - 1; e->rssi_max = rssi + 1; }

    bool alert = is_new && (now - boot_ms) > BASELINE_MS;
    bt_dev_t snap = *e;
    generation++;
    critical_section_exit(&lock);

    /* verbose sighting log (throttled per device via hits/name presence) */
    char a[18];
    snprintf(a, sizeof(a), "%02X:%02X:%02X:%02X:%02X:%02X",
             addr_le[5], addr_le[4], addr_le[3], addr_le[2], addr_le[1], addr_le[0]);
    const char *tag = kind == BT_LE ? "BLE" : "BT ";
    if (is_new) {
        logf_pl("%s NEW %s %s %ddBm ~%.1fm", tag,
                snap.name[0] ? snap.name : a, snap.name[0] ? "" : "",
                rssi, (double)btmon_distance_m(rssi));
    } else if (snap.hits % 8 == 0) {
        logf_pl("%s see %s %ddBm%s", tag, snap.name[0] ? snap.name : a,
                rssi, snap.moving ? " MOV" : "");
    }

    if (alert) { queue_alert(&snap); logf_pl("ALERT new %s %s %ddBm", tag,
                snap.name[0] ? snap.name : a, rssi); }
}

void btmon_on_event(const uint8_t *pkt, uint16_t len) {
    if (len < 2) return;
    uint8_t code = pkt[0];
    const uint8_t *p = pkt + 2;
    uint16_t plen = pkt[1];
    if (plen + 2 > len) plen = (uint16_t)(len - 2);

    if (code == EVT_INQUIRY_RESULT_RSSI) {
        uint8_t num = p[0]; const uint8_t *b = p + 1;
        for (int i = 0; i < num; i++) {
            const uint8_t *r = b + i * 14;
            uint32_t cls = r[8] | (r[9] << 8) | (r[10] << 16);
            record(BT_CLASSIC, r, (int8_t)r[13], cls, 0, NULL, 0);
        }
    } else if (code == EVT_INQUIRY_RESULT) {
        uint8_t num = p[0]; const uint8_t *b = p + 1;
        for (int i = 0; i < num; i++) {
            const uint8_t *r = b + i * 14;
            uint32_t cls = r[9] | (r[10] << 8) | (r[11] << 16);
            record(BT_CLASSIC, r, -127, cls, 0, NULL, 0);
        }
    } else if (code == EVT_EXT_INQUIRY_RESULT) {
        const uint8_t *r = p + 1;
        uint32_t cls = r[8] | (r[9] << 8) | (r[10] << 16);
        record(BT_CLASSIC, r, (int8_t)r[13], cls, 0, r + 14, 240);
    } else if (code == EVT_LE_META) {
        uint8_t sub = p[0];
        if (sub == LE_ADVERTISING_REPORT) {
            uint8_t num = p[1];
            const uint8_t *r = p + 2;
            for (int i = 0; i < num; i++) {
                uint8_t atype = r[1];
                const uint8_t *addr = r + 2;
                uint8_t dlen = r[8];
                const uint8_t *ad = r + 9;
                int8_t rssi = (int8_t)r[9 + dlen];
                record(BT_LE, addr, rssi, 0, atype, ad, dlen);
                r += 10 + dlen;
            }
        } else if (sub == LE_EXT_ADVERTISING_REPORT) {
            uint8_t num = p[1];
            const uint8_t *r = p + 2;
            for (int i = 0; i < num; i++) {
                uint8_t atype = r[2];
                const uint8_t *addr = r + 3;
                int8_t rssi = (int8_t)r[13];
                uint8_t dlen = r[23];
                const uint8_t *ad = r + 24;
                record(BT_LE, addr, rssi, 0, atype, ad, dlen);
                r += 24 + dlen;
            }
        }
    }
}

void btmon_expire(void) {
    uint32_t now = to_ms_since_boot(get_absolute_time());
    critical_section_enter_blocking(&lock);
    for (int i = 0; i < BTMON_MAX; i++)
        if (devs[i].used && (now - devs[i].seen_ms) > DEV_TTL_MS) {
            devs[i].used = false;
            generation++;
        }
    critical_section_exit(&lock);
}

int btmon_count(bt_kind_t kind) {
    int c = 0;
    critical_section_enter_blocking(&lock);
    for (int i = 0; i < BTMON_MAX; i++) if (devs[i].used && devs[i].kind == kind) c++;
    critical_section_exit(&lock);
    return c;
}

bool btmon_get(bt_kind_t kind, int rank, bt_dev_t *out) {
    bool ok = false;
    critical_section_enter_blocking(&lock);
    bt_dev_t tmp[BTMON_MAX];
    int c = 0;
    for (int i = 0; i < BTMON_MAX; i++)
        if (devs[i].used && devs[i].kind == kind) tmp[c++] = devs[i];
    for (int i = 1; i < c; i++) {
        bt_dev_t k = tmp[i]; int j = i - 1;
        while (j >= 0 && tmp[j].rssi < k.rssi) { tmp[j+1] = tmp[j]; j--; }
        tmp[j+1] = k;
    }
    if (rank >= 0 && rank < c) { *out = tmp[rank]; ok = true; }
    critical_section_exit(&lock);
    return ok;
}

btmon_presence_t btmon_presence(void) {
    btmon_presence_t pr = {0, 0, 0};
    critical_section_enter_blocking(&lock);
    for (int i = 0; i < BTMON_MAX; i++) {
        if (!devs[i].used) continue;
        pr.total++;
        if (devs[i].rssi != -127 && devs[i].rssi > BTMON_NEAR_DBM) pr.near++;
        if (devs[i].moving) pr.moving++;
    }
    critical_section_exit(&lock);
    return pr;
}

bool btmon_take_alert(bt_dev_t *out) {
    if (aq_tail == aq_head) return false;
    *out = alertq[aq_tail];
    aq_tail = (aq_tail + 1) % ALERTQ;
    return true;
}

uint32_t btmon_generation(void) { return generation; }
