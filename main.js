const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 单实例锁 — 同时只能运行一个
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let mainWindow = null;
let tray = null;
let isFirstLaunch = true;
let currentHotkey = null;

// ---- Config persistence ----
const configPath = path.join(app.getPath('userData'), 'green-todo-config.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { return {}; }
}

function saveConfig(cfg) {
  try { fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2)); } catch {}
}

function registerHotkey(accelerator) {
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey);
  }
  const ok = globalShortcut.register(accelerator, toggleWindow);
  if (ok) {
    currentHotkey = accelerator;
    return true;
  }
  // Fallback: try to re-register the old one
  if (currentHotkey && currentHotkey !== accelerator) {
    globalShortcut.register(currentHotkey, toggleWindow);
  }
  return false;
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 680,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: false,
    icon: createTrayIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    if (isFirstLaunch) {
      isFirstLaunch = false;
      centerAndShow();
    }
  });

  // Close button hides to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTrayIcon() {
  // Create a minimal valid PNG programmatically (32x32 green circle with yellow center)
  // Using raw bitmap approach that Electron supports on Windows
  const size = 32;
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2, r = 13;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      // Yellow center (flower)
      const cdist = Math.sqrt(dx * dx + (dy + 2) * (dy + 2));
      if (cdist <= 4) {
        pixels[idx] = 251; pixels[idx+1] = 191; pixels[idx+2] = 36; pixels[idx+3] = 255;
      } else if (dist <= r) {
        pixels[idx] = 34; pixels[idx+1] = 197; pixels[idx+2] = 94; pixels[idx+3] = 255;
      } else if (dist <= r + 1) {
        const a = Math.max(0, Math.round(255 * (r + 1 - dist)));
        pixels[idx] = 34; pixels[idx+1] = 197; pixels[idx+2] = 94; pixels[idx+3] = a;
      }
    }
  }

  // Encode as minimal PNG manually
  const png = encodePNG(size, size, pixels);
  return nativeImage.createFromBuffer(png);
}

function encodePNG(w, h, rgba) {
  // Minimal PNG encoder (uncompressed)
  const { deflateSync } = require('zlib');

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw image data with filter byte (0 = None) per row
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const compressed = deflateSync(raw);

  // Build PNG file
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crcData = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4);
    crc.writeInt32BE(crc32(crcData));
    return Buffer.concat([len, t, data, crc]);
  }

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
      }
    }
    return (c ^ 0xFFFFFFFF) | 0;
  }

  const iend = Buffer.alloc(0);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', iend)]);
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Green Todo - Ctrl+Space');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示/隐藏', click: toggleWindow },
    { type: 'separator' },
    { label: '导出数据...', click: () => { if (mainWindow) mainWindow.webContents.send('trigger-export'); } },
    { label: '导入数据...', click: () => { if (mainWindow) mainWindow.webContents.send('trigger-import'); } },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', toggleWindow);
}

function centerAndShow() {
  if (!mainWindow) return;
  const { screen } = require('electron');
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { width, height } = display.workAreaSize;
  const { x: dx, y: dy } = display.workArea;
  const [winWidth, winHeight] = mainWindow.getSize();
  mainWindow.setPosition(
    Math.round(dx + (width - winWidth) / 2),
    Math.round(dy + (height - winHeight) / 2)
  );
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    centerAndShow();
  }
}

app.whenReady().then(() => {
  createWindow();
  try { createTray(); } catch (e) { console.error('Tray creation failed:', e); }
  // Load saved hotkey or use default
  const cfg = loadConfig();
  const savedKey = cfg.hotkey || 'Ctrl+Space';
  if (!registerHotkey(savedKey)) {
    registerHotkey('Ctrl+Alt+T');
  }
  if (tray) tray.setToolTip(`Green Todo - ${currentHotkey || savedKey}`);
});

ipcMain.handle('get-hotkey', () => currentHotkey || 'Ctrl+Space');

ipcMain.handle('set-hotkey', (_e, newKey) => {
  const ok = registerHotkey(newKey);
  if (ok) {
    const cfg = loadConfig();
    cfg.hotkey = newKey;
    saveConfig(cfg);
    if (tray) tray.setToolTip(`Green Todo - ${newKey}`);
  }
  return { success: ok, hotkey: currentHotkey };
});

ipcMain.on('hide-window', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('app-quit', () => {
  app.isQuitting = true;
  app.quit();
});

ipcMain.on('toggle-always-on-top', () => {
  if (mainWindow) {
    const isOnTop = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isOnTop);
    mainWindow.webContents.send('always-on-top-changed', !isOnTop);
  }
});

// Export data handler
ipcMain.handle('export-data', async (_event, jsonString) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出待办数据',
    defaultPath: `green-todo-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { success: false };
  try {
    fs.writeFileSync(filePath, jsonString, 'utf-8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Import data handler
ipcMain.handle('import-data', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '导入待办数据',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths || !filePaths[0]) return { success: false };
  try {
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    return { success: true, data: content };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Don't quit — keep tray alive
});
