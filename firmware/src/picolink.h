/**
 * IONITY PicoLink — common configuration
 * © 2026 Ionity Global (Pty) Ltd — MIT licensed (code). POLICY 986 AED.
 */
#ifndef PICOLINK_H
#define PICOLINK_H

#include <stdint.h>
#include <stdbool.h>

#define PICOLINK_VERSION      "1.1.0"
#define PICOLINK_PRODUCT      "IONITY PicoLink"
#define PICOLINK_URL          "https://github.com/Ionity-Global/picolink"

/* ---- Waveshare Pico-OLED-1.3 (SH1107, SPI1) ---- */
#define OLED_SPI_PORT    spi1
#define OLED_PIN_CLK     10   /* SCK  */
#define OLED_PIN_DIN     11   /* MOSI */
#define OLED_PIN_CS       9
#define OLED_PIN_DC       8
#define OLED_PIN_RST     12
#define OLED_WIDTH      128
#define OLED_HEIGHT      64

/* ---- Keys on the Waveshare board ---- */
#define PIN_KEY0         15   /* radio toggle / long-press = USB detach   */
#define PIN_KEY1         17   /* cycle screens                            */

/* ---- Radio / bridge state ---- */
typedef enum {
    RADIO_OFF = 0,       /* bridge gated, HCI reset issued               */
    RADIO_ON  = 1,       /* bridging HCI <-> USB                         */
    RADIO_DETACHED = 2,  /* USB soft-detached (host sees unplug)         */
} radio_state_t;

typedef struct {
    volatile radio_state_t radio;
    volatile bool     usb_mounted;
    volatile bool     cdc_connected;
    volatile uint32_t tx_pkts;
    volatile uint32_t rx_pkts;
    volatile uint32_t tx_bytes;
    volatile uint32_t rx_bytes;
    volatile uint32_t drops;
    char              board[16];
    char              serial[17];
} picolink_state_t;

extern picolink_state_t g_pl;

void  picolink_request_radio(bool on);
void  picolink_request_detach_toggle(void);
float picolink_core_temp_c(void);           /* RP2040 on-die sensor */

#endif
