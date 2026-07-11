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
