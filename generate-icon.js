// One vector source for the installed application, shortcuts and installers.
// Tauri creates a multi-resolution Windows ICO and the macOS ICNS container.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const output = path.join(root, '.local', 'generated-icons');
const source = path.join(root, 'assets', 'app-icon.svg');
const cli = require.resolve('@tauri-apps/cli/tauri.js');
function generate(args) {
  const result = spawnSync(process.execPath, [cli, 'icon', source, '-o', output, ...args], {
    cwd: root, stdio: 'inherit', shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

generate([]);
const icons = path.join(root, 'src-tauri', 'icons');
for (const name of ['icon.png', 'icon.ico', 'icon.icns', '32x32.png', '128x128.png', '128x128@2x.png']) {
  fs.copyFileSync(path.join(output, name), path.join(icons, name));
}
generate(['--png', '16', '--png', '20', '--png', '24', '--png', '40', '--png', '48', '--png', '64']);
for (const size of [16, 20, 24, 40, 48, 64]) {
  fs.copyFileSync(path.join(output, `${size}x${size}.png`), path.join(icons, `${size}x${size}.png`));
}
// Include 125% and 150% Windows scaling instead of leaving the shell to enlarge
// a 16px icon. PNG frames carry full alpha; no legacy monochrome AND mask.
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const frames = sizes.map(size => fs.readFileSync(path.join(icons, size === 256 ? '128x128@2x.png' : `${size}x${size}.png`)));
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + i * 16;
  directory[entry] = directory[entry + 1] = sizes[i] === 256 ? 0 : sizes[i];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frames[i].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frames[i].length;
}
fs.writeFileSync(path.join(icons, 'icon.ico'), Buffer.concat([directory, ...frames]));
// Keep the optional Electron build on the same artwork.
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.copyFileSync(path.join(icons, 'icon.png'), path.join(root, 'build', 'icon.png'));
console.log('Updated desktop icons from assets/app-icon.svg');
