(() => {
  'use strict';

  const now = new Date().toISOString();
  localStorage.setItem('lawyerTasks', JSON.stringify([
    { id: 'mobile-done-1', title: 'Завершённая задача', status: 'done', priority: 'normal', completedAt: now, createdAt: now, updatedAt: now },
    { id: 'mobile-new-1', title: 'Новая задача', status: 'new', priority: 'normal', createdAt: now, updatedAt: now }
  ]));
  localStorage.setItem('lawyerProjects', '[]');
  localStorage.setItem('lawyerProjectTasks', '[]');
  localStorage.setItem('lawyerNotes', '[]');
  localStorage.setItem('lawyerCalendarEvents', '[]');

  const fail = message => {
    const node = document.createElement('div');
    node.id = 'mobile-regression-result';
    node.textContent = `FAIL: ${message}`;
    document.body.append(node);
  };

  const pass = () => {
    const node = document.createElement('div');
    node.id = 'mobile-regression-result';
    node.textContent = 'MOBILE_REGRESSION_PASS';
    document.body.append(node);
  };

  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        const viewport = document.querySelector('meta[name="viewport"]')?.content || '';
        if (!viewport.includes('maximum-scale=1') || !viewport.includes('user-scalable=no')) return fail('масштабирование не отключено');

        const tabs = document.getElementById('tabs');
        const top = document.querySelector('.top');
        const firstTabIcon = tabs?.querySelector('.tab .icon');
        const firstCounter = tabs?.querySelector('.tab .count');
        if (!tabs || getComputedStyle(tabs).position !== 'fixed') return fail('мобильная навигация не закреплена снизу');
        if (getComputedStyle(tabs).bottom !== '0px') return fail('мобильная навигация смещена от нижней границы');

        const tabsRect = tabs.getBoundingClientRect();
        if (Math.abs(tabsRect.bottom - window.innerHeight) > 2) return fail(`мобильная навигация не у нижнего края viewport: ${tabsRect.bottom}/${window.innerHeight}`);
        if (tabsRect.top < window.innerHeight * 0.72) return fail(`мобильная навигация ошибочно отрисована сверху: top=${tabsRect.top}`);

        const topStyle = top ? getComputedStyle(top) : null;
        if (topStyle?.backdropFilter && topStyle.backdropFilter !== 'none') return fail('backdrop-filter верхней панели снова создаёт containing block для fixed-навигации');
        if (topStyle?.webkitBackdropFilter && topStyle.webkitBackdropFilter !== 'none') return fail('webkit-backdrop-filter верхней панели снова создаёт containing block для fixed-навигации');

        if (!firstTabIcon || parseFloat(getComputedStyle(firstTabIcon).width) < 22) return fail('иконки навигации слишком маленькие');
        if (getComputedStyle(firstTabIcon).overflow !== 'visible') return fail('иконки навигации могут обрезаться');
        if (firstCounter) {
          const counterRect = firstCounter.getBoundingClientRect();
          if (counterRect.top < tabsRect.top - 1) return fail('счётчик навигации выступает за верхнюю границу панели');
        }

        const verifyCreateForm = (tab, sheetSelector, fieldSelector, value) => {
          document.querySelector(`[data-tab="${tab}"]`)?.click();
          document.getElementById('fab')?.click();
          const overlay = document.querySelector(sheetSelector);
          const sheet = overlay?.querySelector('.sheet');
          const submit = overlay?.querySelector('.sheet-actions .primary');
          const field = overlay?.querySelector(fieldSelector);
          if (!overlay?.classList.contains('show') || !sheet || !submit || !field) return `форма раздела ${tab} не открылась`;

          const overlayZ = Number.parseInt(getComputedStyle(overlay).zIndex, 10) || 0;
          const navZ = Number.parseInt(getComputedStyle(tabs).zIndex, 10) || 0;
          if (overlayZ <= navZ) return `форма раздела ${tab} перекрывается нижней навигацией`;
          if (submit.textContent.trim() !== 'Создать') return `в форме раздела ${tab} нет кнопки «Создать»`;

          const buttonRect = submit.getBoundingClientRect();
          const sheetRect = sheet.getBoundingClientRect();
          if (buttonRect.top < sheetRect.top - 1 || buttonRect.bottom > sheetRect.bottom + 1 || buttonRect.bottom > window.innerHeight) {
            return `кнопка создания в разделе ${tab} находится вне видимой области`;
          }

          field.value = value;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          submit.click();
          if (overlay.classList.contains('show')) return `форма раздела ${tab} не сохранилась`;
          return '';
        };

        const formChecks = [
          verifyCreateForm('tasks', '#taskSheet', '[name="title"]', 'Проверка создания задачи'),
          verifyCreateForm('projects', '#projectSheet', '[name="title"]', 'Проверка создания проекта'),
          verifyCreateForm('notes', '#noteSheet', '[name="title"]', 'Проверка создания заметки'),
          verifyCreateForm('calendar', '#eventSheet', '[name="title"]', 'Проверка создания события')
        ];
        const formFailure = formChecks.find(Boolean);
        if (formFailure) return fail(formFailure);

        document.querySelector('[data-tab="projects"]')?.click();
        document.querySelector('[data-open-project]')?.click();
        if (getComputedStyle(tabs).display !== 'none') return fail('нижняя навигация не скрывается внутри проекта');
        document.getElementById('backBtn')?.click();
        if (getComputedStyle(tabs).display === 'none') return fail('нижняя навигация не вернулась после выхода из проекта');

        document.querySelector('[data-tab="tasks"]')?.click();
        document.getElementById('toggleCompleted')?.click();
        setTimeout(() => {
          try {
            const completedRow = document.querySelector('.workspace-task-row.is-done');
            const restore = document.querySelector('[data-restore-task="mobile-done-1"]');
            if (!completedRow || !restore) return fail('нет кнопки возврата завершённой задачи');
            if (getComputedStyle(restore).display === 'none') return fail('кнопка возврата завершённой задачи скрыта на мобильном');

            const status = completedRow.querySelector('.workspace-status');
            if (!status || parseFloat(getComputedStyle(status).minHeight) < 30) return fail('овал статуса слишком маленький');
            if (getComputedStyle(status).overflow === 'hidden') return fail('текст статуса может обрезаться');

            const grip = document.querySelector('.workspace-task-row:not(.is-done) .drag-grip');
            if (!grip || parseFloat(getComputedStyle(grip).width) < 18 || parseFloat(getComputedStyle(grip).height) < 28) return fail('drag-иконка слишком маленькая или обрезана');

            const input = document.createElement('input');
            input.className = 'search';
            document.body.append(input);
            const inputSize = parseFloat(getComputedStyle(input).fontSize);
            input.remove();
            if (inputSize < 16) return fail(`размер мобильного input меньше 16px: ${inputSize}`);

            restore.click();
            const tasks = JSON.parse(localStorage.getItem('lawyerTasks') || '[]');
            const restored = tasks.find(task => task.id === 'mobile-done-1');
            if (restored?.status !== 'new') return fail('задача не возвращена в статус new');
            if (restored?.completedAt) return fail('completedAt не очищен');

            pass();
          } catch (error) {
            fail(error?.message || String(error));
          }
        }, 180);
      } catch (error) {
        fail(error?.message || String(error));
      }
    }, 250);
  });
})();
