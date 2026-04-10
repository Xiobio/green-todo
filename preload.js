const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  backupTodos: (jsonString) => ipcRenderer.send('backup-todos', jsonString),
  loadTodosBackup: () => ipcRenderer.invoke('load-todos-backup'),
  updateTrayProgress: (total, completed) => ipcRenderer.send('update-tray-progress', total, completed),
  previewPetState: (index) => ipcRenderer.send('preview-pet-state', index),
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
