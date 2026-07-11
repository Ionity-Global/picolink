/**
 * IONITY PicoLink Console — Electron main process
 * © 2026 Ionity Global (Pty) Ltd — MIT (code)
 *
 * Renderer talks to the dongle over Web Serial (CDC console) and to nearby
 * BLE peripherals over Web Bluetooth — both routed by the OS through the
 * PicoLink radio. Main wires device pickers, the tray, log persistence, and
 * a one-click self-updater (git pull + relaunch) for online machines.
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');

const PICOLINK_VID = 0x2E8A;   // Raspberry Pi
const PICOLINK_PID = 0x986A;   // IONITY PicoLink

let win = null;
let tray = null;
let radioOn = true;
let btCallback = null;         // pending Web Bluetooth device-picker callback

const appVersion = () => {
  try { return require('../package.json').version; } catch { return '?'; }
};

const logDir = () => {
  const d = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const logFilePath = () =>
  path.join(logDir(), `picolink-${new Date().toISOString().slice(0, 10)}.log`);

/* repo root = two levels up from desktop/electron (…/picolink) */
const repoRoot = () => path.resolve(__dirname, '..', '..');

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#0d1b2a',
    autoHideMenuBar: true,
    title: 'IONITY PicoLink Console',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const ses = win.webContents.session;

  /* Auto-select the PicoLink CDC port — no chooser dialog. */
  ses.on('select-serial-port', (event, portList, wc, callback) => {
    event.preventDefault();
    const pick =
      portList.find(p => parseInt(p.vendorId, 16) === PICOLINK_VID) || portList[0];
    callback(pick ? pick.portId : '');
  });

  /* Web Bluetooth: stream the growing scan list to the renderer; the
   * renderer picks a device id (or cancels) and we complete the callback. */
  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    btCallback = callback;
    win.webContents.send('ble-scan-list', devices.map(d => ({
      id: d.deviceId,
      name: d.deviceName || '(unknown)'
    })));
  });

  ses.setPermissionCheckHandler((wc, permission) =>
    ['serial', 'bluetooth'].includes(permission));
  ses.setDevicePermissionHandler(details =>
    details.deviceType === 'serial' || details.deviceType === 'bluetooth');

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', (e) => {
    if (!app.isQuiting && tray) { e.preventDefault(); win.hide(); }
  });
}

function trayIcon() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'));
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
  } catch (_) {}
  return nativeImage.createEmpty();
}

function buildTray() {
  tray = new Tray(trayIcon());
  const refresh = () => {
    tray.setToolTip('IONITY PicoLink');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `IONITY PicoLink Console v${appVersion()}`, enabled: false },
      { type: 'separator' },
      { label: 'Open console', click: () => { win.show(); win.focus(); } },
      {
        label: radioOn ? 'Turn Bluetooth OFF' : 'Turn Bluetooth ON',
        click: () => win.webContents.send('tray-cmd', radioOn ? 'BT OFF' : 'BT ON')
      },
      { type: 'separator' },
      { label: 'Open log folder', click: () => shell.openPath(logDir()) },
      { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
    ]));
  };
  refresh();
  ipcMain.on('radio-state', (_e, on) => { radioOn = !!on; refresh(); });
}

/* ---- Web Bluetooth picker callbacks from renderer ---- */
ipcMain.on('ble-select', (_e, deviceId) => {
  if (btCallback) { btCallback(deviceId); btCallback = null; }
});
ipcMain.on('ble-cancel', () => {
  if (btCallback) { btCallback(''); btCallback = null; }
});

/* ---- logs ---- */
ipcMain.on('append-log', (_e, line) => fs.appendFile(logFilePath(), line + '\n', () => {}));
ipcMain.handle('get-log-path', () => logFilePath());
ipcMain.handle('open-log-folder', () => shell.openPath(logDir()));
ipcMain.handle('app-version', () => appVersion());
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

/* ---- self-updater: git pull + npm install, then caller may relaunch ---- */
function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, windowsHide: true, timeout: 120000, shell: process.platform === 'win32' },
      (err, stdout, stderr) => resolve({ ok: !err, out: (stdout || '') + (stderr || '') }));
  });
}
ipcMain.handle('check-update', async () => {
  const root = repoRoot();
  if (!fs.existsSync(path.join(root, '.git'))) {
    return { ok: false, out: 'Not a git checkout — reinstall from the IONITY drive to enable updates.' };
  }
  const fetch = await run('git', ['-C', root, 'fetch', '--quiet']);
  const local = await run('git', ['-C', root, 'rev-parse', 'HEAD']);
  const remote = await run('git', ['-C', root, 'rev-parse', '@{u}']);
  const behind = local.out.trim() !== remote.out.trim();
  return { ok: fetch.ok, behind, local: local.out.trim().slice(0, 7), remote: remote.out.trim().slice(0, 7) };
});
ipcMain.handle('apply-update', async () => {
  const root = repoRoot();
  const pull = await run('git', ['-C', root, 'pull', '--ff-only']);
  if (!pull.ok) return pull;
  const install = await run('npm', ['install', '--no-audit', '--no-fund'], path.join(root, 'desktop'));
  return { ok: install.ok, out: pull.out + '\n' + install.out };
});
ipcMain.handle('relaunch', () => { app.relaunch(); app.exit(0); });

