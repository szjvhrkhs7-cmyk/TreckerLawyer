(() => {
  'use strict';

  const prioritySheet = document.getElementById('prioritySheet');
  const priorityForm = document.getElementById('priorityForm');
  const prioritySheetTitle = document.getElementById('prioritySheetTitle');
  let selectedTask = null;
  let newTaskDefaults = null;
  let weekAnchor = startOfWeek(new Date());

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function dateKey(value) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  function fromDateKey(value) {
    const parts = String(value || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const result = new Date(parts[0], parts[1] - 1, parts[2]);
    return dateKey(result) === value ? result : null;
  }

  function startOfWeek(value) {
    const result = new Date(value);
    result.setHours(0, 0, 0, 0);
    const day = result.getDay() || 7;
    result.setDate(result.getDate() - day + 1);
    return result;
  }

  function addDays(value, amount) {
    const result = new Date(value);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function nearestWorkday() {
    const today = new Date();
    const day = today.getDay();
    if (day >= 1 && day <= 5) return today;
    return addDays(today, day === 6 ? 2 : 1);
  }

  function taskEntries() {
    return [
      ...load(LS.tasks).filter(valid).map(task => ({ task: normTask(task), key: LS.tasks, scope: 'root' })),
      ...load(LS.projectTasks).filter(valid).map(task => ({ task: normTask(task), key: LS.projectTasks, scope: 'project' }))
    ];
  }

  function findTask(id, scope) {
    return taskEntries().find(entry => entry.scope === scope && sameId(entry.task.id, id)) || null;
  }

  function saveTask(entry, patch) {
    if (!entry) return false;
    const items = load(entry.key);
    const index = items.findIndex(task => sameId(task.id, entry.task.id));
    if (index < 0) return false;
    items[index] = { ...items[index], ...patch, updatedAt: now() };
    Object.keys(items[index]).forEach(key => items[index][key] === undefined && delete items[index][key]);
    save(entry.key, items);
    return true;
  }

  function deleteTask(entry) {
    if (!entry) return false;
    const items = load(entry.key);
    const next = items.filter(task => !sameId(task.id, entry.task.id));
    if (next.length === items.length) return false;
    save(entry.key, next);
    return true;
  }

  function projectTitle(task) {
    if (!task.projectId) return '';
    return allProjects().find(project => sameId(project.id, task.projectId))?.title || '';
  }

  function priorityTaskCount() {
    return taskEntries().filter(({ task }) => task.status !== 'done' && fromDateKey(task.priorityDate)).length;
  }

  function openPriorityPicker(entry) {
    if (!entry || entry.task.status === 'done') return;
    selectedTask = entry;
    const chosenDate = fromDateKey(entry.task.priorityDate) || nearestWorkday();
    prioritySheetTitle.textContent = entry.task.priorityDate ? 'Изменить приоритет' : 'Поставить приоритет';
    priorityForm.innerHTML = `<div class="sheet-fields">
      <p class="priority-picker-task">${esc(entry.task.title)}</p>
      <div class="field"><label for="priorityDay">День</label><input id="priorityDay" name="priorityDate" type="date" required value="${esc(dateKey(chosenDate))}"></div>
      <div class="field"><label for="priorityLevel">Зона</label><select id="priorityLevel" name="priorityLevel"><option value="main">Главное</option><option value="other">Остальные задачи</option></select></div>
      <p class="priority-picker-hint">Можно выбрать только рабочий день — с понедельника по пятницу.</p>
    </div><div class="sheet-actions">
      ${entry.task.priorityDate ? '<button type="button" class="btn danger" data-remove-priority>Убрать приоритет</button>' : ''}
      <button type="button" class="btn" data-cancel-priority>Отмена</button>
      <button type="submit" class="btn primary">Сохранить</button>
    </div>`;
    priorityForm.elements.priorityLevel.value = entry.task.priorityLevel === 'other' ? 'other' : 'main';
    showOverlay(prioritySheet);
  }

  function openPriorityCreator(priorityDate, priorityLevel) {
    const parsedDate = fromDateKey(priorityDate);
    if (!parsedDate || parsedDate.getDay() === 0 || parsedDate.getDay() === 6) return;
    selectedTask = null;
    newTaskDefaults = { priorityDate, priorityLevel: priorityLevel === 'other' ? 'other' : 'main' };
    prioritySheetTitle.textContent = 'Новая задача в приоритетах';
    priorityForm.innerHTML = `<div class="sheet-fields">
      <div class="field"><label for="priorityTaskTitle">Краткая суть задачи *</label><textarea id="priorityTaskTitle" name="title" required data-autogrow="true" autofocus></textarea></div>
      <div class="field"><label for="priorityTaskExtra">Что требуется дополнительно</label><textarea id="priorityTaskExtra" name="extra" data-autogrow="true"></textarea></div>
      <div class="grid2">
        <div class="field"><label for="priorityDay">День</label><input id="priorityDay" name="priorityDate" type="date" required value="${esc(priorityDate)}"></div>
        <div class="field"><label for="priorityLevel">Зона</label><select id="priorityLevel" name="priorityLevel"><option value="main">Главное</option><option value="other">Остальные задачи</option></select></div>
      </div>
      <div class="field"><label for="priorityTaskUrgency">Срочность</label><select id="priorityTaskUrgency" name="priority"><option value="normal">Обычная</option><option value="low">Низкая</option><option value="medium">Средняя</option><option value="high">Важно / срочно</option></select></div>
      <p class="priority-picker-hint">Задача одновременно появится в общем списке задач.</p>
    </div><div class="sheet-actions">
      <button type="button" class="btn" data-cancel-priority>Отмена</button>
      <button type="submit" class="btn primary">Создать задачу</button>
    </div>`;
    priorityForm.elements.priorityLevel.value = newTaskDefaults.priorityLevel;
    showOverlay(prioritySheet);
    bindAutoGrow(priorityForm);
    requestAnimationFrame(() => priorityForm.elements.title?.focus());
  }

  function formatDay(value, options) {
    return value.toLocaleDateString('ru-RU', options).replace('.', '');
  }

  function weekLabel(days) {
    const first = days[0];
    const last = days[4];
    if (first.getFullYear() !== last.getFullYear()) {
      return `${formatDay(first, { day: 'numeric', month: 'long', year: 'numeric' })} — ${formatDay(last, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    }
    if (first.getMonth() === last.getMonth()) {
      return `${first.getDate()}–${formatDay(last, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    }
    return `${formatDay(first, { day: 'numeric', month: 'long' })} — ${formatDay(last, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }

  function taskCard(entry) {
    const task = entry.task;
    const id = esc(String(task.id));
    const scope = esc(entry.scope);
    const project = projectTitle(task);
    return `<article class="priority-card" data-priority-card="${id}" data-task-scope="${scope}">
      <button type="button" class="priority-card__main" data-priority-open="${id}" data-task-scope="${scope}">
        <strong>${esc(task.title || 'Без названия')}</strong>
        ${project ? `<span>${esc(project)}</span>` : ''}
      </button>
      <div class="priority-card__actions">
        <button type="button" class="priority-card__done" data-priority-done="${id}" data-task-scope="${scope}">Выполнить</button>
        <button type="button" data-set-priority="${id}" data-task-scope="${scope}">Перенести</button>
        <button type="button" data-priority-remove="${id}" data-task-scope="${scope}">Убрать</button>
        <button type="button" class="is-danger" data-priority-delete="${id}" data-task-scope="${scope}" aria-label="Удалить задачу ${esc(task.title)}">Удалить</button>
      </div>
    </article>`;
  }

  function zone(entries, level, emptyText, priorityDate) {
    const matching = entries.filter(entry => (entry.task.priorityLevel === 'other' ? 'other' : 'main') === level);
    return `<div class="priority-zone__head"><h3>${level === 'main' ? 'Главное' : 'Остальные задачи'}</h3><button type="button" class="priority-add" data-priority-add="${level}" data-priority-date="${esc(priorityDate)}" aria-label="Добавить задачу: ${level === 'main' ? 'главное' : 'остальные задачи'}">+ Добавить</button></div>${matching.length ? matching.map(taskCard).join('') : `<p class="priority-zone-empty">${emptyText}</p>`}`;
  }

  function renderPriorities() {
    const days = Array.from({ length: 5 }, (_, index) => addDays(weekAnchor, index));
    const entries = taskEntries().filter(({ task }) => task.status !== 'done' && fromDateKey(task.priorityDate));
    page.innerHTML = `<section class="workspace-page priority-page">
      <header class="workspace-page-head priority-page-head">
        <div><p class="workspace-page-eyebrow">План на неделю</p><h2>Приоритеты</h2><p>${esc(weekLabel(days))}</p></div>
        <div class="priority-week-actions" aria-label="Навигация по неделям">
          <button type="button" class="btn" data-priority-week="prev" aria-label="Предыдущая неделя">‹</button>
          <button type="button" class="btn" data-priority-week="today">Текущая неделя</button>
          <button type="button" class="btn" data-priority-week="next" aria-label="Следующая неделя">›</button>
        </div>
      </header>
      <div class="priority-board" role="region" aria-label="Приоритеты на рабочую неделю" tabindex="0">
        ${days.map(day => {
          const key = dateKey(day);
          const dayEntries = entries.filter(entry => entry.task.priorityDate === key);
          return `<section class="priority-day" data-priority-date="${key}">
            <header class="priority-day__head"><strong>${esc(formatDay(day, { weekday: 'long' }))}</strong><span>${esc(formatDay(day, { day: 'numeric', month: 'long' }))}</span></header>
            <div class="priority-zone priority-zone--main">${zone(dayEntries, 'main', 'Главный приоритет не выбран', key)}</div>
            <div class="priority-zone priority-zone--other">${zone(dayEntries, 'other', 'Дополнительных задач нет', key)}</div>
          </section>`;
        }).join('')}
      </div>
    </section>`;
  }

  priorityForm.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(priorityForm);
    const priorityDate = String(data.get('priorityDate') || '');
    const parsedDate = fromDateKey(priorityDate);
    const control = priorityForm.elements.priorityDate;
    if (!parsedDate || parsedDate.getDay() === 0 || parsedDate.getDay() === 6) {
      control.setCustomValidity('Выберите рабочий день с понедельника по пятницу');
      control.reportValidity();
      control.setCustomValidity('');
      return;
    }
    const priorityLevel = data.get('priorityLevel') === 'other' ? 'other' : 'main';
    if (newTaskDefaults) {
      const title = String(data.get('title') || '').trim();
      const titleControl = priorityForm.elements.title;
      if (!title) {
        titleControl.setCustomValidity('Укажите краткую суть задачи');
        titleControl.reportValidity();
        titleControl.setCustomValidity('');
        return;
      }
      const timestamp = now();
      const items = load(LS.tasks);
      items.push({
        id: uid(),
        title,
        extra: String(data.get('extra') || '').trim(),
        dueDate: '',
        reminder: 0,
        priority: ['low', 'medium', 'high'].includes(data.get('priority')) ? data.get('priority') : 'normal',
        status: 'new',
        notes: '',
        priorityDate,
        priorityLevel,
        createdAt: timestamp,
        updatedAt: timestamp
      });
      save(LS.tasks, items);
      weekAnchor = startOfWeek(parsedDate);
      newTaskDefaults = null;
      hideOverlay(prioritySheet);
      render();
      return;
    }
    if (!selectedTask) return;
    if (!saveTask(selectedTask, { priorityDate, priorityLevel })) return;
    weekAnchor = startOfWeek(parsedDate);
    selectedTask = null;
    hideOverlay(prioritySheet);
    render();
  });

  priorityForm.addEventListener('click', event => {
    if (event.target.closest('[data-cancel-priority]')) {
      event.preventDefault();
      selectedTask = null;
      newTaskDefaults = null;
      hideOverlay(prioritySheet);
      return;
    }
    if (event.target.closest('[data-remove-priority]')) {
      event.preventDefault();
      if (saveTask(selectedTask, { priorityDate: undefined, priorityLevel: undefined })) {
        selectedTask = null;
        hideOverlay(prioritySheet);
        render();
      }
    }
  });

  page.addEventListener('click', event => {
    const setButton = event.target.closest('[data-set-priority]');
    if (setButton) {
      event.preventDefault();
      event.stopPropagation();
      openPriorityPicker(findTask(setButton.dataset.setPriority, setButton.dataset.taskScope || 'root'));
      return;
    }
    if (state.tab !== 'priorities' || state.projectId) return;

    const addButton = event.target.closest('[data-priority-add]');
    if (addButton) {
      event.preventDefault();
      openPriorityCreator(addButton.dataset.priorityDate, addButton.dataset.priorityAdd);
      return;
    }

    const weekButton = event.target.closest('[data-priority-week]');
    if (weekButton) {
      const action = weekButton.dataset.priorityWeek;
      weekAnchor = action === 'today' ? startOfWeek(new Date()) : addDays(weekAnchor, action === 'prev' ? -7 : 7);
      render();
      return;
    }

    const target = event.target.closest('[data-priority-open], [data-priority-done], [data-priority-remove], [data-priority-delete]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const id = target.dataset.priorityOpen || target.dataset.priorityDone || target.dataset.priorityRemove || target.dataset.priorityDelete;
    const entry = findTask(id, target.dataset.taskScope || 'root');
    if (!entry) return;
    if (target.dataset.priorityOpen) {
      openTask(entry.task);
      return;
    }
    if (target.dataset.priorityDone) {
      const completedAt = now();
      if (saveTask(entry, { status: 'done', completedAt: entry.task.completedAt || completedAt })) render();
      return;
    }
    if (target.dataset.priorityRemove) {
      if (saveTask(entry, { priorityDate: undefined, priorityLevel: undefined })) render();
      return;
    }
    askConfirm('Задача будет удалена из трекера без возможности восстановления.', () => {
      if (deleteTask(entry)) render();
    });
  }, true);

  document.addEventListener('click', event => {
    if (event.target.id === 'prioritySheet' || event.target.closest('#prioritySheet [data-cancel-priority]')) {
      selectedTask = null;
      newTaskDefaults = null;
    }
  });

  globalThis.priorityTaskCount = priorityTaskCount;
  globalThis.renderPriorities = renderPriorities;
  globalThis.openPriorityPicker = openPriorityPicker;
})();

