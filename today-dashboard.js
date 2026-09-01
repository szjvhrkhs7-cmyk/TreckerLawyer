(() => {
  'use strict';

  const baseRender = render;
  const baseUpdateHeader = updateHeader;
  const TODAY_TAB = 'today';

  function localDateKey(value = new Date()) {
    const pad = item => String(item).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  function addDays(value, amount) {
    const date = new Date(value);
    date.setDate(date.getDate() + amount);
    return date;
  }

  function dayLabel(value = new Date()) {
    const label = value.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    return label ? label[0].toLocaleUpperCase('ru-RU') + label.slice(1) : '';
  }

  function rootTasks() {
    return load(LS.tasks).filter(valid).map(normTask);
  }

  function taskProjectTitle(task) {
    if (!task.projectId) return '';
    return allProjects().find(project => sameId(project.id, task.projectId))?.title || '';
  }

  function focusScore(task) {
    const today = localDateKey();
    const tomorrow = localDateKey(addDays(new Date(), 1));
    if (overdue(task)) return 100;
    if (task.dueDate === today) return 90;
    if (task.priority === 'high') return 80;
    if (task.dueDate === tomorrow) return 70;
    if (task.status === 'inwork') return 60;
    if (task.status === 'waiting') return 30;
    return 40;
  }

  function focusTasks() {
    return rootTasks()
      .filter(task => task.status !== 'done' && task.status !== 'waiting')
      .sort((a, b) => focusScore(b) - focusScore(a) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4);
  }

  function waitingTasks() {
    return rootTasks().filter(task => task.status === 'waiting').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function todayEvents() {
    const today = localDateKey();
    return (globalThis.allCalendarEvents?.() || []).filter(event => event.date === today).slice(0, 4);
  }

  function upcomingEvents() {
    return globalThis.upcomingCalendarEvents?.() || [];
  }

  function taskTiming(task) {
    if (overdue(task)) return 'Просрочено';
    const today = localDateKey();
    const tomorrow = localDateKey(addDays(new Date(), 1));
    if (task.dueDate === today) return 'Сегодня';
    if (task.dueDate === tomorrow) return 'Завтра';
    return task.dueDate ? fmtDate(task.dueDate) : 'Без срока';
  }

  function focusTaskCard(task) {
    const id = esc(String(task.id));
    const project = taskProjectTitle(task);
    const critical = overdue(task) || task.priority === 'high';
    return `<article class="today-task ${critical ? 'is-critical' : ''}">
      <button class="today-task__open" type="button" data-edit-task="${id}" aria-label="Открыть задачу ${esc(task.title)}">
        <span class="today-task__check" aria-hidden="true"></span>
        <span class="today-task__content">
          <strong>${esc(task.title)}</strong>
          <small>${project ? `${esc(project)} · ` : ''}${esc(taskTiming(task))}</small>
        </span>
      </button>
      <span class="today-task__status">${esc(statusText[task.status] || 'Новая')}</span>
      <button class="today-task__done" type="button" data-done-task="${id}">Завершить</button>
    </article>`;
  }

  function compactProject(project, projectTasks) {
    const items = projectTasks.filter(task => sameId(task.projectId, project.id));
    const done = items.filter(task => task.status === 'done').length;
    const progress = items.length ? Math.round(done / items.length * 100) : 0;
    return `<button class="today-project" type="button" data-open-project="${esc(String(project.id))}">
      <span class="today-project__title">${esc(project.title)}</span>
      <span class="today-project__meta">${done} / ${items.length} задач <b>${progress}%</b></span>
      <span class="today-project__progress" aria-hidden="true"><span style="--project-progress:${progress}%"></span></span>
    </button>`;
  }

  function renderToday() {
    const all = rootTasks();
    const active = all.filter(task => task.status !== 'done');
    const inwork = active.filter(task => task.status === 'inwork').length;
    const overdueCount = active.filter(overdue).length;
    const focus = focusTasks();
    const waiting = waitingTasks();
    const events = todayEvents();
    const nextEvent = upcomingEvents()[0];
    const projectTasks = load(LS.projectTasks).filter(valid).map(normTask);
    const projects = allProjects().filter(project => project.status !== 'done').slice(0, 3);

    const focusHtml = focus.length
      ? focus.map(focusTaskCard).join('')
      : `<div class="today-empty"><svg class="icon" aria-hidden="true"><use href="#i-check-square"></use></svg><strong>Критичных задач нет</strong><span>Можно спокойно перейти к плановым задачам.</span></div>`;

    const calendarHtml = events.length
      ? events.map(event => `<button class="today-event" type="button" data-today-event="${esc(String(event.id))}"><time>${esc(event.startTime)}</time><span><strong>${esc(event.title)}</strong>${event.location ? `<small>${esc(event.location)}</small>` : ''}</span></button>`).join('')
      : `<div class="today-calendar-empty">На сегодня событий нет</div>`;

    const waitingHtml = waiting.length
      ? waiting.slice(0, 3).map(task => `<button class="today-waiting" type="button" data-edit-task="${esc(String(task.id))}"><span>${esc(task.title)}</span><small>${esc(taskTiming(task))}</small></button>`).join('')
      : `<p class="today-muted">Нет задач в ожидании</p>`;

    const projectsHtml = projects.length
      ? projects.map(project => compactProject(project, projectTasks)).join('')
      : `<p class="today-muted">Активных проектов пока нет</p>`;

    page.innerHTML = `<section class="today-dashboard" aria-label="Сегодня">
      <header class="today-header">
        <div>
          <p class="today-eyebrow">Рабочий день</p>
          <h2>Сегодня</h2>
          <p>${esc(dayLabel())}</p>
        </div>
        <button class="today-add" type="button" data-today-add><svg class="icon" aria-hidden="true"><use href="#i-plus"></use></svg>Добавить</button>
      </header>

      <div class="today-layout">
        <div class="today-main-column">
          <section class="today-panel today-focus-panel">
            <div class="today-section-heading"><div><span>Фокус</span><h3>Требуют внимания</h3></div>${overdueCount ? `<span class="today-alert">${overdueCount} просрочено</span>` : '<span class="today-safe">Без просрочек</span>'}</div>
            <div class="today-focus-list">${focusHtml}</div>
            <button class="today-link" type="button" data-today-open-tasks>Все задачи →</button>
          </section>

          <section class="today-panel today-waiting-panel">
            <div class="today-section-heading"><div><span>Статус</span><h3>Ожидают ответа</h3></div><span class="today-count">${waiting.length}</span></div>
            <div class="today-waiting-list">${waitingHtml}</div>
          </section>
        </div>

        <aside class="today-side-column">
          <section class="today-kpis" aria-label="Сводка">
            <article class="today-kpi ${overdueCount ? 'is-danger' : ''}"><strong>${overdueCount}</strong><span>Просрочено</span></article>
            <article class="today-kpi"><strong>${inwork}</strong><span>В работе</span></article>
            <article class="today-kpi"><strong>${nextEvent ? esc(nextEvent.startTime) : '—'}</strong><span>Следующее событие</span></article>
          </section>

          <section class="today-panel today-calendar-panel">
            <div class="today-section-heading"><div><span>Расписание</span><h3>Сегодня в календаре</h3></div></div>
            <div class="today-events">${calendarHtml}</div>
            <button class="today-link" type="button" data-today-open-calendar>Открыть календарь →</button>
          </section>

          <section class="today-panel today-projects-panel">
            <div class="today-section-heading"><div><span>Работа</span><h3>Проекты</h3></div></div>
            <div class="today-projects">${projectsHtml}</div>
            <button class="today-link" type="button" data-today-open-projects>Все проекты →</button>
          </section>
        </aside>
      </div>
    </section>`;
  }

  updateHeader = function updateWorkspaceHeader() {
    baseUpdateHeader();
    document.documentElement.dataset.view = state.projectId ? 'project' : state.tab;
    if (state.tab !== TODAY_TAB || state.projectId) return;
    mainTitle.textContent = 'Сегодня';
    stats.textContent = dayLabel();
    document.title = `Сегодня · ${APP_TITLE}`;
  };

  render = function renderWorkspace() {
    if (state.projectId || state.tab !== TODAY_TAB) {
      baseRender();
      return;
    }
    updateHeader();
    page.innerHTML = '';
    page.classList.remove('calendar-page');
    renderToday();
  };

  page.addEventListener('click', event => {
    if (state.tab !== TODAY_TAB || state.projectId) return;
    if (event.target.closest('[data-today-add]')) { openTask(); return; }
    if (event.target.closest('[data-today-open-tasks]')) { switchTab('tasks'); return; }
    if (event.target.closest('[data-today-open-projects]')) { switchTab('projects'); return; }
    if (event.target.closest('[data-today-open-calendar]')) { switchTab('calendar'); return; }
    const eventId = event.target.closest('[data-today-event]')?.dataset.todayEvent;
    if (!eventId) return;
    const calendarEvent = globalThis.allCalendarEvents?.().find(item => sameId(item.id, eventId));
    if (!calendarEvent) return;
    state.calendarAnchor = calendarEvent.date;
    state.calendarSelectedDate = calendarEvent.date;
    switchTab('calendar');
    globalThis.openCalendarEvent?.(calendarEvent);
  });

  state.tab = TODAY_TAB;
  state.query = '';
  state.projectId = null;
  render();
})();