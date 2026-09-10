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
  const saturday = new Date(monday);
  saturday.setDate(saturday.getDate() + 5);
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
      const days = [...document.querySelectorAll('.priority-day')];
      if (!document.querySelector('.priority-board') || days.length !== 7) return finish('FAIL: недельная доска должна показывать семь дней');
      for (const day of days) {
        const button = day.querySelector('.priority-zone--main .priority-add');
        const rect = button.getBoundingClientRect();
        if (Math.abs(rect.width - rect.height) > 1) return finish('FAIL: кнопка добавления должна быть квадратной');
        for (const pseudo of ['::before', '::after']) {
          const stroke = getComputedStyle(button, pseudo);
          if (stroke.position !== 'absolute' || !['""', "''"].includes(stroke.content)) return finish('FAIL: плюс зависит от текстовой строки');
          if (Math.abs(parseFloat(stroke.left) - button.clientWidth / 2) > 1 || Math.abs(parseFloat(stroke.top) - button.clientHeight / 2) > 1) return finish('FAIL: плюс смещён относительно центра кнопки');
        }
        if (innerWidth < 900 && (rect.width < 44 || rect.height < 44)) return finish('FAIL: область нажатия слишком мала');
      }
      const today = document.querySelector('.priority-day.is-today[aria-current="date"]');
      if (!today || today.dataset.priorityDate !== key(new Date())) return finish('FAIL: текущий день не отмечен в текущей неделе');
      const currentWeekButton = document.querySelector('[data-priority-week="today"]');
      if (currentWeekButton?.getAttribute('aria-pressed') !== 'true') return finish('FAIL: текущая неделя не отмечена активной');
      if (document.querySelectorAll('.priority-card').length !== 3) return finish('FAIL: не показаны обычные и проектные задачи');
      if (document.querySelector('[data-priority-remove]')) return finish('FAIL: кнопка «Убрать» осталась на карточке приоритета');
      if (document.querySelectorAll('[data-priority-drag]').length !== 3) return finish('FAIL: drag-handle отсутствует у части карточек');
      const title = [...document.querySelectorAll('.priority-card__main strong')].find(node => node.textContent === longTitle);
      if (!title) return finish('FAIL: длинное название отсутствует');
      const titleStyle = getComputedStyle(title);
      if (titleStyle.whiteSpace === 'nowrap' || titleStyle.textOverflow === 'ellipsis' || title.scrollHeight > title.clientHeight + 1) return finish('FAIL: текст приоритета обрезается');

      document.querySelector('[data-priority-week="next"]')?.click();
      await wait(80);
      if (document.querySelector('.priority-day.is-today')) return finish('FAIL: текущий день ошибочно отмечен на следующей неделе');
      if (document.querySelector('[data-priority-week="today"]')?.getAttribute('aria-pressed') !== 'false') return finish('FAIL: следующая неделя ошибочно отмечена текущей');
      document.querySelector('[data-tab="tasks"]')?.click();
      await wait(80);
      document.querySelector('[data-tab="priorities"]')?.click();
      await wait(100);
      if (!document.querySelector(`.priority-day.is-today[data-priority-date="${key(new Date())}"]`)) return finish('FAIL: при повторном входе не открылась текущая неделя');

      const addButton = document.querySelector(`[data-priority-add="main"][data-priority-date="${key(saturday)}"]`);
      if (!addButton) return finish('FAIL: суббота отсутствует или в ней нельзя добавить задачу');
      addButton.click();
      await wait(50);
      if (!document.querySelector('#prioritySheet.show')) return finish('FAIL: форма новой задачи на выходной не открылась');
      form.elements.title.value = 'Задача на субботу';
      form.elements.extra.value = 'Проверить поддержку всех семи дней недели';
      form.elements.priorityLevel.value = 'other';
      form.requestSubmit();
      await wait(100);
      tasks = JSON.parse(localStorage.getItem('lawyerTasks') || '[]');
      const created = tasks.find(task => task.title === 'Задача на субботу');
      if (!created || created.priorityDate !== key(saturday) || created.priorityLevel !== 'other' || created.status !== 'new') return finish('FAIL: задача на выходной сохранена неверно');
      if (!document.querySelector(`[data-priority-card="${created.id}"]`)) return finish('FAIL: задача на выходной не появилась на доске');
      document.querySelector('[data-tab="tasks"]')?.click();
      await wait(100);
      if (!document.querySelector(`[data-task-row="${created.id}"]`) && !document.body.textContent.includes('Задача на субботу')) return finish('FAIL: задача на выходной не появилась во вкладке задач');
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
