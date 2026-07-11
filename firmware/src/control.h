/** IONITY PicoLink — CDC control protocol (console app <-> dongle) */
#ifndef CONTROL_H
#define CONTROL_H

void control_task(void);              /* parse CDC input, emit STAT lines   */
void control_emit_alert(const void *dev);  /* emit ALERT {json} for a device */

#endif
