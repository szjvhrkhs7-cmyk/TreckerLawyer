(() => {
  'use strict';

  const pad = value => String(value).padStart(2, '0');
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const timestamp = new Date().toISOString();
  const fullExtra = 'Сверить ответственность, порядок возврата оборудования и ограничения ответственности по договору эквайринга.';
  const fullNotes = 'Проверить редакцию приложения к договору и отдельно отметить спорные условия для продуктовой команды.';

  localStorage.setItem('lawyerTasks', JSON.stringify([
    { id: 'desktop-overdue', title: 'Проверить договор эквайринга и подготовить подробные рекомендации для продуктовой команды', status: 'inwork', priority: 'high', dueDate: dateKey(yesterday), extra: fullExtra, notes: fullNotes, createdAt: timestamp, updatedAt: timestamp },
    { id: 'desktop-today', title: 'Согласовать условия нового вклада', status: 'inwork', priority: 'normal', dueDate: dateKey(today), createdAt: timestamp, updatedAt: timestamp },
    { id: 'desktop-waiting', title: 'Дождаться ответа продуктовой команды', status: 'waiting', priority: 'low', dueDate: dateKey(tomorrow), createdAt: timestamp, updatedAt: timestamp },
    { id: 'desktop-done', title: 'Подготовить правовое заключение', status: 'done', priority: 'normal', completedAt: timestamp, createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerProjects', JSON.stringify([
    { id: 'desktop-project-1', title: 'Цифровой рубль', description: 'Правовая поддержка запуска', createdAt: timestamp, updatedAt: timestamp },
    { id: 'desktop-project-2', title: 'Социальный вклад', description: 'Продуктовая документация', createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerProjectTasks', JSON.stringify([
    { id: 'desktop-project-task-1', projectId: 'desktop-project-1', title: 'Проверить оферту', status: 'inwork', priority: 'normal', createdAt: timestamp, updatedAt: timestamp },
    { id: 'desktop-project-task-2', projectId: 'desktop-project-2', title: 'Согласовать форму заявления', status: 'done', priority: 'normal', completedAt: timestamp, createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerNotes', JSON.stringify([
    { id: 'desktop-note-1', title: 'Позиция по рекламе', body: 'Рабочая заметка для визуальной проверки desktop-карточки.', createdAt: timestamp, updatedAt: timestamp },
    { id: 'desktop-note-2', title: 'Вопросы к бизнесу', body: 'Уточнить сценарий клиента, сроки и каналы уведомления.', createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerCalendarEvents', JSON.stringify([
    { id: 'desktop-event-1', title: 'Проектный комитет', date: dateKey(today), startTime: '14:30', endTime: '15:30', color: 'blue', reminder: 15, createdAt: timestamp, updatedAt: timestamp },
    { id: 'desktop-event-2', title: 'Встреча с продуктом', date: dateKey(tomorrow), startTime: '11:00', endTime: '11:45', color: 'red', reminder: 15, createdAt: timestamp, updatedAt: timestamp }
  ]));

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = message => {
    const node = document.createElement('div');
    node.id = 'desktop-regression-result';
    node.textContent = message;
    document.body.append(node);
  };
  const fail = message => result(`DESKTOP_REGRESSION_PASS FAIL: ${message}`);
  const pass = () => result('DESKTOP_REGRESSION_PASS');

  window.addEventListener('load', async () => {
    document.documentElement.dataset.theme = 'light';
    localStorage.setItem('theme', 'light');
    await wait(1300);

    try {
      if (window.innerWidth < 1200) return fail(`viewport слишком узкий: ${window.innerWidth}`);

      const app = document.querySelector('.app');
      const sidebar = document.querySelector('.top');
      const page = document.querySelector('.page');
      const brandbar = document.querySelector('.brandbar');
      const brandmark = document.querySelector('.brandmark');
      const brandname = document.querySelector('.brandname');
      const syncButton = document.getElementById('syncButton');
      const themeButton = document.getElementById('themeToggle');
      const brandIcon = brandmark?.querySelector('.icon');
      if (!app || !sidebar || !page || !brandbar || !brandmark || !brandname || !syncButton || !themeButton || !brandIcon) return fail('не найдена базовая desktop-компоновка');

      const appRect = app.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      if (appRect.left < -1 || appRect.right > window.innerWidth + 1) return fail('контейнер приложения выходит за viewport');
      if (appRect.width < 1100) return fail(`desktop-контейнер слишком узкий: ${appRect.width}`);
      if (sidebarRect.width < 220 || sidebarRect.width > 280) return fail(`неверная ширина sidebar: ${sidebarRect.width}`);
      if (pageRect.width < 760) return fail(`рабочая область слишком узкая: ${pageRect.width}`);
      if (document.documentElement.scrollWidth > window.innerWidth + 2) return fail(`горизонтальный overflow: ${document.documentElement.scrollWidth}/${window.innerWidth}`);

      if (!getComputedStyle(brandmark).backgroundImage.includes('linear-gradient')) return fail('логомарка не использует цветной градиент');
      if (Number.parseFloat(getComputedStyle(brandIcon).opacity) < .9) return fail('иконка внутри логомарки скрыта');
      const brandRect = brandbar.getBoundingClientRect();
      const markRect = brandmark.getBoundingClientRect();
      const nameRect = brandname.getBoundingClientRect();
      const syncRect = syncButton.getBoundingClientRect();
      const themeRect = themeButton.getBoundingClientRect();
      const identityCenterDelta = Math.abs((markRect.top + markRect.height / 2) - (nameRect.top + nameRect.height / 2));
      const controlsCenterDelta = Math.abs((syncRect.top + syncRect.height / 2) - (themeRect.top + themeRect.height / 2));
      if (brandRect.height < 100) return fail(`brandbar слишком сжат: ${brandRect.height}`);
      if (identityCenterDelta > 7) return fail(`логотип и название не выровнены: ${identityCenterDelta}`);
      if (controlsCenterDelta > 4) return fail(`системные кнопки не выровнены: ${controlsCenterDelta}`);
      if (syncRect.top <= markRect.bottom + 3) return fail('системные кнопки не отделены от бренда второй строкой');
      if (syncRect.width < themeRect.width + 35) return fail(`кнопка синхронизации слишком узкая: ${syncRect.width}/${themeRect.width}`);
      if (syncRect.right > themeRect.left - 5) return fail('кнопки синхронизации и темы перекрываются');
      if (getComputedStyle(syncButton.querySelector('span')).display === 'none') return fail('desktop-статус синхронизации скрыт');
      if (markRect.left < brandRect.left - 1 || themeRect.right > brandRect.right + 1) return fail('элементы brandbar выходят за контейнер');

      const tabs = [...document.querySelectorAll('#tabs .tab')];
      const tabRects = tabs.map(tab => tab.getBoundingClientRect());
      if (tabs.length !== 4) return fail(`ожидалось 4 вкладки, получено ${tabs.length}`);
      if (document.querySelector('[data-tab="today"]')) return fail('раздел Сегодня остался в desktop-навигации');
      if (!document.querySelector('[data-tab="tasks"]')?.classList.contains('active')) return fail('задачи не активны при запуске');
      if (tabRects.some(item => item.width < 190 || item.height < 42)) return fail(`слишком маленькая desktop-вкладка ${Math.min(...tabRects.map(item => item.width))}×${Math.min(...tabRects.map(item => item.height))}`);
      if (tabRects[1].top <= tabRects[0].top) return fail('desktop-навигация не вертикальная');

      const taskRow = document.querySelector('.workspace-task-row:not(.is-done)');
      const taskSearch = document.getElementById('taskSearch');
      if (!document.querySelector('.workspace-tasks-page') || !taskRow || !taskSearch) return fail('экран задач не является главным или не работает');
      if (taskRow.getBoundingClientRect().width < 700) return fail(`desktop-строка задачи слишком узкая: ${taskRow.getBoundingClientRect().width}`);
      const taskMain = taskRow.querySelector('.workspace-task-main')?.getBoundingClientRect();
      const status = taskRow.querySelector('.workspace-status')?.getBoundingClientRect();
      const actions = taskRow.querySelector('.workspace-row-actions')?.getBoundingClientRect();
      if (!taskMain || !status || !actions) return fail('неполная структура строки задачи');
      if (taskMain.right > status.left + 2) return fail(`текст задачи перекрывает статус: ${taskMain.right}/${status.left}`);
      if (actions.right > taskRow.getBoundingClientRect().right + 1) return fail('действия задачи выходят за карточку');

      const detailedRow = document.querySelector('[data-sort-id="desktop-overdue"]');
      const extra = detailedRow?.querySelector('.workspace-task-detail-block--extra .workspace-task-detail-text');
      const notes = detailedRow?.querySelector('.workspace-task-detail-block--notes .workspace-task-detail-text');
      const taskTitle = detailedRow?.querySelector('.workspace-task-main strong');
      if (extra?.textContent !== fullExtra) return fail('поле «Что требуется» не показано полностью');
      if (notes?.textContent !== fullNotes) return fail('заметки задачи не показаны полностью');
      if (!taskTitle || getComputedStyle(taskTitle).whiteSpace === 'nowrap') return fail('длинное название задачи не переносится');
      if (getComputedStyle(extra).whiteSpace !== 'pre-wrap') return fail('подробный текст задачи может обрезаться');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await wait(30);
      if (document.activeElement !== taskSearch) return fail('Ctrl/Cmd+K не переводит фокус в поиск');

      document.querySelector('[data-edit-task="desktop-overdue"]')?.click();
      await wait(80);
      const taskSheet = document.querySelector('#taskSheet.show .sheet');
      if (!taskSheet) return fail('детали задачи не открываются');
      const sheetRect = taskSheet.getBoundingClientRect();
      if (sheetRect.width < 420 || sheetRect.width > 560) return fail(`неудачная ширина drawer: ${sheetRect.width}`);
      if (sheetRect.left < window.innerWidth / 2) return fail(`drawer не справа: ${sheetRect.left}`);
      askConfirm('Проверка вложенного подтверждения', () => {});
      await wait(30);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(30);
      if (document.getElementById('confirmDialog')?.classList.contains('show')) return fail('Escape не закрывает верхнее подтверждение');
      if (!document.getElementById('taskSheet')?.classList.contains('show')) return fail('Escape закрыл форму под подтверждением');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(60);
      if (document.getElementById('taskSheet')?.classList.contains('show')) return fail('Escape не закрывает детали задачи');

      const taskTab = document.querySelector('[data-tab="tasks"]');
      taskTab?.focus();
      taskTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await wait(100);
      if (!document.querySelector('[data-tab="projects"]')?.classList.contains('active')) return fail('ArrowDown не переключает desktop-вкладки');
      if (document.querySelectorAll('.workspace-project-card').length < 2) return fail('проекты не отображаются');

      document.querySelector('[data-tab="notes"]')?.click();
      await wait(100);
      const notesCards = [...document.querySelectorAll('.workspace-note-card')];
      if (notesCards.length < 2) return fail('заметки не отображаются');
      if (Math.abs(notesCards[0].getBoundingClientRect().top - notesCards[1].getBoundingClientRect().top) > 3) return fail('заметки не образуют desktop-сетку');

      document.querySelector('[data-tab="calendar"]')?.click();
      await wait(100);
      const calendar = document.querySelector('.calendar-view .calendar-month');
      if (!calendar) return fail('календарь не открывается');
      if (calendar.getBoundingClientRect().width < 700) return fail(`desktop-календарь слишком узкий: ${calendar.getBoundingClientRect().width}`);

      themeButton?.click();
      await wait(60);
      if (document.documentElement.dataset.theme !== 'dark') return fail(`тёмная тема не включилась: ${document.documentElement.dataset.theme}`);
      if (!getComputedStyle(brandmark).backgroundImage.includes('linear-gradient')) return fail('логомарка ломается в тёмной теме');
      themeButton?.click();

      pass();
    } catch (error) {
      fail(error?.message || String(error));
    }
  });
})();
