/**
 * IONITY PicoLink Console — renderer UI
 * Talks to the dongle's CDC port via Web Serial (Chromium built-in, offline).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';

const PICOLINK_USB = { usbVendorId: 0x2e8a, usbProductId: 0x986a };

export default function App() {
  const portRef = useRef(null);
  const writerRef = useRef(null);
  const readerRef = useRef(null);
  const keepReading = useRef(false);
  const logEndRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [id, setId] = useState(null);
  const [stat, setStat] = useState(null);
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [logPath, setLogPath] = useState('');

  const pushLog = useCallback((line, kind = 'log') => {
    const entry = { t: new Date(), line, kind, key: Math.random().toString(36).slice(2) };
    setLogs((l) => [...l.slice(-1999), entry]);
    window.picolink?.appendLog(`${entry.t.toISOString()} ${line}`);
  }, []);

  /* ---------------- serial plumbing ---------------- */

  const handleLine = useCallback((raw) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('LOG ')) {
      pushLog(line.slice(4), 'device');
    } else if (line.startsWith('STAT ')) {
      try { setStat(JSON.parse(line.slice(5))); } catch { /* ignore */ }
    } else if (line.startsWith('ID ')) {
      try { setId(JSON.parse(line.slice(3))); } catch { /* ignore */ }
    } else if (line.startsWith('OK') || line === 'PONG') {
      pushLog(line, 'ok');
    } else {
      pushLog(line, 'device');
    }
  }, [pushLog]);

  const readLoop = useCallback(async (port) => {
    const decoder = new TextDecoder();
    let buf = '';
    keepReading.current = true;
    while (port.readable && keepReading.current) {
      const reader = port.readable.getReader();
      readerRef.current = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i;
          while ((i = buf.search(/[\r\n]/)) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            handleLine(line);
          }
        }
      } catch { /* device pulled / detached */ }
      finally { reader.releaseLock(); }
    }
  }, [handleLine]);

  const send = useCallback(async (cmd) => {
    try {
      if (!writerRef.current) return;
      await writerRef.current.write(new TextEncoder().encode(cmd + '\n'));
      pushLog(`> ${cmd}`, 'sent');
    } catch { pushLog(`send failed: ${cmd}`, 'err'); }
  }, [pushLog]);

  const openPort = useCallback(async (port) => {
    try {
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      writerRef.current = port.writable.getWriter();
      setConnected(true);
      pushLog('Console connected to PicoLink', 'ok');
      readLoop(port);
      setTimeout(() => { send('HELLO'); send('STATUS'); }, 300);
    } catch (e) {
      pushLog(`open failed: ${e.message}`, 'err');
    }
  }, [pushLog, readLoop, send]);

  const connect = useCallback(async (interactive) => {
    if (portRef.current) return;
    setBusy(true);
    try {
      let port = null;
      const granted = await navigator.serial.getPorts();
      port = granted.find((p) => {
        const i = p.getInfo();
        return i.usbVendorId === PICOLINK_USB.usbVendorId;
      }) || granted[0] || null;
      if (!port && interactive) {
        port = await navigator.serial.requestPort({ filters: [PICOLINK_USB] })
          .catch(() => null);
      }
      if (port) await openPort(port);
      else if (interactive) pushLog('No PicoLink found — is it plugged in?', 'err');
    } finally { setBusy(false); }
  }, [openPort, pushLog]);

  const disconnect = useCallback(async () => {
    keepReading.current = false;
    try { await readerRef.current?.cancel(); } catch {}
    try { writerRef.current?.releaseLock(); } catch {}
    try { await portRef.current?.close(); } catch {}
    portRef.current = null;
    writerRef.current = null;
    setConnected(false);
    pushLog('Console disconnected', 'err');
  }, [pushLog]);

  /* auto-connect + hotplug */
  useEffect(() => {
    connect(false);
    const onAdd = () => { pushLog('USB device attached', 'ok'); connect(false); };
    const onRemove = () => { disconnect(); };
    navigator.serial?.addEventListener('connect', onAdd);
    navigator.serial?.addEventListener('disconnect', onRemove);
    window.picolink?.onTrayCmd((cmd) => send(cmd));
    window.picolink?.getLogPath().then(setLogPath);
    return () => {
      navigator.serial?.removeEventListener('connect', onAdd);
      navigator.serial?.removeEventListener('disconnect', onRemove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* keep tray in sync */
  const radio = stat?.radio ?? 'unknown';
  useEffect(() => { window.picolink?.radioState(radio === 'on'); }, [radio]);

  useEffect(() => {
    if (autoScroll) logEndRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [logs, autoScroll]);

  /* ---------------- actions ---------------- */

  const toggleRadio = () => send(radio === 'on' ? 'BT OFF' : 'BT ON');
  const detach = () => send('DETACH');
  const exportLogs = () => {
    const text = logs.map((l) => `${l.t.toISOString()} ${l.line}`).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `picolink-export-${Date.now()}.log`;
    a.click();
  };

  const shown = filter
    ? logs.filter((l) => l.line.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  const fmtBytes = (n = 0) =>
    n > 1048576 ? (n / 1048576).toFixed(1) + ' MB'
    : n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';

  const uptime = (ms = 0) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
  };

  /* ---------------- render ---------------- */

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
        <div className={`link-pill ${connected ? 'on' : ''}`}>
          <i />{connected ? 'DONGLE LINKED' : 'SEARCHING…'}
          {!connected && (
            <button className="ghost" disabled={busy} onClick={() => connect(true)}>connect</button>
          )}
        </div>
      </header>

      <main>
        <section className="panel status">
          <div className="radio-block">
            <div className={`orb ${radio}`} />
            <div>
              <h2>Bluetooth radio</h2>
              <p className="radio-state">{radio.toUpperCase()}</p>
            </div>
            <label className="switch" title="Toggle radio">
              <input
                type="checkbox"
                checked={radio === 'on'}
                disabled={!connected || radio === 'detached'}
                onChange={toggleRadio}
              />
              <span />
            </label>
          </div>

          <div className="grid">
            <div className="cell"><label>TX → host</label><b>{stat?.tx_pkts ?? '—'}</b><small>{fmtBytes(stat?.tx_bytes)}</small></div>
            <div className="cell"><label>RX → radio</label><b>{stat?.rx_pkts ?? '—'}</b><small>{fmtBytes(stat?.rx_bytes)}</small></div>
            <div className="cell"><label>Drops</label><b>{stat?.drops ?? '—'}</b><small>&nbsp;</small></div>
            <div className="cell"><label>Uptime</label><b className="small">{stat ? uptime(stat.uptime_ms) : '—'}</b><small>&nbsp;</small></div>
          </div>

          <div className="dev-info">
            <span><label>Device</label>{id ? `${id.product} v${id.version}` : '—'}</span>
            <span><label>Board</label>{id?.board ?? '—'}</span>
            <span><label>Serial</label>{id?.serial ?? '—'}</span>
          </div>

          <div className="btn-row">
            <button onClick={detach} disabled={!connected} title="Soft USB unplug/replug">
              {radio === 'detached' ? 'Re-attach USB' : 'Detach USB'}
            </button>
            <button onClick={() => send('STATUS')} disabled={!connected}>Refresh</button>
            <button onClick={() => send('PING')} disabled={!connected}>Ping</button>
          </div>
        </section>

        <section className="panel console">
          <div className="console-bar">
            <h2>Logs</h2>
            <input
              placeholder="filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <label className="chk">
              <input type="checkbox" checked={autoScroll}
                     onChange={(e) => setAutoScroll(e.target.checked)} /> follow
            </label>
            <button className="ghost" onClick={exportLogs}>export</button>
            <button className="ghost" onClick={() => window.picolink?.openLogs()}>folder</button>
            <button className="ghost" onClick={() => setLogs([])}>clear</button>
          </div>
          <div className="log-view">
            {shown.map((l) => (
              <div key={l.key} className={`ll ${l.kind}`}>
                <span className="ts">{l.t.toLocaleTimeString()}</span>
                <span className="msg">{l.line}</span>
              </div>
            ))}
            {shown.length === 0 && <div className="empty">no log lines {filter && 'matching filter'}</div>}
            <div ref={logEndRef} />
          </div>
          <footer className="log-foot">
            session mirrored to <code>{logPath || '…'}</code>
          </footer>
        </section>
      </main>

      <footer className="app-foot">
        © 2026 Ionity Global (Pty) Ltd · ionity.today · PicoLink Console works fully offline
      </footer>
    </div>
  );
}
