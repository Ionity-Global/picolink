/**
 * IONITY PicoLink — USB descriptors
 * Composite: Bluetooth HCI (class E0/01/01, native drivers on Win/Linux)
 *          + CDC ACM (logs & control) + MSC (onboard installer disk)
 */
#include "tusb.h"
#include "pico/unique_id.h"
#include "picolink.h"

#define USB_VID   0x2E8A          /* Raspberry Pi */
#define USB_PID   0x986A          /* IONITY PicoLink (Policy 986 AED)     */
#define USB_BCD   0x0200

/* ------------------------------------------------------------------ */
/* Device descriptor                                                   */
/* NB: class must be declared per-interface (Misc/IAD) so the host     */
/* binds BTHUSB/btusb to the BT function and CDC/MSC to theirs.        */
/* ------------------------------------------------------------------ */
tusb_desc_device_t const desc_device = {
    .bLength            = sizeof(tusb_desc_device_t),
    .bDescriptorType    = TUSB_DESC_DEVICE,
    .bcdUSB             = USB_BCD,
    .bDeviceClass       = TUSB_CLASS_MISC,
    .bDeviceSubClass    = MISC_SUBCLASS_COMMON,
    .bDeviceProtocol    = MISC_PROTOCOL_IAD,
    .bMaxPacketSize0    = CFG_TUD_ENDPOINT0_SIZE,
    .idVendor           = USB_VID,
    .idProduct          = USB_PID,
    .bcdDevice          = 0x0100,
    .iManufacturer      = 0x01,
    .iProduct           = 0x02,
    .iSerialNumber      = 0x03,
    .bNumConfigurations = 0x01
};

uint8_t const *tud_descriptor_device_cb(void) {
    return (uint8_t const *)&desc_device;
}

/* ------------------------------------------------------------------ */
/* Configuration descriptor                                            */
/* ------------------------------------------------------------------ */
enum {
    ITF_NUM_BTH = 0,
    ITF_NUM_BTH_ISO,
    ITF_NUM_CDC,
    ITF_NUM_CDC_DATA,
    ITF_NUM_MSC,
    ITF_NUM_TOTAL
};

#define EPNUM_BT_EVT     0x81   /* interrupt IN  — HCI events           */
#define EPNUM_BT_ACL_OUT 0x02   /* bulk OUT      — ACL host->ctrl       */
#define EPNUM_BT_ACL_IN  0x82   /* bulk IN       — ACL ctrl->host       */
#define EPNUM_CDC_NOTIF  0x84
#define EPNUM_CDC_OUT    0x05
#define EPNUM_CDC_IN     0x85
#define EPNUM_MSC_OUT    0x06
#define EPNUM_MSC_IN     0x86

#define CONFIG_TOTAL_LEN (TUD_CONFIG_DESC_LEN + TUD_BTH_DESC_LEN + TUD_CDC_DESC_LEN + TUD_MSC_DESC_LEN)

uint8_t const desc_configuration[] = {
    /* config: itf count, string idx, total len, attribute, power (mA) */
    TUD_CONFIG_DESCRIPTOR(1, ITF_NUM_TOTAL, 0, CONFIG_TOTAL_LEN, 0x00, 250),

    /* Bluetooth HCI: itf, stridx, ep-evt, evt size, interval, ep-acl-IN, ep-acl-OUT, acl size */
    TUD_BTH_DESCRIPTOR(ITF_NUM_BTH, 0, EPNUM_BT_EVT, CFG_TUD_BTH_EVENT_EPSIZE, 1,
                       EPNUM_BT_ACL_IN, EPNUM_BT_ACL_OUT, CFG_TUD_BTH_DATA_EPSIZE, 0, 9),

    /* CDC: itf, string idx, ep notif, notif size, ep out, ep in, size */
    TUD_CDC_DESCRIPTOR(ITF_NUM_CDC, 4, EPNUM_CDC_NOTIF, 8, EPNUM_CDC_OUT, EPNUM_CDC_IN, 64),

    /* MSC: itf, string idx, ep out, ep in, size */
    TUD_MSC_DESCRIPTOR(ITF_NUM_MSC, 5, EPNUM_MSC_OUT, EPNUM_MSC_IN, 64),
};

uint8_t const *tud_descriptor_configuration_cb(uint8_t index) {
    (void)index;
    return desc_configuration;
}

/* ------------------------------------------------------------------ */
/* String descriptors                                                  */
/* ------------------------------------------------------------------ */
static char serial_str[2 * PICO_UNIQUE_BOARD_ID_SIZE_BYTES + 1];

char const *string_desc_arr[] = {
    (const char[]){0x09, 0x04},        /* 0: language = English (US)    */
    "IONITY Global",                   /* 1: manufacturer               */
    "IONITY PicoLink BT Dongle",       /* 2: product                    */
    serial_str,                        /* 3: serial (chip unique id)    */
    "PicoLink Log Console",            /* 4: CDC                        */
    "IONITY Installer Disk",           /* 5: MSC                        */
};

static uint16_t _desc_str[32];

uint16_t const *tud_descriptor_string_cb(uint8_t index, uint16_t langid) {
    (void)langid;
    uint8_t chr_count;

    if (index == 0) {
        memcpy(&_desc_str[1], string_desc_arr[0], 2);
        chr_count = 1;
    } else {
        if (index >= sizeof(string_desc_arr) / sizeof(string_desc_arr[0])) return NULL;

        if (index == 3 && serial_str[0] == 0) {
            pico_get_unique_board_id_string(serial_str, sizeof(serial_str));
        }

        const char *str = string_desc_arr[index];
        chr_count = (uint8_t)strlen(str);
        if (chr_count > 31) chr_count = 31;

        for (uint8_t i = 0; i < chr_count; i++) {
            _desc_str[1 + i] = str[i];
        }
    }

    _desc_str[0] = (uint16_t)((TUSB_DESC_STRING << 8) | (2 * chr_count + 2));
    return _desc_str;
}
