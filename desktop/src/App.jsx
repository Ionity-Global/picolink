/**
 * IONITY PicoLink Console — renderer UI (tabbed)
 * © 2026 Ionity Global (Pty) Ltd — MIT
 *
 * Dashboard · BLE (Web Bluetooth scan/connect/GATT) · Bluetooth Classic
 * (dongle monitor + OS pairing) · WiFi RADAR · Logs — all over one PicoLink.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSerial } from './useSerial.js';
import { aiInsight } from './insight.js';
import { deviceType } from './fingerprint.js';
import { analyzeSecurity } from './security.js';
import { OPTIONAL_SERVICES, gattName, decodeValue, props as charProps } from './gatt.js';

const REPO = 'https://github.com/Ionity-Global/picolink';
const TABS = ['Dashboard', 'Security', 'BLE', 'Bluetooth', 'WiFi Radar', 'Logs'];

/* trusted-device watchlist, persisted locally (Electron renderer) */
function useTrusted() {
  const [trusted, setTrusted] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('picolink.trusted') || '[]')); }
    catch { return new Set(); }
  });
  const save = (set) => { localStorage.setItem('picolink.trusted', JSON.stringify([...set])); setTrusted(new Set(set)); };
  const trust = (addr) => { const n = new Set(trusted); n.add(addr); save(n); };
  const untrust = (addr) => { const n = new Set(trusted); n.delete(addr); save(n); };
  return { trusted, trust, untrust };
}

