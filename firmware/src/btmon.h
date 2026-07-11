/**
 * IONITY PicoLink — Bluetooth monitor
 *
 * Passively snoops the HCI event stream that already flows controller->host
 * through the bridge, and extracts nearby-device sightings:
 *   - Bluetooth Classic (BR/EDR) inquiry results  (+RSSI, EIR name)
 *   - Bluetooth LE advertising reports            (+RSSI, AD name)
 * No extra radio traffic — it only reads what the host's own scan produces.
 */
#ifndef BTMON_H
#define BTMON_H

#include <stdint.h>
#include <stdbool.h>

#define BTMON_MAX      24     /* per table (classic + le share a pool)     */
#define BTMON_NAME_LEN 24

typedef enum { BT_CLASSIC = 0, BT_LE = 1 } bt_kind_t;

typedef struct {
    bt_kind_t kind;
    uint8_t   addr[6];        /* big-endian display order                  */
    char      name[BTMON_NAME_LEN];
    int8_t    rssi;           /* dBm                                       */
    uint32_t  cls;            /* Class of Device (classic only)            */
    uint8_t   addr_type;      /* LE: 0 public, 1 random                    */
    uint32_t  seen_ms;
    bool      used;
} bt_dev_t;

void btmon_init(void);
/* fed from the bridge for every controller->host HCI event */
void btmon_on_event(const uint8_t *pkt, uint16_t len);
void btmon_expire(void);                   /* call periodically            */

int  btmon_count(bt_kind_t kind);
/* rank 0 = strongest of that kind; copies out under lock. */
bool btmon_get(bt_kind_t kind, int rank, bt_dev_t *out);
uint32_t btmon_generation(void);

/* meters, log-distance path-loss model (txpower -59dBm @1m, n=2.0) */
float btmon_distance_m(int8_t rssi);

#endif
