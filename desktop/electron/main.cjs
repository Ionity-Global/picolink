/**
 * IONITY PicoLink Console — Electron main process
 * © 2026 Ionity Global (Pty) Ltd — MIT (code)
 *
 * The renderer talks to the dongle via Web Serial (no native modules).
 * Main auto-grants the serial port for the PicoLink (VID 0x2E8A / PID 0x986A),
 * provides the tray, and appends logs to a rolling file in userData.
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PICOLINK_VID = 0x2E8A;   // Raspberry Pi
const PICOLINK_PID = 0x986A;   // IONITY PicoLink

let win = null;
let tray = null;
let radioOn = true;

const logDir = () => {
  const d = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

function logFilePath() {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(logDir(), `picolink-${day}.log`);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 700,
    minWidth: 760,
    minHeight: 520,
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

  /* Auto-select the PicoLink CDC port — no chooser dialog needed. */
  win.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    const pick =
      portList.find(p => parseInt(p.vendorId, 16) === PICOLINK_VID || Number(p.vendorId) === PICOLINK_VID) ||
      portList[0];
    callback(pick ? pick.portId : '');
  });

  ses.setPermissionCheckHandler((wc, permission) =>
    ['serial'].includes(permission) ? true : false);
  ses.setDevicePermissionHandler(details =>
    details.deviceType === 'serial');

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', (e) => {
    if (!app.isQuiting && tray) {
      e.preventDefault();
      win.hide();               /* keep running in tray */
    }
  });
}

function trayIcon() {
  const p = path.join(__dirname, '..', 'assets', 'icon.png');
  try {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
  } catch (_) {}
  return nativeImage.createEmpty();
}

function buildTray() {
  tray = new Tray(trayIcon());
  const refresh = () => {
    tray.setToolTip('IONITY PicoLink');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'IONITY PicoLink Console', enabled: false },
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

/* Renderer streams every log line here; we append to the day file. */
ipcMain.on('append-log', (_e, line) => {
  fs.appendFile(logFilePath(), line + '\n', () => {});
});
ipcMain.handle('get-log-path', () => logFilePath());
ipcMain.handle('open-log-folder', () => shell.openPath(logDir()));

app.whenReady().then(() => {
  createWindow();
  buildTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else win.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
