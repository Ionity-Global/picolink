/** IONITY PicoLink — GPS NMEA reader (UART0 @ 9600) */
#include <string.h>
#include <stdlib.h>
#include <stdbool.h>
#include "pico/stdlib.h"
#include "hardware/uart.h"
#include "hardware/gpio.h"
#include "picolink.h"
#include "gps.h"
#include "logbuf.h"

static char line[100];
static int  llen;
static volatile bool has_fix, present;
static volatile double lat_dd, lon_dd;
static volatile int sats;
static bool logged_fix;

void gps_init(void) {
    uart_init(GPS_UART, GPS_BAUD);
    gpio_set_function(GPS_PIN_TX, GPIO_FUNC_UART);
    gpio_set_function(GPS_PIN_RX, GPIO_FUNC_UART);
    uart_set_hw_flow(GPS_UART, false, false);
    uart_set_format(GPS_UART, 8, 1, UART_PARITY_NONE);
}

/* split a comma line into fields (in place); returns count */
static int split(char *s, char *f[], int max) {
    int n = 0; f[n++] = s;
    for (char *p = s; *p && n < max; p++) if (*p == ',') { *p = 0; f[n++] = p + 1; }
    return n;
}

/* NMEA ddmm.mmmm -> signed decimal degrees */
static double nmea_deg(const char *v, const char *hemi, int deg_digits) {
    if (!v[0]) return 0;
    double raw = atof(v);
    int d = (int)(raw / 100);
    double m = raw - d * 100;
    double dd = d + m / 60.0;
    (void)deg_digits;
    if (hemi[0] == 'S' || hemi[0] == 'W') dd = -dd;
    return dd;
}

static void parse(char *s) {
    if (s[0] != '$') return;
    present = true;
    char *f[20];
    int n = split(s, f, 20);
    const char *typ = (n && strlen(f[0]) >= 6) ? f[0] + 3 : "";
    if (!strcmp(typ, "GGA") && n >= 8) {
        int fix = atoi(f[6]);
        if (fix > 0 && f[2][0] && f[4][0]) {
            lat_dd = nmea_deg(f[2], f[3], 2);
            lon_dd = nmea_deg(f[4], f[5], 3);
            sats = atoi(f[7]);
            has_fix = true;
        } else has_fix = false;
    } else if (!strcmp(typ, "RMC") && n >= 7) {
        if (f[2][0] == 'A' && f[3][0] && f[5][0]) {
            lat_dd = nmea_deg(f[3], f[4], 2);
            lon_dd = nmea_deg(f[5], f[6], 3);
            has_fix = true;
        }
    }
    if (has_fix && !logged_fix) { logged_fix = true; logf_pl("GPS fix %.5f,%.5f", lat_dd, lon_dd); }
}

void gps_task(void) {
    while (uart_is_readable(GPS_UART)) {
        char c = uart_getc(GPS_UART);
        if (c == '\n' || c == '\r') {
            if (llen) { line[llen] = 0; parse(line); llen = 0; }
        } else if (llen < (int)sizeof(line) - 1) {
            line[llen++] = c;
        } else llen = 0;
    }
}

bool   gps_has_fix(void) { return has_fix; }
double gps_lat(void)     { return lat_dd; }
double gps_lon(void)     { return lon_dd; }
int    gps_sats(void)    { return sats; }
bool   gps_present(void) { return present; }
