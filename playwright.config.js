const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:1421', viewport: { width: 440, height: 680 }, timezoneId: 'Asia/Shanghai' },
  webServer: { command: 'node tests/server.cjs', url: 'http://127.0.0.1:1421', reuseExistingServer: !process.env.CI },
});
