const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  hideWindow: () => ipcRenderer.send('hide-window'),
  quitApp: () => ipcRenderer.send('app-quit'),
  toggleAlwaysOnTop: () => ipcRenderer.send('toggle-always-on-top'),
  onAlwaysOnTopChanged: (cb) => ipcRenderer.on('always-on-top-changed', (_e, val) => cb(val)),
  exportData: (jsonStr) => ipcRenderer.invoke('export-data', jsonStr),
  importData: () => ipcRenderer.invoke('import-data'),
  getHotkey: () => ipcRenderer.invoke('get-hotkey'),
  setHotkey: (key) => ipcRenderer.invoke('set-hotkey', key),
  onTriggerExport: (cb) => ipcRenderer.on('trigger-export', () => cb()),
  onTriggerImport: (cb) => ipcRenderer.on('trigger-import', () => cb()),
});
