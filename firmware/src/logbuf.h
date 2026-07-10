/** IONITY PicoLink — ring-buffered logging (OLED + CDC + host sync) */
#ifndef LOGBUF_H
#define LOGBUF_H

#include <stdint.h>
#include <stdbool.h>

#define LOG_LINE_LEN   64
#define LOG_LINES      32

void log_init(void);
void logf_pl(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
/* newest-first access for UI: idx 0 = latest. Returns NULL past end. */
const char *log_get(int idx);
uint32_t log_seq(void);              /* increments on every new line   */
/* drain unsent lines to CDC (called from main loop) */
void log_pump_cdc(void);

#endif
