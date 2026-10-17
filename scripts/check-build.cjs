const { spawnSync } = require('node:child_process');
const path = require('node:path');

function run(program, args) {
  const result = spawnSync(program, args, { stdio: 'inherit', shell: false, timeout: 15 * 60 * 1000 });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run(process.execPath, ['--check', 'web/app.js']);
run(process.execPath, ['--check', 'web/tauri-bridge.js']);

// The existing Windows release workflow invokes this before packaging. Run the
// regression suite against the exact source going into the installer.
if (process.env.CI && process.platform === 'win32') {
  run('cargo', ['test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--lib']);
  run('cargo', ['run', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--example', 'windows_smoke']);
  run('cargo', ['run', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--example', 'icon_preview', '--', '.local/tray-icons.png']);
  // Keep visual QA available through the existing CI log even when the workflow
  // only publishes installer files. This contains generated artwork, never user data.
  console.log('::group::Native tray icon preview (PNG)');
  console.log('GREEN_TODO_TRAY_PREVIEW=' + require('node:fs').readFileSync('.local/tray-icons.png').toString('base64'));
  console.log('::endgroup::');
  const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  run(process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  const playwright = path.resolve('node_modules/@playwright/test/cli.js');
  run(process.execPath, [playwright, 'install', 'chromium']);
  run(process.execPath, [playwright, 'test']);
}
