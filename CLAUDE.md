# CLAUDE.md

This file provides guidance for Claude Code when working on this project.

## Project Overview

Green Todo is a desktop daily todo app built with Electron. It uses a plant growth metaphor (seed → sprout → flower) with satisfying physics-based celebration animations.

## Tech Stack

- **Electron 28** — Desktop framework (main.js = main process, preload.js = bridge, app.js = renderer)
- **Vanilla HTML/CSS/JS** — No frameworks, no build tools, no bundler
- **Web Audio API** — Synthesized sound effects (no audio files)
- **localStorage** — Data persistence (todos, theme, clipboard, mute state)

## Architecture

Single-class architecture: `GreenTodo` in `app.js` (~950 lines) handles all renderer logic:
- Data management (CRUD, localStorage, migration, cleanup)
- DOM rendering (todo lists, calendar, clipboard panel)
- Celebration system (physics confetti, combo, sound effects)
- Date navigation (calendar, day switching)
- Theme management (dark/light mode)

`main.js` handles Electron concerns:
- Window management (frameless, transparent, always-on-top)
- System tray (dynamically generated PNG icon)
- Global shortcuts (Ctrl+Space with Ctrl+Alt+T fallback)
- IPC handlers (export/import via dialog + fs)
- Single instance lock

## Key Design Decisions

1. **Tasks belong to dates** — Each task has a `date` field set to the currently viewed date at creation time. Tasks don't migrate between dates.
2. **Completed tasks filtered by creation date** — `getCompletedTodos()` filters by `t.date === selectedDate`, not by `completedAt`.
3. **Single instance** — `app.requestSingleInstanceLock()` prevents multiple instances.
4. **Close = hide to tray** — Window close is intercepted; only tray menu "退出" or IPC `app-quit` truly quits.
5. **Tray icon is generated programmatically** — No icon files; PNG is created from raw RGBA pixels + zlib-compressed PNG encoder in `main.js`.
6. **Import merges, never overwrites** — `importTodos()` checks existing IDs and only adds new items.

## Security Model

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
- CSP: `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'`
- File I/O (export/import) happens in main process only via `ipcMain.handle`
- HTML output uses `escapeHtml()` and `escapeAttr()` to prevent XSS
- Input limited to 200 chars (HTML + JS validation), max 500 todos

## Coding Conventions

- All UI text is in Chinese (zh-CN)
- CSS uses custom properties (`--green-50` through `--green-900`, `--bg`, `--surface`, etc.)
- Dark mode via `.dark` class on `.app-container`
- Animations respect `prefers-reduced-motion` (CSS media query + JS `_reduceMotion` flag)
- `aria-live` announcer for screen reader feedback on all CRUD operations
- Focus management: `_lastFocused` saved on modal open, restored on close

## Common Tasks

### Adding a new feature
1. Add HTML in `index.html`
2. Add styles in `styles.css` (use existing CSS variables)
3. Add logic in `app.js` (method on `GreenTodo` class)
4. Bind events in `bindEvents()`
5. If it needs main process access, add IPC in `preload.js` + `main.js`

### Modifying the todo data model
1. Update the `addTodo()` method for new fields
2. Update `loadTodos()` migration logic to backfill missing fields
3. Update `createIncompleteItem()` / `createCompletedItem()` for display

### Testing
No test framework. Manual testing via `npm start`. Check:
- Light + dark mode
- Keyboard navigation (Tab through all interactive elements)
- Rapid clicking (verify `_completing` lock works)
- Cross-day behavior (check date watcher)
- Import/export round-trip
