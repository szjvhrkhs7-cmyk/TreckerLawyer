(() => {
  'use strict';

  const now = new Date();
  const stamp = offset => new Date(now.getTime() + offset).toISOString();

  localStorage.setItem('lawyerTasks', JSON.stringify([
    { id: 'drag-task-1', title: 'Первая задача', status: 'new', priority: 'normal', createdAt: stamp(-2000), updatedAt: stamp(-2000) },
    { id: 'drag-task-2', title: 'Вторая задача', status: 'new', priority: 'normal', createdAt: stamp(-1000), updatedAt: stamp(-1000) }
  ]));
  localStorage.setItem('lawyerProjects', JSON.stringify([
    { id: 'drag-project-1', title: 'Первый проект', description: 'Проверка мобильных controls', createdAt: stamp(-2000), updatedAt: stamp(-2000) },
    { id: 'drag-project-2', title: 'Второй проект', description: 'Проверка drag handle', createdAt: stamp(-1000), updatedAt: stamp(-1000) }
  ]));
  localStorage.setItem('lawyerProjectTasks', '[]');
  localStorage.setItem('lawyerNotes', JSON.stringify([
    { id: 'drag-note-1', title: 'Первая заметка', body: 'Тест', createdAt: stamp(-2000), updatedAt: stamp(-2000) },
    { id: 'drag-note-2', title: 'Вторая заметка', body: 'Тест', createdAt: stamp(-1000), updatedAt: stamp(-1000) }
  ]));
  localStorage.setItem('lawyerCalendarEvents', '[]');
  localStorage.removeItem('lawyerTaskOrder');

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (predicate, label, timeout = 6000) => {
    const started = performance.now();
    while (performance.now() - started < timeout) {
      const value = predicate();
      if (value) return value;
      await wait(60);
    }
    throw new Error(`таймаут ожидания: ${label}`);
  };

  const finish = message => {
    const existing = document.getElementById('interaction-regression-result');
    if (existing) existing.remove();
    const node = document.createElement('div');
    node.id = 'interaction-regression-result';
    node.textContent = message;
    document.body.append(node);
  };
  const fail = message => finish(`FAIL: ${message}`);
  const pass = () => finish('INTERACTION_REGRESSION_PASS');

  window.addEventListener('load', async () => {
    try {
      const taskTab = await waitFor(() => document.querySelector('[data-tab="tasks"]'), 'вкладка задач');
      taskTab.click();

      await waitFor(() => document.querySelector('.workspace-tasks-page'), 'новая страница задач');
      const rows = [...document.querySelectorAll('.workspace-task-row:not(.is-done)')];
      if (rows.length < 2) return fail('недостаточно карточек задач');
      for (const row of rows) {
        const handle = row.querySelector(':scope > [data-drag-handle]');
        const priority = row.querySelector('.workspace-priority');
        const overflow = row.querySelector('.workspace-icon-button');
        if (!handle || getComputedStyle(handle).display !== 'none') return fail('левая drag-иконка задачи отображается');
        if (!priority || getComputedStyle(priority).display === 'none') return fail('степень срочности задачи скрыта');
        if (priority.textContent.trim() !== 'Обычная') return fail(`неверный текст срочности: ${priority.textContent.trim()}`);
        if (!overflow || overflow.getBoundingClientRect().width < 44 || overflow.getBoundingClientRect().height < 44) {
          return fail('правое меню задачи слишком маленькое');
        }
      }

      document.querySelector('[data-tab="projects"]')?.click();
      const project = await waitFor(() => document.querySelector('.workspace-project-card'), 'карточка проекта');
      const projectControls = [...project.querySelectorAll('.workspace-row-actions button')];
      if (projectControls.length < 4) return fail('project controls не отрисованы');
      for (const control of projectControls) {
        const rect = control.getBoundingClientRect();
        if (rect.height < 44) return fail(`project control ниже 44px: ${rect.height}`);
      }
      const projectIconButtons = projectControls.filter(control => control.classList.contains('workspace-icon-button'));
      if (projectIconButtons.some(control => control.getBoundingClientRect().width < 44)) return fail('project icon controls слишком узкие');
      if (projectIconButtons.some(control => parseFloat(getComputedStyle(control).fontSize) < 18)) return fail('glyph в project control слишком маленький');

      document.querySelector('[data-tab="notes"]')?.click();
      const note = await waitFor(() => document.querySelector('.workspace-note-card'), 'карточка заметки');
      const noteAction = note.querySelector('.workspace-icon-button');
      const noteHandle = note.querySelector('[data-drag-handle]');
      if (!noteAction || !noteHandle) return fail('note controls не отрисованы');
      if (noteAction.getBoundingClientRect().width < 44 || noteAction.getBoundingClientRect().height < 44) return fail('note action слишком маленький');
      if (noteHandle.getBoundingClientRect().width < 44 || noteHandle.getBoundingClientRect().height < 44) return fail('note drag handle слишком маленький');

      pass();
    } catch (error) {
      fail(error?.message || String(error));
    }
  });
})();
