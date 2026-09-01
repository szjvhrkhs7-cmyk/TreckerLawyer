(() => {
  'use strict';

  const baseRender = render;
  const baseUpdateHeader = updateHeader;
  const baseApplyTheme = applyTheme;

  const pad = value => String(value).padStart(2, '0');
  const localDateKey = (value = new Date()) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const addDays = (value, amount) => {
    const date = new Date(value);
    date.setDate(date.getDate() + amount);
    return date;
  };
  const capitalize = value => value ? value[0].toLocaleUpperCase('ru-RU') + value.slice(1) : '';
  const todayKey = () => localDateKey();
  const tomorrowKey = () => localDateKey(addDays(new Date(), 1));

  function workspaceApplyTheme(theme, persist = false) {
    baseApplyTheme(theme, persist);
    themeColor.content = document.documentElement.dataset.theme === 'dark' ? '#0b1220' : '#f6f8fb';
  }

  applyTheme = workspaceApplyTheme;

  function rootTasks() {
    return load(LS.tasks).filter(valid).map(normTask);
  }

  function allTrackedTasks() {
    return [
      ...rootTasks(),
      ...load(LS.projectTasks).filter(valid).map(normTask)
    ];
  }

  function activeTasks() {
    return allTrackedTasks().filter(task => task.status !== 'done');
  }

  function datePriority(task) {
    if (overdue(task)) return 0;
    if (task.priority === 'high') return 1;
    if (task.dueDate === todayKey()) return 2;
    if (task.dueDate === tomorrowKey()) return 3;
    if (task.status === 'inwork') return 4;
    if (task.status === 'waiting') return 6;
    return 5;
  }

  function focusTasks() {
    return rootTasks()
      .filter(task => task.status !== 'done')
      .sort((a, b) => datePriority(a) - datePriority(b)
        || String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31'))
        || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 3);
  }

  function dueText(task) {
    if (!task.dueDate) return 'Без срока';
    if (overdue(task)) {
      const deadline = new Date(`${task.dueDate}T00:00:00`);
      const current = new Date();
      current.setHours(0, 0, 0, 0);
      const days = Math.max(1, Math.round((current - deadline) / 86400000));
      return `Просрочено на ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`;
    }
    if (task.dueDate === todayKey()) return 'Сегодня';
    if (task.dueDate === tomorrowKey()) return 'Завтра';
    return fmtDate(task.dueDate);
  }

  function statusLabel(task) {
    if (overdue(task)) return 'Просрочено';
    if (task.priority === 'high') return 'Высокий приоритет';
    return statusText[task.status] || 'Активная';
  }

  function focusTaskHtml(task) {
    const id = esc(String(task.id));
    const isLate = overdue(task);
    return `<article class="today-focus-task ${isLate ? 'is-overdue' : ''}">
      <button class="today-focus-check" type="button" data-today-done="${id}" aria-label="Завершить задачу ${esc(task.title)}"><span aria-hidden="true"></span></button>
      <button class="today-focus-main" type="button" data-today-edit="${id}">
        <strong>${esc(task.title)}</strong>
        <small>${esc(dueText(task))}${task.extra ? ` · ${esc(task.extra.slice(0, 70))}` : ''}</small>
      </button>
      <span class="today-status ${isLate ? 'is-danger' : task.priority === 'high' ? 'is-warning' : ''}">${esc(statusLabel(task))}</span>
      <button class="today-complete" type="button" data-today-done="${id}">Завершить</button>
    </article>`;
  }

  function calendarEvents() {
    if (typeof globalThis.allCalendarEvents === 'function') return globalThis.allCalendarEvents();
    return load(LS.calendarEvents).filter(valid).sort((a, b) => `${a.date || ''}T${a.startTime || ''}`.localeCompare(`${b.date || ''}T${b.startTime || ''}`));
  }

  function todayEvents() {
    return calendarEvents().filter(event => event.date === todayKey()).slice(0, 4);
  }

  function nextEvent() {
    const current = new Date();
    return calendarEvents().find(event => {
      if (!event.date || !event.startTime) return false;
      const date = new Date(`${event.date}T${event.startTime}:00`);
      return Number.isFinite(date.getTime()) && date >= current;
    }) || null;
  }

  function eventTimeLabel(event) {
    if (!event) return '—';
    if (event.date === todayKey()) return event.startTime || '—';
    if (event.date === tomorrowKey()) return 'Завтра';
    const date = new Date(`${event.date}T00:00:00`);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '') : '—';
  }

  function projectsSummary() {
    const projectTasks = load(LS.projectTasks).filter(valid).map(normTask);
    return allProjects()
      .filter(project => project.status !== 'done')
      .map(project => {
        const tasks = projectTasks.filter(task => sameId(task.projectId, project.id));
        const done = tasks.filter(task => task.status === 'done').length;
        const active = tasks.length - done;
        const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
        const hasOverdue = tasks.some(task => overdue(task));
        return { project, tasks, done, active, progress, hasOverdue };
      })
      .sort((a, b) => Number(b.hasOverdue) - Number(a.hasOverdue) || b.active - a.active || String(b.project.createdAt || '').localeCompare(String(a.project.createdAt || '')))
      .slice(0, 3);
  }

  function projectHtml(item) {
    const id = esc(String(item.project.id));
    return `<button class="today-project" type="button" data-open-project="${id}">
      <span class="today-project__top"><strong>${esc(item.project.title)}</strong><small>${item.progress}%</small></span>
      <span class="today-project__meta">${item.active} активных · ${item.done}/${item.tasks.length || 0} завершено</span>
      <progress class="today-progress" value="${item.progress}" max="100" aria-label="Выполнение проекта ${esc(item.project.title)}: ${item.progress}%"></progress>
    </button>`;
  }

  function renderToday() {
    const allActive = activeTasks();
    const rootFocus = focusTasks();
    const waiting = rootTasks().filter(task => task.status === 'waiting' && task.status !== 'done').slice(0, 2);
    const events = todayEvents();
    const upcoming = nextEvent();
    const projects = projectsSummary();
    const overdueCount = allActive.filter(task => overdue(task)).length;
    const inWorkCount = allActive.filter(task => task.status === 'inwork').length;
    const longDate = capitalize(new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));

    const focusHtml = rootFocus.length
      ? rootFocus.map(focusTaskHtml).join('')
      : '<div class="today-empty"><strong>Срочных задач нет</strong><span>Можно спокойно перейти к общему списку или запланировать новую задачу.</span></div>';

    const eventsHtml = events.length
      ? events.map(event => `<button class="today-event" type="button" data-today-event="${esc(String(event.id))}" data-event-date="${esc(event.date)}"><time>${esc(event.startTime || '')}</time><span><strong>${esc(event.title || 'Без названия')}</strong>${event.location ? `<small>${esc(event.location)}</small>` : ''}</span></button>`).join('')
      : '<div class="today-panel-empty">На сегодня событий нет</div>';

    const projectsHtml = projects.length
      ? projects.map(projectHtml).join('')
      : '<div class="today-panel-empty">Активных проектов пока нет</div>';

    const waitingHtml = waiting.length
      ? waiting.map(task => `<button class="today-waiting-row" type="button" data-today-edit="${esc(String(task.id))}"><span><strong>${esc(task.title)}</strong><small>${esc(dueText(task))}</small></span><span aria-hidden="true">›</span></button>`).join('')
      : '<div class="today-panel-empty">Нет задач в ожидании</div>';

    page.innerHTML = `<section class="today-dashboard" aria-label="Рабочий день">
      <header class="today-page-header">
        <div><p class="today-eyebrow">Рабочее пространство</p><h2>Сегодня</h2><p>${esc(longDate)}</p></div>
        <div class="today-page-header__actions">
          <button class="btn today-search" type="button" data-workspace-search><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg>Найти</button>
          <button class="btn primary" type="button" data-today-new><svg class="icon" aria-hidden="true"><use href="#i-plus"></use></svg>Добавить</button>
        </div>
      </header>

      <div class="today-grid">
        <div class="today-main-column">
          <section class="today-panel today-focus-panel">
            <div class="today-panel-heading"><div><h3>Требуют внимания</h3>${overdueCount ? `<span class="today-alert-count">${overdueCount} просрочено</span>` : ''}</div><button type="button" data-workspace-tab="tasks">Все задачи →</button></div>
            <div class="today-focus-list">${focusHtml}</div>
          </section>

          <section class="today-panel today-waiting-panel">
            <div class="today-panel-heading"><div><h3>Ожидают ответа</h3><span class="today-neutral-count">${waiting.length}</span></div><button type="button" data-workspace-tab="tasks">Все →</button></div>
            <div class="today-waiting-list">${waitingHtml}</div>
          </section>
        </div>

        <aside class="today-side-column">
          <section class="today-kpis" aria-label="Краткая статистика">
            <article class="today-kpi ${overdueCount ? 'is-danger' : ''}"><strong>${overdueCount}</strong><span>Просрочено</span></article>
            <article class="today-kpi"><strong>${inWorkCount}</strong><span>В работе</span></article>
            <article class="today-kpi"><strong>${esc(eventTimeLabel(upcoming))}</strong><span>Следующее событие</span></article>
          </section>

          <section class="today-panel">
            <div class="today-panel-heading"><div><h3>Сегодня в календаре</h3></div><button type="button" data-workspace-tab="calendar">Все события →</button></div>
            <div class="today-events">${eventsHtml}</div>
          </section>

          <section class="today-panel">
            <div class="today-panel-heading"><div><h3>Проекты</h3></div><button type="button" data-workspace-tab="projects">Все проекты →</button></div>
            <div class="today-projects">${projectsHtml}</div>
          </section>
        </aside>
      </div>
    </section>`;
  }

  function customizeTodayHeader() {
    if (state.tab !== 'today' || state.projectId) return;
    mainTitle.textContent = 'Сегодня';
    stats.textContent = capitalize(new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
    document.title = `Сегодня · ${APP_TITLE}`;
  }

  updateHeader = function workspaceUpdateHeader() {
    baseUpdateHeader();
    customizeTodayHeader();
  };

  render = function workspaceRender() {
    const isToday = state.tab === 'today' && !state.projectId;
    page.classList.toggle('today-page', isToday);
    if (!isToday) {
      baseRender();
      return;
    }
    updateHeader();
    page.classList.remove('calendar-page');
    renderToday();
  };

  page.addEventListener('click', event => {
    if (state.tab !== 'today' || state.projectId) return;

    const newButton = event.target.closest('[data-today-new]');
    if (newButton) {
      event.preventDefault();
      event.stopPropagation();
      openTask();
      return;
    }

    const searchButton = event.target.closest('[data-workspace-search]');
    if (searchButton) {
      event.preventDefault();
      event.stopPropagation();
      switchTab('tasks');
      requestAnimationFrame(() => document.getElementById('taskSearch')?.focus());
      return;
    }

    const tabButton = event.target.closest('[data-workspace-tab]');
    if (tabButton) {
      event.preventDefault();
      event.stopPropagation();
      switchTab(tabButton.dataset.workspaceTab);
      return;
    }

    const eventButton = event.target.closest('[data-today-event]');
    if (eventButton) {
      event.preventDefault();
      event.stopPropagation();
      state.calendarAnchor = eventButton.dataset.eventDate || todayKey();
      state.calendarSelectedDate = state.calendarAnchor;
      switchTab('calendar');
      return;
    }

    const completeButton = event.target.closest('[data-today-done]');
    if (completeButton) {
      event.preventDefault();
      event.stopPropagation();
      const taskId = completeButton.dataset.todayDone;
      const items = rootTasks();
      const task = items.find(item => sameId(item.id, taskId));
      if (!task) return;
      const completedAt = now();
      task.status = 'done';
      task.completedAt = task.completedAt || completedAt;
      task.updatedAt = completedAt;
      save(LS.tasks, items);
      render();
      return;
    }

    const editButton = event.target.closest('[data-today-edit]');
    if (editButton) {
      event.preventDefault();
      event.stopPropagation();
      const task = rootTasks().find(item => sameId(item.id, editButton.dataset.todayEdit));
      if (task) openTask(task);
    }
  }, true);

  state = { ...state, tab: 'today', query: '', projectId: null, filter: 'active', showCompleted: false };
  applyTheme(document.documentElement.dataset.theme);
  render();
})();
