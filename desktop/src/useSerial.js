/**
 * IONITY PicoLink — Web Serial hook.
 * Parses the dongle's line protocol (LOG/STAT/ID/WIFI/BTLIST/BLELIST),
 * auto-connects + auto-reconnects, exposes state + send().
 */
import { useEffect, useRef, useState, useCallback } from 'react';

const PICOLINK_USB = { usbVendorId: 0x2e8a, usbProductId: 0x986a };

export function useSerial() {
  const portRef = useRef(null);
  const writerRef = useRef(null);
  const readerRef = useRef(null);
  const keep = useRef(false);

  const [connected, setConnected] = useState(false);
  const [id, setId] = useState(null);
  const [stat, setStat] = useState(null);
  const [wifi, setWifi] = useState([]);
  const [btClassic, setBtClassic] = useState([]);
  const [ble, setBle] = useState([]);
  const [logs, setLogs] = useState([]);

  const pushLog = useCallback((line, kind = 'log') => {
    const e = { t: new Date(), line, kind, key: Math.random().toString(36).slice(2) };
    setLogs(l => [...l.slice(-1999), e]);
    window.picolink?.appendLog(`${e.t.toISOString()} ${line}`);
  }, []);
  const clearLogs = useCallback(() => setLogs([]), []);

  const handleLine = useCallback((raw) => {
    const line = raw.trim();
    if (!line) return;
    const jparse = (pfx) => { try { return JSON.parse(line.slice(pfx.length)); } catch { return null; } };
    if (line.startsWith('LOG '))          pushLog(line.slice(4), 'device');
    else if (line.startsWith('STAT '))    { const j = jparse('STAT '); if (j) setStat(j); }
    else if (line.startsWith('ID '))      { const j = jparse('ID '); if (j) setId(j); }
    else if (line.startsWith('WIFI '))    { const j = jparse('WIFI '); if (j?.nets) setWifi(j.nets); }
    else if (line.startsWith('BTLIST '))  { const j = jparse('BTLIST '); if (j?.devs) setBtClassic(j.devs); }
    else if (line.startsWith('BLELIST ')) { const j = jparse('BLELIST '); if (j?.devs) setBle(j.devs); }
    else if (line.startsWith('OK') || line === 'PONG') pushLog(line, 'ok');
    else pushLog(line, 'device');
  }, [pushLog]);

  const readLoop = useCallback(async (port) => {
    const dec = new TextDecoder();
    let buf = '';
    keep.current = true;
    while (port.readable && keep.current) {
      const reader = port.readable.getReader();
      readerRef.current = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.search(/[\r\n]/)) >= 0) { handleLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
        }
      } catch {} finally { reader.releaseLock(); }
    }
  }, [handleLine]);

  const send = useCallback(async (cmd) => {
    try {
      if (!writerRef.current) return;
      await writerRef.current.write(new TextEncoder().encode(cmd + '\n'));
      if (!/^STATUS$|^WIFI$|^BT$|^BLE$/.test(cmd)) pushLog(`> ${cmd}`, 'sent');
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
      setTimeout(() => { send('HELLO'); send('STATUS'); send('WIFI'); }, 300);
    } catch (e) { pushLog(`open failed: ${e.message}`, 'err'); }
  }, [pushLog, readLoop, send]);

  const connect = useCallback(async (interactive) => {
    if (portRef.current) return;
    try {
      const granted = await navigator.serial.getPorts();
      let port = granted.find(p => p.getInfo().usbVendorId === PICOLINK_USB.usbVendorId) || granted[0] || null;
      if (!port && interactive) port = await navigator.serial.requestPort({ filters: [PICOLINK_USB] }).catch(() => null);
      if (port) await openPort(port);
      else if (interactive) pushLog('No PicoLink found — is it plugged in?', 'err');
    } catch {}
  }, [openPort, pushLog]);

  const disconnect = useCallback(async () => {
    keep.current = false;
    try { await readerRef.current?.cancel(); } catch {}
    try { writerRef.current?.releaseLock(); } catch {}
    try { await portRef.current?.close(); } catch {}
    portRef.current = null; writerRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    connect(false);
    const onAdd = () => connect(false);
    const onRemove = () => disconnect();
    navigator.serial?.addEventListener('connect', onAdd);
    navigator.serial?.addEventListener('disconnect', onRemove);
    return () => {
      navigator.serial?.removeEventListener('connect', onAdd);
      navigator.serial?.removeEventListener('disconnect', onRemove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* poll device lists while connected (dongle pushes STAT on its own) */
  useEffect(() => {
    if (!connected) return;
    const iv = setInterval(() => { send('WIFI'); send('BT'); send('BLE'); }, 5000);
    return () => clearInterval(iv);
  }, [connected, send]);

  return { connected, id, stat, wifi, btClassic, ble, logs, send, connect, clearLogs };
}
