/**
 * IONITY PicoLink — TinyUSB configuration
 * Composite device: Bluetooth HCI (BTH) + CDC (logs/control) + MSC (onboard installer disk)
 */
#ifndef _TUSB_CONFIG_H_
#define _TUSB_CONFIG_H_

#ifdef __cplusplus
extern "C" {
#endif

#ifndef CFG_TUSB_MCU
#error CFG_TUSB_MCU must be defined (set by pico-sdk)
#endif

#ifndef CFG_TUSB_OS
#define CFG_TUSB_OS           OPT_OS_PICO
#endif

#ifndef CFG_TUSB_DEBUG
#define CFG_TUSB_DEBUG        0
#endif

#define CFG_TUD_ENABLED       1
#define CFG_TUSB_RHPORT0_MODE (OPT_MODE_DEVICE | OPT_MODE_FULL_SPEED)

#ifndef CFG_TUSB_MEM_SECTION
#define CFG_TUSB_MEM_SECTION
#endif

#ifndef CFG_TUSB_MEM_ALIGN
#define CFG_TUSB_MEM_ALIGN    __attribute__ ((aligned(4)))
#endif

/* ---- Device stack ---- */
#define CFG_TUD_ENDPOINT0_SIZE   64

/* Classes */
#define CFG_TUD_BTH              1
#define CFG_TUD_CDC              1
#define CFG_TUD_MSC              1
#define CFG_TUD_HID              0
#define CFG_TUD_MIDI             0
#define CFG_TUD_VENDOR           0

/* BTH: no SCO/ISO audio alt-settings in v1 (keeps EP budget + no audio bridge) */
#define CFG_TUD_BTH_ISO_ALT_COUNT  2
#define CFG_TUD_BTH_EVENT_EPSIZE   64
#define CFG_TUD_BTH_DATA_EPSIZE    64

/* CDC buffers */
#define CFG_TUD_CDC_RX_BUFSIZE   512
#define CFG_TUD_CDC_TX_BUFSIZE   2048
#define CFG_TUD_CDC_EP_BUFSIZE   64

/* MSC buffer */
#define CFG_TUD_MSC_EP_BUFSIZE   512

#ifdef __cplusplus
}
#endif

#endif
