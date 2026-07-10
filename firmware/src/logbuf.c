/** IONITY PicoLink — ring-buffered logging */
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include "pico/stdlib.h"
#include "pico/mutex.h"
#include "tusb.h"
#include "logbuf.h"
#include "picolink.h"

static char     lines[LOG_LINES][LOG_LINE_LEN];
static uint32_t head;          /* next slot to write                    */
static uint32_t total;         /* lines ever written                    */
static uint32_t cdc_sent;      /* lines already pushed to CDC           */
static mutex_t  lock;

void log_init(void) {
    mutex_init(&lock);
    memset(lines, 0, sizeof(lines));
    head = total = cdc_sent = 0;
}

void logf_pl(const char *fmt, ...) {
    char tmp[LOG_LINE_LEN];
    uint32_t ms = to_ms_since_boot(get_absolute_time());
    int n = snprintf(tmp, sizeof(tmp), "[%6lu.%03lu] ",
                     (unsigned long)(ms / 1000), (unsigned long)(ms % 1000));
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(tmp + n, sizeof(tmp) - (size_t)n, fmt, ap);
    va_end(ap);

    mutex_enter_blocking(&lock);
    strncpy(lines[head], tmp, LOG_LINE_LEN - 1);
    lines[head][LOG_LINE_LEN - 1] = 0;
    head = (head + 1) % LOG_LINES;
    total++;
    mutex_exit(&lock);
}

const char *log_get(int idx) {
    if (idx < 0 || (uint32_t)idx >= LOG_LINES || (uint32_t)idx >= total) return NULL;
    uint32_t slot = (head + LOG_LINES - 1 - (uint32_t)idx) % LOG_LINES;
    return lines[slot];
}

uint32_t log_seq(void) { return total; }

void log_pump_cdc(void) {
    if (!tud_cdc_connected()) { cdc_sent = total; return; }

    /* if we fell far behind, resync to the oldest retained line */
    if (total - cdc_sent > LOG_LINES) cdc_sent = total - LOG_LINES;

    while (cdc_sent < total) {
        uint32_t back = total - cdc_sent;              /* 1..LOG_LINES  */
        const char *l = log_get((int)back - 1);
        if (!l) { cdc_sent++; continue; }
        uint32_t need = (uint32_t)strlen(l) + 8;
        if (tud_cdc_write_available() < need) break;   /* try later     */
        tud_cdc_write_str("LOG ");
        tud_cdc_write_str(l);
        tud_cdc_write_str("\r\n");
        cdc_sent++;
    }
    tud_cdc_write_flush();
}
