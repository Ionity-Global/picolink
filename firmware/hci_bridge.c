/**
 * IONITY PicoLink — transparent HCI bridge: CYW43439 radio <-> USB BTH class
 */
#include <string.h>
#include "pico/stdlib.h"
#include "pico/cyw43_arch.h"
#include "cyw43.h"
#include "tusb.h"
#include "picolink.h"
#include "hci_bridge.h"
#include "logbuf.h"
#include "btmon.h"

#define HDR 4
#define H4_CMD  0x01
#define H4_ACL  0x02
#define H4_SCO  0x03
#define H4_EVT  0x04

#define RX_BUF_SZ (HDR + 4 + 1024)
static __attribute__((aligned(4))) uint8_t rx_buf[RX_BUF_SZ];
static __attribute__((aligned(4))) uint8_t evt_buf[2 + 255];
static __attribute__((aligned(4))) uint8_t acl_buf[4 + 1021];
static volatile bool evt_busy, acl_busy;
static volatile bool bt_work;
static bool bridge_on = true;
static bool hci_up = false;

static __attribute__((aligned(4))) uint8_t tx_buf[HDR + 4 + 1024];

void cyw43_bluetooth_hci_process(void) { bt_work = true; }

#include "pico/async_context.h"
bool btstack_cyw43_init(async_context_t *context)   { (void)context; return true; }
void btstack_cyw43_deinit(async_context_t *context) { (void)context; }

bool hci_bridge_init(void) {
    int err = cyw43_bluetooth_hci_init();
    if (err) { logf_pl("BT core init failed (%d)", err); return false; }
    hci_up = true;
    bt_work = true;
    logf_pl("BT radio up (CYW43439)");
    return true;
}

void hci_bridge_set_enabled(bool on) {
    bridge_on = on;
    g_pl.radio = on ? RADIO_ON : RADIO_OFF;
    logf_pl("Radio %s", on ? "ENABLED" : "DISABLED");
    if (!on && hci_up) {
        uint8_t rst[HDR + 3] = {0};
        rst[3] = H4_CMD;
        rst[4] = 0x03; rst[5] = 0x0C; rst[6] = 0x00;
        CYW43_THREAD_ENTER
        cyw43_bluetooth_hci_write(rst, sizeof(rst));
        CYW43_THREAD_EXIT
    }
}

bool hci_bridge_enabled(void) { return bridge_on; }

static void fwd_to_radio(uint8_t h4type, const void *data, size_t len) {
    if (!hci_up) return;
    if (!bridge_on) { g_pl.drops++; return; }
    if (len > sizeof(tx_buf) - HDR) { g_pl.drops++; return; }
    memset(tx_buf, 0, HDR);
    tx_buf[3] = h4type;
    memcpy(tx_buf + HDR, data, len);
    CYW43_THREAD_ENTER
    int err = cyw43_bluetooth_hci_write(tx_buf, len + HDR);
    CYW43_THREAD_EXIT
    if (err) { g_pl.drops++; logf_pl("HCI wr err %d", err); return; }
    g_pl.rx_pkts++;
    g_pl.rx_bytes += (uint32_t)len;
}

void tud_bt_hci_cmd_cb(void *hci_cmd, size_t cmd_len) { fwd_to_radio(H4_CMD, hci_cmd, cmd_len); }
void tud_bt_acl_data_received_cb(void *acl_data, uint16_t data_len) { fwd_to_radio(H4_ACL, acl_data, data_len); }
void tud_bt_event_sent_cb(uint16_t sent_bytes) { (void)sent_bytes; evt_busy = false; }
void tud_bt_acl_data_sent_cb(uint16_t sent_bytes) { (void)sent_bytes; acl_busy = false; }

void hci_bridge_task(void) {
    if (!hci_up || !tud_mounted()) return;
    if (evt_busy && acl_busy) return;

    for (int budget = 0; budget < 8; budget++) {
        if (!bt_work) break;
        uint32_t len = 0;
        CYW43_THREAD_ENTER
        int err = cyw43_bluetooth_hci_read(rx_buf, sizeof(rx_buf), &len);
        CYW43_THREAD_EXIT
        if (err || len <= HDR) { bt_work = false; break; }

        uint8_t  type = rx_buf[3];
        uint8_t *pkt  = &rx_buf[HDR];
        uint16_t plen = (uint16_t)(len - HDR);
        if (!bridge_on) { g_pl.drops++; continue; }

        if (type == H4_EVT) {
            btmon_on_event(pkt, plen);
            if (plen > sizeof(evt_buf)) { g_pl.drops++; continue; }
            absolute_time_t dl = make_timeout_time_ms(50);
            while (evt_busy && !time_reached(dl)) { tud_task(); }
            if (evt_busy) { g_pl.drops++; continue; }
            memcpy(evt_buf, pkt, plen);
            evt_busy = true;
            if (!tud_bt_event_send(evt_buf, plen)) { evt_busy = false; g_pl.drops++; }
            else { g_pl.tx_pkts++; g_pl.tx_bytes += plen; }
        } else if (type == H4_ACL) {
            if (plen > sizeof(acl_buf)) { g_pl.drops++; continue; }
            absolute_time_t dl = make_timeout_time_ms(50);
            while (acl_busy && !time_reached(dl)) { tud_task(); }
            if (acl_busy) { g_pl.drops++; continue; }
            memcpy(acl_buf, pkt, plen);
            acl_busy = true;
            if (!tud_bt_acl_data_send(acl_buf, plen)) { acl_busy = false; g_pl.drops++; }
            else { g_pl.tx_pkts++; g_pl.tx_bytes += plen; }
        } else {
            g_pl.drops++;
        }
    }
}
