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

  localStorage.setItem('theme', 'light');
  localStorage.setItem('lawyerTasks', JSON.stringify([
    { id: 'preview-1', title: 'Проверить договор эквайринга', status: 'inwork', priority: 'high', dueDate: key(yesterday), extra: 'Сверить ответственность и возврат оборудования', createdAt: timestamp, updatedAt: timestamp },
    { id: 'preview-2', title: 'Согласовать условия нового вклада', status: 'inwork', priority: 'normal', dueDate: key(today), createdAt: timestamp, updatedAt: timestamp },
    { id: 'preview-3', title: 'Дождаться ответа продуктовой команды', status: 'waiting', priority: 'low', dueDate: key(tomorrow), createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerProjects', JSON.stringify([
    { id: 'preview-project-1', title: 'Цифровой рубль', description: 'Правовая поддержка запуска', createdAt: timestamp, updatedAt: timestamp },
    { id: 'preview-project-2', title: 'Социальный вклад', description: 'Продуктовая документация', createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerProjectTasks', JSON.stringify([
    { id: 'preview-project-task-1', projectId: 'preview-project-1', title: 'Проверить оферту', status: 'inwork', priority: 'normal', createdAt: timestamp, updatedAt: timestamp },
    { id: 'preview-project-task-2', projectId: 'preview-project-2', title: 'Согласовать форму заявления', status: 'done', priority: 'normal', completedAt: timestamp, createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerNotes', JSON.stringify([
    { id: 'preview-note-1', title: 'Позиция по рекламе', body: 'Рабочая заметка', createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerCalendarEvents', JSON.stringify([
    { id: 'preview-event-1', title: 'Проектный комитет', date: key(today), startTime: '14:30', endTime: '15:30', color: 'blue', reminder: 15, createdAt: timestamp, updatedAt: timestamp },
    { id: 'preview-event-2', title: 'Встреча с продуктом', date: key(tomorrow), startTime: '11:00', endTime: '11:45', color: 'red', reminder: 15, createdAt: timestamp, updatedAt: timestamp }
  ]));
})();