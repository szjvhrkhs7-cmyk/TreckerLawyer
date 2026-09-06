(() => {
  'use strict';

  const pad = value => String(value).padStart(2, '0');
  const dateKey = value => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const startOfWeek = value => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    return date;
  };
  const addDays = (value, amount) => {
    const date = new Date(value);
    date.setDate(date.getDate() + amount);
    return date;
  };

  const now = new Date();
  const week = startOfWeek(now);
  const stamp = now.toISOString();

  localStorage.setItem('lawyerTasks', JSON.stringify([
    {
      id: 'visual-task-1',
      title: 'Напомнить Стасу про ДКБО и проверить финальную редакцию документов',
      extra: 'Сверить изменения, подготовить короткий комментарий для продуктовой команды.',
      notes: 'Отдельно проверить спорные формулировки по ответственности.',
      status: 'inwork',
      priority: 'high',
      dueDate: dateKey(now),
      priorityDate: dateKey(now),
      priorityLevel: 'main',
      createdAt: stamp,
      updatedAt: stamp
    },
    {
      id: 'visual-task-2',
      title: 'Согласовать условия нового вклада',
      status: 'new',
      priority: 'medium',
      dueDate: dateKey(addDays(now, 1)),
      priorityDate: dateKey(addDays(week, 1)),
      priorityLevel: 'other',
      createdAt: stamp,
      updatedAt: stamp
    },
    {
      id: 'visual-task-3',
      title: 'Подготовить правовую позицию по запросу нотариуса',
      status: 'waiting',
      priority: 'normal',
      dueDate: dateKey(addDays(now, 2)),
      priorityDate: dateKey(addDays(week, 4)),
      priorityLevel: 'main',
      createdAt: stamp,
      updatedAt: stamp
    }
  ]));

  localStorage.setItem('lawyerProjects', JSON.stringify([
    { id: 'visual-project-1', title: 'Новый карточный продукт', description: 'Правовая поддержка запуска продукта и клиентской документации', createdAt: stamp, updatedAt: stamp },
    { id: 'visual-project-2', title: 'Социальный вклад', description: 'Актуализация условий и форм документов', createdAt: stamp, updatedAt: stamp }
  ]));

  localStorage.setItem('lawyerProjectTasks', JSON.stringify([
    { id: 'visual-project-task-1', projectId: 'visual-project-1', title: 'Проверить оферту', status: 'inwork', priority: 'normal', createdAt: stamp, updatedAt: stamp }
  ]));

  localStorage.setItem('lawyerNotes', JSON.stringify([
    { id: 'visual-note-1', title: 'Позиция по рекламе', body: 'Короткая рабочая заметка для визуальной проверки карточки.', createdAt: stamp, updatedAt: stamp },
    { id: 'visual-note-2', title: 'Вопросы к бизнесу', body: 'Уточнить сценарий клиента, сроки и каналы уведомления.', createdAt: stamp, updatedAt: stamp }
  ]));

  localStorage.setItem('lawyerCalendarEvents', JSON.stringify([
    { id: 'visual-event-1', title: 'Проектный комитет', date: dateKey(now), startTime: '14:30', endTime: '15:30', color: 'blue', reminder: 15, createdAt: stamp, updatedAt: stamp },
    { id: 'visual-event-2', title: 'Встреча с продуктом', date: dateKey(addDays(now, 1)), startTime: '11:00', endTime: '11:45', color: 'red', reminder: 15, createdAt: stamp, updatedAt: stamp }
  ]));

  function appendDesktopPriorityResult(text) {
    if (document.getElementById('priority-desktop-layout-result')) return;
    const result = document.createElement('div');
    result.id = 'priority-desktop-layout-result';
    result.hidden = true;
    result.textContent = text;
    document.body.append(result);
  }

  function reportDesktopPrioritiesLayout(attempt = 0) {
    if (window.innerWidth < 900) return;
    const board = document.querySelector('.priority-board');
    const days = [...document.querySelectorAll('.priority-day')];

    if ((!board || days.length < 2) && attempt < 20) {
      setTimeout(() => reportDesktopPrioritiesLayout(attempt + 1), 150);
      return;
    }
    if (!board || days.length < 2) {
      appendDesktopPriorityResult('PRIORITY_DESKTOP_VERTICAL_FAIL board-or-days-not-ready');
      return;
    }

    const boardRect = board.getBoundingClientRect();
    const dayRects = days.map(day => day.getBoundingClientRect());
    const stacked = dayRects.every((rect, index) => index === 0 || rect.top >= dayRects[index - 1].bottom + 4);
    const fullWidth = dayRects.every(rect => rect.width >= boardRect.width * .97);
    const noHorizontalOverflow = document.documentElement.scrollWidth <= window.innerWidth + 8;
    const readableMainZones = [...document.querySelectorAll('.priority-zone--main')]
      .every(zone => zone.getBoundingClientRect().width >= 220);

    appendDesktopPriorityResult(
      stacked && fullWidth && noHorizontalOverflow && readableMainZones
        ? 'PRIORITY_DESKTOP_VERTICAL_PASS'
        : `PRIORITY_DESKTOP_VERTICAL_FAIL stacked=${stacked} fullWidth=${fullWidth} overflow=${!noHorizontalOverflow} readable=${readableMainZones}`
    );
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      const view = new URLSearchParams(location.search).get('view') || 'tasks';
      document.querySelector(`[data-tab="${view}"]`)?.click();
      if (view === 'priorities') setTimeout(() => reportDesktopPrioritiesLayout(), 700);
    }, 500);
  });
})();
