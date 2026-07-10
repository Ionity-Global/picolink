/** IONITY PicoLink — button handling (active-low keys on the Waveshare hat) */
#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include "picolink.h"
#include "buttons.h"

#define DEBOUNCE_MS   30
#define LONGPRESS_MS 700

typedef struct {
    uint     pin;
    bool     pressed;
    uint32_t t_down;
    bool     long_fired;
} key_t;

static key_t k0, k1;

void buttons_init(void) {
    k0 = (key_t){ .pin = PIN_KEY0 };
    k1 = (key_t){ .pin = PIN_KEY1 };
    for (int i = 0; i < 2; i++) {
        uint pin = i ? PIN_KEY1 : PIN_KEY0;
        gpio_init(pin);
        gpio_set_dir(pin, GPIO_IN);
        gpio_pull_up(pin);
    }
}

static btn_event_t poll_key(key_t *k, btn_event_t ev_short, btn_event_t ev_long) {
    uint32_t now = to_ms_since_boot(get_absolute_time());
    bool down = !gpio_get(k->pin);          /* active low */

    if (down && !k->pressed) {
        k->pressed = true;
        k->t_down = now;
        k->long_fired = false;
    } else if (down && k->pressed && !k->long_fired && (now - k->t_down) >= LONGPRESS_MS) {
        k->long_fired = true;
        return ev_long;
    } else if (!down && k->pressed) {
        k->pressed = false;
        if (!k->long_fired && (now - k->t_down) >= DEBOUNCE_MS) return ev_short;
    }
    return BTN_NONE;
}

btn_event_t buttons_poll(void) {
    btn_event_t e = poll_key(&k0, BTN_KEY0_SHORT, BTN_KEY0_LONG);
    if (e != BTN_NONE) return e;
    return poll_key(&k1, BTN_KEY1_SHORT, BTN_KEY1_LONG);
}
