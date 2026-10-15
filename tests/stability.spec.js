const { test, expect } = require('@playwright/test');

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const todo = (id, overrides = {}) => ({ id, text: `任务 ${id}`, completed: false, date: today(), createdAt: new Date().toISOString(), completedAt: null, order: 0, ...overrides });

test.beforeEach(async ({ page }) => {
  page.runtimeErrors = [];
  page.on('pageerror', error => page.runtimeErrors.push(error.message));
});

test.afterEach(async ({ page }) => { expect(page.runtimeErrors).toEqual([]); });

async function boot(page, options = {}) {
  await page.addInitScript((options) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear();
      if ('stored' in options) localStorage.setItem('green-todos', typeof options.stored === 'string' ? options.stored : JSON.stringify(options.stored));
      localStorage.setItem('green-todo-muted', 'true');
      sessionStorage.setItem('seeded', 'true');
    }
    window.nativeCalls = [];
    window.importResult = null;
    window.__TAURI__ = {
      core: { invoke: async (command, args) => {
        window.nativeCalls.push({ command, args });
        if (command === 'get_hotkey') return 'Ctrl+Space';
        if (command === 'load_todos_backup') {
          if (options.restoreDelay) await new Promise(resolve => setTimeout(resolve, options.restoreDelay));
          return options.backup ? JSON.stringify(options.backup) : null;
        }
        if (command === 'set_hotkey') return { success: true, hotkey: args.key };
        if (command === 'import_data') return window.importResult;
        if (command === 'backup_todos' && options.failBackup) throw new Error('disk full');
        return null;
      } },
      event: { listen: async () => () => {} },
      window: { getCurrentWindow: () => ({ startDragging: async () => {} }) },
    };
  }, options);
  await page.goto('/');
  await page.waitForFunction(() => window.app);
}

test('快捷键录制可按 Esc 取消，方向键使用可注册的名称', async ({ page }) => {
  await boot(page, { stored: [] });
  await page.locator('#hotkey-badge').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hotkey-overlay')).toBeHidden();
  await page.locator('#hotkey-badge').click();
  await page.keyboard.press('Control+ArrowUp');
  await page.locator('#hotkey-confirm').click();
  expect(await page.evaluate(() => nativeCalls.find(c => c.command === 'set_hotkey').args.key)).toBe('Ctrl+Up');
});

test('Ctrl+N 不触发单键快捷键，中文输入确认不提交任务', async ({ page }) => {
  await boot(page, { stored: [] });
  await page.keyboard.press('Control+n');
  await expect(page.locator('#modal-overlay')).toBeHidden();
  await page.locator('#add-btn').click();
  await page.locator('#todo-input').fill('中文输入中');
  await page.locator('#todo-input').dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
  await expect(page.locator('#modal-overlay')).toBeVisible();
  expect(await page.evaluate(() => app.todos.length)).toBe(0);
});

test('动画期间完成状态已落盘，重启后任务仍可见', async ({ page }) => {
  await boot(page, { stored: [todo('a')] });
  await page.locator('.todo-check').click();
  await page.evaluate(() => app.addTodo('第二条'));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('green-todos')));
  expect(saved[0].completed).toBe(true);
  expect(saved[0]).not.toHaveProperty('_completing');
  await page.reload();
  await page.locator('#tab-completed').click();
  await expect(page.locator('#completed-list .todo-item')).toHaveCount(1);
});

test('损坏的本地存储从备份恢复，并清除旧的动画锁', async ({ page }) => {
  await boot(page, { stored: '{broken', backup: [todo('restored', { _completing: true })] });
  await expect(page.locator('#incomplete-list .todo-item')).toHaveCount(1);
  expect(await page.evaluate(() => app.todos[0])).not.toHaveProperty('_completing');
});

test('恢复期间不能新建任务而覆盖尚未载入的备份', async ({ page }) => {
  await boot(page, { backup: [todo('backup')], restoreDelay: 350 });
  await page.evaluate(() => app.addTodo('不应写入'));
  await expect(page.locator('#incomplete-list .todo-item')).toHaveCount(1);
  expect(await page.evaluate(() => app.todos.map(t => t.id))).toEqual(['backup']);
});

test('启动时保留超过 30 天的未完成任务', async ({ page }) => {
  await boot(page, { stored: [todo('old', { date: '2020-01-01' })] });
  expect(await page.evaluate(() => app.todos.map(t => t.id))).toEqual(['old']);
});

test('磁盘和 localStorage 都失败时不递归清理或静默丢数据', async ({ page }) => {
  await boot(page, { stored: [todo('old', { date: '2020-01-01' })], failBackup: true });
  await page.evaluate(async () => {
    Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    app.saveTodos();
    await app._backupWrite;
  });
  expect(await page.evaluate(() => app.todos.map(t => t.id))).toEqual(['old']);
  await expect(page.locator('.app-notice')).toContainText('保存');
});

test('坏数据不会让初始化崩溃', async ({ page }) => {
  await boot(page, { stored: [null, todo('valid'), { id: 'bad', text: 123 }, todo('locked', { _completing: true })] });
  await expect(page.locator('#incomplete-list .todo-item')).toHaveCount(2);
});

test('导入会校验字段、补迁移字段并去重', async ({ page }) => {
  await boot(page, { stored: [] });
  await page.evaluate(async () => {
    window.importResult = { success: true, data: JSON.stringify([null, { id: 'good', text: '旧任务' }, { id: 'bad', text: 123 }, { id: 'good', text: '重复' }]) };
    await app.importTodos();
  });
  await expect(page.locator('#incomplete-list .todo-item')).toHaveCount(1);
  expect(await page.evaluate(() => app.todos[0].date)).toBe(today());
});

