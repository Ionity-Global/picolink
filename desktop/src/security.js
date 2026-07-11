/**
 * AEDI Security — on-device threat reasoning over the PicoLink's passive view.
 *
 * Turns raw sightings into named findings + a 0-100 posture score:
 *   WiFi:  evil-twin / rogue AP, open & weak networks, cloned SSIDs
 *   BLE:   tracker-following-you, advertising floods, dwelling unknowns
 * All heuristic, all local. `trusted` is a Set of MAC/BSSID strings the user
 * has marked safe (persisted by the app).
 */

const TRACKER_CATS = { findmy: 'Apple Find My', tile: 'Tile', smarttag: 'Samsung SmartTag', ibeacon: 'iBeacon', eddystone: 'Eddystone beacon' };

export function analyzeSecurity(s, trusted = new Set()) {
  const findings = [];
  const wifi = s.wifi || [];
  const ble = s.ble || [];
  const bt = s.btClassic || [];
  const st = s.stat || {};
  const uptime = st.uptime_ms || 0;

  /* ---------- WiFi: evil twin / cloned SSID ---------- */
  const bySsid = {};
  wifi.forEach(n => {
    if (!n.ssid) return;
    (bySsid[n.ssid] = bySsid[n.ssid] || []).push(n);
  });
  Object.entries(bySsid).forEach(([ssid, aps]) => {
    const bssids = new Set(aps.map(a => a.bssid).filter(Boolean));
    const secs = new Set(aps.map(a => a.sec));
    if (bssids.size > 1 && (secs.has('open') && secs.size > 1)) {
      findings.push({ sev: 'crit', icon: 'ti-alert-octagon', title: 'Possible evil-twin AP',
        text: `“${ssid}” is broadcast by ${bssids.size} radios with mixed security (${[...secs].join(', ')}) — a classic evil-twin pattern. Don’t join the open one.` });
    } else if (bssids.size > 2) {
      findings.push({ sev: 'warn', icon: 'ti-access-point', title: 'SSID on many radios',
        text: `“${ssid}” appears on ${bssids.size} BSSIDs. Usually a mesh/repeater — but verify it’s yours before joining.` });
    }
  });

  /* ---------- WiFi: open & weak networks ---------- */
  const open = wifi.filter(n => n.sec === 'open' && n.ssid);
  const wep = wifi.filter(n => n.sec === 'wep');
  if (open.length) findings.push({ sev: 'warn', icon: 'ti-lock-open', title: `${open.length} open network${open.length > 1 ? 's' : ''}`,
    text: `Unencrypted: ${open.slice(0, 3).map(n => '“' + n.ssid + '”').join(', ')}${open.length > 3 ? '…' : ''}. Traffic on these is sniffable; avoid for anything sensitive.` });
  if (wep.length) findings.push({ sev: 'warn', icon: 'ti-lock-open', title: `${wep.length} WEP network${wep.length > 1 ? 's' : ''}`,
    text: `WEP is broken and trivially cracked. Treat as open.` });

  /* ---------- BLE: tracker following you ---------- */
  const all = [...ble, ...bt];
  const trackers = [];
  all.forEach(d => {
    if (trusted.has(d.addr)) return;
    const dwell = uptime && d.first_ms != null ? (uptime - d.first_ms) : 0;
    const near = d.rssi !== -127 && d.rssi > -75;
    const knownTracker = d.cat && TRACKER_CATS[d.cat];
    const persistent = dwell > 120000;            /* >2 min in range        */
    if (knownTracker && near) {
      trackers.push({ d, why: `${TRACKER_CATS[d.cat]}${persistent ? ', following ' + Math.round(dwell / 60000) + ' min' : ''}` });
    } else if (persistent && near && d.atype === 'random' && !d.name) {
      trackers.push({ d, why: `unknown rotating-address device near for ${Math.round(dwell / 60000)} min` });
    }
  });
  trackers.slice(0, 4).forEach(t => findings.push({
    sev: t.d.cat && TRACKER_CATS[t.d.cat] ? 'crit' : 'warn', icon: 'ti-crosshair',
    title: 'Possible tracker near you', addr: t.d.addr,
    text: `${t.d.name || t.d.addr} — ${t.why}, ~${t.d.dist_m?.toFixed?.(1)} m. If it isn’t yours, it may be tracking your location.` }));

  /* ---------- BLE: advertising flood (spam attack) ---------- */
  if (ble.length >= 16) findings.push({ sev: 'warn', icon: 'ti-wave-square', title: 'BLE advertising flood',
    text: `${ble.length}+ BLE advertisers at once can indicate a BLE-spam attack (e.g. Flipper). Nearby phones may see popup spam.` });

  /* ---------- positive note ---------- */
  if (findings.length === 0) findings.push({ sev: 'ok', icon: 'ti-shield-check', title: 'No threats detected',
    text: 'No evil-twin APs, open-network clones, trackers or BLE floods in view right now.' });

  /* ---------- posture score ---------- */
  let score = 100;
  findings.forEach(f => { score -= f.sev === 'crit' ? 25 : f.sev === 'warn' ? 10 : 0; });
  if (!s.connected) score = 0;
  score = Math.max(5, Math.min(100, score));
  const band = score >= 80 ? 'secure' : score >= 55 ? 'caution' : 'at risk';
  const threats = findings.filter(f => f.sev === 'crit' || f.sev === 'warn').length;

  const headline = !s.connected ? 'Waiting for the PicoLink…'
    : threats === 0 ? 'Airspace looks secure.'
    : `${threats} thing${threats > 1 ? 's' : ''} worth your attention.`;

  return { headline, findings, score, band, threats };
}
