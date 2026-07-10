/** IONITY PicoLink — WiFi RADAR: passive scanner running beside the BT bridge */
#ifndef WIFI_SCAN_H
#define WIFI_SCAN_H

#include <stdint.h>
#include <stdbool.h>

#define WIFI_MAX_NETS 16

typedef struct {
    char    ssid[33];
    int16_t rssi;        /* dBm                    */
    uint8_t channel;
    uint8_t bssid[6];
    uint32_t seen_ms;    /* last time heard        */
    bool    used;
} wifi_net_t;

void wifi_scan_init(void);          /* bring STA up, first scan            */
void wifi_scan_task(void);          /* kick scans, expire old entries      */
int  wifi_scan_count(void);
/* rank 0 = strongest. Returns false past end. Copies out under lock. */
bool wifi_scan_get(int rank, wifi_net_t *out);
/* AEDi channel-congestion insight, <= 21 chars for the OLED */
void wifi_scan_insight(char *buf, int len);
uint32_t wifi_scan_generation(void); /* bumps when table changes           */

#endif
