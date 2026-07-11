/**
 * IONITY PicoLink — Bluetooth monitor + presence/motion + intruder alerts
 *
 * Passively snoops the HCI event stream that already flows controller->host
 * through the bridge, and extracts nearby-device sightings:
 *   - Bluetooth Classic (BR/EDR) inquiry results  (+RSSI, EIR name)
 *   - Bluetooth LE advertising reports            (+RSSI, AD name)
 * No extra radio traffic — it only reads what the host's own scan produces.
 *
 * On top of the raw table it derives:
 *   - presence  (how many devices are within a near threshold)
 *   - motion    (per-device RSSI spread over a rolling window)
 *   - intruder alerts (first appearance of an address after a warm-up baseline)
 */
#ifndef BTMON_H
#define BTMON_H

#include <stdint.h>
#include <stdbool.h>

#define BTMON_MAX      24     /* per table (classic + le share a pool)     */
#define BTMON_NAME_LEN 24
#define BTMON_NEAR_DBM (-70)  /* "in the room" threshold                   */
#define BTMON_MOVE_DB    8    /* rssi spread (dB) that counts as motion    */

typedef enum { BT_CLASSIC = 0, BT_LE = 1 } bt_kind_t;

typedef struct {
    bt_kind_t kind;
    uint8_t   addr[6];        /* big-endian display order                  */
    char      name[BTMON_NAME_LEN];
    int8_t    rssi;           /* dBm (latest)                              */
    int8_t    rssi_min;       /* rolling window min                        */
    int8_t    rssi_max;       /* rolling window max                        */
    uint16_t  hits;           /* sightings since first seen                */
    uint32_t  cls;            /* Class of Device (classic only)            */
    uint8_t   addr_type;      /* LE: 0 public, 1 random                    */
    uint32_t  first_ms;       /* first sighting                            */
    uint32_t  seen_ms;        /* last sighting                             */
    bool      moving;         /* rssi spread > BTMON_MOVE_DB               */
    bool      used;
} bt_dev_t;

typedef struct {
    int near;                 /* devices within BTMON_NEAR_DBM             */
    int moving;               /* devices currently moving                 */
    int total;                /* all live devices                         */
} btmon_presence_t;

void btmon_init(void);
void btmon_on_event(const uint8_t *pkt, uint16_t len);
void btmon_expire(void);

int  btmon_count(bt_kind_t kind);
bool btmon_get(bt_kind_t kind, int rank, bt_dev_t *out);
uint32_t btmon_generation(void);

btmon_presence_t btmon_presence(void);

/* intruder alert queue: returns true and fills *out if a brand-new device
 * appeared after the warm-up baseline. Drains one entry per call. */
bool btmon_take_alert(bt_dev_t *out);

float btmon_distance_m(int8_t rssi);

#endif
