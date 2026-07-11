/**
 * AEDI command bar — a tiny on-device natural-language intent parser.
 * Turns free text ("show trackers", "scan wifi", "locate me", "export",
 * "turn bluetooth off", "connect ble") into concrete app actions. No cloud;
 * pure pattern matching so it works offline.
 *
 * Returns { ok, say, tab?, send?, act? } — the caller performs tab/send/act.
 */
export function parseCommand(text) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return { ok: false, say: '' };

  const m = (re) => re.test(t);

  /* navigation */
  if (m(/\b(security|threat|evil|intrud|tracker)/)) return { ok: true, tab: 'Security', say: 'Opening Security.' };
  if (m(/\b(recon|radar|survey|map|area)/))        return { ok: true, tab: 'Recon', say: 'Opening Recon / area radar.' };
  if (m(/\bwifi|wi-fi|network|ssid|ap\b/))          return { ok: true, tab: 'WiFi Radar', send: 'WIFI', say: 'Opening WiFi radar and rescanning.' };
  if (m(/\bble\b|gatt|characteristic|service/))     return { ok: true, tab: 'BLE', say: 'Opening BLE explorer.' };
  if (m(/\bclassic|pair|headset|bluetooth device/)) return { ok: true, tab: 'Bluetooth', say: 'Opening Bluetooth (Classic).' };
  if (m(/\blog|console|serial/))                    return { ok: true, tab: 'Logs', say: 'Opening logs.' };
  if (m(/\bsetting|autorun|startup|launch at/))     return { ok: true, tab: 'Settings', say: 'Opening settings.' };
  if (m(/\bdashboard|home|status|overview/))        return { ok: true, tab: 'Dashboard', say: 'Opening dashboard.' };

  /* radio control */
  if (m(/(turn|switch).*(bluetooth|radio|bt).*(off|down)/) || m(/\b(bt|radio) off\b/))
    return { ok: true, send: 'BT OFF', say: 'Turning the radio off.' };
  if (m(/(turn|switch).*(bluetooth|radio|bt).*(on|up)/) || m(/\b(bt|radio) on\b/))
    return { ok: true, send: 'BT ON', say: 'Turning the radio on.' };
  if (m(/\bdetach|unplug/))                          return { ok: true, send: 'DETACH', say: 'Detaching USB.' };
  if (m(/\bbootloader|flash mode|update firmware/))  return { ok: true, send: 'BOOTLOADER', say: 'Rebooting into the bootloader.' };
  if (m(/\bping\b/))                                 return { ok: true, send: 'PING', say: 'Pinging the dongle.' };

  /* scans / actions */
  if (m(/scan.*wifi|wifi.*scan/))                    return { ok: true, tab: 'WiFi Radar', send: 'WIFI', say: 'Scanning WiFi.' };
  if (m(/scan.*ble|ble.*scan|scan.*bluetooth/))      return { ok: true, tab: 'BLE', act: 'ble-scan', say: 'Starting a BLE scan.' };
  if (m(/export|save survey|dump|report/))           return { ok: true, tab: 'Recon', act: 'export', say: 'Exporting the survey.' };
  if (m(/locate|where am i|position|gps|geoloc/))    return { ok: true, tab: 'Recon', act: 'locate', say: 'Estimating location.' };
  if (m(/brief|summar|what.?s (around|happening)/))  return { ok: true, tab: 'Dashboard', act: 'briefing', say: 'Generating a briefing.' };
  if (m(/update|upgrade|newer|pull/))                return { ok: true, act: 'update', say: 'Checking GitHub for updates.' };

  return { ok: false, say: `Not sure how to "${text}". Try: scan wifi, show trackers, locate me, export, bluetooth off, update.` };
}

/* suggestions shown under the command bar */
export const COMMAND_HINTS = [
  'show trackers', 'scan wifi', 'locate me', 'export survey',
  'open BLE', 'bluetooth off', 'check for updates'
];
