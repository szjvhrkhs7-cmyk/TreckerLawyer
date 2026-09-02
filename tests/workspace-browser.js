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
  const fullExtra = 'Сверить договор, проверить ответственность сторон и подготовить итоговые рекомендации без сокращения текста.';
  const fullNotes = 'Созвон с продуктом во вторник. Отдельно проверить порядок уведомления клиента и форму согласия.';

  localStorage.setItem('lawyerTasks', JSON.stringify([
    { id: 'ci-workspace-overdue', title: 'Просроченная задача с длинным названием, которое должно отображаться полностью без обрезки', status: 'inwork', priority: 'high', dueDate: key(yesterday), extra: fullExtra, notes: fullNotes, createdAt: timestamp, updatedAt: timestamp },
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
    await wait(1100);
    try {
      if (document.querySelector('[data-tab="today"]')) return finish('FAIL: раздел Сегодня остался в навигации');
      if (!document.querySelector('[data-tab="tasks"]')?.classList.contains('active')) return finish('FAIL: задачи не являются главным экраном');
      if (!document.querySelector('.workspace-tasks-page')) return finish('FAIL: экран задач не открылся по умолчанию');
      if (document.querySelectorAll('#tabs .tab').length !== 5) return finish('FAIL: в навигации нет пяти разделов с приоритетами');
      if (!document.querySelector('[data-tab="priorities"]')) return finish('FAIL: вкладка приоритетов отсутствует');
      if (document.querySelectorAll('.workspace-task-row').length < 3) return finish('FAIL: задачи не отображаются новым списком');
      if (document.querySelectorAll('.workspace-summary-item').length !== 3) return finish('FAIL: сводка задач не отображается');

      const detailedRow = document.querySelector('[data-sort-id="ci-workspace-overdue"]');
      const extra = detailedRow?.querySelector('.workspace-task-detail-block--extra .workspace-task-detail-text');
      const notes = detailedRow?.querySelector('.workspace-task-detail-block--notes .workspace-task-detail-text');
      const title = detailedRow?.querySelector('.workspace-task-main strong');
      if (extra?.textContent !== fullExtra) return finish('FAIL: поле «Что требуется» не показано полностью в карточке');
      if (notes?.textContent !== fullNotes) return finish('FAIL: заметки не показаны полностью в карточке');
      if (!title || getComputedStyle(title).whiteSpace === 'nowrap' || getComputedStyle(title).textOverflow === 'ellipsis') return finish('FAIL: название задачи всё ещё обрезается');
      if (getComputedStyle(extra).whiteSpace !== 'pre-wrap') return finish('FAIL: подробный текст не настроен на полный перенос строк');

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
