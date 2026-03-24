# TODO

## 待办

- [ ] **Mac 版本构建** — Electron 的 DMG 打包必须在 macOS 上执行，Windows 无法交叉编译。两种方案：
  1. 在 Mac 上运行 `npm install && npm run build:mac`
  2. 配置 GitHub Actions CI，在 `macos-latest` runner 上自动构建并发布到 Releases
