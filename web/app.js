/* ============================================
   Green Todo v2 - Full Rewrite
   Fixes: race conditions, i18n, dark mode,
   combo system, physics confetti, sound, a11y
   ============================================ */

// Tag platform for CSS (vibrancy bg on macOS, etc.). Runs before class instantiation.
try {
  if (window.electronAPI && window.electronAPI.platform) {
    document.documentElement.setAttribute('data-platform', window.electronAPI.platform);
  }
} catch {}

const COMBO_WINDOW_MS = 5000;
const COMPLETION_DELAY_MS = 2000;
const MAX_TODOS = 500;
const DATA_RETENTION_DAYS = 30;

class GreenTodo {
  constructor() {
    this.todos = this.loadTodos();
    this.activeTab = 'incomplete';
    this.dragItem = null;
    this.comboCount = 0;
    this.lastCompleteTime = 0;
    this.pendingDeleteId = null;
    this.pendingDeleteEl = null;
    this.isDarkMode = false;
    this.audioCtx = null;
    this._muted = localStorage.getItem('green-todo-muted') === 'true';
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this._reduceMotion = rmq.matches;
    rmq.addEventListener('change', (e) => { this._reduceMotion = e.matches; });
    this._particles = [];
    this._particleLoop = null;
    this.clipItems = this.loadClipboard();
    this.selectedDate = this.getTodayKey();
    this.calendarMonth = null; // YYYY-MM for calendar view
    this.init();
  }

  init() {
    this.cacheDom();
    this.cleanupOldTodos();
    this.loadTheme();
    this.setDateAndGreeting();
    this.bindEvents();
    this.render();
    this.startDateWatcher();
    this.initHotkey();
  }

  cacheDom() {
    this.container = document.getElementById('app-container');
    this.incompleteList = document.getElementById('incomplete-list');
    this.completedList = document.getElementById('completed-list');
    this.emptyIncomplete = document.getElementById('empty-incomplete');
    this.emptyCompleted = document.getElementById('empty-completed');
    this.incompleteCount = document.getElementById('incomplete-count');
    this.completedCount = document.getElementById('completed-count');
    this.tabIndicator = document.getElementById('tab-indicator');
    this.tabIncomplete = document.getElementById('tab-incomplete');
    this.tabCompleted = document.getElementById('tab-completed');
    this.addBtn = document.getElementById('add-btn');
    this.modalOverlay = document.getElementById('modal-overlay');
    this.todoInput = document.getElementById('todo-input');
    this.cancelBtn = document.getElementById('cancel-btn');
    this.confirmBtn = document.getElementById('confirm-btn');
    this.hideBtn = document.getElementById('hide-btn');
    this.closeBtn = document.getElementById('close-btn');
    this.themeBtn = document.getElementById('theme-btn');
    this.pinBtn = document.getElementById('pin-btn');
    this.deleteOverlay = document.getElementById('delete-overlay');
    this.deleteCancelBtn = document.getElementById('delete-cancel-btn');
    this.deleteConfirmBtn = document.getElementById('delete-confirm-btn');
    this.celebrationContainer = document.getElementById('celebration-container');
    this.progressFill = document.getElementById('progress-fill');
    this.progressText = document.getElementById('progress-text');
    this.greetingText = document.getElementById('greeting-text');
  }

  // ---- Date & Greeting ----
  setDateAndGreeting() {
    this.updateDateNav();
    const h = new Date().getHours();
    let greeting = '夜深了，注意休息';
    if (h >= 6 && h < 11) greeting = '早安，新的一天开始了';
    else if (h >= 11 && h < 14) greeting = '午安，继续加油';
    else if (h >= 14 && h < 18) greeting = '下午好，收获时间到';
    else if (h >= 18 && h < 22) greeting = '晚上好，辛苦了';
    this.greetingText.textContent = greeting;
    this._currentDateKey = this.getTodayKey();
  }

