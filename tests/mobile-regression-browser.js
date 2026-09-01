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