/* ---- Cloud AI briefing ----
 * Saves a telemetry snapshot + a briefing to the user's Documents\IONITY\
 * briefings folder (which OneDrive/Drive mirror if that's their Documents).
 * If ANTHROPIC_API_KEY is set in the environment, it also asks Claude for a
 * natural-language read; otherwise it writes the local heuristic summary. */
ipcMain.handle('save-briefing', async (_e, payload) => {
  const dir = path.join(app.getPath('documents'), 'IONITY', 'briefings');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(dir, `picolink-snapshot-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload.snapshot, null, 2));

  let briefing = payload.localBriefing || '';
  let usedCloud = false;
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5', max_tokens: 700,
          messages: [{ role: 'user', content:
            'You are analysing live RF telemetry from an IONITY PicoLink dongle. ' +
            'Give a concise, friendly situational briefing (what is around, congestion, anything notable). ' +
            'Telemetry JSON:\n' + JSON.stringify(payload.snapshot) }]
        })
      });
      const j = await res.json();
      const txt = j?.content?.[0]?.text;
      if (txt) { briefing = txt; usedCloud = true; }
    } catch (e) { briefing += `\n\n(cloud briefing failed: ${e.message})`; }
  }
  const mdPath = path.join(dir, `picolink-briefing-${stamp}.md`);
  fs.writeFileSync(mdPath,
    `# IONITY PicoLink briefing\n\n_${new Date().toLocaleString()}_ · ` +
    `${usedCloud ? 'Claude cloud analysis' : 'on-device heuristic'}\n\n${briefing}\n`);
  return { ok: true, mdPath, jsonPath, usedCloud };
});
ipcMain.handle('open-path', (_e, p) => shell.showItemInFolder(p));

/* ---- Wi-Fi geolocation ----
 * Estimates the dongle's position from the surrounding APs' BSSIDs using
 * Google's Geolocation API (standard positioning, same as laptops). Needs a
 * key in GOOGLE_GEOLOCATION_KEY (or passed in). Online-only; GPS is the
 * offline path. Nothing is transmitted except the AP MAC/RSSI list you already
 * observe. */
ipcMain.handle('geolocate', async (_e, aps) => {
  const key = process.env.GOOGLE_GEOLOCATION_KEY;
  if (!key) return { ok: false, need: 'key', msg: 'Set GOOGLE_GEOLOCATION_KEY to enable Wi-Fi positioning (or use an attached GPS).' };
  const wifiAccessPoints = (aps || [])
    .filter(a => a.bssid && /^[0-9a-f:]{17}$/i.test(a.bssid))
    .map(a => ({ macAddress: a.bssid, signalStrength: a.rssi, channel: a.ch }));
  if (wifiAccessPoints.length < 2) return { ok: false, msg: 'Need at least 2 APs with BSSIDs (flash firmware v1.4.0+ so BSSIDs are reported).' };
  try {
    const res = await fetch('https://www.googleapis.com/geolocation/v1/geolocate?key=' + key, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ considerIp: false, wifiAccessPoints })
    });
    const j = await res.json();
    if (j?.location) return { ok: true, lat: j.location.lat, lng: j.location.lng, accuracy: j.accuracy, aps: wifiAccessPoints.length };
    return { ok: false, msg: j?.error?.message || 'no fix' };
  } catch (e) { return { ok: false, msg: e.message }; }
});

/* ---- site-survey export (wardriving-style CSV + JSON) ---- */
ipcMain.handle('save-survey', async (_e, survey) => {
  const dir = path.join(app.getPath('documents'), 'IONITY', 'surveys');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(dir, `picolink-survey-${stamp}`);
  fs.writeFileSync(base + '.json', JSON.stringify(survey, null, 2));
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['kind', 'id', 'name', 'security/sig', 'rssi', 'dist_m', 'channel', 'lat', 'lng', 'seen']];
  (survey.wifi || []).forEach(n => rows.push(['wifi', n.bssid || '', n.ssid || '', n.sec || '', n.rssi, '', n.ch || '', survey.lat ?? '', survey.lng ?? '', survey.at]));
  (survey.classic || []).forEach(d => rows.push(['classic', d.addr, d.name || '', d.cat || d.cod || '', d.rssi, d.dist_m ?? '', '', survey.lat ?? '', survey.lng ?? '', survey.at]));
  (survey.ble || []).forEach(d => rows.push(['ble', d.addr, d.name || '', d.cat || d.atype || '', d.rssi, d.dist_m ?? '', '', survey.lat ?? '', survey.lng ?? '', survey.at]));
  fs.writeFileSync(base + '.csv', rows.map(r => r.map(esc).join(',')).join('\r\n'));
  return { ok: true, csvPath: base + '.csv', jsonPath: base + '.json',
           counts: { wifi: (survey.wifi || []).length, classic: (survey.classic || []).length, ble: (survey.ble || []).length } };
});