  updateDateNav() {
    const d = new Date(this.selectedDate + 'T00:00:00');
    const days = ['周日','周一','周二','周三','周四','周五','周六'];
    const label = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${days[d.getDay()]}`;
    const isToday = this.selectedDate === this.getTodayKey();
    const navEl = document.getElementById('date-nav-text');
    if (isToday) {
      navEl.innerHTML = `<span class="date-today-tag">今天</span> <span class="date-detail">· ${label}</span>`;
    } else {
      navEl.innerHTML = `<span class="date-detail">${label}</span>`;
    }
    document.getElementById('date-today').classList.toggle('hidden', isToday);
  }

  navigateDate(offset) {
    const d = new Date(this.selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    this.selectedDate = this.dateToKey(d);
    this.updateDateNav();
    this.render();
  }

  goToToday() {
    this.selectedDate = this.getTodayKey();
    this.updateDateNav();
    this.hideCalendar();
    this.render();
  }

  dateToKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // ---- Calendar ----
  toggleCalendar() {
    const overlay = document.getElementById('calendar-overlay');
    if (overlay.classList.contains('hidden')) {
      this.calendarMonth = this.selectedDate.slice(0, 7);
      this.renderCalendar();
      overlay.classList.remove('hidden');
    } else {
      this.hideCalendar();
    }
  }

  hideCalendar() {
    document.getElementById('calendar-overlay').classList.add('hidden');
  }

  renderCalendar() {
    const [y, m] = this.calendarMonth.split('-').map(Number);
    document.getElementById('cal-title').textContent = `${y}年${m}月`;

    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';

    const firstDay = new Date(y, m - 1, 1);
    let startDow = firstDay.getDay() - 1; // Mon=0
    if (startDow < 0) startDow = 6;
    const daysInMonth = new Date(y, m, 0).getDate();
    const prevMonthDays = new Date(y, m - 1, 0).getDate();
    const todayKey = this.getTodayKey();

    // Collect dates that have tasks
    const taskDates = new Set(this.todos.map(t => t.date));

    // Previous month padding
    for (let i = startDow - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const btn = this.createCalDay(day, 'other-month', null);
      grid.appendChild(btn);
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const classes = [];
      if (key === todayKey) classes.push('today');
      if (key === this.selectedDate) classes.push('selected');
      if (taskDates.has(key)) classes.push('has-tasks');
      const btn = this.createCalDay(d, classes.join(' '), key);
      grid.appendChild(btn);
    }

    // Next month padding (fill to 42 cells = 6 rows)
    const totalCells = startDow + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const btn = this.createCalDay(d, 'other-month', null);
      grid.appendChild(btn);
    }
  }

  createCalDay(day, className, dateKey) {
    const btn = document.createElement('button');
    btn.className = `cal-day ${className}`;
    btn.textContent = day;
    if (dateKey) {
      btn.addEventListener('click', () => {
        this.selectedDate = dateKey;
        this.updateDateNav();
        this.hideCalendar();
        this.render();
      });
    }
    return btn;
  }

  navigateCalMonth(offset) {
    const [y, m] = this.calendarMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    this.calendarMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    this.renderCalendar();
  }

  startDateWatcher() {
    setInterval(() => this.checkDateChange(), 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.checkDateChange();
    });
  }

  checkDateChange() {
    const newKey = this.getTodayKey();
    if (newKey !== this._currentDateKey) {
      const oldKey = this._currentDateKey;
      this._currentDateKey = newKey;
      // Auto-navigate to today if user was viewing the previous "today"
      if (this.selectedDate === oldKey) {
        this.selectedDate = newKey;
      }
      this.setDateAndGreeting();
      this.render();
    }
  }

  // ---- Theme ----
  loadTheme() {
    const saved = localStorage.getItem('green-todo-theme');
    if (saved === 'dark') {
      this.isDarkMode = true;
    } else if (saved === 'light') {
      this.isDarkMode = false;
    } else {
      this.isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    this.applyTheme();
  }

  applyTheme() {
    this.container.classList.toggle('dark', this.isDarkMode);
    const lightIcon = this.themeBtn.querySelector('.theme-icon-light');
    const darkIcon = this.themeBtn.querySelector('.theme-icon-dark');
    if (lightIcon) lightIcon.style.display = this.isDarkMode ? 'none' : 'block';
    if (darkIcon) darkIcon.style.display = this.isDarkMode ? 'block' : 'none';
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('green-todo-theme', this.isDarkMode ? 'dark' : 'light');
    this.applyTheme();
  }

  // ---- Events ----
  bindEvents() {
    // Date navigation
    document.getElementById('date-prev').addEventListener('click', () => this.navigateDate(-1));
    document.getElementById('date-next').addEventListener('click', () => this.navigateDate(1));
    document.getElementById('cal-btn').addEventListener('click', () => this.toggleCalendar());
    document.getElementById('date-today').addEventListener('click', () => this.goToToday());
    document.getElementById('cal-prev').addEventListener('click', () => this.navigateCalMonth(-1));
    document.getElementById('cal-next').addEventListener('click', () => this.navigateCalMonth(1));
    document.getElementById('calendar-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'calendar-overlay') this.hideCalendar();
    });

    // Hotkey settings
    document.getElementById('hotkey-badge').addEventListener('click', () => this.openHotkeyRecorder());
    document.getElementById('hotkey-cancel').addEventListener('click', () => this.closeHotkeyRecorder());
    document.getElementById('hotkey-confirm').addEventListener('click', () => this.confirmHotkey());
    document.getElementById('hotkey-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'hotkey-overlay') this.closeHotkeyRecorder();
    });

    // Clipboard
    document.getElementById('clip-btn').addEventListener('click', () => this.toggleClipPanel());
    document.getElementById('clip-close').addEventListener('click', () => document.getElementById('clip-panel').classList.add('hidden'));
    document.getElementById('clip-add-btn').addEventListener('click', () => this.addClipItem());
    document.getElementById('clip-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.addClipItem(); }
    });
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('clip-panel');
      if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !e.target.closest('#clip-btn')) {
        panel.classList.add('hidden');
      }
    });

    // Pet preview button — cycle through all states
    document.getElementById('pet-preview-btn').addEventListener('click', () => this.previewPetStates());

    this.tabIncomplete.addEventListener('click', () => this.switchTab('incomplete'));
    this.tabCompleted.addEventListener('click', () => this.switchTab('completed'));
    this.addBtn.addEventListener('click', () => this.showModal());
    this.cancelBtn.addEventListener('click', () => this.hideModal());
    this.confirmBtn.addEventListener('click', () => this.addTodoFromInput());
    this.modalOverlay.addEventListener('click', (e) => { if (e.target === this.modalOverlay) this.hideModal(); });
    this.todoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.addTodoFromInput(); }
      if (e.key === 'Escape') this.hideModal();
    });
    this.hideBtn.addEventListener('click', () => { if (window.electronAPI) window.electronAPI.hideWindow(); });
    this.closeBtn.addEventListener('click', () => { if (window.electronAPI) window.electronAPI.hideWindow(); });
    this.themeBtn.addEventListener('click', () => this.toggleTheme());
    document.getElementById('export-btn').addEventListener('click', () => this.exportTodos());
    if (window.electronAPI.onTriggerExport) window.electronAPI.onTriggerExport(() => this.exportTodos());
    if (window.electronAPI.onTriggerImport) window.electronAPI.onTriggerImport(() => this.importTodos());
    this.muteBtn = document.getElementById('mute-btn');
    this.muteBtn.addEventListener('click', () => {
      this.toggleMute();
      this.muteBtn.querySelector('.mute-icon-off').style.display = this._muted ? 'none' : 'block';
      this.muteBtn.querySelector('.mute-icon-on').style.display = this._muted ? 'block' : 'none';
    });
    // Init mute icon state
    if (this._muted) {
      this.muteBtn.querySelector('.mute-icon-off').style.display = 'none';
      this.muteBtn.querySelector('.mute-icon-on').style.display = 'block';
    }
    this.pinBtn.addEventListener('click', () => {
      if (window.electronAPI) window.electronAPI.toggleAlwaysOnTop();
    });
    if (window.electronAPI && window.electronAPI.onAlwaysOnTopChanged) {
      window.electronAPI.onAlwaysOnTopChanged((val) => {
        this.pinBtn.classList.toggle('pinned', val);
      });
    }

    // Delete confirmation
    this.deleteCancelBtn.addEventListener('click', () => this.hideDeleteConfirm());
    this.deleteConfirmBtn.addEventListener('click', () => this.confirmDelete());
    this.deleteOverlay.addEventListener('click', (e) => { if (e.target === this.deleteOverlay) this.hideDeleteConfirm(); });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const inInput = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
      if (!inInput && this.modalOverlay.classList.contains('hidden') && this.deleteOverlay.classList.contains('hidden')) {
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); this.showModal(); }
        if (e.key === 'i' || e.key === 'I') { e.preventDefault(); this.importTodos(); }
        if (e.key === '1') this.switchTab('incomplete');
        if (e.key === '2') this.switchTab('completed');
        // Alt+Up/Down to reorder focused todo
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          const focused = document.activeElement?.closest('.todo-item');
          if (focused && this.incompleteList.contains(focused)) {
            e.preventDefault();
            this.keyboardReorder(focused.dataset.id, e.key === 'ArrowUp' ? -1 : 1);
          }
        }
      }
      if (e.key === 'Escape') {
        const clipPanel = document.getElementById('clip-panel');
        const calOverlay = document.getElementById('calendar-overlay');
        const hotkeyOverlay = document.getElementById('hotkey-overlay');
        if (!hotkeyOverlay.classList.contains('hidden')) { this.closeHotkeyRecorder(); return; }
        if (!this.deleteOverlay.classList.contains('hidden')) { this.hideDeleteConfirm(); return; }
        if (!this.modalOverlay.classList.contains('hidden')) { this.hideModal(); return; }
        if (!clipPanel.classList.contains('hidden')) { clipPanel.classList.add('hidden'); return; }
        if (!calOverlay.classList.contains('hidden')) { this.hideCalendar(); return; }
        if (window.electronAPI) window.electronAPI.hideWindow();
      }
    });
  }

  // ---- Data ----
  loadTodos() {
    try {
      let data = localStorage.getItem('green-todos');

      // If localStorage is empty, try to restore from file backup
      if (!data && window.electronAPI && window.electronAPI.loadTodosBackup) {
        // loadTodosBackup is async (ipcRenderer.invoke), but constructor needs sync data.
        // We'll trigger async restore separately. For now return [] and restore later.
        this._needsAsyncRestore = true;
      }

      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      let needSave = false;
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      parsed.forEach((t, i) => {
        if (t.order === undefined) { t.order = i; needSave = true; }
        if (!t.date && t.createdAt) { t.date = t.createdAt.slice(0, 10); needSave = true; }
        if (!t.date) { t.date = todayKey; needSave = true; }
        if (!t.createdAt) { t.createdAt = today.toISOString(); needSave = true; }
        if (t.completed && !t.completedAt) { t.completedAt = t.createdAt; needSave = true; }
      });
      if (needSave) { try { localStorage.setItem('green-todos', JSON.stringify(parsed)); } catch {} }
      return parsed;
    } catch { return []; }
  }

  // Called after constructor if localStorage was empty — tries to restore from file backup
  async tryRestoreFromBackup() {
    if (!this._needsAsyncRestore) return;
    this._needsAsyncRestore = false;
    try {
      const backupData = await window.electronAPI.loadTodosBackup();
      if (backupData) {
        const parsed = JSON.parse(backupData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.todos = parsed;
          localStorage.setItem('green-todos', backupData);
          this.render();
          this.announce(`已从备份恢复 ${parsed.length} 条待办`);
          console.log(`[backup] restored ${parsed.length} todos from file backup`);
        }
      }
    } catch (e) {
      console.error('[backup] restore failed:', e);
    }
  }

  saveTodos() {
    const json = JSON.stringify(this.todos);
    // 1. Write to localStorage (fast, in-memory)
    try {
      localStorage.setItem('green-todos', json);
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        this.cleanupOldTodos(7);
        try { localStorage.setItem('green-todos', JSON.stringify(this.todos)); } catch {}
      }
    }
    // 2. Write to file backup via IPC (atomic write, survives kill -9)
    try {
      if (window.electronAPI && window.electronAPI.backupTodos) {
        window.electronAPI.backupTodos(json);
      }
    } catch {}
  }

  cleanupOldTodos(days = DATA_RETENTION_DAYS) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;
    const before = this.todos.length;
    this.todos = this.todos.filter(t => t.date >= cutoffKey);
    if (this.todos.length !== before) this.saveTodos();
  }

  getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  getIncompleteTodos() {
    return this.todos.filter(t => !t.completed && !t._completing && t.date === this.selectedDate)
      .sort((a, b) => a.order - b.order);
  }

  getCompletedTodos() {
    return this.todos.filter(t => t.completed && t.date === this.selectedDate)
      .sort((a, b) => {
        const ta = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        const tb = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
      });
  }

  // ---- Tab ----
  switchTab(tab) {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.tabIncomplete.classList.toggle('active', tab === 'incomplete');
    this.tabCompleted.classList.toggle('active', tab === 'completed');
    this.tabIncomplete.setAttribute('aria-selected', tab === 'incomplete');
    this.tabCompleted.setAttribute('aria-selected', tab === 'completed');
    this.tabIndicator.classList.toggle('right', tab === 'completed');
    this.incompleteList.classList.toggle('hidden', tab !== 'incomplete');
    this.completedList.classList.toggle('hidden', tab !== 'completed');
    this.updateEmptyStates();
  }

  // ---- Render ----
  render() {
    this.renderIncomplete();
    this.renderCompleted();
    this.updateCounts();
    this.updateProgress();
    this.updateEmptyStates();
  }

  renderIncomplete() {
    const todos = this.getIncompleteTodos();
    this.incompleteList.innerHTML = '';
    todos.forEach((todo, i) => {
      const el = this.createIncompleteItem(todo, i);
      this.incompleteList.appendChild(el);
    });
  }

  renderCompleted() {
    const todos = this.getCompletedTodos();
    this.completedList.innerHTML = '';
    todos.forEach(todo => {
      const el = this.createCompletedItem(todo);
      this.completedList.appendChild(el);
    });
  }

  createIncompleteItem(todo, index) {
    const el = document.createElement('div');
    el.className = this._justAddedId === todo.id ? 'todo-item just-added' : 'todo-item';
    el.dataset.id = todo.id;
    el.draggable = true;
    if (!this._justAddedId && index < 20) el.style.animationDelay = `${index * 0.04}s`;
    else if (!this._justAddedId) el.style.animation = 'none';

    el.innerHTML = `
      <div class="drag-handle" aria-hidden="true">
        <svg viewBox="0 0 12 20" width="10" height="16"><circle cx="3" cy="4" r="1.3" fill="currentColor"/><circle cx="9" cy="4" r="1.3" fill="currentColor"/><circle cx="3" cy="10" r="1.3" fill="currentColor"/><circle cx="9" cy="10" r="1.3" fill="currentColor"/><circle cx="3" cy="16" r="1.3" fill="currentColor"/><circle cx="9" cy="16" r="1.3" fill="currentColor"/></svg>
      </div>
      <button class="todo-check" title="完成此任务" aria-label="完成: ${this.escapeAttr(todo.text)}">
        <svg class="seedling-icon" viewBox="0 0 24 24" width="22" height="22"><path d="M12 20V12" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/><path d="M12 12C12 8.5 8.5 6.5 5 6.5C5 10 8.5 12 12 12Z" fill="#4ade80"/><path d="M12 12C12 8.5 15.5 6.5 19 6.5C19 10 15.5 12 12 12Z" fill="#22c55e"/><path d="M12 16C10 14.5 7.5 14.5 6 15" stroke="#22c55e" stroke-width="1.3" stroke-linecap="round" fill="none"/></svg>
      </button>
      <span class="todo-text">${this.escapeHtml(todo.text)}</span>
      <span class="todo-time">${this.formatTime(todo.createdAt)}</span>
      <button class="todo-delete" title="删除" aria-label="删除: ${this.escapeAttr(todo.text)}">
        <svg viewBox="0 0 16 16" width="14" height="14"><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>`;

    el.querySelector('.todo-check').addEventListener('click', () => this.completeTodo(todo.id, el));
    el.querySelector('.todo-delete').addEventListener('click', () => this.requestDelete(todo.id, el));
    el.querySelector('.todo-text').addEventListener('dblclick', (e) => this.startEdit(todo.id, e.currentTarget));
    this.setupDrag(el, todo.id);
    return el;
  }

  createCompletedItem(todo) {
    const el = document.createElement('div');
    el.className = 'todo-item completed';
    el.dataset.id = todo.id;

    el.innerHTML = `
      <svg class="completed-flower" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="9" r="2.5" fill="#fbbf24"/><ellipse cx="12" cy="4.5" rx="2.2" ry="3.2" fill="#4ade80" opacity="0.75"/><ellipse cx="16.5" cy="7.2" rx="2.2" ry="3.2" fill="#22c55e" opacity="0.65" transform="rotate(55 16.5 7.2)"/><ellipse cx="14.8" cy="12.8" rx="2.2" ry="3.2" fill="#86efac" opacity="0.55" transform="rotate(120 14.8 12.8)"/><ellipse cx="9.2" cy="12.8" rx="2.2" ry="3.2" fill="#86efac" opacity="0.55" transform="rotate(-120 9.2 12.8)"/><ellipse cx="7.5" cy="7.2" rx="2.2" ry="3.2" fill="#22c55e" opacity="0.65" transform="rotate(-55 7.5 7.2)"/><path d="M12 12V22" stroke="#15803d" stroke-width="1.5" stroke-linecap="round"/></svg>
      <span class="todo-text">${this.escapeHtml(todo.text)}</span>
      <span class="todo-time">${this.formatTime(todo.completedAt)}</span>
      <button class="todo-undo" title="撤销" aria-label="撤销完成: ${this.escapeAttr(todo.text)}">
        <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 8C3 5.2 5.2 3 8 3C10.8 3 13 5.2 13 8C13 10.8 10.8 13 8 13H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M6 11L4 13L6 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
      </button>
      <button class="todo-delete" title="删除" aria-label="删除: ${this.escapeAttr(todo.text)}">
        <svg viewBox="0 0 16 16" width="14" height="14"><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>`;

    el.querySelector('.todo-undo').addEventListener('click', () => this.uncompleteTodo(todo.id));
    el.querySelector('.todo-delete').addEventListener('click', () => this.requestDelete(todo.id, el));
    return el;
  }

  updateCounts() {
    const inc = this.getIncompleteTodos().length;
    const comp = this.getCompletedTodos().length;
    this.incompleteCount.textContent = inc;
    this.completedCount.textContent = comp;
  }

  updateProgress() {
    const inc = this.getIncompleteTodos().length;
    const comp = this.getCompletedTodos().length;
    const total = inc + comp;
    const pct = total > 0 ? Math.round((comp / total) * 100) : 0;
    this.progressFill.style.width = `${pct}%`;

    // Update menu bar pet + battery icon
    try { window.electronAPI.updateTrayProgress(total, comp); } catch {}
    // Update in-app pet widget
    try { this._updatePetWidget(total, comp); } catch {}

    // Bind pet click (once)
    if (!this._petClickBound) {
      this._petClickBound = true;
      const petWidget = document.getElementById('pet-widget');
      if (petWidget) {
        petWidget.addEventListener('click', () => this._onPetClick());
      }
    }

    if (total === 0) {
      this.progressText.textContent = '种下第一颗种子吧';
    } else if (pct === 100) {
      this.progressText.textContent = `全部完成！共 ${comp} 项`;
    } else if (pct >= 80) {
      this.progressText.textContent = `${comp}/${total} 胜利在望！`;
    } else if (pct >= 50) {
      this.progressText.textContent = `${comp}/${total} 已过半，加油`;
    } else if (comp > 0) {
      this.progressText.textContent = `${comp}/${total} 已完成`;
    } else {
      this.progressText.textContent = `${total} 项待办，开始吧`;
    }
  }

  previewPetStates() {
    if (this._petPreviewing) return;
    this._petPreviewing = true;
    const btn = document.getElementById('pet-preview-btn');
    const textEl = this.progressText;
    const origText = textEl.textContent;
    btn.classList.add('previewing');

    // States: [total, completed, label]
    const states = [
      [10, 0, '🌑 种子沉睡'],
      [10, 0, '💤 种子做梦'],
      [10, 1, '🌱 发芽了~'],
      [10, 1, '😪 打哈欠'],
      [10, 2, '😐 眨眨眼'],
      [10, 2, '🌿 慢慢长'],
      [10, 4, '🙂 还不错~'],
      [10, 4, '🤔 好奇中'],
      [10, 6, '😊 开心！'],
      [10, 6, '😋 吐舌头'],
      [10, 6, '😉 眨眼笑'],
      [10, 8, '✨ 闪闪眼'],
      [10, 8, '⭐ 星星眼'],
      [10, 10, '🌸 花开了！'],
      [10, 10, '💕 恋爱了！'],
    ];
    let i = 0;
    const step = () => {
      if (i < states.length) {
        const [t, c, label] = states[i];
        try { window.electronAPI.previewPetState(i); } catch {}
        textEl.textContent = label;
        i++;
        setTimeout(step, 800);
      } else {
        btn.classList.remove('previewing');
        textEl.textContent = origText;
        this._petPreviewing = false;
        this.updateProgress(); // restore real state
      }
    };
    step();
  }

  updateEmptyStates() {
    const incLen = this.getIncompleteTodos().length;
    const compLen = this.getCompletedTodos().length;
    if (this.activeTab === 'incomplete') {
      this.emptyIncomplete.classList.toggle('hidden', incLen > 0);
      this.emptyCompleted.classList.add('hidden');
    } else {
      this.emptyCompleted.classList.toggle('hidden', compLen > 0);
      this.emptyIncomplete.classList.add('hidden');
    }
  }

  // ---- Todo Operations ----
  addTodoFromInput() {
    const text = this.todoInput.value.trim();
    if (!text) return;
    this.hideModal();
    this.addTodo(text);
  }

  addTodo(text) {
    if (typeof text !== 'string') return;
    text = text.trim();
    if (!text) return;
    if (text.length > 200) text = text.substring(0, 200);
    if (this.todos.length >= MAX_TODOS) return;

    const todo = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text,
      completed: false,
      date: this.selectedDate,
      createdAt: new Date().toISOString(),
      completedAt: null,
      order: this.getIncompleteTodos().length,
    };
    this.todos.push(todo);
    this._justAddedId = todo.id;
    this.saveTodos();
    this.playSound('add');
    if (this.activeTab !== 'incomplete') this.switchTab('incomplete');
    this.render();
    this.announce(`已添加：${text}`);
    // Clear the flag after animation
    setTimeout(() => { this._justAddedId = null; }, 1000);
  }

  completeTodo(id, element) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo || todo.completed || todo._completing) return;
    todo._completing = true;

    // Combo
    const now = Date.now();
    this.comboCount = (now - this.lastCompleteTime < COMBO_WINDOW_MS) ? this.comboCount + 1 : 1;
    this.lastCompleteTime = now;

    this.playSound('complete', this.comboCount);
    if (!this._reduceMotion) this.playCelebration(element, this.comboCount);
    else {
      const checkBtn = element.querySelector('.todo-check');
      if (checkBtn) checkBtn.innerHTML = `<svg viewBox="0 0 28 28" width="28" height="28"><circle cx="14" cy="14" r="12" fill="#22c55e" opacity="0.2"/><path d="M8 14L12 18L20 10" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
    }

