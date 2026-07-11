const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picolink', {
  /* logs + tray */
  appendLog:   (line) => ipcRenderer.send('append-log', line),
  radioState:  (on)   => ipcRenderer.send('radio-state', on),
  getLogPath:  ()     => ipcRenderer.invoke('get-log-path'),
  openLogs:    ()     => ipcRenderer.invoke('open-log-folder'),
  onTrayCmd:   (cb)   => ipcRenderer.on('tray-cmd', (_e, cmd) => cb(cmd)),

  /* Web Bluetooth device picker */
  onBleScanList: (cb) => ipcRenderer.on('ble-scan-list', (_e, list) => cb(list)),
  bleSelect:   (id)   => ipcRenderer.send('ble-select', id),
  bleCancel:   ()     => ipcRenderer.send('ble-cancel'),

  /* misc + updater */
  version:     ()     => ipcRenderer.invoke('app-version'),
  openExternal:(url)  => ipcRenderer.invoke('open-external', url),
  checkUpdate: ()     => ipcRenderer.invoke('check-update'),
  applyUpdate: ()     => ipcRenderer.invoke('apply-update'),
  relaunch:    ()     => ipcRenderer.invoke('relaunch'),
  saveBriefing:(p)    => ipcRenderer.invoke('save-briefing', p),
  showItem:    (p)    => ipcRenderer.invoke('open-path', p),

  platform: process.platform
});
