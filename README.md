# 🌱 Green Todo

一款清新解压的桌面每日待办工具，用植物成长隐喻让完成任务变成一件有趣的事。

![Electron](https://img.shields.io/badge/Electron-28+-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## 特性

### 核心功能
- **增删改查** — 新建(N)、删除(确认)、双击编辑、完成、撤销
- **拖拽排序** — 鼠标拖拽 + 键盘 Alt+↑↓ 双通道
- **日历导航** — 自由切换日期，任务按日期归属
- **收藏剪贴板** — 永久保存常用文本，一键复制
- **数据导入导出** — JSON 格式，导入去重合并

### 视觉体验
- **暗色模式** — 跟随系统 + 手动切换
- **植物主题** — 种子 → 幼苗 → 花朵的成长隐喻
- **物理引擎 Confetti** — 真实重力、阻力、旋转、摆动
- **Combo 连击** — 5秒内连续完成触发递增庆祝（双连击→传奇）
- **全清特效** — 清空所有待办时的超级庆祝
- **Web Audio 音效** — 合成琶音，可静音

### 桌面集成
- **系统托盘** — 关闭最小化到托盘，常驻后台
- **全局快捷键** — Ctrl+Space 随时呼出/隐藏
- **多显示器** — 窗口出现在鼠标所在屏幕
- **单实例** — 不会重复打开

### 无障碍
- **ARIA 完整** — tablist/dialog/alertdialog/aria-live 播报
- **键盘全操作** — N新建、I导入、1/2切标签、Esc退出、Alt+方向键排序
- **prefers-reduced-motion** — 运行时监听，自动关闭动画
- **焦点管理** — 弹窗打开/关闭时焦点保存与恢复

### 安全
- **CSP** — Content-Security-Policy 限制脚本来源
- **Sandbox** — 渲染进程沙箱化
- **Context Isolation** — 上下文隔离
- **XSS 防护** — escapeHtml/escapeAttr 输出转义
- **主进程 IO** — 文件操作隔离在 main process

## 快速开始

```bash
# 克隆
git clone https://github.com/Xiobio/green-todo.git
cd green-todo

# 安装依赖
npm install

# 启动
npm start
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Space` | 全局呼出/隐藏窗口 |
| `N` | 新建待办 |
| `I` | 导入数据 |
| `1` / `2` | 切换 待办/已完成 标签 |
| `Esc` | 关闭弹窗 / 隐藏窗口 |
| `Alt+↑` / `Alt+↓` | 上下移动任务排序 |
| `Enter` | 确认输入 |
| 双击任务文字 | 原地编辑 |

## 技术栈

- **Electron 28** — 跨平台桌面框架
- **原生 HTML/CSS/JS** — 零第三方依赖
- **Web Audio API** — 音效合成
- **localStorage** — 数据持久化
- **requestAnimationFrame** — 物理引擎粒子系统

## 项目结构

```
green-todo/
├── main.js        # Electron 主进程（窗口、托盘、快捷键、IPC）
├── preload.js     # 预加载脚本（安全 API 桥接）
├── index.html     # 界面结构
├── styles.css     # 样式（含暗色模式、动画、日历）
├── app.js         # 应用逻辑（GreenTodo 类）
└── package.json
```

## 截图

> 启动应用后按 Ctrl+Space 呼出窗口，点击 + 种下第一颗种子。

## 进化历程

经过 8 轮迭代、200+ 模拟用户评测、50+ 问题修复：

```
v1   (4.5/10) → v2 (7.5) → v2.1 (8.2) → v2.2 (8.5) → v2.3 (8.6) → v3 (8.8) → v3.2 (9.0)
```

## License

MIT