test('编辑后直接点击完成，第一次点击即生效', async ({ page }) => {
  await boot(page, { stored: [todo('edit')] });
  await page.locator('.todo-text').dblclick();
  await page.locator('#incomplete-list input').fill('修改后');
  await page.locator('.todo-check').click();
  await expect.poll(() => page.evaluate(() => app.todos[0].completed)).toBe(true);
  expect(await page.evaluate(() => app.todos[0].text)).toBe('修改后');
});

test('多次点击完成的粒子数受限，完成结果不会重复', async ({ page }) => {
  await boot(page, { stored: Array.from({ length: 30 }, (_, i) => todo(String(i), { order: i })) });
  await page.evaluate(() => document.querySelectorAll('.todo-check').forEach(button => button.click()));
  await page.waitForTimeout(900);
  expect(await page.locator('.confetti-particle').count()).toBeLessThanOrEqual(160);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('green-todos')).filter(t => t.completed).length)).toBe(30);
});

test('新增任务不会重建其他任务节点', async ({ page }) => {
  await boot(page, { stored: Array.from({ length: 100 }, (_, i) => todo(String(i), { order: i })) });
  expect(await page.evaluate(() => {
    const first = document.querySelector('.todo-item');
    app.addTodo('新任务');
    return first === document.querySelector('.todo-item');
  })).toBe(true);
});

test('主动清空的空数组不会恢复出已删除的任务', async ({ page }) => {
  await boot(page, { stored: [], backup: [todo('deleted')] });
  expect(await page.evaluate(() => app.todos)).toEqual([]);
});

test('快捷键冲突会保留原设置，并允许继续修改', async ({ page }) => {
  await boot(page, { stored: [] });
  await page.evaluate(() => { electronAPI.setHotkey = async () => ({ success: false, error: '快捷键已被占用' }); });
  await page.locator('#hotkey-badge').click();
  await page.keyboard.press('Control+Shift+t');
  await page.locator('#hotkey-confirm').click();
  await expect(page.locator('#hotkey-overlay')).toBeVisible();
  await expect(page.locator('#hotkey-confirm')).toBeEnabled();
  await expect(page.locator('#hotkey-text')).toHaveText('Ctrl+Space');
  await expect(page.locator('.app-notice')).toContainText('占用');
});

test('导入导出的原生调用失败会提示，且不产生未处理异常', async ({ page }) => {
  await boot(page, { stored: [] });
  await page.evaluate(async () => {
    electronAPI.exportData = async () => { throw new Error('unavailable'); };
    await app.exportTodos();
  });
  await expect(page.locator('.app-notice')).toContainText('导出失败');
  await page.evaluate(async () => {
    electronAPI.importData = async () => { throw new Error('unavailable'); };
    await app.importTodos();
  });
  await expect(page.locator('.app-notice')).toContainText('导入失败');
});

test('旧数据日期按本地时区迁移', async ({ page }) => {
  await boot(page, { stored: [todo('local', { date: null, createdAt: '2026-10-15T17:00:00Z' })] });
  expect(await page.evaluate(() => app.todos[0].date)).toBe('2026-10-16');
});

test('达到任务上限时保留输入并显示原因', async ({ page }) => {
  await boot(page, { stored: Array.from({ length: 500 }, (_, i) => todo(String(i), { order: i })) });
  await page.locator('#add-btn').click();
  await page.locator('#todo-input').fill('不能丢失这段输入');
  await page.locator('#confirm-btn').click();
  await expect(page.locator('#todo-input')).toHaveValue('不能丢失这段输入');
  await expect(page.locator('#modal-overlay')).toBeVisible();
  await expect(page.locator('.app-notice')).toContainText('500');
  expect(await page.evaluate(() => app.todos.length)).toBe(500);
});

test('重复排序值和特殊 ID 也能用键盘排序', async ({ page }) => {
  await boot(page, { stored: [todo('a"[]'), todo('b')] });
  await page.evaluate(() => app.keyboardReorder('a"[]', 1));
  expect(await page.locator('#incomplete-list .todo-item').evaluateAll(nodes => nodes.map(node => node.dataset.id))).toEqual(['b', 'a"[]']);
});

test('快速保存合并文件写入，备份最终包含最新数据', async ({ page }) => {
  await boot(page, { stored: [] });
  const result = await page.evaluate(async () => {
    const snapshots = [];
    let concurrent = 0, max = 0;
    electronAPI.backupTodos = async json => {
      concurrent++; max = Math.max(max, concurrent);
      await new Promise(resolve => setTimeout(resolve, 10));
      snapshots.push(JSON.parse(json)); concurrent--;
    };
    for (let i = 0; i < 20; i++) app.addTodo(`任务 ${i}`);
    await app._backupWrite;
    return { max, writes: snapshots.length, finalCount: snapshots.at(-1).length };
  });
  expect(result).toEqual({ max: 1, writes: 1, finalCount: 20 });
});

test('切换日期会清理动画，不影响当前页面', async ({ page }) => {
  await boot(page, { stored: [todo('a')] });
  await page.locator('.todo-check').click();
  await page.locator('#date-next').click();
  await page.waitForTimeout(2500);
  expect(await page.locator('#celebration-container > *').count()).toBe(0);
  expect(await page.evaluate(() => app.activeTab)).toBe('incomplete');
});

test('动态开启减少动画后不会残留特效', async ({ page }) => {
  await boot(page, { stored: [todo('a')] });
  await page.locator('.todo-check').click();
  await page.waitForTimeout(550);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#celebration-container > *')).toHaveCount(0);
  expect(await page.evaluate(() => app.todos[0].completed)).toBe(true);
});