export default function App() {
  const s = useSerial();
  const tw = useTrusted();
  const [tab, setTab] = useState('Dashboard');
  const [appVer, setAppVer] = useState('');
  const [update, setUpdate] = useState(null);
  const sec = analyzeSecurity(s, tw.trusted);

  useEffect(() => { window.picolink?.version().then(setAppVer); }, []);
  useEffect(() => { window.picolink?.radioState(s.stat?.radio === 'on'); }, [s.stat?.radio]);
  useEffect(() => { window.picolink?.onTrayCmd((cmd) => s.send(cmd)); }, [s]);

  const checkUpdate = async () => {
    setUpdate({ busy: true });
    const r = await window.picolink?.checkUpdate();
    setUpdate(r || { ok: false });
  };
  const applyUpdate = async () => {
    setUpdate({ busy: true, applying: true });
    const r = await window.picolink?.applyUpdate();
    setUpdate({ ...r, applied: r?.ok });
  };

  return (
    <div className="shell">
      <header>
        <div className="brand">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
            <circle cx="12" cy="12" r="11" fill="none" stroke="#00c6ff" strokeWidth="1.6" />
            <path d="M9 5.5v13M9 5.5l6.5 4.2L9 14M9 18.5l6.5-4.2L9 10"
                  fill="none" stroke="#00c6ff" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <h1>IONITY <span>PicoLink</span></h1>
            <p>USB Bluetooth · BLE dongle console</p>
          </div>
        </div>
        <div className="head-right">
          <button className="ghost upd" onClick={checkUpdate} title="Check for updates (online)">
            <span className="ver">v{appVer || '—'}</span> check updates
          </button>
          <div className={`link-pill ${s.connected ? 'on' : ''}`}>
            <i />{s.connected ? 'DONGLE LINKED' : 'SEARCHING…'}
            {!s.connected && <button className="ghost" onClick={() => s.connect(true)}>connect</button>}
          </div>
        </div>
      </header>

      {update && <UpdateBar update={update} onApply={applyUpdate}
                            onRelaunch={() => window.picolink?.relaunch()}
                            onClose={() => setUpdate(null)} />}

      <nav className="tabs">
        {TABS.map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
            {t === 'Security' && sec.threats > 0 && <span className="badge danger">{sec.threats}</span>}
            {t === 'BLE' && s.ble.length > 0 && <span className="badge">{s.ble.length}</span>}
            {t === 'Bluetooth' && s.btClassic.length > 0 && <span className="badge">{s.btClassic.length}</span>}
            {t === 'WiFi Radar' && s.wifi.length > 0 && <span className="badge">{s.wifi.length}</span>}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'Dashboard'  && <Dashboard s={s} />}
        {tab === 'Security'   && <SecurityPanel s={s} sec={sec} tw={tw} />}
        {tab === 'BLE'        && <BlePanel s={s} />}
        {tab === 'Bluetooth'  && <ClassicPanel s={s} />}
        {tab === 'WiFi Radar' && <WifiPanel s={s} />}
        {tab === 'Logs'       && <LogsPanel s={s} />}
      </main>

      <footer className="app-foot">
        © 2026 Ionity Global (Pty) Ltd · ionity.today · works fully offline · {' '}
        <a onClick={() => window.picolink?.openExternal(REPO)}>github.com/Ionity-Global/picolink</a>
      </footer>

      <div className="toasts">
        {s.alerts.slice(0, 4).map(a => (
          <div key={a.key} className="toast" onClick={() => { setTab('Bluetooth'); s.dismissAlert(a.key); }}>
            <i className="ti ti-alert-triangle" aria-hidden />
            <div>
              <b>New {a.kind === 'ble' ? 'BLE' : 'Classic'} device</b>
              <span>{a.name || a.addr} · {a.rssi} dBm · ~{a.dist_m?.toFixed?.(1)} m</span>
            </div>
            <button className="x" onClick={(e) => { e.stopPropagation(); s.dismissAlert(a.key); }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── update bar ─────────────────────────── */
function UpdateBar({ update, onApply, onRelaunch, onClose }) {
  let body;
  if (update.busy && update.applying) body = 'Updating… (git pull + npm install)';
  else if (update.busy) body = 'Checking for updates…';
  else if (update.applied) body = <>Updated. <button className="ghost" onClick={onRelaunch}>Relaunch now</button></>;
  else if (update.behind === false) body = 'You’re on the latest version.';
  else if (update.behind) body = <>Update available ({update.local} → {update.remote}). <button className="ghost" onClick={onApply}>Update &amp; keep working offline</button></>;
  else body = update.out || 'Update check unavailable.';
  return <div className="update-bar"><span>{body}</span><button className="x" onClick={onClose}>×</button></div>;
}

/* ─────────────────────────── dashboard ─────────────────────────── */
function Dashboard({ s }) {
  const st = s.stat;
  const radio = st?.radio ?? 'unknown';
  const insight = aiInsight(s);
  const bytes = (n = 0) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB'
    : n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
  const uptime = (ms = 0) => { const x = Math.floor(ms / 1000);
    return `${Math.floor(x / 3600)}h ${Math.floor((x % 3600) / 60)}m ${x % 60}s`; };

  return (
    <div className="cols">
      <section className="panel">
        <div className="radio-block">
          <div className={`orb ${radio}`} />
          <div>
            <h2>Bluetooth radio</h2>
            <p className="radio-state">{String(radio).toUpperCase()}</p>
          </div>
          <label className="switch" title="Toggle radio">
            <input type="checkbox" checked={radio === 'on'}
                   disabled={!s.connected || radio === 'detached'}
                   onChange={() => s.send(radio === 'on' ? 'BT OFF' : 'BT ON')} />
            <span />
          </label>
        </div>

        <div className="grid">
          <div className="cell"><label>Near / moving</label><b>{st?.near ?? 0}<span className="sub"> / {st?.moving ?? 0}</span></b><small>presence radar</small></div>
          <div className="cell"><label>Core temp</label><b>{st?.temp_c != null ? st.temp_c.toFixed(1) + '°' : '—'}</b><small>{s.id?.board ?? 'RP2350'}</small></div>
          <div className="cell"><label>TX / RX</label><b className="small">{(st?.tx_pkts ?? '—')} / {(st?.rx_pkts ?? '—')}</b><small>{bytes(st?.tx_bytes)} / {bytes(st?.rx_bytes)}</small></div>
          <div className="cell"><label>WiFi link</label><b className="small">{st?.wifi_link ?? 'down'}</b><small>{st?.wifi_join || 'not joined'}</small></div>
        </div>

        <div className="dev-info">
          <span><label>Device</label>{s.id ? `${s.id.product} v${s.id.version}` : '—'}</span>
          <span><label>Board</label>{s.id?.board ?? '—'}</span>
          <span><label>Display</label>{s.id?.display ?? 'Waveshare Pico OLED 1.3'}</span>
          <span><label>Serial</label>{s.id?.serial ?? '—'}</span>
          <span><label>Uptime</label>{st ? uptime(st.uptime_ms) : '—'}</span>
        </div>
      </section>

      <section className="panel insight">
        <h2><i className="ti ti-sparkles" aria-hidden /> AEDI Insight</h2>
        <p className="insight-head">{insight.headline}</p>
        <ul className="insight-list">
          {insight.points.map((p, i) => (
            <li key={i} className={`sev-${p.sev}`}><i className={`ti ${p.icon}`} aria-hidden /> {p.text}</li>
          ))}
        </ul>
        <div className="insight-foot">
          <span className="mono">RF environment score</span>
          <div className="score-bar"><div style={{ width: insight.score + '%' }} className={`s-${insight.band}`} /></div>
          <b>{insight.score}/100 · {insight.band}</b>
        </div>
        <Briefing s={s} insight={insight} />
      </section>
    </div>
  );
}

/* ─────────────────────────── Security ─────────────────────────── */
function SecurityPanel({ s, sec, tw }) {
  const all = [...(s.ble || []), ...(s.btClassic || [])].sort((a, b) => b.rssi - a.rssi);
  return (
    <div className="stack">
      <section className="panel insight">
        <div className="panel-head">
          <h2><i className="ti ti-shield-lock" aria-hidden /> Security posture</h2>
          <span className={`posture s-${sec.band.replace(' ', '')}`}>{sec.band.toUpperCase()}</span>
        </div>
        <p className="insight-head">{sec.headline}</p>
        <div className="insight-foot">
          <span className="mono">Posture score</span>
          <div className="score-bar"><div style={{ width: sec.score + '%' }}
            className={sec.score >= 80 ? 's-clear' : sec.score >= 55 ? 's-moderate' : 's-congested'} /></div>
          <b>{sec.score}/100</b>
        </div>
        <ul className="insight-list" style={{ marginTop: '14px' }}>
          {sec.findings.map((f, i) => (
            <li key={i} className={`sev-${f.sev === 'crit' ? 'warn' : f.sev}`}>
              <i className={`ti ${f.icon}`} aria-hidden />
              <span><b>{f.title}.</b> {f.text}
                {f.addr && !tw.trusted.has(f.addr) &&
                  <button className="ghost tiny" style={{ marginLeft: 6 }} onClick={() => tw.trust(f.addr)}>trust</button>}
              </span>
            </li>
          ))}
        </ul>
        <p className="insight-note">Passive detection from the dongle’s radio view — evil-twin &amp; open APs, following-trackers, BLE floods. Heuristic; “trust” a device to silence it.</p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Devices in range <small>({all.length})</small></h2>
          <span className="hint" style={{ margin: 0 }}>{tw.trusted.size} trusted</span>
        </div>
        {all.length === 0 ? <p className="hint">Nothing yet — start a Windows Bluetooth scan to populate.</p> : (
          <table className="tbl">
            <thead><tr><th>Type</th><th>Name / addr</th><th>Signature</th><th>dBm</th><th>~m</th><th></th></tr></thead>
            <tbody>
              {all.map((d, i) => {
                const [label, icon] = deviceType(d);
                const isT = tw.trusted.has(d.addr);
                return (
                  <tr key={i} className={isT ? 'trusted-row' : ''}>
                    <td className="dtype"><i className={`ti ${icon}`} aria-hidden /> {label}</td>
                    <td>{d.name || <span className="mono">{d.addr}</span>}</td>
                    <td>{d.cat ? <span className="cat-badge">{d.cat}</span> : <span className="muted">—</span>}</td>
                    <td className="mono">{d.rssi === -127 ? '—' : d.rssi}</td>
                    <td className="mono">{d.dist_m != null ? d.dist_m.toFixed(1) : '—'}</td>
                    <td>{isT
                      ? <button className="ghost tiny" onClick={() => tw.untrust(d.addr)}>untrust</button>
                      : <button className="ghost tiny" onClick={() => tw.trust(d.addr)}>trust</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/* ─────────────────────────── cloud briefing ─────────────────────────── */
function Briefing({ s, insight }) {
  const [state, setState] = useState(null);   // {busy}|{ok,mdPath,usedCloud}
  const run = async () => {
    setState({ busy: true });
    const snapshot = {
      at: new Date().toISOString(),
      device: s.id, stat: s.stat,
      wifi: s.wifi, classic: s.btClassic, ble: s.ble,
      insight: { headline: insight.headline, score: insight.score, band: insight.band,
                 points: insight.points.map(p => p.text) }
    };
    const localBriefing = `${insight.headline}\n\n` + insight.points.map(p => `- ${p.text}`).join('\n') +
      `\n\nRF environment score: ${insight.score}/100 (${insight.band}).`;
    const r = await window.picolink?.saveBriefing({ snapshot, localBriefing });
    setState(r || { ok: false });
  };
  return (
    <div className="brief">
      <button onClick={run} disabled={state?.busy}>
        <i className="ti ti-cloud-bolt" aria-hidden /> {state?.busy ? 'Generating…' : 'Cloud AI briefing'}
      </button>
      {state?.ok && (
        <span className="brief-done">
          Saved ({state.usedCloud ? 'Claude' : 'local'}) ·{' '}
          <a onClick={() => window.picolink?.showItem(state.mdPath)}>open</a>
        </span>
      )}
      <p className="insight-note">On-device heuristics over live WiFi + BLE + Classic + thermal telemetry, saved to Documents\IONITY. Set an ANTHROPIC_API_KEY to add a Claude write-up; fully offline otherwise.</p>
    </div>
  );
}

/* ─────────────────────────── BLE GATT explorer ─────────────────────────── */
function BlePanel({ s }) {
  const [picker, setPicker] = useState(null);
  const [dev, setDev] = useState(null);       // { name, id, connected }
  const [meta, setMeta] = useState(null);      // { rssi, txPower, mfg, appearance }
  const [tree, setTree] = useState([]);        // [{ uuid, name, chars:[{...}] }]
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [logv, setLogv] = useState([]);        // value events (newest first)
  const deviceRef = useRef(null);
  const charRef = useRef({});                  // uuid -> BluetoothRemoteGATTCharacteristic

  useEffect(() => { window.picolink?.onBleScanList((list) => setPicker({ list })); }, []);
  const supported = typeof navigator !== 'undefined' && !!navigator.bluetooth;

  const vlog = (uuid, name, decoded, kind = 'read') =>
    setLogv(l => [{ t: new Date(), uuid, name, decoded, kind, key: Math.random().toString(36).slice(2) }, ...l.slice(0, 199)]);

  const scan = async () => {
    setErr(''); setBusy('scan'); setPicker({ list: [] });
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES
      });
      setPicker(null);
      await connect(device);
    } catch (e) {
      setPicker(null);
      if (!/cancell?ed|chooser/i.test(e.message || '')) setErr(e.message);
    } finally { setBusy(''); }
  };

  const connect = async (device) => {
    setBusy('connect'); setErr(''); setTree([]); setLogv([]); charRef.current = {};
    try {
      deviceRef.current = device;
      device.addEventListener('gattserverdisconnected', () =>
        setDev(d => d ? { ...d, connected: false } : d));
      setDev({ name: device.name || '(unnamed)', id: device.id, connected: true });

      /* live advertisement data (RSSI, manufacturer) if the platform allows */
      try {
        if (device.watchAdvertisements) {
          device.addEventListener('advertisementreceived', (ev) => {
            const mfg = [];
            ev.manufacturerData?.forEach((v, k) => mfg.push('0x' + k.toString(16).padStart(4, '0')));
            setMeta({ rssi: ev.rssi, txPower: ev.txPower, appearance: ev.appearance,
                      mfg: mfg.join(', '), at: new Date() });
          });
          await device.watchAdvertisements().catch(() => {});
        }
      } catch { /* not supported everywhere */ }

      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices().catch(() => []);
      const built = [];
      for (const svc of services) {
        const chars = await svc.getCharacteristics().catch(() => []);
        const cl = [];
        for (const c of chars) {
          charRef.current[c.uuid] = c;
          const entry = { uuid: c.uuid, name: gattName(c.uuid), props: charProps(c), value: null };
          if (c.properties.read) {
            try { const dv = await c.readValue(); entry.value = decodeValue(c.uuid, dv); }
            catch { /* not readable now */ }
          }
          cl.push(entry);
        }
        built.push({ uuid: svc.uuid, name: gattName(svc.uuid), chars: cl });
      }
      setTree(built);
    } catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  };

  const readChar = async (uuid, name) => {
    const c = charRef.current[uuid]; if (!c) return;
    try {
      const dv = await c.readValue();
      const d = decodeValue(uuid, dv);
      setTree(t => t.map(s => ({ ...s, chars: s.chars.map(x => x.uuid === uuid ? { ...x, value: d } : x) })));
      vlog(uuid, name, d, 'read');
    } catch (e) { vlog(uuid, name, { note: 'read failed: ' + e.message }, 'err'); }
  };

  const toggleNotify = async (uuid, name, on) => {
    const c = charRef.current[uuid]; if (!c) return;
    try {
      if (on) {
        await c.startNotifications();
        c.addEventListener('characteristicvaluechanged', (e) =>
          vlog(uuid, name, decodeValue(uuid, e.target.value), 'notify'));
        vlog(uuid, name, { note: 'notifications on' }, 'ok');
      } else { await c.stopNotifications(); vlog(uuid, name, { note: 'notifications off' }, 'ok'); }
      setTree(t => t.map(s => ({ ...s, chars: s.chars.map(x => x.uuid === uuid ? { ...x, notifying: on } : x) })));
    } catch (e) { vlog(uuid, name, { note: 'notify failed: ' + e.message }, 'err'); }
  };

  const writeChar = async (uuid, name, str) => {
    const c = charRef.current[uuid]; if (!c || !str) return;
    try {
      let bytes;
      if (/^[0-9a-fA-F\s]+$/.test(str) && str.replace(/\s/g, '').length % 2 === 0 && /[0-9a-fA-F]{2}/.test(str))
        bytes = new Uint8Array(str.replace(/\s/g, '').match(/../g).map(h => parseInt(h, 16)));
      else bytes = new TextEncoder().encode(str);
      if (c.properties.writeWithoutResponse && !c.properties.write) await c.writeValueWithoutResponse(bytes);
      else await c.writeValue(bytes);
      vlog(uuid, name, { note: 'wrote ' + bytes.length + ' bytes' }, 'ok');
    } catch (e) { vlog(uuid, name, { note: 'write failed: ' + e.message }, 'err'); }
  };

  const readAll = async () => {
    for (const svc of tree) for (const c of svc.chars)
      if (c.props.includes('read')) await readChar(c.uuid, c.name);
  };

  const disconnect = () => {
    try { deviceRef.current?.gatt?.disconnect(); } catch {}
    setDev(null); setTree([]); setMeta(null); charRef.current = {};
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>BLE — scan, connect &amp; explore</h2>
          <div className="row-btns">
            {dev?.connected && <button className="ghost" onClick={readAll}><i className="ti ti-refresh" aria-hidden /> read all</button>}
            {dev ? <button className="ghost" onClick={disconnect}>{dev.connected ? 'Disconnect' : 'Close'}</button> : null}
            <button onClick={scan} disabled={!supported || !!busy}>
              <i className="ti ti-bluetooth" aria-hidden /> {busy === 'scan' ? 'Scanning…' : busy === 'connect' ? 'Connecting…' : 'Scan'}
            </button>
          </div>
        </div>
        {!supported && <p className="warn">Web Bluetooth unavailable — ensure the PicoLink radio is on and Windows Bluetooth is enabled.</p>}
        {err && <p className="warn">{err}</p>}

        {dev ? (
          <div className="ble-conn">
            <div className="ble-conn-top">
              <div className={`dot ${dev.connected ? 'on' : ''}`} />
              <div><b>{dev.name}</b><span className="mono muted">{dev.id.slice(0, 22)}</span></div>
            </div>
            <div className="kv">
              {meta?.rssi != null && <span><label>Live RSSI</label>{meta.rssi} dBm</span>}
              {meta?.txPower != null && <span><label>Tx power</label>{meta.txPower} dBm</span>}
              {meta?.mfg && <span><label>Mfg data</label>{meta.mfg}</span>}
              <span><label>Services</label>{tree.length}</span>
              <span><label>Characteristics</label>{tree.reduce((n, s) => n + s.chars.length, 0)}</span>
            </div>
          </div>
        ) : <p className="hint">Scan, pick a device, and PicoLink connects over BLE — enumerating every service &amp; characteristic, reading values, and subscribing to live notifications.</p>}
      </section>

      {tree.length > 0 && (
        <section className="panel">
          <h2>GATT services &amp; characteristics</h2>
          <div className="gatt">
            {tree.map(svc => (
              <div key={svc.uuid} className="gatt-svc">
                <div className="gatt-svc-h"><i className="ti ti-folder" aria-hidden /> {svc.name}</div>
                {svc.chars.map(c => (
                  <CharRow key={c.uuid} c={c}
                    onRead={() => readChar(c.uuid, c.name)}
                    onNotify={(on) => toggleNotify(c.uuid, c.name, on)}
                    onWrite={(v) => writeChar(c.uuid, c.name, v)} />
                ))}
                {svc.chars.length === 0 && <div className="gatt-empty">no characteristics</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {logv.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>Live value stream <small>(reads &amp; notifications)</small></h2>
            <button className="ghost" onClick={() => setLogv([])}>clear</button></div>
          <div className="vlog">
            {logv.map(e => (
              <div key={e.key} className={`vrow ${e.kind}`}>
                <span className="ts">{e.t.toLocaleTimeString()}</span>
                <span className="vk">{e.kind}</span>
                <span className="vn">{e.name}</span>
                <span className="vv">{e.decoded.note || e.decoded.text || e.decoded.hex || ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Ambient BLE advertisers <small>(passive, from the dongle)</small></h2>
        <DeviceTable rows={s.ble} kind="ble" empty="No BLE advertisements captured yet — they appear as the radio hears them." />
      </section>

      {picker && <BlePicker picker={picker}
        onPick={(id) => window.picolink?.bleSelect(id)}
        onCancel={() => { window.picolink?.bleCancel(); setPicker(null); }} />}
    </div>
  );
}

function CharRow({ c, onRead, onNotify, onWrite }) {
  const [wv, setWv] = useState('');
  const writable = c.props.includes('write') || c.props.includes('writeNR');
  return (
    <div className="gatt-char">
      <div className="gatt-char-h">
        <span className="cn">{c.name}</span>
        <span className="cprops">{c.props.map(p => <span key={p} className="pbadge">{p}</span>)}</span>
        <span className="cbtns">
          {c.props.includes('read') && <button className="ghost tiny" onClick={onRead}>read</button>}
          {(c.props.includes('notify') || c.props.includes('indicate')) &&
            <button className={`ghost tiny ${c.notifying ? 'on' : ''}`} onClick={() => onNotify(!c.notifying)}>{c.notifying ? 'stop' : 'notify'}</button>}
        </span>
      </div>
      {c.value && (
        <div className="gatt-val">
          {c.value.note && <span className="vnote">{c.value.note}</span>}
          {c.value.text && <span className="vtext">“{c.value.text}”</span>}
          {c.value.hex && <span className="mono vhex">{c.value.hex}</span>}
        </div>
      )}
      {writable && (
        <div className="gatt-write">
          <input placeholder="text or hex bytes" value={wv} onChange={e => setWv(e.target.value)} />
          <button className="ghost tiny" onClick={() => { onWrite(wv); setWv(''); }}>write</button>
        </div>
      )}
    </div>
  );
}

function BlePicker({ picker, onPick, onCancel }) {
  return (
    <div className="modal-wrap">
      <div className="modal">
        <h3><i className="ti ti-bluetooth" aria-hidden /> Nearby BLE devices</h3>
        <div className="pick-list">
          {picker.list.length === 0 && <div className="empty">scanning… bring a device close</div>}
          {picker.list.map(d => (
            <button key={d.id} className="pick" onClick={() => onPick(d.id)}>
              <span>{d.name}</span><i className="ti ti-arrow-right" aria-hidden />
            </button>
          ))}
        </div>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Bluetooth Classic ─────────────────────────── */
function ClassicPanel({ s }) {
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Bluetooth Classic — nearby devices</h2>
          <div className="row-btns">
            <button className="ghost" onClick={() => s.send('BT')}><i className="ti ti-refresh" aria-hidden /> refresh</button>
            <button onClick={() => window.picolink?.openExternal('ms-settings:bluetooth')}>
              <i className="ti ti-plus" aria-hidden /> Pair in Windows
            </button>
          </div>
        </div>
        <p className="hint">These are Classic (BR/EDR) devices the radio hears during a Windows inquiry. Pairing is an OS action — “Pair in Windows” opens the system dialog, which uses this dongle as the adapter.</p>
        <DeviceTable rows={s.btClassic} kind="classic" empty="Start ‘Add device’ in Windows Bluetooth to make Classic devices broadcast." />
      </section>
    </div>
  );
}

/* ─────────────────────────── WiFi radar ─────────────────────────── */
function WifiPanel({ s }) {
  const bars = (rssi) => {
    const lvl = rssi >= -50 ? 5 : rssi >= -60 ? 4 : rssi >= -70 ? 3 : rssi >= -80 ? 2 : 1;
    return <span className="bars">{[0,1,2,3,4].map(i => <i key={i} className={i < lvl ? 'f' : ''} style={{ height: (4 + i * 3) + 'px' }} />)}</span>;
  };
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  const link = s.stat?.wifi_link ?? 'down';
  const joined = s.stat?.wifi_join;
  const joinedUp = link === 'up' || link === 'noip' || link === 'join';
  const pick = (n) => setSsid(n);
  const connect = () => { if (ssid) s.send(`WIFI JOIN "${ssid}" "${pass}"`); };

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>WiFi connect</h2>
          <span className={`wifi-link ${joinedUp ? 'up' : link.startsWith('bad') || link === 'fail' || link === 'nonet' ? 'bad' : ''}`}>
            {joinedUp ? `linked: ${joined}` : `link ${link}`}
          </span>
        </div>
        <p className="hint">Associate the dongle to an AP (WPA2) to verify credentials and link. This is a Bluetooth dongle — it proves the join at link level; it doesn’t route the PC’s internet.</p>
        <div className="wifi-form">
          <input placeholder="SSID" value={ssid} onChange={e => setSsid(e.target.value)} />
          <input placeholder="password" type="password" value={pass} onChange={e => setPass(e.target.value)} />
          <button onClick={connect} disabled={!s.connected || !ssid}><i className="ti ti-wifi" aria-hidden /> Connect</button>
          <button className="ghost" onClick={() => s.send('WIFI LEAVE')} disabled={!s.connected}>Disconnect</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>WiFi RADAR</h2>
          <button className="ghost" onClick={() => s.send('WIFI')}><i className="ti ti-refresh" aria-hidden /> refresh</button>
        </div>
        {s.wifi.length === 0 ? <p className="hint">Listening… the dongle sweeps the air every 8 seconds.</p> : (
          <table className="tbl">
            <thead><tr><th>SSID</th><th>Security</th><th>Signal</th><th>dBm</th><th>Ch</th><th></th></tr></thead>
            <tbody>
              {[...s.wifi].sort((a,b) => b.rssi - a.rssi).map((n, i) => {
                const openish = n.sec === 'open' || n.sec === 'wep';
                return (
                  <tr key={i}>
                    <td>{n.ssid || '(hidden)'}</td>
                    <td className={openish ? 'sec-open' : 'sec-ok'}>
                      <i className={`ti ${openish ? 'ti-lock-open' : 'ti-lock'}`} aria-hidden /> {(n.sec || '—').toUpperCase()}
                    </td>
                    <td>{bars(n.rssi)}</td>
                    <td className="mono">{n.rssi}</td><td className="mono">{n.ch}</td>
                    <td>{n.ssid && <button className="ghost tiny" onClick={() => pick(n.ssid)}>use</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/* ─────────────────────────── logs ─────────────────────────── */
function LogsPanel({ s }) {
  const endRef = useRef(null);
  const [filter, setFilter] = useState('');
  const [chip, setChip] = useState('All');
  const [follow, setFollow] = useState(true);
  useEffect(() => { if (follow) endRef.current?.scrollIntoView({ block: 'end' }); }, [s.logs, follow]);
  const chipMatch = (l) =>
    chip === 'All' ? true :
    chip === 'Sightings' ? /\b(BLE|BT )\b/.test(l.line) :
    chip === 'Alerts' ? (l.kind === 'err' || /ALERT/.test(l.line)) :
    chip === 'Sent' ? l.kind === 'sent' : true;
  const shown = s.logs.filter(l => chipMatch(l) &&
    (!filter || l.line.toLowerCase().includes(filter.toLowerCase())));
  const exportLogs = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s.logs.map(l => `${l.t.toISOString()} ${l.line}`).join('\n')], { type: 'text/plain' }));
    a.download = `picolink-${Date.now()}.log`; a.click();
  };
  return (
    <section className="panel console">
      <div className="console-bar">
        <h2>Logs</h2>
        <div className="chips">
          {['All', 'Sightings', 'Alerts', 'Sent'].map(c => (
            <button key={c} className={`chipbtn ${chip === c ? 'on' : ''}`} onClick={() => setChip(c)}>{c}</button>
          ))}
        </div>
        <input placeholder="filter…" value={filter} onChange={e => setFilter(e.target.value)} />
        <label className="chk"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} /> follow</label>
        <button className="ghost" onClick={exportLogs}>export</button>
        <button className="ghost" onClick={() => window.picolink?.openLogs()}>folder</button>
        <button className="ghost" onClick={s.clearLogs}>clear</button>
      </div>
      <div className="log-view">
        {shown.map(l => (
          <div key={l.key} className={`ll ${l.kind}`}>
            <span className="ts">{l.t.toLocaleTimeString()}</span><span className="msg">{l.line}</span>
          </div>
        ))}
        {shown.length === 0 && <div className="empty">no log lines {filter && 'matching filter'}</div>}
        <div ref={endRef} />
      </div>
    </section>
  );
}

/* ─────────────────────────── shared bits ─────────────────────────── */
function DeviceTable({ rows, kind, empty }) {
  if (!rows || rows.length === 0) return <p className="hint">{empty}</p>;
  const sorted = [...rows].sort((a, b) => b.rssi - a.rssi);
  return (
    <table className="tbl">
      <thead><tr><th>Type</th><th>Name</th><th>Address</th><th>dBm</th><th>~m</th></tr></thead>
      <tbody>
        {sorted.map((d, i) => {
          const [label, icon] = deviceType(d);
          return (
            <tr key={i}>
              <td className="dtype"><i className={`ti ${icon}`} aria-hidden /> {label}</td>
              <td>{d.name || '(unknown)'}</td>
              <td className="mono">{d.addr}</td>
              <td className="mono">{d.rssi === -127 ? '—' : d.rssi}</td>
              <td className="mono">{d.dist_m != null ? d.dist_m.toFixed(1) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

