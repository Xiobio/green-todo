const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const IS_MAC = process.platform === 'darwin';

// Startup tracing — set GREEN_TODO_TRACE=1 to enable.
const trace = process.env.GREEN_TODO_TRACE
  ? (() => {
      const T0 = Date.now();
      const logPath = path.join(require('os').homedir(), 'greentodo-startup.log');
      let buf = `START ${new Date().toISOString()} pid=${process.pid}\n`;
      return (label) => {
        buf += `${Date.now() - T0}ms ${label}\n`;
        try { fs.writeFileSync(logPath, buf); } catch {}
      };
    })()
  : () => {};
trace('main.js:loaded');

// 单实例锁 — 同时只能运行一个
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let mainWindow = null;
let tray = null;
let isFirstLaunch = true;
let currentHotkey = null;

// ---- Data backup persistence (protects against localStorage/LevelDB corruption) ----
const backupPath = path.join(app.getPath('userData'), 'todos-backup.json');
const backupTmpPath = backupPath + '.tmp';

// Atomic write: write to .tmp first, then rename. Prevents half-written files.
function saveTodosBackup(jsonString) {
  try {
    fs.writeFileSync(backupTmpPath, jsonString, 'utf-8');
    fs.renameSync(backupTmpPath, backupPath);
  } catch (e) {
    console.error('[backup] write failed:', e.message);
  }
}

