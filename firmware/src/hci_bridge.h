/** IONITY PicoLink — CYW43439 HCI <-> USB BTH transparent bridge */
#ifndef HCI_BRIDGE_H
#define HCI_BRIDGE_H

#include <stdbool.h>

bool hci_bridge_init(void);        /* brings up CYW43 BT core            */
void hci_bridge_task(void);        /* pump controller->host, call often  */
void hci_bridge_set_enabled(bool on);
bool hci_bridge_enabled(void);

#endif