    setTimeout(() => {
      todo.completed = true;
      todo.completedAt = new Date().toISOString();
      delete todo._completing;
      this.saveTodos();
      this.render();
      this.announce(`已完成：${todo.text}`);

      // Check all-done
      if (this.getIncompleteTodos().length === 0 && this.getCompletedTodos().length > 0) {
        this.playAllDoneCelebration();
      }
    }, COMPLETION_DELAY_MS);
  }

  uncompleteTodo(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo || !todo.completed) return;
    todo.completed = false;
    todo.completedAt = null;
    todo.order = this.getIncompleteTodos().length;
    this.saveTodos();
    this.render();
  }

  requestDelete(id, el) {
    this.pendingDeleteId = id;
    this.pendingDeleteEl = el;
    this._deleteLastFocused = document.activeElement;
    this.deleteOverlay.classList.remove('hidden');
    setTimeout(() => this.deleteCancelBtn.focus(), 100);
  }

  hideDeleteConfirm() {
    this.deleteOverlay.classList.add('hidden');
    this.pendingDeleteId = null;
    this.pendingDeleteEl = null;
    if (this._deleteLastFocused) { this._deleteLastFocused.focus(); this._deleteLastFocused = null; }
  }

  confirmDelete() {
    const id = this.pendingDeleteId;
    const el = this.pendingDeleteEl;
    this.hideDeleteConfirm();
    if (!id) return;

    if (el) {
      el.style.transition = 'all 0.3s ease';
      el.style.transform = 'translateX(40px) scale(0.95)';
      el.style.opacity = '0';
      setTimeout(() => {
        this.todos = this.todos.filter(t => t.id !== id);
        this.saveTodos();
        this.render();
        this.announce('任务已删除');
      }, 300);
    } else {
      this.todos = this.todos.filter(t => t.id !== id);
      this.saveTodos();
      this.render();
      this.announce('任务已删除');
    }
  }

  // ---- Drag & Drop ----
  setupDrag(el, id) {
    el.addEventListener('dragstart', (e) => {
      this.dragItem = id;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      const ghost = document.createElement('div');
      ghost.style.opacity = '0';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      setTimeout(() => ghost.remove(), 0);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      this.dragItem = null;
      this.incompleteList.querySelectorAll('.drag-over').forEach(item => item.classList.remove('drag-over'));
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (el.dataset.id === this.dragItem) return;
      this.incompleteList.querySelectorAll('.drag-over').forEach(item => item.classList.remove('drag-over'));
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!this.dragItem || el.dataset.id === this.dragItem) return;
      const incTodos = this.getIncompleteTodos();
      const fromIdx = incTodos.findIndex(t => t.id === this.dragItem);
      let toIdx = incTodos.findIndex(t => t.id === el.dataset.id);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = incTodos.splice(fromIdx, 1);
      // After splice, indices shift if dragging downward
      if (fromIdx < toIdx) toIdx--;
      incTodos.splice(toIdx, 0, moved);
      incTodos.forEach((t, i) => { const todo = this.todos.find(x => x.id === t.id); if (todo) todo.order = i; });
      this.saveTodos();
      this.renderIncomplete();
      this.dragItem = null;
    });
  }

  // ---- Keyboard Reorder ----
  keyboardReorder(id, direction) {
    const todos = this.getIncompleteTodos();
    const idx = todos.findIndex(t => t.id === id);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= todos.length) return;
    // Swap order values
    const a = this.todos.find(t => t.id === todos[idx].id);
    const b = this.todos.find(t => t.id === todos[newIdx].id);
    if (a && b) { const tmp = a.order; a.order = b.order; b.order = tmp; }
    this.saveTodos();
    this.renderIncomplete();
    // Re-focus the moved item
    const movedEl = this.incompleteList.querySelector(`[data-id="${id}"]`);
    if (movedEl) {
      const btn = movedEl.querySelector('.todo-check');
      if (btn) btn.focus();
    }
    this.announce(direction === -1 ? '上移' : '下移');
  }

  // ---- Modal ----
  showModal() {
    this._lastFocused = document.activeElement;
    this.modalOverlay.classList.remove('hidden');
    this.todoInput.value = '';
    setTimeout(() => this.todoInput.focus(), 100);
  }

  hideModal() {
    this.modalOverlay.classList.add('hidden');
    this.todoInput.value = '';
    this.todoInput.blur();
    // Delay focus restore to avoid Enter key propagation to restored element
    if (this._lastFocused) {
      const el = this._lastFocused;
      this._lastFocused = null;
      setTimeout(() => el.focus(), 50);
    }
  }

  // ==============================
  //  CELEBRATION SYSTEM v2
  // ==============================

  playCelebration(element, combo = 1) {
    const rect = element.getBoundingClientRect();
    const cr = this.celebrationContainer.getBoundingClientRect();
    const x = rect.left - cr.left + 30;
    const y = rect.top - cr.top + rect.height / 2;

    // Phase 1: Preparation (0-300ms)
    element.classList.add('completing-phase1');
    const checkBtn = element.querySelector('.todo-check');
    if (checkBtn) {
      checkBtn.innerHTML = `<svg class="check-anim" viewBox="0 0 28 28" width="28" height="28"><circle cx="14" cy="14" r="12" fill="#22c55e" opacity="0.2"/><path d="M8 14L12 18L20 10" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
    }

    // Phase 2: Burst (300ms)
    setTimeout(() => {
      element.classList.add('golden-glow');
      this.createScreenFlash(x, y);
      this.createRingBurst(x, y, combo);
    }, 300);

    // Phase 3: Explosion (500ms)
    const particleCount = Math.min(25 + combo * 10, 80);
    setTimeout(() => {
      this.createConfettiExplosion(x, y, particleCount, combo);
      this.createFloatText(x, y - 10, combo);
      if (combo > 1) this.createComboText(x, y - 30, combo);
    }, 500);

    // Phase 4: Sparkles (800ms)
    setTimeout(() => {
      for (let i = 0; i < 3 + combo; i++) {
        setTimeout(() => {
          this.createSparkle(x + (Math.random()-0.5)*80, y + (Math.random()-0.5)*40);
        }, i * 100);
      }
    }, 800);

    // Phase 5: Exit (1400ms)
    setTimeout(() => { element.classList.add('completing-exit'); }, 1400);

    // Combo screen shake
    if (combo >= 3) {
      setTimeout(() => {
        this.container.style.animation = 'screenShake 0.3s ease-out';
        setTimeout(() => { this.container.style.animation = ''; }, 300);
      }, 500);
    }
  }

  playAllDoneCelebration() {
    if (this._reduceMotion) { this.playSound('allDone'); return; }
    const cr = this.celebrationContainer.getBoundingClientRect();
    const cx = cr.width / 2, cy = cr.height * 0.45;
    setTimeout(() => {
      this.createConfettiExplosion(cx, cy, 80, 5);
      this.createRingBurst(cx, cy, 5);
      this.createScreenFlash(cx, cy);
      const text = document.createElement('div');
      text.className = 'float-text';
      text.textContent = '全部完成！太棒了！';
      text.style.left = `${cx - 60}px`;
      text.style.top = `${cy}px`;
      text.style.fontSize = '18px';
      this.celebrationContainer.appendChild(text);
      setTimeout(() => text.remove(), 1500);
      this.playSound('allDone');
      setTimeout(() => this.switchTab('completed'), 1800);
    }, 400);
  }

  createScreenFlash(x, y) {
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    const c = this.celebrationContainer;
    flash.style.setProperty('--flash-x', `${(x/c.offsetWidth)*100}%`);
    flash.style.setProperty('--flash-y', `${(y/c.offsetHeight)*100}%`);
    c.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
  }

  createRingBurst(x, y, combo = 1) {
    const count = Math.min(3 + Math.floor(combo / 2), 5);
    const colors = ['#22c55e','#4ade80','#fbbf24','#86efac','#fcd34d'];
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const ring = document.createElement('div');
        ring.className = 'completion-ring';
        ring.style.left = `${x}px`;
        ring.style.top = `${y}px`;
        ring.style.marginLeft = '-5px';
        ring.style.marginTop = '-5px';
        ring.style.borderColor = colors[i % colors.length];
        ring.style.animationDuration = `${0.5 + i * 0.12}s`;
        this.celebrationContainer.appendChild(ring);
        setTimeout(() => ring.remove(), 900);
      }, i * 80);
    }
  }

  createConfettiExplosion(x, y, count = 35, combo = 1) {
    const themes = [
      ['#22c55e','#4ade80','#86efac','#bbf7d0','#fbbf24','#fcd34d','#fef08a','#f0abfc','#ffffff'],
      ['#f87171','#fb923c','#fbbf24','#a78bfa','#f0abfc','#ffffff','#22c55e'],
      ['#38bdf8','#7dd3fc','#22d3ee','#a5f3fc','#fbbf24','#ffffff','#4ade80'],
      ['#a78bfa','#c084fc','#e879f9','#22d3ee','#34d399','#fbbf24','#ffffff'],
    ];
    const colors = themes[Math.floor(Math.random() * themes.length)];
    const shapes = ['particle-circle','particle-star','particle-leaf'];

    for (let i = 0; i < count; i++) {
      setTimeout(() => this.launchParticle(x, y, colors, shapes, combo), Math.random() * 100);
    }
  }

  launchParticle(ox, oy, colors, shapes, combo) {
    const el = document.createElement('div');
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    el.className = `confetti-particle ${shape}`;
    const size = 3 + Math.random() * (8 + combo);
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    el.style.left = `${ox}px`;
    el.style.top = `${oy}px`;
    this.celebrationContainer.appendChild(el);

    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * (4 + combo);

    this._particles.push({
      el,
      x: 0, y: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.5,
      gravity: 0.06 + Math.random() * 0.04,
      drag: 0.97 + Math.random() * 0.02,
      spin: (Math.random() - 0.5) * 12,
      wobbleFreq: 2 + Math.random() * 4,
      wobbleAmp: Math.random() * 1.2,
      rotation: 0,
      opacity: 1,
      frame: 0,
    });

    if (!this._particleLoop) this.startParticleLoop();
  }

  startParticleLoop() {
    const loop = () => {
      for (let i = this._particles.length - 1; i >= 0; i--) {
        const p = this._particles[i];
        p.vx *= p.drag;
        p.vy += p.gravity;
        p.vy *= p.drag;
        p.x += p.vx + Math.sin(p.frame * 0.05 * p.wobbleFreq) * p.wobbleAmp;
        p.y += p.vy;
        p.rotation += p.spin;
        p.opacity -= 0.009;
        p.frame++;

        if (p.opacity <= 0) {
          p.el.remove();
          this._particles.splice(i, 1);
          continue;
        }
        p.el.style.transform = `translate(${p.x}px,${p.y}px) rotate(${p.rotation}deg)`;
        p.el.style.opacity = Math.max(0, p.opacity).toFixed(2);
      }

      if (this._particles.length > 0) {
        this._particleLoop = requestAnimationFrame(loop);
      } else {
        this._particleLoop = null;
      }
    };
    this._particleLoop = requestAnimationFrame(loop);
  }

  createFloatText(x, y, combo) {
    const msgs = ['完成！','太棒了！','干得好！','继续加油！','漂亮！','绽放！','丰收！'];
    const emojis = ['🌸','🌺','🌻','🌷','💐','🌿','🦋','✨','💚','🎉'];
    const text = document.createElement('div');
    text.className = 'float-text';
    text.textContent = msgs[Math.floor(Math.random()*msgs.length)] + ' ' + emojis[Math.floor(Math.random()*emojis.length)];
    text.style.left = `${x - 25}px`;
    text.style.top = `${y}px`;
    if (combo >= 3) text.style.fontSize = '18px';
    this.celebrationContainer.appendChild(text);
    setTimeout(() => text.remove(), 1300);
  }

  createComboText(x, y, combo) {
    const labels = { 2:'双连击！', 3:'三连击！🔥', 4:'超级连击！！', 5:'传奇！！！' };
    const text = document.createElement('div');
    text.className = 'combo-text';
    text.textContent = `x${combo} ${labels[Math.min(combo, 5)] || '无人能挡！！'}`;
    text.style.left = `${x}px`;
    text.style.top = `${y}px`;
    text.style.fontSize = `${Math.min(14 + combo * 3, 30)}px`;
    this.celebrationContainer.appendChild(text);
    setTimeout(() => text.remove(), 1600);
  }

  createSparkle(x, y) {
    const sparkle = document.createElement('div');
    sparkle.className = 'success-sparkle';
    sparkle.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16"><path d="M10 0L12 7L20 10L12 13L10 20L8 13L0 10L8 7Z" fill="#fbbf24" opacity="0.8"/></svg>`;
    sparkle.style.left = `${x - 8}px`;
    sparkle.style.top = `${y - 8}px`;
    this.celebrationContainer.appendChild(sparkle);
    setTimeout(() => sparkle.remove(), 700);
  }

  // ---- Sound (Web Audio API) ----
  ensureAudio() {
    if (!this.audioCtx) {
      try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }
    return this.audioCtx;
  }

  toggleMute() {
    this._muted = !this._muted;
    localStorage.setItem('green-todo-muted', this._muted);
  }

  playSound(type, combo = 1) {
    if (this._muted) return;
    const ctx = this.ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'complete') {
      const notes = [523.25, 659.25, 783.99];
      const gain0 = Math.min(0.08 + combo * 0.015, 0.18);
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq + (combo - 1) * 15;
        gain.gain.setValueAtTime(0, now + i * 0.07);
        gain.gain.linearRampToValueAtTime(gain0, now + i * 0.07 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.25);
      });
    } else if (type === 'add') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'allDone') {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.06);
        gain.gain.linearRampToValueAtTime(0.1, now + i * 0.06 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.5);
      });
    }
  }

  // ---- Helpers ----
  // ---- Inline Edit ----
  startEdit(id, textEl) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo || todo.completed || todo._completing) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = todo.text;
    input.maxLength = 200;
    input.style.cssText = 'flex:1;font-size:14px;padding:3px 8px;border:1.5px solid var(--green-400);border-radius:4px;outline:none;font-family:inherit;color:var(--text);background:var(--surface);min-width:0;';
    textEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const v = input.value.trim();
      if (v && v !== todo.text) { todo.text = v; this.saveTodos(); this.announce(`已修改：${v}`); }
      this.renderIncomplete();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { e.stopPropagation(); input.value = todo.text; input.blur(); }
    });
  }

  // ---- Export ----
  async exportTodos() {
    if (!window.electronAPI || !window.electronAPI.exportData) return;
    const data = JSON.stringify(this.todos, null, 2);
    const result = await window.electronAPI.exportData(data);
    if (result && result.success) this.announce('数据已导出');
  }

  async importTodos() {
    if (!window.electronAPI || !window.electronAPI.importData) return;
    const result = await window.electronAPI.importData();
    if (!result || !result.success) return;
    try {
      const imported = JSON.parse(result.data);
      if (!Array.isArray(imported)) { this.announce('导入失败：数据格式错误'); return; }
      // Merge: add imported todos that don't exist by ID
      const existingIds = new Set(this.todos.map(t => t.id));
      let added = 0;
      imported.forEach(t => {
        if (t && t.id && t.text && !existingIds.has(t.id)) {
          this.todos.push(t);
          existingIds.add(t.id);
          added++;
        }
      });
      this.saveTodos();
      this.render();
      this.announce(`已导入 ${added} 条待办`);
    } catch { this.announce('导入失败：文件解析错误'); }
  }

  // ---- Hotkey Settings ----
  async initHotkey() {
    if (!window.electronAPI || !window.electronAPI.getHotkey) return;
    const key = await window.electronAPI.getHotkey();
    this._currentHotkey = key;
    document.getElementById('hotkey-text').textContent = key;
    document.getElementById('hide-btn').title = `隐藏 (${key})`;
  }

  openHotkeyRecorder() {
    const overlay = document.getElementById('hotkey-overlay');
    const recorder = document.getElementById('hotkey-recorder');
    const confirmBtn = document.getElementById('hotkey-confirm');
    overlay.classList.remove('hidden');
    recorder.textContent = '等待输入...';
    recorder.classList.add('recording');
    confirmBtn.disabled = true;
    this._pendingHotkey = null;

    this._hotkeyHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Meta');
      const key = e.key;
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        parts.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key);
      }
      if (parts.length >= 2 && !['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        const combo = parts.join('+');
        recorder.textContent = combo;
        this._pendingHotkey = combo;
        confirmBtn.disabled = false;
      }
    };
    document.addEventListener('keydown', this._hotkeyHandler, true);
  }

  closeHotkeyRecorder() {
    document.getElementById('hotkey-overlay').classList.add('hidden');
    document.getElementById('hotkey-recorder').classList.remove('recording');
    if (this._hotkeyHandler) {
      document.removeEventListener('keydown', this._hotkeyHandler, true);
      this._hotkeyHandler = null;
    }
    this._pendingHotkey = null;
  }

  async confirmHotkey() {
    if (!this._pendingHotkey || !window.electronAPI) return;
    const result = await window.electronAPI.setHotkey(this._pendingHotkey);
    if (result.success) {
      this._currentHotkey = result.hotkey;
      document.getElementById('hotkey-text').textContent = result.hotkey;
      document.getElementById('hide-btn').title = `隐藏 (${result.hotkey})`;
      this.announce(`快捷键已设为 ${result.hotkey}`);
    } else {
      this.announce('快捷键设置失败，可能被其他程序占用');
    }
    this.closeHotkeyRecorder();
  }

  // ---- Clipboard ----
  loadClipboard() {
    try {
      const data = localStorage.getItem('green-todo-clipboard');
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }

  saveClipboard() {
    try { localStorage.setItem('green-todo-clipboard', JSON.stringify(this.clipItems)); } catch {}
  }

  toggleClipPanel() {
    const panel = document.getElementById('clip-panel');
    if (panel.classList.contains('hidden')) {
      this.renderClipboard();
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  }

  addClipItem() {
    const input = document.getElementById('clip-input');
    const text = input.value.trim();
    if (!text) return;
    this.clipItems.unshift({ id: Date.now().toString(36), text });
    input.value = '';
    this.saveClipboard();
    this.renderClipboard();
  }

  deleteClipItem(id) {
    this.clipItems = this.clipItems.filter(c => c.id !== id);
    this.saveClipboard();
    this.renderClipboard();
  }

  async copyClipItem(id, el) {
    const item = this.clipItems.find(c => c.id === id);
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.text);
      // Show copied flash
      const flash = document.createElement('div');
      flash.className = 'clip-copied';
      flash.textContent = '已复制';
      el.style.position = 'relative';
      el.appendChild(flash);
      setTimeout(() => flash.remove(), 600);
    } catch {}
  }

  renderClipboard() {
    const list = document.getElementById('clip-list');
    const empty = document.getElementById('clip-empty');
    list.innerHTML = '';
    empty.classList.toggle('hidden', this.clipItems.length > 0);

    this.clipItems.forEach(item => {
      const el = document.createElement('div');
      el.className = 'clip-item';
      el.innerHTML = `
        <span class="clip-item-text">${this.escapeHtml(item.text)}</span>
        <span class="clip-item-copy">点击复制</span>
        <button class="clip-item-del" aria-label="删除">
          <svg viewBox="0 0 16 16" width="10" height="10"><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>`;
      el.addEventListener('click', (e) => {
        if (!e.target.closest('.clip-item-del')) this.copyClipItem(item.id, el);
      });
      el.querySelector('.clip-item-del').addEventListener('click', () => this.deleteClipItem(item.id));
      list.appendChild(el);
    });
  }

  announce(msg) {
    const el = document.getElementById('aria-announcer');
    if (el) { el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 100); }
  }

  escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  escapeAttr(str) {
    return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;');
  }

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // ---- In-app Pet Widget ----
  _getPetState(total, completed) {
    const states = [
      { id:"sleep_normal",p:"seed",e:"arc",m:"smile",b:true },
      { id:"sleep_zzz",p:"seed",e:"closed",m:"o",b:true },
      { id:"tired_droopy",p:"sprout",e:"half",m:"line",b:true },
      { id:"tired_yawn",p:"sprout",e:"closed",m:"o",b:true },
      { id:"meh_blink",p:"twoLeaf",e:"wink",m:"line",b:false },
      { id:"meh_normal",p:"twoLeaf",e:"dot",m:"line",b:false },
      { id:"okay_normal",p:"twoLeaf",e:"dot",m:"smile",b:false },
      { id:"okay_curious",p:"twoLeaf",e:"dotUp",m:"o",b:false },
      { id:"happy_smile",p:"bigLeaf",e:"arc",m:"smile",b:true },
      { id:"happy_tongue",p:"bigLeaf",e:"arc",m:"tongue",b:true },
      { id:"happy_wink",p:"bigLeaf",e:"winkHappy",m:"grin",b:true },
      { id:"excited_sparkle",p:"bud",e:"big",m:"grin",b:true },
      { id:"excited_star",p:"bud",e:"star",m:"grin",b:true },
      { id:"celebrate_wow",p:"flower",e:"huge",m:"huge",b:true },
      { id:"celebrate_love",p:"flower",e:"heart",m:"huge",b:true },
    ];
    // When tapping the pet, cycle through ALL states
    if (this._petTapping) {
      return states[this._petTapIndex % states.length];
    }
    if (total === 0) return states[0];
    const pct = completed / total;
    let pool;
    if (pct >= 1.0) pool = states.filter(s => s.p === 'flower');
    else if (pct >= 0.8) pool = states.filter(s => s.p === 'bud');
    else if (pct >= 0.55) pool = states.filter(s => s.p === 'bigLeaf');
    else if (pct >= 0.35) pool = states.filter(s => s.id.startsWith('okay'));
    else if (pct >= 0.15) pool = states.filter(s => s.id.startsWith('meh'));
    else if (pct > 0) pool = states.filter(s => s.p === 'sprout');
    else pool = states.filter(s => s.p === 'seed');
    return pool[(completed + total) % pool.length];
  }

  _onPetClick() {
    // Cycle through all 15 expressions on each click
    this._petTapIndex = ((this._petTapIndex || 0) + 1);
    this._petTapping = true;
    const widget = document.getElementById('pet-widget');
    widget.classList.remove('bounce');
    void widget.offsetWidth;
    widget.classList.add('bounce');
    const inc = this.getIncompleteTodos().length;
    const comp = this.getCompletedTodos().length;
    this._updatePetWidget(inc + comp, comp);
    try { window.electronAPI.previewPetState(this._petTapIndex % 15); } catch {}
    // Reset to normal state after 3 seconds of no clicking
    clearTimeout(this._petTapTimer);
    this._petTapTimer = setTimeout(() => {
      this._petTapping = false;
      this._updatePetWidget(inc + comp, comp);
      try { window.electronAPI.updateTrayProgress(inc + comp, comp); } catch {}
    }, 3000);
  }

  _updatePetWidget(total, comp) {
    const canvas = document.getElementById('pet-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 88, H = 88; // canvas pixel size (2x for retina)
    canvas.width = W; canvas.height = H;

    const st = this._getPetState(total, comp);
    const petKey = `${total}-${comp}`;

    // Bounce animation on any todo change
    if (this._lastPetKey && this._lastPetKey !== petKey) {
      const widget = document.getElementById('pet-widget');
      widget.classList.remove('bounce');
      void widget.offsetWidth;
      widget.classList.add('bounce');
    }
    this._lastPetKey = petKey;

    ctx.clearRect(0, 0, W, H);
    const isDark = document.getElementById('app-container').classList.contains('dark');
    const fg = isDark ? '#a0d8a0' : '#22c55e';
    const fg2 = isDark ? '#7bc87b' : '#16a34a';
    const eye_fg = isDark ? '#1a2e1a' : '#14532d';

    const cx = 44, bcy = 48, br = 22;

    // Body
    ctx.beginPath(); ctx.arc(cx, bcy, br, 0, Math.PI * 2);
    ctx.fillStyle = fg; ctx.fill();

    // Plant
    const sb = bcy - br;
    this._drawPlant(ctx, st.p, cx, sb, fg2);

    // Blush
    if (st.b) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = isDark ? '#ff9999' : '#ff7777';
      ctx.beginPath(); ctx.ellipse(cx - 16, bcy + 2, 5, 3.5, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 16, bcy + 2, 5, 3.5, 0, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Eyes
    this._drawEyes(ctx, st.e, cx, bcy - 4, 12, eye_fg, fg);

    // Mouth
    this._drawMouth(ctx, st.m, cx, bcy + 10, eye_fg);
  }

  _drawPlant(ctx, plant, cx, sb, color) {
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    if (plant === 'seed') {
      ctx.beginPath(); ctx.arc(cx, sb - 5, 5, 0, Math.PI * 2); ctx.fill();
    } else if (plant === 'sprout') {
      ctx.beginPath(); ctx.moveTo(cx, sb); ctx.lineTo(cx, sb - 15); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 9, sb - 16, 6, 0, Math.PI * 2); ctx.fill();
    } else if (plant === 'twoLeaf') {
      ctx.beginPath(); ctx.moveTo(cx, sb); ctx.lineTo(cx, sb - 15); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - 10, sb - 18, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 10, sb - 18, 6, 0, Math.PI * 2); ctx.fill();
    } else if (plant === 'bigLeaf') {
      ctx.beginPath(); ctx.moveTo(cx, sb); ctx.lineTo(cx, sb - 17); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - 13, sb - 20, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 13, sb - 20, 9, 0, Math.PI * 2); ctx.fill();
    } else if (plant === 'bud' || plant === 'flower') {
      ctx.beginPath(); ctx.moveTo(cx, sb); ctx.lineTo(cx, sb - 17); ctx.stroke();
      const fy = sb - 24;
      for (let a = 0; a < 3; a++) {
        const ang = -Math.PI/2 + a * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * 9, fy + Math.sin(ang) * 9, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      if (plant === 'flower') {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(cx, fy, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  _drawEyes(ctx, eyes, cx, ey, es, color, bg) {
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (eyes === 'closed' || eyes === 'arc' || eyes === 'winkHappy') {
      // Happy squint ^_^
      [-1, 1].forEach(s => {
        const ex = cx + s * es;
        if (eyes === 'winkHappy' && s > 0) {
          ctx.beginPath(); ctx.moveTo(ex - 4, ey); ctx.lineTo(ex + 4, ey); ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(ex - 5, ey + 1);
          ctx.quadraticCurveTo(ex, ey - 5, ex + 5, ey + 1);
          ctx.stroke();
        }
      });
    } else if (eyes === 'half') {
      [-1, 1].forEach(s => {
        ctx.beginPath(); ctx.moveTo(cx + s * es - 4, ey); ctx.lineTo(cx + s * es + 4, ey); ctx.stroke();
      });
    } else if (eyes === 'dot' || eyes === 'dotUp') {
      const yo = eyes === 'dotUp' ? -2 : 0;
      [-1, 1].forEach(s => {
        const ex = cx + s * es;
        // White eye bg
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey + yo, 6, 0, Math.PI * 2); ctx.fill();
        // Pupil
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ex + 0.5, ey + yo + 1, 3.5, 0, Math.PI * 2); ctx.fill();
        // Highlight
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 2, ey + yo - 1.5, 1.8, 0, Math.PI * 2); ctx.fill();
      });
    } else if (eyes === 'wink') {
      // Left: round, right: wink
      const lx = cx - es;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx, ey, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(lx + 0.5, ey + 1, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx + 2, ey - 1.5, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + es - 5, ey + 1);
      ctx.quadraticCurveTo(cx + es, ey - 5, cx + es + 5, ey + 1); ctx.stroke();
    } else if (eyes === 'big' || eyes === 'star' || eyes === 'huge') {
      const r = eyes === 'huge' ? 8 : 7;
      [-1, 1].forEach(s => {
        const ex = cx + s * es;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ex + 0.5, ey + 1, r * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex + 2.5, ey - 2, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex - 1.5, ey + 2.5, 1.0, 0, Math.PI * 2); ctx.fill();
      });
    } else if (eyes === 'heart') {
      ctx.fillStyle = '#ef4444';
      [-1, 1].forEach(s => {
        const ex = cx + s * es;
        // Heart shape
        ctx.beginPath();
        ctx.moveTo(ex, ey + 5);
        ctx.bezierCurveTo(ex - 8, ey - 2, ex - 4, ey - 8, ex, ey - 3);
        ctx.bezierCurveTo(ex + 4, ey - 8, ex + 8, ey - 2, ex, ey + 5);
        ctx.fill();
      });
    }
  }

  _drawMouth(ctx, mouth, cx, my, color) {
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (mouth === 'frown') {
      ctx.beginPath();
      ctx.moveTo(cx - 5, my + 2); ctx.quadraticCurveTo(cx, my - 2, cx + 5, my + 2);
      ctx.stroke();
    } else if (mouth === 'line') {
      // Cat mouth ω
      ctx.beginPath();
      ctx.moveTo(cx - 7, my); ctx.quadraticCurveTo(cx - 3, my + 3, cx, my);
      ctx.quadraticCurveTo(cx + 3, my + 3, cx + 7, my);
      ctx.stroke();
    } else if (mouth === 'o' || mouth === 'O') {
      const r = mouth === 'O' ? 5 : 3.5;
      ctx.beginPath(); ctx.arc(cx, my, r, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    } else if (mouth === 'smile' || mouth === 'grin') {
      const w = mouth === 'grin' ? 10 : 8;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - w, my);
      ctx.quadraticCurveTo(cx, my + (mouth === 'grin' ? 10 : 7), cx + w, my);
      ctx.stroke();
    } else if (mouth === 'tongue') {
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - 8, my); ctx.quadraticCurveTo(cx, my + 7, cx + 8, my);
      ctx.stroke();
      // Pink tongue
      ctx.fillStyle = '#f472b6';
      ctx.beginPath(); ctx.arc(cx, my + 7, 3.5, 0, Math.PI); ctx.fill();
    } else if (mouth === 'huge') {
      // Big open mouth
      ctx.beginPath(); ctx.arc(cx, my + 2, 8, 0, Math.PI);
      ctx.fillStyle = color; ctx.fill();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new GreenTodo();
  // If localStorage was empty, attempt async restore from file backup
  window.app.tryRestoreFromBackup();
});