function loadTodosBackup() {
  try {
    if (fs.existsSync(backupPath)) {
      const data = fs.readFileSync(backupPath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return data;
    }
  } catch (e) {
    console.error('[backup] read failed:', e.message);
  }
  return null;
}

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
  trace('createWindow:start');
  const windowOpts = {
    width: 440,
    height: 680,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    icon: IS_MAC ? undefined : createMacTrayIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    }
  };
  if (IS_MAC) {
    // vibrancy REPLACES transparent on macOS — they are mutually exclusive.
    windowOpts.vibrancy = 'under-window';
  } else {
    windowOpts.transparent = true;
  }
  mainWindow = new BrowserWindow(windowOpts);
  trace('BrowserWindow:created');

  if (process.env.GREEN_TODO_TRACE) {
    mainWindow.webContents.on('dom-ready', () => trace('wc:dom-ready'));
    mainWindow.webContents.on('did-finish-load', () => trace('wc:did-finish-load'));
    mainWindow.on('show', () => trace('win:show'));
  }
  mainWindow.loadFile('index.html');

  if (IS_MAC) {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  mainWindow.once('ready-to-show', () => {
    trace('ready-to-show');
    if (isFirstLaunch) {
      isFirstLaunch = false;
      centerAndShow();
      trace('first-show');
    }
  });

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

// ---- Tray pet icon ----

function fillCircle(buf, W, cx, cy, r, R, G, B, A) {
  for (let y = Math.max(0, Math.floor(cy-r-1)); y <= Math.min(Math.floor(cy+r+1), 999); y++) {
    for (let x = Math.max(0, Math.floor(cx-r-1)); x <= Math.min(Math.floor(cx+r+1), 999); x++) {
      if (x >= W || y*W+x >= buf.length/4) continue;
      const d = Math.sqrt((x+0.5-cx)**2 + (y+0.5-cy)**2);
      if (d <= r+0.8) {
        const a = d <= r ? A : Math.round(A * Math.max(0, 1-(d-r)/0.8));
        if (a <= 0) continue;
        const i = (y*W+x)*4;
        const srcA=a/255, dstA=buf[i+3]/255, outA=srcA+dstA*(1-srcA);
        if (outA > 0) {
          buf[i]   = Math.round((R*srcA + buf[i]  *dstA*(1-srcA)) / outA);
          buf[i+1] = Math.round((G*srcA + buf[i+1]*dstA*(1-srcA)) / outA);
          buf[i+2] = Math.round((B*srcA + buf[i+2]*dstA*(1-srcA)) / outA);
          buf[i+3] = Math.round(outA * 255);
        }
      }
    }
  }
}

function fillRoundRect(buf, W, x0, y0, w, h, r, R, G, B, A) {
  for (let y = y0; y < y0+h; y++) for (let x = x0; x < x0+w; x++) {
    if (x < 0 || x >= W) continue;
    let inside = true;
    for (const [cx2,cy2] of [[x0+r,y0+r],[x0+w-r,y0+r],[x0+r,y0+h-r],[x0+w-r,y0+h-r]]) {
      if ((x+0.5<cx2&&y+0.5<cy2)||(x+0.5>x0+w-r&&y+0.5<cy2)||(x+0.5<cx2&&y+0.5>y0+h-r)||(x+0.5>x0+w-r&&y+0.5>y0+h-r)) {
        if (Math.sqrt((x+0.5-cx2)**2+(y+0.5-cy2)**2)>r+0.5){inside=false;break;}
      }
    }
    if (!inside) continue;
    const i=(y*W+x)*4; buf[i]=R;buf[i+1]=G;buf[i+2]=B;buf[i+3]=A;
  }
}

function eraseCircle(buf, W, cx, cy, r) {
  for (let y=Math.floor(cy-r-1);y<=Math.ceil(cy+r+1);y++) for (let x=Math.floor(cx-r-1);x<=Math.ceil(cx+r+1);x++) {
    if (x<0||x>=W||y<0) continue;
    const d=Math.sqrt((x+0.5-cx)**2+(y+0.5-cy)**2), i=(y*W+x)*4;
    if(i<0||i>=buf.length-3)continue;
    if(d<=r)buf[i+3]=0; else if(d<=r+0.8)buf[i+3]=Math.min(buf[i+3],Math.round(255*((d-r)/0.8)));
  }
}

function eraseLine(buf, W, x0, x1, y) {
  for (let x=x0;x<=x1;x++){const i=(y*W+x)*4;if(i>=0&&i<buf.length-3)buf[i+3]=0;}
}

function fillTriangle(buf, W, x0, y0, x1, y1, x2, y2, R, G, B, A) {
  const minY=Math.max(0,Math.min(y0,y1,y2)|0), maxY=Math.min(999,Math.max(y0,y1,y2)|0);
  const minX=Math.max(0,Math.min(x0,x1,x2)|0), maxX=Math.min(W-1,Math.max(x0,x1,x2)|0);
  for (let y=minY;y<=maxY;y++) for (let x=minX;x<=maxX;x++) {
    const px=x+0.5,py=y+0.5;
    const d0=(x1-x0)*(py-y0)-(y1-y0)*(px-x0);
    const d1=(x2-x1)*(py-y1)-(y2-y1)*(px-x1);
    const d2=(x0-x2)*(py-y2)-(y0-y2)*(px-x2);
    if((d0>=0&&d1>=0&&d2>=0)||(d0<=0&&d1<=0&&d2<=0)){
      const i=(y*W+x)*4;if(i>=0&&i<buf.length-3){buf[i]=R;buf[i+1]=G;buf[i+2]=B;buf[i+3]=A;}
    }
  }
}

// Plant spirit — 15 unique states. Plant grows seed→flower, with expression variants per stage.
// Each day starts with a random variant based on date hash.

// 15 states: [plantStage, expressionVariant]
// Plant stages: seed, sprout, twoLeaf, bigLeaf, bud, flower
// Expression variants add personality: blink, tongue, yawn, wink, surprised, etc.
const PET_STATES = [
  // --- 0% (sleeping) ---
  { id: 'sleep_normal',  plant: 'seed',    eyes: 'closed',   mouth: 'none',   blush: true  },
  { id: 'sleep_zzz',     plant: 'seed',    eyes: 'closed',   mouth: 'none',   blush: true,  zzz: true },
  // --- 1-14% (tired) ---
  { id: 'tired_droopy',  plant: 'sprout',  eyes: 'half',     mouth: 'frown',  blush: false },
  { id: 'tired_yawn',    plant: 'sprout',  eyes: 'closed',   mouth: 'O',      blush: false },
  // --- 15-34% (meh) ---
  { id: 'meh_blink',     plant: 'twoLeaf', eyes: 'wink',     mouth: 'line',   blush: false },
  { id: 'meh_normal',    plant: 'twoLeaf', eyes: 'dot',      mouth: 'line',   blush: false },
  // --- 35-54% (okay) ---
  { id: 'okay_normal',   plant: 'twoLeaf', eyes: 'dot',      mouth: 'smile',  blush: false },
  { id: 'okay_curious',  plant: 'twoLeaf', eyes: 'dotUp',    mouth: 'o',      blush: false },
  // --- 55-79% (happy) ---
  { id: 'happy_smile',   plant: 'bigLeaf', eyes: 'arc',      mouth: 'smile',  blush: true  },
  { id: 'happy_tongue',  plant: 'bigLeaf', eyes: 'arc',      mouth: 'tongue', blush: true  },
  { id: 'happy_wink',    plant: 'bigLeaf', eyes: 'winkHappy',mouth: 'grin',   blush: true  },
  // --- 80-99% (excited) ---
  { id: 'excited_sparkle',plant:'bud',     eyes: 'big',      mouth: 'grin',   blush: true  },
  { id: 'excited_star',  plant: 'bud',     eyes: 'star',     mouth: 'grin',   blush: true  },
  // --- 100% (celebrate) ---
  { id: 'celebrate_wow', plant: 'flower',  eyes: 'huge',     mouth: 'huge',   blush: true  },
  { id: 'celebrate_love',plant: 'flower',  eyes: 'heart',    mouth: 'huge',   blush: true  },
];

function getPetState(total, completed) {
  if (total === 0) return 'happy_smile';
  const pct = completed / total;
  // Determine stage
  let pool;
  if (pct >= 1)        pool = PET_STATES.filter(s => s.plant === 'flower');
  else if (pct >= 0.8) pool = PET_STATES.filter(s => s.plant === 'bud');
  else if (pct >= 0.55)pool = PET_STATES.filter(s => s.plant === 'bigLeaf');
  else if (pct >= 0.35)pool = PET_STATES.filter(s => s.id.startsWith('okay'));
  else if (pct >= 0.15)pool = PET_STATES.filter(s => s.id.startsWith('meh'));
  else if (pct > 0)    pool = PET_STATES.filter(s => s.plant === 'sprout');
  else                 pool = PET_STATES.filter(s => s.plant === 'seed');
  // Pick variant based on today's date (changes daily)
  const day = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < day.length; i++) hash = (hash * 31 + day.charCodeAt(i)) | 0;
  return pool[Math.abs(hash) % pool.length].id;
}

