/** IONITY PicoLink — 2-key input with debounce + long-press */
#ifndef BUTTONS_H
#define BUTTONS_H

#include <stdbool.h>

typedef enum {
    BTN_NONE = 0,
    BTN_KEY0_SHORT,   /* radio on/off            */
    BTN_KEY0_LONG,    /* USB detach / reattach   */
    BTN_KEY1_SHORT,   /* next screen             */
    BTN_KEY1_LONG,    /* display power           */
} btn_event_t;

void buttons_init(void);
btn_event_t buttons_poll(void);   /* call from main loop */

#endif
