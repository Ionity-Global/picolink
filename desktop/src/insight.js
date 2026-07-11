/**
 * AEDI Insight — on-device heuristic "signal intelligence".
 *
 * Reads the live PicoLink telemetry (WiFi RADAR, BLE + Classic monitor,
 * link stats, core temp) and produces a plain-English read of the RF
 * environment plus a 0-100 health score. Fully local, no cloud — the
 * "AI touch" is the reasoning layer that turns raw dBm into decisions.
 */
export function aiInsight(s) {
  const points = [];
  const wifi = s.wifi || [];
  const ble = s.ble || [];
  const bt = s.btClassic || [];
  const st = s.stat;

  /* ---- WiFi channel congestion ---- */
  if (wifi.length) {
    const perCh = {};
    wifi.forEach(n => { perCh[n.ch] = (perCh[n.ch] || 0) + 1; });
    const busiest = Object.entries(perCh).sort((a, b) => b[1] - a[1])[0];
    const best = [1, 6, 11].map(c => [c, perCh[c] || 0]).sort((a, b) => a[1] - b[1])[0];
    const strongest = [...wifi].sort((a, b) => b.rssi - a.rssi)[0];
    points.push({ sev: 'info', icon: 'ti-wifi',
      text: `${wifi.length} WiFi networks in range; strongest “${strongest.ssid || 'hidden'}” at ${strongest.rssi} dBm.` });
    if (busiest && busiest[1] >= 3) {
      points.push({ sev: 'warn', icon: 'ti-alert-triangle',
        text: `Channel ${busiest[0]} is crowded (${busiest[1]} APs). For 2.4 GHz, channel ${best[0]} is the clearest of 1/6/11.` });
    } else {
      points.push({ sev: 'ok', icon: 'ti-circle-check',
        text: `2.4 GHz air is relatively clear — channel ${best[0]} is the least crowded.` });
    }
  } else {
    points.push({ sev: 'info', icon: 'ti-wifi', text: 'WiFi radar warming up…' });
  }

  /* ---- presence estimate from BLE + Classic ---- */
  const near = [...ble, ...bt].filter(d => d.rssi > -70 && d.rssi !== -127);
  const total = ble.length + bt.length;
  if (total > 0) {
    const nearest = [...ble, ...bt].filter(d => d.dist_m != null).sort((a, b) => a.dist_m - b.dist_m)[0];
    const presence = near.length >= 4 ? 'busy' : near.length >= 1 ? 'occupied' : 'quiet';
    points.push({ sev: 'info', icon: 'ti-radar',
      text: `${total} Bluetooth device${total === 1 ? '' : 's'} sighted (${ble.length} BLE, ${bt.length} classic); ${near.length} within ~5 m → space looks ${presence}.` });
    if (nearest) points.push({ sev: 'info', icon: 'ti-current-location',
      text: `Closest: “${nearest.name || nearest.addr}” ≈ ${nearest.dist_m.toFixed(1)} m away.` });
  }

  /* ---- link health ---- */
  if (st) {
    if (st.drops > 0) points.push({ sev: 'warn', icon: 'ti-packet',
      text: `${st.drops} HCI packets dropped — heavy traffic or a stalled host lane.` });
    if (st.temp_c != null && st.temp_c > 55) points.push({ sev: 'warn', icon: 'ti-temperature',
      text: `Core running warm at ${st.temp_c.toFixed(1)} °C — ensure airflow.` });
    if (st.radio !== 'on') points.push({ sev: 'warn', icon: 'ti-bluetooth-off',
      text: `Radio is ${st.radio}. Turn it on to bridge Bluetooth.` });
  }

  /* ---- 0-100 RF environment score ---- */
  let score = 100;
  if (wifi.length > 10) score -= 15; else if (wifi.length > 6) score -= 8;
  const maxCh = wifi.length ? Math.max(...Object.values(wifi.reduce((a, n) => ((a[n.ch] = (a[n.ch] || 0) + 1), a), {}))) : 0;
  if (maxCh >= 4) score -= 15; else if (maxCh >= 3) score -= 8;
  if (near.length >= 6) score -= 10;
  if (st?.drops > 0) score -= 10;
  if (st?.temp_c > 60) score -= 10;
  if (st?.radio && st.radio !== 'on') score -= 25;
  score = Math.max(5, Math.min(100, Math.round(score)));
  const band = score >= 80 ? 'clear' : score >= 55 ? 'moderate' : 'congested';

  const headline = !s.connected ? 'Waiting for the PicoLink…'
    : band === 'clear' ? 'RF environment is clean and healthy.'
    : band === 'moderate' ? 'RF environment is workable with some congestion.'
    : 'RF environment is congested — expect interference.';

  if (points.length === 0) points.push({ sev: 'info', icon: 'ti-hourglass', text: 'Gathering telemetry…' });
  return { headline, points, score, band };
}
