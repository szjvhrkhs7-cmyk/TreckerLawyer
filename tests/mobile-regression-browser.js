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
        document.querySelector('[data-tab="tasks"]')?.click();
        document.getElementById('toggleCompleted')?.click();
        setTimeout(() => {
          try {
            const restore = document.querySelector('[data-restore-task="mobile-done-1"]');
            if (!restore) return fail('нет кнопки возврата завершённой задачи');
            restore.click();
            const tasks = JSON.parse(localStorage.getItem('lawyerTasks') || '[]');
            const restored = tasks.find(task => task.id === 'mobile-done-1');
            if (restored?.status !== 'new') return fail('задача не возвращена в статус new');
            if (restored?.completedAt) return fail('completedAt не очищен');

            const viewport = document.querySelector('meta[name="viewport"]')?.content || '';
            if (!viewport.includes('maximum-scale=1') || !viewport.includes('user-scalable=no')) return fail('масштабирование не отключено');

            const input = document.createElement('input');
            input.className = 'search';
            document.body.append(input);
            const inputSize = parseFloat(getComputedStyle(input).fontSize);
            input.remove();
            if (inputSize < 16) return fail(`размер мобильного input меньше 16px: ${inputSize}`);

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
