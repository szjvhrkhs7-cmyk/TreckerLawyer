(() => {
  'use strict';

  const pad = value => String(value).padStart(2, '0');
  const key = value => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() || 7) + 1);
  const tuesday = new Date(monday);
  tuesday.setDate(tuesday.getDate() + 1);
  const wednesday = new Date(monday);
  wednesday.setDate(wednesday.getDate() + 2);
  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);
  const timestamp = new Date().toISOString();
  const longTitle = 'Подготовить подробное правовое заключение по проекту реструктуризации без сокращения текста';

  localStorage.setItem('lawyerTasks', JSON.stringify([
    { id: 'priority-new', title: longTitle, status: 'inwork', priority: 'high', createdAt: timestamp, updatedAt: timestamp },
    { id: 'priority-done', title: 'Проверить пакет документов', status: 'inwork', priority: 'normal', priorityDate: key(monday), priorityLevel: 'main', createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerProjects', JSON.stringify([
    { id: 'priority-project', title: 'Проект договора', createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerProjectTasks', JSON.stringify([
    { id: 'priority-move', projectId: 'priority-project', title: 'Согласовать протокол разногласий', status: 'inwork', priority: 'normal', priorityDate: key(tuesday), priorityLevel: 'other', createdAt: timestamp, updatedAt: timestamp }
  ]));

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const finish = message => {
    const node = document.createElement('div');
    node.id = 'priorities-test-result';
    node.textContent = message;
    document.body.append(node);
  };

  window.addEventListener('load', async () => {
    await wait(1200);
    try {
      const assign = document.querySelector('[data-set-priority="priority-new"]');
      if (!assign || !/Поставить приоритет/.test(assign.textContent)) return finish('FAIL: кнопка назначения приоритета не найдена в задачах');
      assign.click();
      await wait(50);
      const form = document.getElementById('priorityForm');
      if (!document.querySelector('#prioritySheet.show') || !form) return finish('FAIL: форма приоритета не открылась');
      if (form.querySelector('[data-remove-priority]')) return finish('FAIL: кнопка «Убрать приоритет» осталась в форме');
      form.elements.priorityDate.value = key(wednesday);
      form.elements.priorityLevel.value = 'main';
      form.requestSubmit();
      await wait(100);
      let tasks = JSON.parse(localStorage.getItem('lawyerTasks') || '[]');
      const assigned = tasks.find(task => task.id === 'priority-new');
      if (assigned?.priorityDate !== key(wednesday) || assigned?.priorityLevel !== 'main') return finish('FAIL: назначенный день не сохранился в задаче');

      document.querySelector('[data-tab="priorities"]')?.click();
      await wait(120);
      if (!document.querySelector('.priority-board') || document.querySelectorAll('.priority-day').length !== 5) return finish('FAIL: недельная доска не отрисована');
      if (document.querySelectorAll('.priority-card').length !== 3) return finish('FAIL: не показаны обычные и проектные задачи');
      if (document.querySelector('[data-priority-remove]')) return finish('FAIL: кнопка «Убрать» осталась на карточке приоритета');
      if (document.querySelectorAll('[data-priority-drag]').length !== 3) return finish('FAIL: drag-handle отсутствует у части карточек');
      const title = [...document.querySelectorAll('.priority-card__main strong')].find(node => node.textContent === longTitle);
      if (!title) return finish('FAIL: длинное название отсутствует');
      const titleStyle = getComputedStyle(title);
      if (titleStyle.whiteSpace === 'nowrap' || titleStyle.textOverflow === 'ellipsis' || title.scrollHeight > title.clientHeight + 1) return finish('FAIL: текст приоритета обрезается');

      const dragCard = document.querySelector('[data-priority-card="priority-move"]');
      const dragHandle = dragCard?.querySelector('[data-priority-drag]');
      const targetZone = document.querySelector(`[data-priority-dropzone][data-priority-date="${key(thursday)}"][data-priority-level="main"]`);
      if (!dragCard || !dragHandle || !targetZone) return finish('FAIL: элементы для перетаскивания не найдены');
      const start = dragHandle.getBoundingClientRect();
      const target = targetZone.getBoundingClientRect();
      const pointerId = 77;
      dragHandle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', button: 0, clientX: start.left + 4, clientY: start.top + 4 }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', buttons: 1, clientX: target.left + Math.min(20, target.width / 2), clientY: target.top + 20 }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', button: 0, clientX: target.left + Math.min(20, target.width / 2), clientY: target.top + 20 }));
      await wait(120);
      let projectTasks = JSON.parse(localStorage.getItem('lawyerProjectTasks') || '[]');
      const moved = projectTasks.find(task => task.id === 'priority-move');
      if (!moved || moved.priorityDate !== key(thursday) || moved.priorityLevel !== 'main') return finish('FAIL: перетаскивание не изменило день и зону задачи');

      const addButton = document.querySelector(`[data-priority-add="other"][data-priority-date="${key(thursday)}"]`);
      if (!addButton) return finish('FAIL: кнопка добавления задачи в приоритетах не найдена');
      addButton.click();
      await wait(50);
      if (!document.querySelector('#prioritySheet.show')) return finish('FAIL: форма новой задачи из приоритетов не открылась');
      form.elements.title.value = 'Новая задача прямо из приоритетов';
      form.elements.extra.value = 'Проверить синхронное появление в общем списке';
      form.requestSubmit();
      await wait(100);
      tasks = JSON.parse(localStorage.getItem('lawyerTasks') || '[]');
      const created = tasks.find(task => task.title === 'Новая задача прямо из приоритетов');
      if (!created || created.priorityDate !== key(thursday) || created.priorityLevel !== 'other' || created.status !== 'new') return finish('FAIL: новая задача из приоритетов сохранена неверно');
      if (!document.querySelector(`[data-priority-card="${created.id}"]`)) return finish('FAIL: новая задача не появилась на доске');
      document.querySelector('[data-tab="tasks"]')?.click();
      await wait(100);
      if (!document.querySelector(`[data-task-row="${created.id}"]`) && !document.body.textContent.includes('Новая задача прямо из приоритетов')) return finish('FAIL: новая задача не появилась во вкладке задач');
      document.querySelector('[data-tab="priorities"]')?.click();
      await wait(100);

      document.querySelector('[data-priority-done="priority-done"]')?.click();
      await wait(80);
      tasks = JSON.parse(localStorage.getItem('lawyerTasks') || '[]');
      if (tasks.find(task => task.id === 'priority-done')?.status !== 'done') return finish('FAIL: выполнение не отразилось в исходной задаче');
      if (document.querySelector('[data-priority-card="priority-done"]')) return finish('FAIL: выполненная задача осталась в активных приоритетах');

      document.querySelector('[data-priority-delete="priority-new"]')?.click();
      await wait(40);
      document.getElementById('confirmAccept')?.click();
      await wait(80);
      tasks = JSON.parse(localStorage.getItem('lawyerTasks') || '[]');
      if (tasks.some(task => task.id === 'priority-new')) return finish('FAIL: удаление из приоритетов не удалило исходную задачу');

      finish('PRIORITIES_PASS');
    } catch (error) {
      finish(`FAIL: ${error?.message || String(error)}`);
    }
  });
})();
