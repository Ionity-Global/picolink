/**
 * IONITY PicoLink — SH1107 128x64 OLED driver (Waveshare Pico-OLED-1.3, 4-wire SPI)
 *
 * Physical panel: 64 SEG (columns) x 128 COM (rows), 16 pages of 8 rows.
 * We keep the framebuffer in physical layout and expose a 128x64 landscape
 * drawing API (logical x maps to physical row, logical y to physical column).
 */
#include <string.h>
#include "pico/stdlib.h"
#include "hardware/spi.h"
#include "hardware/gpio.h"
#include "picolink.h"
#include "oled.h"
#include "font.h"

#define PAGES 16          /* 128 rows / 8   */
#define COLS  64          /* physical SEG   */

static uint8_t fb[PAGES * COLS];   /* [page * COLS + col] */

static inline void cs(bool sel)  { gpio_put(OLED_PIN_CS, !sel); }
static inline void dc_cmd(void)  { gpio_put(OLED_PIN_DC, 0); }
static inline void dc_data(void) { gpio_put(OLED_PIN_DC, 1); }

static void wr_cmd(uint8_t c) {
    cs(true); dc_cmd();
    spi_write_blocking(OLED_SPI_PORT, &c, 1);
    cs(false);
}

static void wr_data(const uint8_t *d, size_t n) {
    cs(true); dc_data();
    spi_write_blocking(OLED_SPI_PORT, d, n);
    cs(false);
}

void oled_init(void) {
    spi_init(OLED_SPI_PORT, 10 * 1000 * 1000);
    gpio_set_function(OLED_PIN_CLK, GPIO_FUNC_SPI);
    gpio_set_function(OLED_PIN_DIN, GPIO_FUNC_SPI);
    gpio_init(OLED_PIN_CS);  gpio_set_dir(OLED_PIN_CS, GPIO_OUT);  gpio_put(OLED_PIN_CS, 1);
    gpio_init(OLED_PIN_DC);  gpio_set_dir(OLED_PIN_DC, GPIO_OUT);
    gpio_init(OLED_PIN_RST); gpio_set_dir(OLED_PIN_RST, GPIO_OUT);

    /* hardware reset */
    gpio_put(OLED_PIN_RST, 1); sleep_ms(20);
    gpio_put(OLED_PIN_RST, 0); sleep_ms(20);
    gpio_put(OLED_PIN_RST, 1); sleep_ms(20);

    /* init sequence per Waveshare OLED_1in3 (SH1107) reference */
    static const uint8_t seq[] = {
        0xAE,             /* display off                */
        0x00, 0x10,       /* column low / high          */
        0xB0,             /* page 0                     */
        0xDC, 0x00,       /* display start line 0       */
        0x81, 0x6F,       /* contrast                   */
        0x21,             /* vertical (page) addressing */
        0xA0,             /* segment remap              */
        0xC0,             /* COM scan direction         */
        0xA4,             /* entire display from RAM    */
        0xA6,             /* normal (not inverted)      */
        0xA8, 0x3F,       /* multiplex 1/64             */
        0xD3, 0x60,       /* display offset 0x60        */
        0xD5, 0x41,       /* osc divide                 */
        0xD9, 0x22,       /* pre-charge                 */
        0xDB, 0x35,       /* VCOMH                      */
        0xAD, 0x8A,       /* DC-DC on                   */
    };
    for (size_t i = 0; i < sizeof(seq); i++) wr_cmd(seq[i]);
    sleep_ms(100);
    wr_cmd(0xAF);         /* display on */

    oled_clear();
    oled_flush();
}

void oled_power(bool on) { wr_cmd(on ? 0xAF : 0xAE); }

void oled_clear(void) { memset(fb, 0, sizeof(fb)); }

void oled_pixel(int x, int y, bool on) {
    if ((unsigned)x >= OLED_WIDTH || (unsigned)y >= OLED_HEIGHT) return;
#if OLED_ROTATE_180
    x = OLED_WIDTH - 1 - x;
    y = OLED_HEIGHT - 1 - y;
#endif
    int row = x;               /* physical row  = logical x  */
    int col = OLED_HEIGHT - 1 - y; /* physical col = flipped y */
    uint8_t *b = &fb[(row >> 3) * COLS + col];
    uint8_t m = (uint8_t)(1u << (row & 7));
    if (on) *b |= m; else *b &= (uint8_t)~m;
}

void oled_hline(int x0, int x1, int y, bool on) {
    for (int x = x0; x <= x1; x++) oled_pixel(x, y, on);
}

void oled_fill_rect(int x, int y, int w, int h, bool on) {
    for (int j = 0; j < h; j++)
        for (int i = 0; i < w; i++)
            oled_pixel(x + i, y + j, on);
}

static void draw_char(int x, int y, char ch, bool inv) {
    if (ch < 0x20 || ch > 0x7F) ch = '?';
    const uint8_t *g = font5x7[ch - 0x20];
    for (int cx = 0; cx < 6; cx++) {
        uint8_t bits = (cx < 5) ? g[cx] : 0;
        for (int cy = 0; cy < 8; cy++) {
            bool on = (bits >> cy) & 1;
            oled_pixel(x + cx, y + cy, inv ? !on : on);
        }
    }
}

void oled_text(int x, int y, const char *s) {
    while (*s) { draw_char(x, y, *s++, false); x += 6; }
}

void oled_text_inv(int x, int y, const char *s) {
    while (*s) { draw_char(x, y, *s++, true); x += 6; }
}

void oled_flush(void) {
    for (int page = 0; page < PAGES; page++) {
        wr_cmd((uint8_t)(0xB0 + page));
        wr_cmd(0x00);      /* column low  */
        wr_cmd(0x10);      /* column high */
        wr_data(&fb[page * COLS], COLS);
    }
}
