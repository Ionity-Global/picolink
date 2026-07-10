/** IONITY PicoLink — SH1107 driver for Waveshare Pico-OLED-1.3 (SPI) */
#ifndef OLED_H
#define OLED_H

#include <stdint.h>
#include <stdbool.h>

/* If your unit shows a mirrored/upside-down image, flip these. */
#ifndef OLED_ROTATE_180
#define OLED_ROTATE_180 0
#endif

void oled_init(void);
void oled_clear(void);
void oled_pixel(int x, int y, bool on);
void oled_hline(int x0, int x1, int y, bool on);
void oled_fill_rect(int x, int y, int w, int h, bool on);
void oled_text(int x, int y, const char *s);            /* 6px advance  */
void oled_text_inv(int x, int y, const char *s);        /* inverted     */
void oled_flush(void);
void oled_power(bool on);                                /* display on/off */

#endif
