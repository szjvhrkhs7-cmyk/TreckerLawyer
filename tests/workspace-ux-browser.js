(() => {
  'use strict';
  const stamp = new Date().toISOString();
  const dateKey = offset => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  };
  const record = (id, status, dueDate = '') => ({ id, title: `Задача ${id}`, status, dueDate, priority: 'normal', createdAt: stamp, updatedAt: stamp });
  localStorage.setItem('lawyerTasks', JSON.stringify([
    { ...record('ux-overdue', 'inwork', dateKey(-1)), extra: 'Сверить условия договора', notes: '<b>Уточнить позицию</b>' },
    record('ux-today', 'new', dateKey(0)),
    record('ux-tomorrow', 'waiting', dateKey(1)),
    record('ux-unscheduled', 'new'),
    { ...record('ux-done', 'done', dateKey(-1)), completedAt: stamp }
  ]));
  localStorage.setItem('lawyerProjects', JSON.stringify([{ id: 'ux-project', title: 'Проверка проекта', createdAt: stamp }]));
  localStorage.setItem('lawyerProjectTasks', JSON.stringify([{ ...record('ux-project-task', 'inwork', dateKey(-1)), projectId: 'ux-project' }]));
  const manual = ['ux-tomorrow', 'ux-unscheduled', 'ux-today', 'ux-overdue'];
  localStorage.setItem('lawyerTaskOrder', JSON.stringify(manual));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(predicate) {
    for (let tries = 0; tries < 100; tries++) {
      if (predicate()) return;
      await wait(50);
    }
    throw new Error('Интерфейс не обновился вовремя');
  }
  function assert(value, message) { if (!value) throw new Error(message); }
  const ids = () => [...document.querySelectorAll('#activeTasks [data-sort-id]')].map(row => row.dataset.sortId);
  const stored = (key, id) => JSON.parse(localStorage.getItem(key) || '[]').find(task => task.id === id);
  const sort = value => { const control = document.getElementById('taskSort'); control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); };
  const clickFilter = value => document.querySelector(`.filters [data-filter="${value}"]`).click();
  async function undo() {
    await waitFor(() => document.querySelector('#workspaceToast.show button'));
    assert(getComputedStyle(document.getElementById('workspaceToast')).pointerEvents !== 'none', 'Кнопка отмены не принимает нажатия');
    document.querySelector('#workspaceToast.show button').click();
  }
  window.addEventListener('load', async () => {
    let message = 'WORKSPACE_UX_PASS';
    try {
      await waitFor(() => document.querySelector('[data-done-task="ux-overdue"]')?.classList.contains('workspace-complete-action'));
      assert(JSON.stringify(ids()) === JSON.stringify(manual), 'Не сохранен ручной порядок');
      document.querySelector('.workspace-summary-item[data-filter="overdue"] strong').click();
      assert(ids().join() === 'ux-overdue', 'Счетчик просрочки не фильтрует задачи или включает завершенные');
      assert(document.querySelector('.workspace-summary-item[data-filter="overdue"]').getAttribute('aria-pressed') === 'true', 'Сводка не отражает выбранный фильтр');
      clickFilter('today');
      assert(ids().join() === 'ux-today', 'Сегодня включает другие дни');
      clickFilter('active');
      sort('due');
      assert(ids().join() === 'ux-overdue,ux-today,ux-tomorrow,ux-unscheduled', 'Сортировка по сроку работает неправильно');
      assert([...document.querySelectorAll('#activeTasks [data-drag-handle]')].every(handle => handle.disabled), 'Перетаскивание доступно в автоматической сортировке');
      sort('urgency');
      assert(ids()[0] === 'ux-overdue', 'Просрочка не первая в сортировке по срочности');
      sort('manual');
      assert(JSON.stringify(ids()) === JSON.stringify(manual), 'Сортировка изменила ручной порядок');
      assert(localStorage.getItem('lawyerTaskOrder') === JSON.stringify(manual), 'Сортировка переписала сохраненный порядок');

      const search = document.getElementById('taskSearch');
      search.value = 'нет такой задачи';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      assert(document.querySelector('.workspace-empty [data-reset-task-filters]'), 'В пустом поиске нет сброса');
      document.querySelector('.workspace-empty [data-reset-task-filters]').click();
      assert(ids().length === 4 && document.getElementById('taskSearch').value === '', 'Сброс не вернул активные задачи');

      document.querySelector('[data-done-task="ux-overdue"]').click();
      await undo();
      assert(stored('lawyerTasks', 'ux-overdue').status === 'inwork', 'Отмена не вернула предыдущий статус');
      assert(!stored('lawyerTasks', 'ux-overdue').completedAt, 'Отмена оставила дату выполнения');
      document.querySelector('[data-edit-task="ux-overdue"]').click();
      document.querySelector('[data-task-detail-done]').click();
      await undo();
      assert(stored('lawyerTasks', 'ux-overdue').status === 'inwork', 'Не работает отмена выполнения из деталей');

      document.querySelector('[data-done-task="ux-today"]').click();
      await waitFor(() => document.querySelector('#workspaceToast.show button'));
      const records = JSON.parse(localStorage.getItem('lawyerTasks'));
      const changed = records.find(task => task.id === 'ux-today');
      changed.updatedAt = '2099-01-01T00:00:00.000Z';
      changed.extra = 'Более позднее изменение';
      localStorage.setItem('lawyerTasks', JSON.stringify(records));
      document.querySelector('#workspaceToast.show button').click();
      assert(stored('lawyerTasks', 'ux-today').status === 'done' && stored('lawyerTasks', 'ux-today').extra === 'Более позднее изменение', 'Отмена затерла более позднее изменение');

      document.querySelector('[data-tab="projects"]').click();
      document.querySelector('[data-open-project="ux-project"]').click();
      document.querySelector('[data-done-task="ux-project-task"]').click();
      await undo();
      assert(stored('lawyerProjectTasks', 'ux-project-task').status === 'inwork', 'Отмена задачи проекта записала данные в другой раздел');
      assert(stored('lawyerTasks', 'ux-today').status === 'done', 'Отмена задачи проекта изменила обычные задачи');
      document.querySelector('[data-workspace-new-task]').click();
      const title = document.querySelector('#taskForm [name="title"]');
      assert(title.labels.length === 1, 'Поле названия не связано с подписью');
      assert(document.querySelector('#taskForm [name="dueDate"]').labels.length === 1, 'Поле срока не связано с подписью');
      document.getElementById('cancelTask').click();
      assert(!document.getElementById('taskSheet').classList.contains('show'), 'Форма не закрылась');
      assert(document.documentElement.scrollWidth <= innerWidth + 1, 'Горизонтальное переполнение страницы');
      if (innerWidth < 900) {
        for (const row of document.querySelectorAll('.workspace-task-row')) {
          const bounds = row.getBoundingClientRect();
          for (const button of row.querySelectorAll('.workspace-row-actions .btn')) {
            const rect = button.getBoundingClientRect();
            assert(rect.height >= 44 && rect.left >= bounds.left && rect.right <= bounds.right, 'Действие на телефоне слишком маленькое или выходит за карточку');
          }
        }
      }
    } catch (error) { message = `FAIL: ${error.message}`; }
    const result = document.createElement('p');
    result.id = 'workspace-ux-result';
    result.textContent = message;
    document.body.append(result);
  });
})();
