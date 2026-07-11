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

const REPO = 'https://github.com/Ionity-Global/picolink';
const TABS = ['Dashboard', 'BLE', 'Bluetooth', 'WiFi Radar', 'Logs'];

export default function App() {
  const s = useSerial();
  const [tab, setTab] = useState('Dashboard');
  const [appVer, setAppVer] = useState('');
  const [update, setUpdate] = useState(null);

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
            {t === 'BLE' && s.ble.length > 0 && <span className="badge">{s.ble.length}</span>}
            {t === 'Bluetooth' && s.btClassic.length > 0 && <span className="badge">{s.btClassic.length}</span>}
            {t === 'WiFi Radar' && s.wifi.length > 0 && <span className="badge">{s.wifi.length}</span>}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'Dashboard'  && <Dashboard s={s} />}
        {tab === 'BLE'        && <BlePanel s={s} />}
        {tab === 'Bluetooth'  && <ClassicPanel s={s} />}
        {tab === 'WiFi Radar' && <WifiPanel s={s} />}
        {tab === 'Logs'       && <LogsPanel s={s} />}
      </main>

      <footer className="app-foot">
        © 2026 Ionity Global (Pty) Ltd · ionity.today · works fully offline · {' '}
        <a onClick={() => window.picolink?.openExternal(REPO)}>github.com/Ionity-Global/picolink</a>
      </footer>
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
          <div className="cell"><label>TX → host</label><b>{st?.tx_pkts ?? '—'}</b><small>{bytes(st?.tx_bytes)}</small></div>
          <div className="cell"><label>RX → radio</label><b>{st?.rx_pkts ?? '—'}</b><small>{bytes(st?.rx_bytes)}</small></div>
          <div className="cell"><label>Core temp</label><b>{st?.temp_c != null ? st.temp_c.toFixed(1) + '°' : '—'}</b><small>RP2350</small></div>
          <div className="cell"><label>Drops</label><b>{st?.drops ?? '—'}</b><small>&nbsp;</small></div>
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
        <p className="insight-note">On-device heuristics over live WiFi + BLE + Classic + thermal telemetry. No cloud; fully offline.</p>
      </section>
    </div>
  );
}

