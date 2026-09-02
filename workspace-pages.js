(() => {
  'use strict';

  const baseOpenTask = openTask;
  const projectIsDone = project => project?.status === 'done' || Boolean(project?.completedAt);

  function localDateKey(value = new Date()) {
    const pad = number => String(number).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  function formatDateTime(value) {
    if (!value || Number.isNaN(Date.parse(value))) return '';
    return new Date(value).toLocaleString('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }).replace('.', '');
  }

  function taskProject(task) {
    return task?.projectId ? allProjects().find(project => sameId(project.id, task.projectId)) : null;
  }

  function taskDueLabel(task) {
    if (!task?.dueDate) return 'Без срока';
    if (overdue(task)) return `Просрочено · ${fmtDate(task.dueDate)}`;
    if (task.dueDate === localDateKey()) return 'Сегодня';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (task.dueDate === localDateKey(tomorrow)) return 'Завтра';
    return fmtDate(task.dueDate);
  }

  function taskTone(task) {
    if (overdue(task)) return 'danger';
    if (task.priority === 'high') return 'warning';
    if (task.status === 'waiting') return 'purple';
    if (task.status === 'inwork') return 'blue';
    return 'neutral';
  }

  function ensureToast() {
    let toast = document.getElementById('workspaceToast');
    if (toast) return toast;
    toast = document.createElement('div');
    toast.id = 'workspaceToast';
    toast.className = 'workspace-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.append(toast);
    return toast;
  }

  let toastTimer = null;
  function showToast(message) {
    const toast = ensureToast();
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function storedTaskKey(task) {
    return task?.projectId ? LS.projectTasks : LS.tasks;
  }

  function updateStoredTask(task, patch) {
    if (!task?.id) return false;
    const key = storedTaskKey(task);
    const items = load(key);
    const index = items.findIndex(item => sameId(item.id, task.id));
    if (index < 0) return false;
    items[index] = { ...items[index], ...patch, updatedAt: now() };
    save(key, items);
    return true;
  }

  function deleteStoredTask(task) {
    if (!task?.id) return false;
    const key = storedTaskKey(task);
    const items = load(key);
    const next = items.filter(item => !sameId(item.id, task.id));
    if (next.length === items.length) return false;
    save(key, next);
    return true;
  }

  function workspaceOpenTask(task = {}) {
    if (!task?.id) {
      baseOpenTask(task);
      return;
    }

    const current = normTask(task);
    const project = taskProject(current);
    const tone = taskTone(current);
    state.editingTask = current;
    taskSheetTitle.textContent = 'Детали задачи';
    taskForm.innerHTML = `<section class="task-detail" aria-label="Детали задачи">
      <header class="task-detail__header">
        <div class="task-detail__title-wrap">
          <span class="workspace-status workspace-status--${tone}">${esc(overdue(current) ? 'Просрочено' : statusText[current.status] || 'Активная')}</span>
          ${current.priority !== 'normal' && current.priority !== 'none' ? `<span class="workspace-priority workspace-priority--${esc(current.priority)}">${esc(priorityText[current.priority] || current.priority)}</span>` : ''}
          <h3>${esc(current.title)}</h3>
        </div>
        <button type="button" class="workspace-icon-button" id="cancelTask" aria-label="Закрыть детали задачи">×</button>
      </header>
      <dl class="task-detail__facts">
        <div><dt>Срок</dt><dd class="${overdue(current) ? 'is-danger' : ''}">${esc(taskDueLabel(current))}</dd></div>
        <div><dt>Статус</dt><dd>${esc(statusText[current.status] || current.status)}</dd></div>
        <div><dt>Приоритет</dt><dd>${esc(priorityText[current.priority] || current.priority)}</dd></div>
        ${project ? `<div><dt>Проект</dt><dd>${esc(project.title)}</dd></div>` : ''}
      </dl>
      ${current.extra ? `<section class="task-detail__section"><h4>Описание</h4><p>${esc(current.extra)}</p></section>` : ''}
      ${current.notes ? `<section class="task-detail__section"><h4>Заметки</h4><p>${esc(stripHtml(current.notes))}</p></section>` : ''}
      <div class="task-detail__history">
        ${current.updatedAt ? `<span>Изменено ${esc(formatDateTime(current.updatedAt))}</span>` : ''}
        ${current.createdAt ? `<span>Создано ${esc(formatDateTime(current.createdAt))}</span>` : ''}
      </div>
      <div class="task-detail__actions">
        ${current.status !== 'done' ? '<button type="button" class="btn primary" data-task-detail-done>Завершить задачу</button>' : ''}
        <button type="button" class="btn" data-task-detail-edit>Изменить</button>
        <button type="button" class="btn" data-task-detail-calendar>В календарь</button>
        <button type="button" class="btn danger" data-task-detail-delete>Удалить</button>
      </div>
    </section>`;
    showOverlay(taskSheet);
  }

  openTask = workspaceOpenTask;
  globalThis.openTask = workspaceOpenTask;

  taskForm.addEventListener('click', event => {
    const task = state.editingTask?.id ? normTask(state.editingTask) : null;
    if (!task) return;

    if (event.target.closest('[data-task-detail-edit]')) {
      event.preventDefault();
      baseOpenTask(task);
      return;
    }
    if (event.target.closest('[data-task-detail-calendar]')) {
      event.preventDefault();
      makeIcs(task);
      return;
    }
    if (event.target.closest('[data-task-detail-done]')) {
      event.preventDefault();
      if (updateStoredTask(task, { status: 'done', completedAt: now() })) {
        hideOverlay(taskSheet);
        render();
        showToast('Задача завершена');
      }
      return;
    }
    if (event.target.closest('[data-task-detail-delete]')) {
      event.preventDefault();
      askConfirm('Задача будет удалена без возможности восстановления.', () => {
        if (!deleteStoredTask(task)) return;
        hideOverlay(taskSheet);
        render();
        showToast('Задача удалена');
      });
    }
  });

  function workspaceTaskRow(task, done = false) {
    const id = esc(String(task.id));
    const tone = taskTone(task);
    const project = taskProject(task);
    return `<article class="workspace-task-row workspace-task-row--${tone} ${done ? 'is-done' : ''}" data-sort-id="${id}">
      ${done ? '<span class="workspace-task-row__done-mark" aria-hidden="true">✓</span>' : dragHandle(`задачу ${task.title}`)}
      <button type="button" class="workspace-task-main" data-edit-task="${id}">
        <strong>${esc(task.title || 'Без названия')}</strong>
        <span class="workspace-task-meta">
          <span class="workspace-due ${overdue(task) ? 'is-danger' : ''}">${esc(taskDueLabel(task))}</span>
          ${project ? `<span>${esc(project.title)}</span>` : ''}
          ${task.extra ? `<span class="workspace-task-description">${esc(task.extra)}</span>` : ''}
        </span>
      </button>
      <span class="workspace-status workspace-status--${tone}">${esc(overdue(task) ? 'Просрочено' : statusText[task.status] || task.status)}</span>
      <span class="workspace-priority workspace-priority--${esc(task.priority)}">${esc(priorityText[task.priority] || task.priority)}</span>
      <div class="workspace-row-actions">
        ${!done && task.status !== 'done' ? `<button type="button" class="btn workspace-priority-action" data-set-priority="${id}" data-task-scope="${task.projectId ? 'project' : 'root'}">${task.priorityDate ? 'Изменить приоритет' : 'Поставить приоритет'}</button>` : ''}
        ${!done && task.status !== 'done' ? `<button type="button" class="btn ok" data-done-task="${id}">Завершить</button>` : ''}
        <button type="button" class="workspace-icon-button" data-edit-task="${id}" aria-label="Открыть задачу ${esc(task.title)}">•••</button>
      </div>
    </article>`;
  }

  function workspaceTaskList(items) {
    if (!items.length) return '<div class="workspace-empty"><svg class="icon" aria-hidden="true"><use href="#i-inbox"></use></svg><strong>Задач нет</strong><span>Здесь появятся задачи, соответствующие выбранному фильтру.</span></div>';
    return `<div class="workspace-task-list list">${orderedFor('task', items).map(task => workspaceTaskRow(task, task.status === 'done')).join('')}</div>`;
  }

  function enhancedRenderTasks() {
    const items = tasks();
    const activeCount = items.filter(task => task.status !== 'done').length;
    const overdueCount = items.filter(task => overdue(task)).length;
    const inWorkCount = items.filter(task => task.status === 'inwork').length;
    const waitingCount = items.filter(task => task.status === 'waiting').length;
    const heading = state.projectId ? 'Задачи проекта' : 'Задачи';

    page.innerHTML = `<section class="workspace-page workspace-tasks-page">
      <header class="workspace-page-head">
        <div><p class="workspace-page-eyebrow">Рабочий список</p><h2>${heading}</h2><p>${activeCount} активных задач</p></div>
        <button type="button" class="btn primary workspace-page-add" data-workspace-new-task><svg class="icon" aria-hidden="true"><use href="#i-plus"></use></svg>Новая задача</button>
      </header>
      <section class="workspace-summary-strip" aria-label="Статистика задач">
        <article class="workspace-summary-item ${overdueCount ? 'is-danger' : ''}"><strong>${overdueCount}</strong><span>Просрочено</span></article>
        <article class="workspace-summary-item"><strong>${inWorkCount}</strong><span>В работе</span></article>
        <article class="workspace-summary-item"><strong>${waitingCount}</strong><span>Ожидают</span></article>
      </section>
      <div class="workspace-toolbar">
        <div class="search-wrap"><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg><input class="search" id="taskSearch" type="search" autocomplete="off" placeholder="Поиск задач" value="${esc(state.query)}" aria-label="Поиск по задачам"></div>
        ${renderFilters()}
      </div>
      <div id="activeTasks"></div>
      ${!state.projectId ? '<details class="workspace-utilities"><summary>Экспорт и резервные копии</summary><div><button type="button" class="btn" id="csvBtn">Экспорт CSV</button><button type="button" class="btn" id="backupBtn">Резервная копия</button><button type="button" class="btn" id="restoreBtn">Восстановить</button></div></details>' : ''}
      <section class="completed-section workspace-completed"><button type="button" class="completed-link" id="toggleCompleted" aria-expanded="${state.showCompleted}"></button><div id="completedTasks"></div></section>
    </section>`;

    const input = $('#taskSearch');
    const active = $('#activeTasks');
    const completed = $('#completedTasks');
    const toggle = $('#toggleCompleted');

    function draw() {
      state.query = input.value;
      const done = items.filter(task => task.status === 'done' && taskMatchesQuery(task));
      const filtered = items.filter(taskPass);
      active.innerHTML = workspaceTaskList(filtered);
      toggle.textContent = `${state.showCompleted ? '▴' : '▾'} Завершённые (${done.length})`;
      toggle.setAttribute('aria-expanded', String(state.showCompleted));
      completed.innerHTML = state.showCompleted ? workspaceTaskList(done) : '';
      bindSortable(active, 'task');
      if (state.showCompleted) bindSortable(completed, 'task');
    }

    input.oninput = draw;
    draw();
  }

  function projectSummary(project, projectTasks) {
    const projectItems = projectTasks.filter(task => sameId(task.projectId, project.id));
    const done = projectItems.filter(task => task.status === 'done').length;
    return {
      tasks: projectItems,
      done,
      active: projectItems.length - done,
      progress: projectItems.length ? Math.round(done / projectItems.length * 100) : 0,
      overdue: projectItems.filter(task => overdue(task)).length
    };
  }

  function workspaceProjectCard(project, projectTasks, completed = false) {
    const id = esc(String(project.id));
    const summary = projectSummary(project, projectTasks);
    const completedLabel = project.completedAt ? new Date(project.completedAt).toLocaleDateString('ru-RU') : '';
    return `<article class="workspace-project-card ${completed ? 'is-completed' : ''}" data-sort-id="${id}">
      <div class="workspace-project-card__top">
        <span class="workspace-project-icon"><svg class="icon" aria-hidden="true"><use href="#i-folder"></use></svg></span>
        <button type="button" class="workspace-project-title" data-open-project="${id}"><strong>${esc(project.title)}</strong>${project.description ? `<span>${esc(project.description)}</span>` : ''}</button>
        ${completed ? '<span class="workspace-status workspace-status--neutral">Завершён</span>' : summary.overdue ? `<span class="workspace-status workspace-status--danger">${summary.overdue} просрочено</span>` : ''}
      </div>
      <div class="workspace-project-metrics"><span>${summary.active} активных</span><span>${summary.done}/${summary.tasks.length} выполнено</span><strong>${completed ? 100 : summary.progress}%</strong></div>
      <progress class="workspace-progress" value="${completed ? 100 : summary.progress}" max="100" aria-label="Выполнение проекта ${esc(project.title)}: ${completed ? 100 : summary.progress}%"></progress>
      <div class="workspace-project-footer">
        <span>${completedLabel ? `Завершён ${esc(completedLabel)}` : summary.tasks.length ? `${summary.tasks.length} задач` : 'Задач пока нет'}</span>
        <div class="workspace-row-actions">
          ${completed ? '' : dragHandle(`проект ${project.title}`)}
          <button type="button" class="btn" data-open-project="${id}">Открыть</button>
          <button type="button" class="workspace-icon-button" data-edit-project="${id}" aria-label="Изменить проект ${esc(project.title)}">✎</button>
          ${completed ? '' : `<button type="button" class="workspace-icon-button workspace-icon-button--success" data-complete-project="${id}" aria-label="Завершить проект ${esc(project.title)}">✓</button>`}
          <button type="button" class="workspace-icon-button workspace-icon-button--danger" data-del-project="${id}" aria-label="Удалить проект ${esc(project.title)}">×</button>
        </div>
      </div>
    </article>`;
  }

  function enhancedRenderProjects() {
    const projectTasks = load(LS.projectTasks).filter(valid).map(normTask);
    const projects = allProjects();
    const activeCount = projects.filter(project => !projectIsDone(project)).length;
    page.innerHTML = `<section class="workspace-page workspace-projects-page">
      <header class="workspace-page-head">
        <div><p class="workspace-page-eyebrow">Рабочие направления</p><h2>Проекты</h2><p>${activeCount} активных проектов</p></div>
        <button type="button" class="btn primary workspace-page-add" data-workspace-new-project><svg class="icon" aria-hidden="true"><use href="#i-plus"></use></svg>Новый проект</button>
      </header>
      <div class="search-wrap workspace-page-search"><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg><input class="search" id="projectSearch" type="search" autocomplete="off" placeholder="Поиск проектов" value="${esc(state.query)}" aria-label="Поиск проектов"></div>
      <div class="workspace-project-grid list" id="projectsList"></div>
      <section class="completed-section workspace-completed"><button type="button" class="completed-link" id="toggleCompletedProjects" aria-expanded="${Boolean(state.showCompletedProjects)}"></button><div class="workspace-project-grid list" id="completedProjects"></div></section>
    </section>`;

    const input = $('#projectSearch');
    const activeList = $('#projectsList');
    const completedList = $('#completedProjects');
    const toggle = $('#toggleCompletedProjects');

    function draw() {
      state.query = input.value;
      const query = state.query.trim().toLocaleLowerCase('ru');
      const matching = projects.filter(project => !query || `${project.title || ''} ${project.description || ''}`.toLocaleLowerCase('ru').includes(query));
      const active = orderedFor('project', matching.filter(project => !projectIsDone(project)));
      const completed = orderedFor('project', matching.filter(projectIsDone));
      activeList.innerHTML = active.map(project => workspaceProjectCard(project, projectTasks, false)).join('') || '<div class="workspace-empty"><svg class="icon" aria-hidden="true"><use href="#i-folder"></use></svg><strong>Активных проектов нет</strong><span>Создайте проект для большой задачи или отдельного направления работы.</span></div>';
      toggle.textContent = `${state.showCompletedProjects ? '▴' : '▾'} Завершённые проекты (${completed.length})`;
      toggle.setAttribute('aria-expanded', String(Boolean(state.showCompletedProjects)));
      completedList.innerHTML = state.showCompletedProjects ? completed.map(project => workspaceProjectCard(project, projectTasks, true)).join('') : '';
      bindSortable(activeList, 'project');
    }

    input.oninput = draw;
    draw();
  }

  function noteUpdatedLabel(note) {
    const value = note.updatedAt || note.createdAt;
    if (!value || Number.isNaN(Date.parse(value))) return '';
    return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
  }

  function enhancedRenderNotes() {
    const notes = allNotes();
    page.innerHTML = `<section class="workspace-page workspace-notes-page">
      <header class="workspace-page-head">
        <div><p class="workspace-page-eyebrow">Быстрый блокнот</p><h2>Заметки</h2><p>${notes.length} записей</p></div>
        <button type="button" class="btn primary workspace-page-add" data-workspace-new-note><svg class="icon" aria-hidden="true"><use href="#i-plus"></use></svg>Новая заметка</button>
      </header>
      <div class="search-wrap workspace-page-search"><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg><input class="search" id="noteSearch" type="search" autocomplete="off" placeholder="Поиск заметок" value="${esc(state.query)}" aria-label="Поиск заметок"></div>
      <div class="workspace-notes-grid list" id="notesList"></div>
    </section>`;

    const input = $('#noteSearch');
    const list = $('#notesList');

    function draw() {
      state.query = input.value;
      const query = state.query.trim().toLocaleLowerCase('ru');
      const matching = orderedFor('note', notes.filter(note => !query || `${note.title || ''} ${stripHtml(note.body || '')}`.toLocaleLowerCase('ru').includes(query)));
      list.innerHTML = matching.map(note => {
        const id = esc(String(note.id));
        const title = esc(note.title || 'Без заголовка');
        const preview = esc(cleanNotePreview(note.body).slice(0, 240) || 'Пустая заметка');
        return `<div class="swipe-row workspace-note-row" data-note-row="${id}" data-sort-id="${id}">
          <div class="swipe-action"><button type="button" class="swipe-delete" data-delete-note="${id}" aria-label="Удалить заметку">Удалить</button></div>
          <article class="workspace-note-card note-card">
            <div class="workspace-note-card__top">${dragHandle(`заметку ${note.title || 'Без заголовка'}`)}<span>${esc(noteUpdatedLabel(note))}</span><button type="button" class="workspace-icon-button workspace-icon-button--danger" data-delete-note="${id}" aria-label="Удалить заметку ${title}">×</button></div>
            <button type="button" class="workspace-note-main" data-open-note="${id}" aria-label="Открыть заметку ${title}"><h3>${title}</h3><p>${preview}</p></button>
          </article>
        </div>`;
      }).join('') || '<div class="workspace-empty"><svg class="icon" aria-hidden="true"><use href="#i-note"></use></svg><strong>Заметок не найдено</strong><span>Создайте запись или измените поисковый запрос.</span></div>';
      bindNoteSwipe();
      bindSortable(list, 'note');
    }

    input.oninput = draw;
    draw();
  }

  renderTasks = enhancedRenderTasks;
  renderProjects = enhancedRenderProjects;
  renderNotes = enhancedRenderNotes;
  globalThis.renderTasks = enhancedRenderTasks;
  globalThis.renderProjects = enhancedRenderProjects;
  globalThis.renderNotes = enhancedRenderNotes;

  page.addEventListener('click', event => {
    const editTaskButton = event.target.closest('[data-edit-task]');
    if (editTaskButton) {
      event.preventDefault();
      event.stopPropagation();
      const task = tasks().find(item => sameId(item.id, editTaskButton.dataset.editTask));
      if (task) workspaceOpenTask(task);
      return;
    }
    if (event.target.closest('[data-workspace-new-task]')) {
      event.preventDefault();
      event.stopPropagation();
      baseOpenTask();
      return;
    }
    if (event.target.closest('[data-workspace-new-project]')) {
      event.preventDefault();
      event.stopPropagation();
      openProject();
      return;
    }
    if (event.target.closest('[data-workspace-new-note]')) {
      event.preventDefault();
      event.stopPropagation();
      openNote();
      return;
    }
    if (event.target.closest('#toggleCompletedProjects')) {
      event.preventDefault();
      event.stopPropagation();
      state.showCompletedProjects = !state.showCompletedProjects;
      enhancedRenderProjects();
    }
  }, true);

  render();
})();
