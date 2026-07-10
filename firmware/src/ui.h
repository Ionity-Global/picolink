/** IONITY PicoLink — OLED user interface */
#ifndef UI_H
#define UI_H

void ui_init(void);          /* splash                       */
void ui_next_screen(void);
void ui_toggle_display(void);
void ui_task(void);          /* re-render if dirty / periodic */

#endif
