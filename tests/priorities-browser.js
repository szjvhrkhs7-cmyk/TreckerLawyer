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
    { id: 'priority-remove', projectId: 'priority-project', title: 'Согласовать протокол разногласий', status: 'inwork', priority: 'normal', priorityDate: key(tuesday), priorityLevel: 'other', createdAt: timestamp, updatedAt: timestamp }
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
      const title = [...document.querySelectorAll('.priority-card__main strong')].find(node => node.textContent === longTitle);
      if (!title) return finish('FAIL: длинное название отсутствует');
      const titleStyle = getComputedStyle(title);
      if (titleStyle.whiteSpace === 'nowrap' || titleStyle.textOverflow === 'ellipsis' || title.scrollHeight > title.clientHeight + 1) return finish('FAIL: текст приоритета обрезается');

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

      document.querySelector('[data-priority-remove="priority-remove"]')?.click();
      await wait(80);
      const projectTasks = JSON.parse(localStorage.getItem('lawyerProjectTasks') || '[]');
      const removed = projectTasks.find(task => task.id === 'priority-remove');
      if (!removed || removed.priorityDate) return finish('FAIL: задача не убрана из приоритетов или удалена целиком');

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

