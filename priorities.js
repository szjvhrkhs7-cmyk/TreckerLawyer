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

  function priorityDragHandle(task) {
    return `<button type="button" class="drag-handle priority-drag-handle" data-priority-drag aria-label="Перетащить задачу ${esc(task.title || 'Без названия')}" aria-pressed="false"><span class="drag-grip" aria-hidden="true"></span></button>`;
  }

  function taskCard(entry) {
    const task = entry.task;
    const id = esc(String(task.id));
    const scope = esc(entry.scope);
    const project = projectTitle(task);
    return `<article class="priority-card" data-priority-card="${id}" data-task-scope="${scope}" data-priority-date="${esc(task.priorityDate || '')}" data-priority-level="${esc(task.priorityLevel === 'other' ? 'other' : 'main')}">
      ${priorityDragHandle(task)}
      <button type="button" class="priority-card__main" data-priority-open="${id}" data-task-scope="${scope}">
        <strong>${esc(task.title || 'Без названия')}</strong>
        ${project ? `<span>${esc(project)}</span>` : ''}
      </button>
      <div class="priority-card__actions">
        <button type="button" class="priority-card__done" data-priority-done="${id}" data-task-scope="${scope}">Выполнить</button>
        <button type="button" data-set-priority="${id}" data-task-scope="${scope}">Перенести</button>
        <button type="button" class="is-danger" data-priority-delete="${id}" data-task-scope="${scope}" aria-label="Удалить задачу ${esc(task.title)}">Удалить</button>
      </div>
    </article>`;
  }

  function zone(entries, level, emptyText, priorityDate) {
    const matching = entries.filter(entry => (entry.task.priorityLevel === 'other' ? 'other' : 'main') === level);
    return `<div class="priority-zone__head"><h3>${level === 'main' ? 'Главное' : 'Остальные задачи'}</h3><button type="button" class="priority-add" data-priority-add="${level}" data-priority-date="${esc(priorityDate)}" aria-label="Добавить задачу: ${level === 'main' ? 'главное' : 'остальные задачи'}">+ Добавить</button></div><div class="priority-zone__list" data-priority-dropzone data-priority-date="${esc(priorityDate)}" data-priority-level="${level}">${matching.length ? matching.map(taskCard).join('') : `<p class="priority-zone-empty">${emptyText}</p>`}</div>`;
  }

  function bindPriorityDrag() {
    const handles = page.querySelectorAll('[data-priority-drag]');
    handles.forEach(handle => {
      if (handle.dataset.priorityDragBound === '1') return;
      handle.dataset.priorityDragBound = '1';
      const card = handle.closest('.priority-card');
      if (!card) return;

      let dragging = false;
      let moved = false;
      let startX = 0;
      let startY = 0;
      let pointerId = null;
      let floating = null;
      let originZone = null;
      let originNext = null;
      let originRect = null;
      const animations = new WeakMap();

      const cardsIn = zone => [...zone.querySelectorAll(':scope > .priority-card')];
      const snapshot = zone => new Map(cardsIn(zone).filter(item => item !== card).map(item => [item, item.getBoundingClientRect().top]));
      const animate = (zone, before) => {
        cardsIn(zone).forEach(item => {
          if (item === card) return;
          const oldTop = before.get(item);
          if (oldTop === undefined) return;
          const delta = oldTop - item.getBoundingClientRect().top;
          if (Math.abs(delta) < 0.5) return;
          animations.get(item)?.cancel?.();
          const animation = item.animate?.([
            { transform: `translate3d(0,${delta}px,0)` },
            { transform: 'translate3d(0,0,0)' }
          ], { duration: 165, easing: 'cubic-bezier(.2,.8,.2,1)' });
          if (animation) animations.set(item, animation);
        });
      };

      const placeFloating = (x, y) => {
        if (!floating || !originRect) return;
        floating.style.transform = `translate3d(${x - startX}px,${y - startY}px,0) scale(1.012)`;
      };

      const dropzoneAt = (x, y) => {
        const hit = document.elementFromPoint(x, y);
        return hit?.closest?.('[data-priority-dropzone]') || null;
      };

      const moveCard = (zone, y) => {
        if (!zone) return;
        const previousZone = card.parentElement;
        const beforePrevious = previousZone?.matches?.('[data-priority-dropzone]') ? snapshot(previousZone) : null;
        const beforeTarget = previousZone === zone ? beforePrevious : snapshot(zone);
        const candidates = cardsIn(zone).filter(item => item !== card);
        const target = candidates.find(item => {
          const rect = item.getBoundingClientRect();
          return y < rect.top + rect.height / 2;
        });
        if (target) zone.insertBefore(card, target);
        else zone.append(card);
        if (beforePrevious) animate(previousZone, beforePrevious);
        if (zone !== previousZone) animate(zone, beforeTarget);
        zone.querySelector('.priority-zone-empty')?.remove();
      };

      const onMove = event => {
        if (!dragging || event.pointerId !== pointerId) return;
        if (event.cancelable) event.preventDefault();
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (Math.hypot(dx, dy) > 4) moved = true;
        placeFloating(event.clientX, event.clientY);
        moveCard(dropzoneAt(event.clientX, event.clientY), event.clientY);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', finish, true);
        window.removeEventListener('pointercancel', cancel, true);
        document.body.classList.remove('drag-reordering');
        card.classList.remove('dragging', 'drag-placeholder');
        handle.setAttribute('aria-pressed', 'false');
      };

      const restore = () => {
        if (!originZone) return;
        if (originNext && originNext.parentNode === originZone) originZone.insertBefore(card, originNext);
        else originZone.append(card);
      };

      const persistDrop = () => {
        const zone = card.parentElement;
        if (!zone?.matches?.('[data-priority-dropzone]')) return false;
        const entry = findTask(card.dataset.priorityCard, card.dataset.taskScope || 'root');
        if (!entry) return false;
        const patch = { priorityDate: zone.dataset.priorityDate, priorityLevel: zone.dataset.priorityLevel === 'other' ? 'other' : 'main' };
        return saveTask(entry, patch);
      };

      function finish(event) {
        if (!dragging || event.pointerId !== pointerId) return;
        dragging = false;
        cleanup();
        const changedZone = card.parentElement !== originZone || card.dataset.priorityDate !== card.parentElement?.dataset.priorityDate || card.dataset.priorityLevel !== card.parentElement?.dataset.priorityLevel;
        if (!moved || !persistDrop()) restore();
        floating?.remove();
        floating = null;
        if (moved && changedZone) render();
      }

      function cancel(event) {
        if (!dragging || event.pointerId !== pointerId) return;
        dragging = false;
        restore();
        cleanup();
        floating?.remove();
        floating = null;
      }

      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 && event.pointerType !== 'touch') return;
        event.preventDefault();
        dragging = true;
        moved = false;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        originZone = card.parentElement;
        originNext = card.nextElementSibling;
        originRect = card.getBoundingClientRect();
        floating = card.cloneNode(true);
        floating.classList.add('drag-floating');
        floating.setAttribute('aria-hidden', 'true');
        floating.style.left = `${originRect.left}px`;
        floating.style.top = `${originRect.top}px`;
        floating.style.width = `${originRect.width}px`;
        floating.style.height = `${originRect.height}px`;
        floating.style.transform = 'translate3d(0,0,0) scale(1.012)';
        floating.style.transition = 'none';
        floating.style.willChange = 'transform';
        document.body.append(floating);
        card.classList.add('dragging', 'drag-placeholder');
        document.body.classList.add('drag-reordering');
        handle.setAttribute('aria-pressed', 'true');
        handle.setPointerCapture?.(pointerId);
        window.addEventListener('pointermove', onMove, { passive: false, capture: true });
        window.addEventListener('pointerup', finish, true);
        window.addEventListener('pointercancel', cancel, true);
      });
    });
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
    bindPriorityDrag();
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

    const target = event.target.closest('[data-priority-open], [data-priority-done], [data-priority-delete]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const id = target.dataset.priorityOpen || target.dataset.priorityDone || target.dataset.priorityDelete;
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
