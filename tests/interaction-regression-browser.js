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
  const finish = message => {
    const node = document.createElement('div');
    node.id = 'interaction-regression-result';
    node.textContent = message;
    document.body.append(node);
  };
  const fail = message => finish(`FAIL: ${message}`);
  const pass = () => finish('INTERACTION_REGRESSION_PASS');

  window.addEventListener('load', async () => {
    try {
      await wait(1400);

      document.querySelector('[data-tab="tasks"]')?.click();
      await wait(220);
      const rows = [...document.querySelectorAll('.workspace-task-row:not(.is-done)')];
      if (rows.length < 2) return fail('недостаточно карточек для drag test');

      const first = rows[0];
      const second = rows[1];
      const draggedId = first.dataset.sortId;
      const otherId = second.dataset.sortId;
      const handle = first.querySelector('[data-drag-handle]');
      if (!handle) return fail('drag handle не найден');
      if (getComputedStyle(handle).touchAction !== 'none') return fail(`drag handle допускает browser pan: ${getComputedStyle(handle).touchAction}`);

      const handleRect = handle.getBoundingClientRect();
      const secondRect = second.getBoundingClientRect();
      const pointerId = 73;
      const startX = handleRect.left + handleRect.width / 2;
      const startY = handleRect.top + handleRect.height / 2;
      const endY = secondRect.bottom - Math.min(14, secondRect.height * .12);

      handle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY
      }));
      await wait(40);

      const floating = document.querySelector('.drag-floating');
      if (!floating) return fail('карточка не отрывается от списка');
      const floatingStyle = getComputedStyle(floating);
      if (floatingStyle.transitionProperty !== 'none' && floatingStyle.transitionDuration !== '0s') {
        return fail(`floating card имеет transform-transition: ${floatingStyle.transitionProperty}/${floatingStyle.transitionDuration}`);
      }
      if (!floatingStyle.transform || floatingStyle.transform === 'none') return fail('floating card не использует compositor transform');

      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        buttons: 1,
        clientX: startX + 8,
        clientY: endY
      }));
      await wait(120);

      const orderDuringDrag = [...document.querySelectorAll('.workspace-task-row:not(.is-done)')].map(row => row.dataset.sortId);
      if (!orderDuringDrag.includes(draggedId)) return fail('dragged card потерялась из списка');
      if (orderDuringDrag[1] !== draggedId) return fail(`точка вставки не переместилась: ${orderDuringDrag.join(',')}`);

      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        button: 0,
        buttons: 0,
        clientX: startX + 8,
        clientY: endY
      }));
      await wait(230);
      if (document.querySelector('.drag-floating')) return fail('floating card остаётся после drop');
      const savedOrder = JSON.parse(localStorage.getItem('lawyerTaskOrder') || '[]').map(String);
      if (savedOrder.indexOf(otherId) < 0 || savedOrder.indexOf(draggedId) < 0 || savedOrder.indexOf(otherId) > savedOrder.indexOf(draggedId)) {
        return fail(`новый порядок не сохранён: ${savedOrder.join(',')}`);
      }

      document.querySelector('[data-tab="projects"]')?.click();
      await wait(180);
      const project = document.querySelector('.workspace-project-card');
      const projectControls = [...(project?.querySelectorAll('.workspace-row-actions button') || [])];
      if (!project || projectControls.length < 4) return fail('project controls не отрисованы');
      for (const control of projectControls) {
        const rect = control.getBoundingClientRect();
        if (rect.height < 44) return fail(`project control ниже 44px: ${rect.height}`);
      }
      const projectIconButtons = projectControls.filter(control => control.classList.contains('workspace-icon-button'));
      if (projectIconButtons.some(control => control.getBoundingClientRect().width < 44)) return fail('project icon controls слишком узкие');
      if (projectIconButtons.some(control => parseFloat(getComputedStyle(control).fontSize) < 18)) return fail('glyph в project control слишком маленький');

      document.querySelector('[data-tab="notes"]')?.click();
      await wait(180);
      const note = document.querySelector('.workspace-note-card');
      const noteAction = note?.querySelector('.workspace-icon-button');
      const noteHandle = note?.querySelector('[data-drag-handle]');
      if (!note || !noteAction || !noteHandle) return fail('note controls не отрисованы');
      if (noteAction.getBoundingClientRect().width < 44 || noteAction.getBoundingClientRect().height < 44) return fail('note action слишком маленький');
      if (noteHandle.getBoundingClientRect().width < 44 || noteHandle.getBoundingClientRect().height < 44) return fail('note drag handle слишком маленький');

      pass();
    } catch (error) {
      fail(error?.message || String(error));
    }
  });
})();
