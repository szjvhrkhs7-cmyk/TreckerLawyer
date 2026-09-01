(() => {
  'use strict';

  const pad = value => String(value).padStart(2, '0');
  const key = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const timestamp = new Date().toISOString();

  localStorage.setItem('lawyerTasks', JSON.stringify([
    { id: 'ci-workspace-overdue', title: 'Просроченная задача', status: 'inwork', priority: 'high', dueDate: key(yesterday), createdAt: timestamp, updatedAt: timestamp },
    { id: 'ci-workspace-today', title: 'Задача на сегодня', status: 'inwork', priority: 'normal', dueDate: key(today), createdAt: timestamp, updatedAt: timestamp },
    { id: 'ci-workspace-waiting', title: 'Ожидаем ответ', status: 'waiting', priority: 'low', dueDate: key(tomorrow), createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerProjects', JSON.stringify([
    { id: 'ci-workspace-project', title: 'Редизайн проекта', description: 'Проверка карточки проекта', createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerProjectTasks', JSON.stringify([
    { id: 'ci-workspace-project-task', projectId: 'ci-workspace-project', title: 'Задача проекта', status: 'inwork', priority: 'normal', createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerNotes', JSON.stringify([
    { id: 'ci-workspace-note', title: 'Рабочая заметка', body: 'Текст заметки для проверки интерфейса', createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerCalendarEvents', JSON.stringify([
    { id: 'ci-workspace-event', title: 'Проектный комитет', date: key(today), startTime: '14:30', endTime: '15:30', color: 'blue', reminder: 15, createdAt: timestamp, updatedAt: timestamp }
  ]));

  function finish(message) {
    const node = document.createElement('div');
    node.id = 'workspace-test-result';
    node.textContent = message;
    document.body.append(node);
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  window.addEventListener('load', async () => {
    await wait(900);
    try {
      if (!document.querySelector('.today-dashboard')) return finish('FAIL: стартовый экран Сегодня не отрисован');
      if (!document.body.textContent.includes('Требуют внимания')) return finish('FAIL: отсутствует фокусный блок');
      if (!document.body.textContent.includes('Проектный комитет')) return finish('FAIL: событие дня не показано');

      document.querySelector('[data-tab="tasks"]')?.click();
      await wait(100);
      if (!document.querySelector('.workspace-tasks-page')) return finish('FAIL: новый экран задач не открылся');
      if (document.querySelectorAll('.workspace-task-row').length < 3) return finish('FAIL: задачи не отображаются новым списком');
      if (document.querySelectorAll('.workspace-summary-item').length !== 3) return finish('FAIL: сводка задач не отображается');

      document.querySelector('[data-edit-task="ci-workspace-overdue"]')?.click();
      await wait(50);
      if (!document.querySelector('#taskSheet.show .task-detail')) return finish('FAIL: детали задачи не открылись');
      document.querySelector('[data-task-detail-done]')?.click();
      await wait(100);
      const storedTasks = JSON.parse(localStorage.getItem('lawyerTasks') || '[]');
      if (storedTasks.find(task => task.id === 'ci-workspace-overdue')?.status !== 'done') return finish('FAIL: завершение из деталей задачи не сохранилось');

      document.querySelector('[data-tab="projects"]')?.click();
      await wait(100);
      if (!document.querySelector('.workspace-projects-page .workspace-project-card')) return finish('FAIL: новый экран проектов не отрисован');

      document.querySelector('[data-tab="notes"]')?.click();
      await wait(100);
      if (!document.querySelector('.workspace-notes-page .workspace-note-card')) return finish('FAIL: новый экран заметок не отрисован');

      document.querySelector('[data-tab="calendar"]')?.click();
      await wait(100);
      if (!document.querySelector('.calendar-view .calendar-month')) return finish('FAIL: календарь не открылся после редизайна');

      finish('WORKSPACE_PASS');
    } catch (error) {
      finish(`FAIL: ${error?.message || String(error)}`);
    }
  });
})();