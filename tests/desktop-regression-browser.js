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

  localStorage.setItem('lawyerTasks', JSON.stringify([
    { id: 'desktop-overdue', title: 'Проверить договор эквайринга', status: 'inwork', priority: 'high', dueDate: key(yesterday), extra: 'Сверить ответственность и порядок возврата оборудования', createdAt: timestamp, updatedAt: timestamp },
    { id: 'desktop-today', title: 'Согласовать условия нового вклада', status: 'inwork', priority: 'normal', dueDate: key(today), createdAt: timestamp, updatedAt: timestamp },
    { id: 'desktop-waiting', title: 'Дождаться ответа продуктовой команды', status: 'waiting', priority: 'low', dueDate: key(tomorrow), createdAt: timestamp, updatedAt: timestamp },
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
    { id: 'desktop-note-1', title: 'Позиция по рекламе', body: 'Короткая рабочая заметка для визуальной проверки desktop-карточки.', createdAt: timestamp, updatedAt: timestamp },
    { id: 'desktop-note-2', title: 'Вопросы к бизнесу', body: 'Уточнить сценарий клиента, сроки и каналы уведомления.', createdAt: timestamp, updatedAt: timestamp }
  ]));
  localStorage.setItem('lawyerCalendarEvents', JSON.stringify([
    { id: 'desktop-event-1', title: 'Проектный комитет', date: key(today), startTime: '14:30', endTime: '15:30', color: 'blue', reminder: 15, createdAt: timestamp, updatedAt: timestamp },
    { id: 'desktop-event-2', title: 'Встреча с продуктом', date: key(tomorrow), startTime: '11:00', endTime: '11:45', color: 'red', reminder: 15, createdAt: timestamp, updatedAt: timestamp }
  ]));

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fail = message => {
    const node = document.createElement('div');
    node.id = 'desktop-regression-result';
    node.textContent = `FAIL: ${message}`;
    document.body.append(node);
  };
  const pass = () => {
    const node = document.createElement('div');
    node.id = 'desktop-regression-result';
    node.textContent = 'DESKTOP_REGRESSION_PASS';
    document.body.append(node);
  };
  const rect = selector => document.querySelector(selector)?.getBoundingClientRect();

  window.addEventListener('load', async () => {
    await wait(1200);
    try {
      if (window.innerWidth < 1200) return fail(`viewport слишком узкий: ${window.innerWidth}`);

      const app = document.querySelector('.app');
      const sidebar = document.querySelector('.top');
      const page = document.querySelector('.page');
      const brandbar = document.querySelector('.brandbar');
      const brandmark = document.querySelector('.brandmark');
      const brandIcon = brandmark?.querySelector('.icon');
      if (!app || !sidebar || !page || !brandbar || !brandmark || !brandIcon) return fail('не найдена базовая desktop-компоновка');

      const appRect = app.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      if (appRect.left < -1 || appRect.right > window.innerWidth + 1) return fail('контейнер приложения выходит за viewport');
      if (appRect.width < 1100) return fail(`desktop-контейнер слишком узкий: ${appRect.width}`);
      if (sidebarRect.width < 220 || sidebarRect.width > 280) return fail(`неверная ширина sidebar: ${sidebarRect.width}`);
      if (pageRect.width < 760) return fail(`рабочая область слишком узкая: ${pageRect.width}`);
      if (document.documentElement.scrollWidth > window.innerWidth + 2) return fail('есть горизонтальный overflow страницы');

      const brandStyle = getComputedStyle(brandmark);
      if (!brandStyle.backgroundImage.includes('linear-gradient')) return fail('логомарка не использует цветной градиент');
      if (Number.parseFloat(getComputedStyle(brandIcon).opacity) < .9) return fail('иконка внутри логомарки скрыта');
      const brandItems = [...brandbar.children].map(node => node.getBoundingClientRect());
      const centerYs = brandItems.map(item => item.top + item.height / 2);
      if (Math.max(...centerYs) - Math.min(...centerYs) > 6) return fail('элементы brandbar не выровнены в одну строку');
      for (let index = 1; index < brandItems.length; index += 1) {
        if (brandItems[index - 1].right > brandItems[index].left + 1) return fail('элементы brandbar перекрываются');
      }

      const tabs = [...document.querySelectorAll('#tabs .tab')];
      if (tabs.length !== 5) return fail('desktop-навигация должна содержать 5 разделов');
      const tabRects = tabs.map(tab => tab.getBoundingClientRect());
      if (tabRects.some(item => item.width < 190 || item.height < 42)) return fail('desktop-навигация имеет слишком маленькие hit-area');
      if (tabRects[1].top <= tabRects[0].top) return fail('desktop-навигация не вертикальная');

      const todayGrid = document.querySelector('.today-grid');
      const mainColumn = document.querySelector('.today-main-column');
      const sideColumn = document.querySelector('.today-side-column');
      if (!todayGrid || !mainColumn || !sideColumn) return fail('экран Сегодня не отрисован');
      const mainRect = mainColumn.getBoundingClientRect();
      const sideRect = sideColumn.getBoundingClientRect();
      if (sideRect.left <= mainRect.left || sideRect.left < mainRect.right - 4) return fail('desktop-колонки Сегодня налезают друг на друга');
      if (mainRect.width < 430 || sideRect.width < 290) return fail('колонки Сегодня имеют неудачную ширину');

      document.querySelector('[data-tab="tasks"]')?.click();
      await wait(180);
      const taskPage = document.querySelector('.workspace-tasks-page');
      const taskRow = document.querySelector('.workspace-task-row:not(.is-done)');
      const taskSearch = document.getElementById('taskSearch');
      if (!taskPage || !taskRow || !taskSearch) return fail('экран задач не работает');
      if (!document.querySelector('[data-tab="tasks"]')?.classList.contains('active')) return fail('активная вкладка задач не обновилась');
      if (taskRow.getBoundingClientRect().width < 700) return fail('desktop-строка задачи слишком узкая');
      const mainTaskRect = taskRow.querySelector('.workspace-task-main')?.getBoundingClientRect();
      const statusRect = taskRow.querySelector('.workspace-status')?.getBoundingClientRect();
      const actionsRect = taskRow.querySelector('.workspace-row-actions')?.getBoundingClientRect();
      if (!mainTaskRect || !statusRect || !actionsRect) return fail('неполная структура строки задачи');
      if (mainTaskRect.right > statusRect.left + 2) return fail('текст задачи перекрывает статус');
      if (actionsRect.right > taskRow.getBoundingClientRect().right + 1) return fail('действия задачи выходят за карточку');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await wait(30);
      if (document.activeElement !== taskSearch) return fail('Ctrl/Cmd+K не переводит фокус в поиск');

      document.querySelector('[data-edit-task="desktop-overdue"]')?.click();
      await wait(80);
      const taskSheet = document.querySelector('#taskSheet.show .sheet');
      if (!taskSheet) return fail('детали задачи не открываются');
      const sheetRect = taskSheet.getBoundingClientRect();
      if (sheetRect.width < 420 || sheetRect.width > 560) return fail(`неудачная ширина desktop drawer: ${sheetRect.width}`);
      if (sheetRect.left < window.innerWidth / 2) return fail('desktop drawer не расположен справа');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(60);
      if (document.getElementById('taskSheet')?.classList.contains('show')) return fail('Escape не закрывает детали задачи');

      const firstTab = document.querySelector('[data-tab="tasks"]');
      firstTab?.focus();
      firstTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await wait(100);
      if (!document.querySelector('[data-tab="projects"]')?.classList.contains('active')) return fail('ArrowDown не переключает desktop-вкладки');
      if (document.querySelectorAll('.workspace-project-card').length < 2) return fail('проекты не отображаются desktop-сеткой');

      document.querySelector('[data-tab="notes"]')?.click();
      await wait(100);
      const notes = [...document.querySelectorAll('.workspace-note-card')];
      if (notes.length < 2) return fail('заметки не отображаются');
      const noteRows = notes.map(note => note.getBoundingClientRect().top);
      if (Math.abs(noteRows[0] - noteRows[1]) > 3) return fail('desktop-заметки не образуют двухколоночную сетку');

      document.querySelector('[data-tab="calendar"]')?.click();
      await wait(100);
      if (!document.querySelector('.calendar-view .calendar-month')) return fail('календарь не открывается');
      if (document.querySelector('.calendar-month')?.getBoundingClientRect().width < 700) return fail('desktop-календарь слишком узкий');

      const themeButton = document.getElementById('themeToggle');
      themeButton?.click();
      await wait(60);
      if (document.documentElement.dataset.theme !== 'dark') return fail('переключение темы не работает');
      if (!getComputedStyle(brandmark).backgroundImage.includes('linear-gradient')) return fail('логомарка ломается в тёмной теме');
      if (document.documentElement.scrollWidth > window.innerWidth + 2) return fail('тёмная тема создаёт горизонтальный overflow');

      pass();
    } catch (error) {
      fail(error?.message || String(error));
    }
  });
})();