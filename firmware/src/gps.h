/**
 * IONITY PicoLink — optional GPS (UART NMEA) for geotagging sightings.
 * Reads $--GGA / $--RMC on UART0 @ 9600. Harmless if no module is attached
 * (just reports no fix). Gives the survey/DB real coordinates offline.
 */
#ifndef GPS_H
#define GPS_H

#include <stdbool.h>

void   gps_init(void);
void   gps_task(void);      /* poll UART, parse lines — call often */
bool   gps_has_fix(void);
double gps_lat(void);       /* signed decimal degrees */
double gps_lon(void);
int    gps_sats(void);
bool   gps_present(void);   /* any NMEA seen since boot */

#endif