function renderPetIcon(total, completed) {
  const stateId = getPetState(total, completed);
  return renderPetIconForState(PET_STATES.find(s => s.id === stateId) || PET_STATES[0], total, completed);
}

function renderPetIconForState(state, total, completed) {
  const cells = Math.min(total, 10);
  const filled = total <= 10 ? completed : Math.round(completed / total * 10);

  const cellW = 5, cellH = 4, cellGap = 2;
  const batW = cells > 0 ? cells * (cellW + cellGap) - cellGap : 0;
  const W = Math.max(44, batW + 4);
  const batY = 40;
  const H = cells > 0 ? batY + cellH + 1 : 40;
  const cx = Math.floor(W / 2);
  const bodyR = 13, bodyY = 26;
  const K = 0;

  const buf = Buffer.alloc(W * H * 4);

  // --- Body ---
  fillCircle(buf, W, cx, bodyY, bodyR, K,K,K,255);
  eraseCircle(buf, W, cx-4, bodyY-5, 3);
  fillCircle(buf, W, cx-4, bodyY-5, 3, K,K,K,80);
  // Feet
  fillCircle(buf, W, cx-5, bodyY+bodyR-1, 3, K,K,K,255);
  fillCircle(buf, W, cx+5, bodyY+bodyR-1, 3, K,K,K,255);

  // ====== PLANT ======
  const sb = bodyY - bodyR;

  if (state.plant === 'seed') {
    fillCircle(buf, W, cx, sb-2, 3.5, K,K,K,255);
  } else if (state.plant === 'sprout') {
    for (let y=sb;y>=sb-8;y--) fillCircle(buf,W,cx,y,1.5,K,K,K,255);
    fillCircle(buf,W,cx+4,sb-6,3.5,K,K,K,255);
    fillCircle(buf,W,cx+2,sb-5,2.5,K,K,K,255);
  } else if (state.plant === 'twoLeaf') {
    for (let y=sb;y>=sb-9;y--) fillCircle(buf,W,cx,y,1.8,K,K,K,255);
    fillCircle(buf,W,cx-4,sb-7,3.5,K,K,K,255);fillCircle(buf,W,cx-2,sb-5,2.5,K,K,K,255);
    fillCircle(buf,W,cx+4,sb-7,3.5,K,K,K,255);fillCircle(buf,W,cx+2,sb-5,2.5,K,K,K,255);
  } else if (state.plant === 'bigLeaf') {
    for (let y=sb;y>=sb-10;y--) fillCircle(buf,W,cx,y,2,K,K,K,255);
    fillCircle(buf,W,cx-7,sb-9,5,K,K,K,255);fillCircle(buf,W,cx-4,sb-6,3,K,K,K,255);
    fillCircle(buf,W,cx+7,sb-9,5,K,K,K,255);fillCircle(buf,W,cx+4,sb-6,3,K,K,K,255);
  } else if (state.plant === 'bud') {
    for (let y=sb;y>=sb-9;y--) fillCircle(buf,W,cx,y,2,K,K,K,255);
    fillCircle(buf,W,cx-4,sb-4,3,K,K,K,255);fillCircle(buf,W,cx+4,sb-4,3,K,K,K,255);
    const budCy=sb-13;
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      const dx=(x+0.5-cx)/4,dy=(y+0.5-budCy)/6;
      if(dx*dx+dy*dy<=1){const i=(y*W+x)*4;buf[i]=buf[i+1]=buf[i+2]=K;buf[i+3]=255;}
    }
  } else if (state.plant === 'flower') {
    for (let y=sb;y>=sb-8;y--) fillCircle(buf,W,cx,y,2,K,K,K,255);
    fillCircle(buf,W,cx-4,sb-4,3,K,K,K,255);fillCircle(buf,W,cx+4,sb-4,3,K,K,K,255);
    const fx=cx,fy=sb-13;
    for (let a=0;a<5;a++){
      const angle=-Math.PI/2+(a*Math.PI*2/5);
      fillCircle(buf,W,fx+Math.cos(angle)*7,fy+Math.sin(angle)*6,4.5,K,K,K,255);
    }
    eraseCircle(buf,W,fx,fy,3);fillCircle(buf,W,fx,fy,3,K,K,K,160);
  }

  // ====== EYES — only clean simple shapes ======
  const eyeY = bodyY - 3, eyeS = 5;

  // Helper: clean arc cutout (for closed/happy eyes)
  function eyeArc(ex, ey, dir) { // dir: 1=down(closed), -1=up(happy)
    for (let dx=-3;dx<=3;dx++) {
      const dy = Math.abs(dx)<=1 ? dir : 0;
      const i = ((ey+dy)*W+ex+dx)*4; if(i>=0&&i<buf.length-3) buf[i+3]=0;
      const i2 = ((ey+dy+dir)*W+ex+dx)*4; if(i2>=0&&i2<buf.length-3) buf[i2+3]=0;
    }
  }

  if (state.eyes === 'closed') {
    // Clean closed arcs ⌒⌒
    for (const s of [-1,1]) eyeArc(cx+s*eyeS, eyeY, 1);
  } else if (state.eyes === 'half') {
    // Small round eyes (smaller than normal = sleepy)
    for (const s of [-1,1]) eraseCircle(buf,W,cx+s*eyeS,eyeY,2);
  } else if (state.eyes === 'dot') {
    // Normal round eyes with pupil
    for (const s of [-1,1]) { eraseCircle(buf,W,cx+s*eyeS,eyeY,3.5); fillCircle(buf,W,cx+s*eyeS,eyeY+0.5,1.5,K,K,K,255); }
  } else if (state.eyes === 'dotUp') {
    // Looking up (pupil shifted up)
    for (const s of [-1,1]) { const ex=cx+s*eyeS; eraseCircle(buf,W,ex,eyeY,3.5); fillCircle(buf,W,ex,eyeY-1,1.5,K,K,K,255); }
  } else if (state.eyes === 'wink') {
    // Left: normal eye. Right: closed arc
    eraseCircle(buf,W,cx-eyeS,eyeY,3.5); fillCircle(buf,W,cx-eyeS,eyeY+0.5,1.5,K,K,K,255);
    eyeArc(cx+eyeS, eyeY, 1);
  } else if (state.eyes === 'winkHappy') {
    // Left: happy arc. Right: closed arc
    eyeArc(cx-eyeS, eyeY, -1);
    eyeArc(cx+eyeS, eyeY, 1);
  } else if (state.eyes === 'arc') {
    // Happy arcs ∪∪
    for (const s of [-1,1]) eyeArc(cx+s*eyeS, eyeY, -1);
  } else if (state.eyes === 'big') {
    // Big round eyes with pupil + small highlight
    for (const s of [-1,1]) { const ex=cx+s*eyeS;
      eraseCircle(buf,W,ex,eyeY,4.5); fillCircle(buf,W,ex,eyeY+0.5,2.2,K,K,K,255); eraseCircle(buf,W,ex-1.5,eyeY-1.5,1);
    }
  } else if (state.eyes === 'star') {
    // Sparkle: big eyes with TWO highlight dots (looks sparkly without messy cross)
    for (const s of [-1,1]) { const ex=cx+s*eyeS;
      eraseCircle(buf,W,ex,eyeY,4.5); fillCircle(buf,W,ex,eyeY+0.5,2.2,K,K,K,255);
      eraseCircle(buf,W,ex-1.5,eyeY-1.5,1.2); eraseCircle(buf,W,ex+1,eyeY+1,0.8);
    }
  } else if (state.eyes === 'huge') {
    // Extra-large round eyes
    for (const s of [-1,1]) { const ex=cx+s*eyeS;
      eraseCircle(buf,W,ex,eyeY,5); fillCircle(buf,W,ex,eyeY+0.5,2.5,K,K,K,255); eraseCircle(buf,W,ex-2,eyeY-2,1.2);
    }
  } else if (state.eyes === 'heart') {
    // Two small circles side by side (reads as heart shape at tiny size)
    for (const s of [-1,1]) { const ex=cx+s*eyeS;
      eraseCircle(buf,W,ex-1.5,eyeY-0.5,2); eraseCircle(buf,W,ex+1.5,eyeY-0.5,2);
    }
  }

  // ====== MOUTH — only clean shapes ======
  const mY = bodyY + 5;
  if (state.mouth === 'frown') {
    // Thin downward arc
    for(let dx=-3;dx<=3;dx++){const dy=Math.abs(dx)<=1?0:-1;
      const i=((mY+dy)*W+cx+dx)*4;if(i>=0&&i<buf.length-3)buf[i+3]=0;}
  } else if (state.mouth === 'line') {
    // Simple dash
    eraseLine(buf,W,cx-3,cx+3,mY);
  } else if (state.mouth === 'o' || state.mouth === 'O') {
    // Small circle (o=tiny, O=small)
    eraseCircle(buf,W,cx,mY,state.mouth==='O'?2.5:1.5);
  } else if (state.mouth === 'smile') {
    // Clean thin U-curve
    for(let dx=-4;dx<=4;dx++){const dy=Math.abs(dx)<=1?2:Math.abs(dx)<=3?1:0;
      const i=((mY+dy)*W+cx+dx)*4;if(i>=0&&i<buf.length-3)buf[i+3]=0;}
  } else if (state.mouth === 'grin') {
    // Wider smile (but NOT the face-eating version)
    for(let dx=-5;dx<=5;dx++){const dy=Math.abs(dx)<=2?2:Math.abs(dx)<=4?1:0;
      const i=((mY+dy)*W+cx+dx)*4;if(i>=0&&i<buf.length-3)buf[i+3]=0;}
  } else if (state.mouth === 'tongue') {
    // Smile + small bump below (tongue sticking out of body silhouette)
    for(let dx=-4;dx<=4;dx++){const dy=Math.abs(dx)<=1?2:Math.abs(dx)<=3?1:0;
      const i=((mY+dy)*W+cx+dx)*4;if(i>=0&&i<buf.length-3)buf[i+3]=0;}
    // Tongue extends BELOW body as a small circle
    fillCircle(buf,W,cx,bodyY+bodyR+2,2.5,K,K,K,200);
  } else if (state.mouth === 'huge') {
    // Slightly bigger grin (controlled, not face-eating)
    for(let dx=-5;dx<=5;dx++){const dy=Math.abs(dx)<=2?3:Math.abs(dx)<=4?2:Math.abs(dx)<=5?1:0;
      const i=((mY+dy)*W+cx+dx)*4;if(i>=0&&i<buf.length-3)buf[i+3]=0;}
  }

  // ====== BLUSH ======
  if (state.blush) {
    fillCircle(buf,W,cx-9,bodyY+1,2.5,K,K,K,50);
    fillCircle(buf,W,cx+9,bodyY+1,2.5,K,K,K,50);
  }

  // ====== ZZZ ======
  if (state.zzz) {
    fillCircle(buf,W,cx+14,sb-4,2,K,K,K,180);
    fillCircle(buf,W,cx+17,sb-7,1.5,K,K,K,140);
  }

  // Battery bar
  if (cells > 0) {
    const batX = Math.floor((W - batW) / 2);
    for (let c = 0; c < cells; c++) {
      const bx = batX + c * (cellW + cellGap);
      if (c < filled) {
        fillRoundRect(buf,W,bx,batY,cellW,cellH,1,K,K,K,220);
      } else {
        for(let y=batY;y<batY+cellH;y++) for(let x=bx;x<bx+cellW;x++){
          if(y===batY||y===batY+cellH-1||x===bx||x===bx+cellW-1){
            const i=(y*W+x)*4;if(i>=0&&i<buf.length-3){buf[i]=K;buf[i+1]=K;buf[i+2]=K;buf[i+3]=100;}
          }
        }
      }
    }
  }

  return { w: W, h: H, pixels: buf };
}

