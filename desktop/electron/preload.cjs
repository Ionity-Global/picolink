const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picolink', {
  appendLog:   (line) => ipcRenderer.send('append-log', line),
  radioState:  (on)   => ipcRenderer.send('radio-state', on),
  getLogPath:  ()     => ipcRenderer.invoke('get-log-path'),
  openLogs:    ()     => ipcRenderer.invoke('open-log-folder'),
  onTrayCmd:   (cb)   => ipcRenderer.on('tray-cmd', (_e, cmd) => cb(cmd)),
  platform: process.platform
});
