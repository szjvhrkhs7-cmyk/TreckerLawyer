(() => {
  'use strict';

  const timestamp = new Date().toISOString();
  localStorage.setItem('lawyerTasks', JSON.stringify([
    { id: 'completion-root-active', title: 'Проверить договор перед отправкой', status: 'inwork', priority: 'normal', createdAt: timestamp, updatedAt: timestamp },
    { id: 'completion-root-done', title: 'Уже завершённая задача', status: 'done', priority: 'normal', completedAt: timestamp, createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerProjects', JSON.stringify([
    { id: 'completion-project', title: 'Тестовый проект', description: 'Проверка задач проекта', createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerProjectTasks', JSON.stringify([
    { id: 'completion-project-active', projectId: 'completion-project', title: 'Согласовать форму заявления', status: 'new', priority: 'normal', createdAt: timestamp, updatedAt: timestamp },
    { id: 'completion-project-done', projectId: 'completion-project', title: 'Готовая задача проекта', status: 'done', priority: 'normal', completedAt: timestamp, createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerNotes', '[]');
  localStorage.setItem('lawyerCalendarEvents', '[]');

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (predicate, timeout = 6000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = predicate();
      if (value) return value;
      await wait(60);
    }
    return null;
  };

  let finished = false;
  function finish(message) {
    if (finished) return;
    finished = true;
    const node = document.createElement('div');
    node.id = 'task-completion-result';
    node.textContent = message;
    document.body.append(node);
  }
  const fail = message => finish(`FAIL: ${message}`);
  const pass = () => finish('TASK_COMPLETION_PASS');

  function storedTask(key, id) {
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    return items.find(item => String(item.id) === String(id));
  }

  function validateButton(button, row, context) {
    if (!button || !row) return `${context}: кнопка «Выполнить» не найдена`;
    if (button.textContent.trim() !== 'Выполнить') return `${context}: неверная подпись кнопки`;
    if (!button.classList.contains('workspace-complete-action')) return `${context}: не применён стиль действия выполнения`;
    if (!button.getAttribute('aria-label')?.startsWith('Выполнить задачу')) return `${context}: нет понятной aria-label`;
    if (getComputedStyle(button).display === 'none') return `${context}: кнопка скрыта`;

    const rect = button.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rect.left < rowRect.left - 1 || rect.right > rowRect.right + 1) return `${context}: кнопка выходит за карточку`;
    if (rect.left < -1 || rect.right > window.innerWidth + 1) return `${context}: кнопка выходит за viewport`;
    if (window.innerWidth < 900 && rect.height < 44) return `${context}: мобильная touch-зона меньше 44px`;
    if (window.innerWidth >= 900 && rect.height < 36) return `${context}: desktop-кнопка слишком мала`;
    return '';
  }

  function validateMobileTaskGeometry(row, context) {
    if (window.innerWidth >= 900) return '';
    const main = row?.querySelector('.workspace-task-main');
    const title = main?.querySelector('strong');
    const actions = row?.querySelector('.workspace-row-actions');
    if (!main || !title || !actions) return `${context}: неполная мобильная карточка`;
    const rowRect = row.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    if (mainRect.width < 200 || titleRect.width < 200) return `${context}: текстовая колонка слишком узкая (${mainRect.width}/${titleRect.width})`;
    if (rowRect.height > 420) return `${context}: карточка аномально высокая (${rowRect.height})`;
    if (actionsRect.width < 200) return `${context}: панель действий слишком узкая (${actionsRect.width})`;
    return '';
  }

  function validateCompletedSection(expectedId, expectedCount, context) {
    const toggle = document.getElementById('toggleCompleted');
    if (!toggle) return `${context}: раздел завершённых задач не найден`;
    if (toggle.getAttribute('aria-expanded') !== 'true') return `${context}: раздел «Завершено» не открылся автоматически`;
    if (!toggle.textContent.includes(`Завершено (${expectedCount})`)) return `${context}: неверное название или счётчик раздела: ${toggle.textContent.trim()}`;
    if (document.querySelector(`#activeTasks [data-sort-id="${expectedId}"]`)) return `${context}: выполненная задача осталась среди активных`;
    const completedRow = document.querySelector(`#completedTasks .workspace-task-row.is-done[data-sort-id="${expectedId}"]`);
    if (!completedRow) return `${context}: выполненная задача не появилась в «Завершено»`;
    if (!completedRow.querySelector('[data-restore-task]')) return `${context}: у завершённой задачи пропала возможность возврата`;
    return '';
  }

  window.addEventListener('load', async () => {
    try {
      const rootButton = await waitFor(() => {
        const button = document.querySelector('[data-done-task="completion-root-active"]');
        return button?.textContent.trim() === 'Выполнить' ? button : null;
      });
      const rootRow = rootButton?.closest('.workspace-task-row');
      const rootButtonFailure = validateButton(rootButton, rootRow, 'Обычная задача');
      if (rootButtonFailure) return fail(rootButtonFailure);
      const rootGeometryFailure = validateMobileTaskGeometry(rootRow, 'Обычная задача');
      if (rootGeometryFailure) return fail(rootGeometryFailure);

      if (window.innerWidth < 900) {
        const actions = rootRow.querySelector('.workspace-row-actions');
        const priorityAction = rootRow.querySelector('.workspace-priority-action');
        if (!actions || getComputedStyle(actions).display === 'none') return fail('Мобильная панель действий скрыта');
        if (!priorityAction || getComputedStyle(priorityAction).display === 'none') return fail('На телефоне пропала кнопка приоритета');
      }

      rootButton.click();
      const rootStored = await waitFor(() => {
        const task = storedTask('lawyerTasks', 'completion-root-active');
        return task?.status === 'done' && task.completedAt ? task : null;
      });
      if (!rootStored) return fail('Обычная задача не сохранилась со статусом done и completedAt');

      await waitFor(() => document.querySelector('#completedTasks [data-sort-id="completion-root-active"]'));
      const rootCompletedFailure = validateCompletedSection('completion-root-active', 2, 'Обычная задача');
      if (rootCompletedFailure) return fail(rootCompletedFailure);

      state.projectId = 'completion-project';
      state.tab = 'tasks';
      state.filter = 'active';
      state.query = '';
      state.showCompleted = false;
      render();

      const projectButton = await waitFor(() => {
        const button = document.querySelector('[data-done-task="completion-project-active"]');
        return button?.textContent.trim() === 'Выполнить' ? button : null;
      });
      const projectRow = projectButton?.closest('.workspace-task-row');
      const projectButtonFailure = validateButton(projectButton, projectRow, 'Задача проекта');
      if (projectButtonFailure) return fail(projectButtonFailure);
      const projectGeometryFailure = validateMobileTaskGeometry(projectRow, 'Задача проекта');
      if (projectGeometryFailure) return fail(projectGeometryFailure);

      projectButton.click();
      const projectStored = await waitFor(() => {
        const task = storedTask('lawyerProjectTasks', 'completion-project-active');
        return task?.status === 'done' && task.completedAt ? task : null;
      });
      if (!projectStored) return fail('Задача проекта не сохранилась со статусом done и completedAt');

      await waitFor(() => document.querySelector('#completedTasks [data-sort-id="completion-project-active"]'));
      const projectCompletedFailure = validateCompletedSection('completion-project-active', 2, 'Задача проекта');
      if (projectCompletedFailure) return fail(projectCompletedFailure);

      if (document.documentElement.scrollWidth > window.innerWidth + 1) {
        return fail(`Появился горизонтальный overflow: ${document.documentElement.scrollWidth}/${window.innerWidth}`);
      }

      pass();
    } catch (error) {
      fail(error?.message || String(error));
    }
  });
})();
