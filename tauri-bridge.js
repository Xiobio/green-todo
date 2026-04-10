// Tauri bridge — re-creates window.electronAPI using Tauri's invoke/listen.
(function() {
  function setup() {
    if (!window.__TAURI__) return false;
    const { invoke } = window.__TAURI__.core;
    const { listen } = window.__TAURI__.event;

    window.electronAPI = {
      platform: navigator.platform.includes('Mac') ? 'darwin' :
                navigator.platform.includes('Win') ? 'win32' : 'linux',
      backupTodos: (json) => invoke('backup_todos', { jsonString: json }),
      loadTodosBackup: () => invoke('load_todos_backup'),
      updateTrayProgress: (t, c) => invoke('update_tray_progress', { total: t, completed: c }).catch(() => {}),
      previewPetState: (i) => invoke('preview_pet_state', { index: i }).catch(() => {}),
      hideWindow: () => invoke('hide_window'),
      quitApp: () => invoke('quit_app'),
      toggleAlwaysOnTop: () => invoke('toggle_always_on_top'),
      onAlwaysOnTopChanged: (cb) => listen('always-on-top-changed', (e) => cb(e.payload)),
      exportData: (j) => invoke('export_data', { jsonStr: j }),
      importData: () => invoke('import_data'),
      getHotkey: () => invoke('get_hotkey'),
      setHotkey: (k) => invoke('set_hotkey', { key: k }),
      onTriggerExport: (cb) => listen('trigger-export', () => cb()),
      onTriggerImport: (cb) => listen('trigger-import', () => cb()),
    };
    document.documentElement.setAttribute('data-platform', window.electronAPI.platform);
    return true;
  }
  if (!setup()) {
    document.addEventListener('DOMContentLoaded', setup);
  }
})();