/* ─────────────────────────── BLE (Web Bluetooth) ─────────────────────────── */
function BlePanel({ s }) {
  const [picker, setPicker] = useState(null);       // {list:[]}
  const [conn, setConn] = useState(null);           // connected device summary
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const deviceRef = useRef(null);

  useEffect(() => {
    window.picolink?.onBleScanList((list) => setPicker({ list }));
  }, []);

  const supported = typeof navigator !== 'undefined' && !!navigator.bluetooth;

  const scan = async () => {
    setErr(''); setBusy(true); setPicker({ list: [] });
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', 'device_information', 'battery_service', 0x180a, 0x180f]
      });
      setPicker(null);
      await connect(device);
    } catch (e) {
      setPicker(null);
      if (!/cancell?ed|chooser/i.test(e.message)) setErr(e.message);
    } finally { setBusy(false); }
  };

  const readChar = async (server, svc, chr) => {
    try {
      const service = await server.getPrimaryService(svc);
      const c = await service.getCharacteristic(chr);
      const v = await c.readValue();
      return v;
    } catch { return null; }
  };

  const connect = async (device) => {
    setBusy(true); setErr('');
    try {
      deviceRef.current = device;
      device.addEventListener('gattserverdisconnected', () => {
        setConn(c => c ? { ...c, connected: false } : c);
      });
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices().catch(() => []);
      const info = { name: device.name || '(unnamed)', id: device.id, connected: true, services: [], battery: null, maker: null, model: null };
      info.services = services.map(x => x.uuid);

      const bat = await readChar(server, 'battery_service', 'battery_level');
      if (bat) info.battery = bat.getUint8(0);
      const maker = await readChar(server, 'device_information', 'manufacturer_name_string');
      if (maker) info.maker = new TextDecoder().decode(maker);
      const model = await readChar(server, 'device_information', 'model_number_string');
      if (model) info.model = new TextDecoder().decode(model);

      setConn(info);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const disconnect = () => {
    try { deviceRef.current?.gatt?.disconnect(); } catch {}
    setConn(null);
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>BLE — scan &amp; connect</h2>
          <button onClick={scan} disabled={!supported || busy}>
            <i className="ti ti-bluetooth" aria-hidden /> {busy ? 'Scanning…' : 'Scan for BLE devices'}
          </button>
        </div>
        {!supported && <p className="warn">Web Bluetooth isn’t available — make sure the PicoLink radio is on and Windows Bluetooth is enabled.</p>}
        {err && <p className="warn">{err}</p>}

        {conn ? (
          <div className="ble-conn">
            <div className="ble-conn-top">
              <div className={`dot ${conn.connected ? 'on' : ''}`} />
              <div>
                <b>{conn.name}</b>
                <span className="mono muted">{conn.id.slice(0, 18)}</span>
              </div>
              <button className="ghost" onClick={disconnect}>{conn.connected ? 'Disconnect' : 'Close'}</button>
            </div>
            <div className="kv">
              {conn.battery != null && <span><label>Battery</label>{conn.battery}%</span>}
              {conn.maker && <span><label>Maker</label>{conn.maker}</span>}
              {conn.model && <span><label>Model</label>{conn.model}</span>}
              <span><label>GATT services</label>{conn.services.length}</span>
            </div>
            {conn.services.length > 0 && (
              <ul className="svc-list">
                {conn.services.map(u => <li key={u} className="mono">{gattName(u)}</li>)}
              </ul>
            )}
          </div>
        ) : (
          <p className="hint">Click scan, pick a device from the list, and PicoLink connects to it over BLE — reading its GATT services, battery and device info.</p>
        )}
      </section>

      <section className="panel">
        <h2>Ambient BLE advertisers <small>(passive, from the dongle)</small></h2>
        <DeviceTable rows={s.ble} kind="ble" empty="No BLE advertisements captured yet — they appear as the radio hears them." />
      </section>

      {picker && <BlePicker picker={picker}
        onPick={(id) => { window.picolink?.bleSelect(id); }}
        onCancel={() => { window.picolink?.bleCancel(); setPicker(null); }} />}
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
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>WiFi RADAR</h2>
        <button className="ghost" onClick={() => s.send('WIFI')}><i className="ti ti-refresh" aria-hidden /> refresh</button>
      </div>
      {s.wifi.length === 0 ? <p className="hint">Listening… the dongle sweeps the air every 8 seconds.</p> : (
        <table className="tbl">
          <thead><tr><th>SSID</th><th>Signal</th><th>dBm</th><th>Ch</th></tr></thead>
          <tbody>
            {[...s.wifi].sort((a,b) => b.rssi - a.rssi).map((n, i) => (
              <tr key={i}><td>{n.ssid || '(hidden)'}</td><td>{bars(n.rssi)}</td>
                  <td className="mono">{n.rssi}</td><td className="mono">{n.ch}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ─────────────────────────── logs ─────────────────────────── */
function LogsPanel({ s }) {
  const endRef = useRef(null);
  const [filter, setFilter] = useState('');
  const [follow, setFollow] = useState(true);
  useEffect(() => { if (follow) endRef.current?.scrollIntoView({ block: 'end' }); }, [s.logs, follow]);
  const shown = filter ? s.logs.filter(l => l.line.toLowerCase().includes(filter.toLowerCase())) : s.logs;
  const exportLogs = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s.logs.map(l => `${l.t.toISOString()} ${l.line}`).join('\n')], { type: 'text/plain' }));
    a.download = `picolink-${Date.now()}.log`; a.click();
  };
  return (
    <section className="panel console">
      <div className="console-bar">
        <h2>Logs</h2>
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
      <thead><tr><th>Name</th><th>Address</th><th>dBm</th><th>~m</th><th>{kind === 'ble' ? 'Type' : 'Class'}</th></tr></thead>
      <tbody>
        {sorted.map((d, i) => (
          <tr key={i}>
            <td>{d.name || '(unknown)'}</td>
            <td className="mono">{d.addr}</td>
            <td className="mono">{d.rssi === -127 ? '—' : d.rssi}</td>
            <td className="mono">{d.dist_m != null ? d.dist_m.toFixed(1) : '—'}</td>
            <td className="mono">{kind === 'ble' ? d.atype : d.cod}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function gattName(uuid) {
  const known = {
    '00001800': 'Generic Access', '00001801': 'Generic Attribute',
    '0000180a': 'Device Information', '0000180f': 'Battery Service',
    '0000180d': 'Heart Rate', '00001812': 'HID', '00001809': 'Health Thermometer',
    '0000fe9f': 'Google', '0000feaa': 'Eddystone'
  };
  const p = uuid.slice(0, 8);
  return known[p] ? `${known[p]}  (${p})` : uuid;
}