function createMacTrayIcon() {
  const { w, h, pixels } = renderPetIcon(0, 0);
  const img = nativeImage.createFromBuffer(encodePNG(w, h, pixels), { scaleFactor: 2 });
  img.setTemplateImage(true);
  return img;
}

function updateTrayIcon(total, completed) {
  if (!tray) return;
  const { w, h, pixels } = renderPetIcon(total, completed);
  const img = nativeImage.createFromBuffer(encodePNG(w, h, pixels), { scaleFactor: 2 });
  img.setTemplateImage(true);
  tray.setImage(img);
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
  const icon = createMacTrayIcon(); // colored pet icon works on all platforms
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
  if (IS_MAC) {
    app.focus({ steal: true });
  }
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
  trace('app:ready');
  // LSUIElement in Info.plist hides Dock at launch; dock.hide() covers runtime relaunch.
  if (IS_MAC && app.dock) {
    app.dock.hide();
  }

  createWindow();
  try { createTray(); } catch (e) { console.error('Tray creation failed:', e); }
  const cfg = loadConfig();
  const defaultKey = IS_MAC ? 'Alt+Space' : 'Ctrl+Space';
  const savedKey = cfg.hotkey || defaultKey;
  if (!registerHotkey(savedKey)) {
    registerHotkey(IS_MAC ? 'Cmd+Alt+T' : 'Ctrl+Alt+T');
  }
  if (tray) tray.setToolTip(`Green Todo - ${currentHotkey || savedKey}`);
});

ipcMain.handle('get-hotkey', () => currentHotkey || (IS_MAC ? 'Alt+Space' : 'Ctrl+Space'));

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

// Backup: renderer sends full todos JSON on every save
ipcMain.on('backup-todos', (_e, jsonString) => {
  saveTodosBackup(jsonString);
});

// Restore: renderer asks for backup if localStorage is empty
ipcMain.handle('load-todos-backup', () => {
  return loadTodosBackup();
});

ipcMain.on('update-tray-progress', (_e, total, completed) => {
  updateTrayIcon(total, completed);
});

ipcMain.on('preview-pet-state', (_e, index) => {
  if (!tray) return;
  const state = PET_STATES[index % PET_STATES.length];
  // Render with forced state
  const {w, h, pixels} = renderPetIconForState(state, 5, index < 2 ? 0 : Math.min(index, 5));
  const img = nativeImage.createFromBuffer(encodePNG(w, h, pixels), { scaleFactor: 2 });
  img.setTemplateImage(true);
  tray.setImage(img);
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
  // Keep tray alive — do not quit.
});