/* ---- persistent device database (maps every device seen, with distance) ----
 * A local, append-merge store in Documents\IONITY\device-db.json: one record
 * per address with first/last seen, sighting count, best RSSI, closest range,
 * category, and last known location. Fed from the live lists each poll. */
const dbPath = () => {
  const dir = path.join(app.getPath('documents'), 'IONITY');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'device-db.json');
};
let deviceDb = {};
try { deviceDb = JSON.parse(fs.readFileSync(dbPath(), 'utf8')); } catch { deviceDb = {}; }
let dbDirty = false, dbTimer = null;
const dbSave = () => {
  dbDirty = true;
  if (dbTimer) return;
  dbTimer = setTimeout(() => { dbTimer = null; if (!dbDirty) return; dbDirty = false;
    try { fs.writeFileSync(dbPath(), JSON.stringify(deviceDb)); } catch {} }, 4000);
};

ipcMain.handle('db-record', (_e, { devices, wifi, location, ts }) => {
  const now = ts || Date.now();
  const upd = (key, rec) => {
    const e = deviceDb[key] || { key, first: now, count: 0, bestRssi: -127, minDist: null };
    e.last = now; e.count++;
    e.kind = rec.kind; e.name = rec.name || e.name; e.cat = rec.cat || e.cat;
    if (rec.rssi != null && rec.rssi > e.bestRssi) e.bestRssi = rec.rssi;
    e.lastRssi = rec.rssi;
    if (rec.dist_m != null && (e.minDist == null || rec.dist_m < e.minDist)) e.minDist = rec.dist_m;
    e.lastDist = rec.dist_m ?? e.lastDist;
    if (rec.ssid) e.ssid = rec.ssid;
    if (rec.sec) e.sec = rec.sec;
    if (location?.lat != null) { e.lat = location.lat; e.lng = location.lng; }
    deviceDb[key] = e;
  };
  (devices || []).forEach(d => d.addr && upd(d.kind + ':' + d.addr, d));
  (wifi || []).forEach(n => n.bssid && upd('wifi:' + n.bssid, { ...n, kind: 'wifi' }));
  dbSave();
  return { ok: true, size: Object.keys(deviceDb).length };
});
ipcMain.handle('db-summary', () => ({ size: Object.keys(deviceDb).length, records: Object.values(deviceDb) }));
ipcMain.handle('db-clear', () => { deviceDb = {}; try { fs.writeFileSync(dbPath(), '{}'); } catch {} return { ok: true }; });
ipcMain.handle('db-export', () => {
  const dir = path.join(app.getPath('documents'), 'IONITY', 'surveys');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `device-db-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['key', 'kind', 'name/ssid', 'cat/sec', 'count', 'bestRssi', 'minDist_m', 'lastDist_m', 'first', 'last', 'lat', 'lng']];
  Object.values(deviceDb).forEach(e => rows.push([e.key, e.kind, e.name || e.ssid || '', e.cat || e.sec || '',
    e.count, e.bestRssi, e.minDist ?? '', e.lastDist ?? '', new Date(e.first).toISOString(), new Date(e.last).toISOString(), e.lat ?? '', e.lng ?? '']));
  fs.writeFileSync(p, rows.map(r => r.map(esc).join(',')).join('\r\n'));
  return { ok: true, path: p, size: Object.keys(deviceDb).length };
});

/* rolling telemetry log (STAT timeseries) */
ipcMain.handle('telemetry-log', (_e, stat) => {
  try {
    const dir = path.join(app.getPath('documents'), 'IONITY', 'telemetry');
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, `telemetry-${new Date().toISOString().slice(0, 10)}.csv`);
    if (!fs.existsSync(p)) fs.writeFileSync(p, 'time,radio,temp_c,wifi_nets,bt,ble,near,moving,drops,wifi_link\r\n');
    const r = [new Date().toISOString(), stat.radio, stat.temp_c, stat.wifi_nets, stat.bt, stat.ble,
               stat.near ?? '', stat.moving ?? '', stat.drops, stat.wifi_link ?? ''].join(',');
    fs.appendFile(p, r + '\r\n', () => {});
  } catch {}
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  buildTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(); else win.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
