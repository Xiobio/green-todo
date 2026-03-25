// Generate a 256x256 PNG icon for the app
const { deflateSync } = require('zlib');
const fs = require('fs');
const path = require('path');

const size = 256;
const pixels = Buffer.alloc(size * size * 4);
const cx = size / 2, cy = size / 2;

// Background circle (green)
const bgR = 100;
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const idx = (y * size + x) * 4;

    if (dist <= bgR) {
      // Gradient green circle
      const t = dist / bgR;
      const r = Math.round(34 + t * 10);
      const g = Math.round(197 - t * 30);
      const b = Math.round(94 + t * 10);
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = 255;
    } else if (dist <= bgR + 2) {
      // Anti-alias
      const alpha = Math.max(0, Math.round(255 * (bgR + 2 - dist) / 2));
      pixels[idx] = 34; pixels[idx + 1] = 197; pixels[idx + 2] = 94; pixels[idx + 3] = alpha;
    }
  }
}

// Yellow flower center
const fcx = cx, fcy = cy - 15, fr = 22;
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const dx = x - fcx, dy = y - fcy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= fr) {
      const idx = (y * size + x) * 4;
      pixels[idx] = 251; pixels[idx + 1] = 191; pixels[idx + 2] = 36; pixels[idx + 3] = 255;
    }
  }
}

// Green petals (5 ellipses around the center)
function drawEllipse(ecx, ecy, rx, ry, r, g, b, alpha) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - ecx, dy = y - ecy;
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (d <= 1) {
        const idx = (y * size + x) * 4;
        // Blend
        const srcA = alpha / 255;
        const dstA = pixels[idx + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA > 0) {
          pixels[idx] = Math.round((r * srcA + pixels[idx] * dstA * (1 - srcA)) / outA);
          pixels[idx + 1] = Math.round((g * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA);
          pixels[idx + 2] = Math.round((b * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA);
          pixels[idx + 3] = Math.round(outA * 255);
        }
      }
    }
  }
}

// 5 petals
const petalR = 28, petalDist = 35;
for (let i = 0; i < 5; i++) {
  const angle = (i * 72 - 90) * Math.PI / 180;
  const px = fcx + Math.cos(angle) * petalDist;
  const py = fcy + Math.sin(angle) * petalDist;
  const green = i % 2 === 0 ? 220 : 197;
  drawEllipse(px, py, petalR, petalR * 1.3, 74, green, 128, 200);
}

// Stem
for (let y = Math.round(fcy + fr); y < cy + 80; y++) {
  for (let dx = -3; dx <= 3; dx++) {
    const x = Math.round(cx + dx);
    if (x >= 0 && x < size && y >= 0 && y < size) {
      const idx = (y * size + x) * 4;
      const dist = Math.abs(dx);
      if (dist <= 2) {
        pixels[idx] = 21; pixels[idx + 1] = 128; pixels[idx + 2] = 61; pixels[idx + 3] = 255;
      }
    }
  }
}

// Encode PNG
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const compressed = deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crcData = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4); crc.writeInt32BE(crc32(crcData));
    return Buffer.concat([len, t, data, crc]);
  }

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
    }
    return (c ^ 0xFFFFFFFF) | 0;
  }

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

const png = encodePNG(size, size, pixels);
const buildDir = path.join(__dirname, 'build');
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
const outPath = path.join(buildDir, 'icon.png');
fs.writeFileSync(outPath, png);
console.log(`Icon generated: ${outPath} (${png.length} bytes)`);
