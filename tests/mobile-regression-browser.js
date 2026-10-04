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
        if (viewport.includes('maximum-scale=1') || viewport.includes('user-scalable=no')) return fail('увеличение страницы на телефоне заблокировано');

        const tabs = document.getElementById('tabs');
        const top = document.querySelector('.top');
        const brandbar = document.querySelector('.brandbar');
        const syncButton = document.getElementById('syncButton');
        const themeButton = document.getElementById('themeToggle');
        const collapseButton = document.getElementById('sidebarCollapse');
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

        if (!brandbar || !syncButton || !themeButton || !collapseButton) return fail('не найдены элементы мобильной шапки');
        if (getComputedStyle(collapseButton).display !== 'none') return fail('desktop-кнопка сворачивания видна на мобильном');
        const brandRect = brandbar.getBoundingClientRect();
        const syncRect = syncButton.getBoundingClientRect();
        const themeRect = themeButton.getBoundingClientRect();
        if (brandRect.left < -1 || brandRect.right > window.innerWidth + 1) return fail('мобильная шапка выходит за viewport');
        if (syncRect.right > window.innerWidth + 1 || themeRect.right > window.innerWidth + 1) return fail('кнопки мобильной шапки выходят за экран');
        if (getComputedStyle(syncButton.querySelector('span')).display !== 'none') return fail('текст синхронизации перегружает мобильную шапку');
        if (brandRect.height > 52) return fail(`мобильная шапка слишком высокая: ${brandRect.height}`);
        if (getComputedStyle(top).backdropFilter && getComputedStyle(top).backdropFilter !== 'none') return fail('верхняя панель снова использует backdrop-filter');

        if (!firstTabIcon || parseFloat(getComputedStyle(firstTabIcon).width) < 22) return fail('иконки навигации слишком маленькие');
        if (getComputedStyle(firstTabIcon).overflow !== 'visible') return fail('иконки навигации могут обрезаться');
        if (firstCounter) {
          const counterRect = firstCounter.getBoundingClientRect();
          if (counterRect.top < tabsRect.top - 1) return fail('счётчик навигации выступает за верхнюю границу панели');
        }

        const summaryLabel = document.querySelector('.workspace-summary-item span');
        if (summaryLabel && getComputedStyle(summaryLabel).whiteSpace === 'nowrap') return fail('подпись мобильной статистики обрезается вместо переноса');
        if (document.documentElement.scrollWidth > window.innerWidth + 1) return fail(`страница имеет горизонтальный overflow: ${document.documentElement.scrollWidth}/${window.innerWidth}`);

        const verifyCreateForm = (tab, sheetSelector, fieldSelector, value) => {
          document.querySelector(`[data-tab="${tab}"]`)?.click();
          document.getElementById('fab')?.click();
          const overlay = document.querySelector(sheetSelector);
          const sheet = overlay?.querySelector('.sheet');
          const submit = overlay?.querySelector('.sheet-actions .primary');
          const field = overlay?.querySelector(fieldSelector);
          if (!overlay?.classList.contains('show') || !sheet || !submit || !field) return `форма раздела ${tab} не открылась`;

          const overlayZ = Number.parseInt(getComputedStyle(overlay).zIndex, 10) || 0;
          const navZ = Number.parseInt(getComputedStyle(tabs).zIndex, 10) || 0;
          if (overlayZ <= navZ) return `форма раздела ${tab} перекрывается нижней навигацией`;
          if (submit.textContent.trim() !== 'Создать') return `в форме раздела ${tab} нет кнопки «Создать»`;

          const buttonRect = submit.getBoundingClientRect();
          const sheetRect = sheet.getBoundingClientRect();
          if (buttonRect.top < sheetRect.top - 1 || buttonRect.bottom > sheetRect.bottom + 1 || buttonRect.bottom > window.innerHeight) {
            return `кнопка создания в разделе ${tab} находится вне видимой области`;
          }

          field.value = value;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          submit.click();
          if (overlay.classList.contains('show')) return `форма раздела ${tab} не сохранилась`;
          if (document.documentElement.scrollWidth > window.innerWidth + 1) return `раздел ${tab} создаёт горизонтальный overflow`;
          return '';
        };

        const formChecks = [
          verifyCreateForm('tasks', '#taskSheet', '[name="title"]', 'Проверка создания задачи'),
          verifyCreateForm('projects', '#projectSheet', '[name="title"]', 'Проверка создания проекта')
        ];
        const formFailure = formChecks.find(Boolean);
        if (formFailure) return fail(formFailure);

        if (document.querySelectorAll('#tabs .tab').length !== 3) return fail('ожидалось три раздела');

        document.querySelector('[data-tab="projects"]')?.click();
        document.querySelector('[data-open-project]')?.click();
        if (getComputedStyle(tabs).display !== 'none') return fail('нижняя навигация не скрывается внутри проекта');
        document.getElementById('backBtn')?.click();
        if (getComputedStyle(tabs).display === 'none') return fail('нижняя навигация не вернулась после выхода из проекта');

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

            const priorityAction = document.querySelector('[data-set-priority="mobile-new-1"]');
            const activeRow = priorityAction?.closest('.workspace-task-row');
            const taskHandle = activeRow?.querySelector(':scope > [data-drag-handle]');
            const priority = activeRow?.querySelector('.workspace-priority');
            const grip = taskHandle?.querySelector('.drag-grip');
            const overflow = activeRow?.querySelector('.workspace-icon-button');
            if (!activeRow) return fail('тестовая активная задача не найдена');
            if (!grip || parseFloat(getComputedStyle(grip).width) < 18 || parseFloat(getComputedStyle(grip).height) < 28) return fail('drag-иконка слишком маленькая или обрезана');
            if (!priority || getComputedStyle(priority).display === 'none') return fail('степень срочности задачи скрыта');
            if (priority.textContent.trim() !== 'Обычная') return fail(`неверный текст срочности: ${priority.textContent.trim()}`);
            if (parseFloat(getComputedStyle(priority).minHeight) < 30) return fail('индикатор срочности слишком маленький');
            if (!overflow || getComputedStyle(overflow).display !== 'none') return fail('правое меню с тремя точками не скрыто');
            if (!priorityAction || getComputedStyle(priorityAction).display === 'none') return fail('кнопка переноса задачи в приоритеты скрыта на мобильном');
            const priorityActionRect = priorityAction.getBoundingClientRect();
            if (priorityActionRect.width < 44 || priorityActionRect.height < 32) return fail('кнопка переноса задачи в приоритеты слишком маленькая');
            if (priorityActionRect.right > window.innerWidth + 1) return fail('кнопка переноса задачи в приоритеты выходит за экран');

            const input = document.createElement('input');
            input.className = 'search';
            document.body.append(input);
            const inputSize = parseFloat(getComputedStyle(input).fontSize);
            input.remove();
            if (inputSize < 16) return fail(`размер мобильного input меньше 16px: ${inputSize}`);

            const sortControl = document.getElementById('taskSort');
            if (!sortControl) return fail('мобильная сортировка задач не найдена');
            const sortStyle = getComputedStyle(sortControl);
            if (parseFloat(sortStyle.fontSize) < 16) return fail(`размер текста сортировки меньше 16px: ${sortStyle.fontSize}`);
            if (sortStyle.appearance !== 'none' && sortStyle.webkitAppearance !== 'none') return fail(`нативная стрелка сортировки не отключена: ${sortStyle.appearance}`);
            if (sortStyle.touchAction !== 'manipulation') return fail(`сортировка допускает double-tap zoom: ${sortStyle.touchAction}`);
            const taskChip = document.querySelector('.workspace-toolbar .chip');
            if (taskChip && getComputedStyle(taskChip).touchAction !== 'manipulation') return fail('кнопки интерфейса допускают double-tap zoom');

            restore.click();
            const tasks = JSON.parse(localStorage.getItem('lawyerTasks') || '[]');
            const restored = tasks.find(task => task.id === 'mobile-done-1');
            if (restored?.status !== 'new') return fail('задача не возвращена в статус new');
            if (restored?.completedAt) return fail('completedAt не очищен');

            document.querySelector('[data-tab="priorities"]')?.click();
            const board = document.querySelector('.priority-board');
            const days = [...document.querySelectorAll('.priority-day')];
            const weekActions = document.querySelector('.priority-week-actions');
            const today = document.querySelector('.priority-day.is-today[aria-current="date"]');
            if (!board || days.length !== 7) return fail('мобильная недельная доска не показывает все семь дней');
            if (!today) return fail('текущий день не отмечен на мобильном');
            const todayRect = today.getBoundingClientRect();
            const topRectAfterPriority = top.getBoundingClientRect();
            const tabsRectAfterPriority = tabs.getBoundingClientRect();
            if (topRectAfterPriority.bottom < 48 || topRectAfterPriority.top > 1) return fail('верхняя мобильная панель исчезает после перехода в приоритеты');
            if (Math.abs(tabsRectAfterPriority.bottom - window.innerHeight) > 2) return fail('нижняя навигация исчезает после перехода в приоритеты');
            const priorityBoardRect = board.getBoundingClientRect();
            if (todayRect.width < priorityBoardRect.width - 4) return fail(`карточка текущего дня не занимает ширину доски: ${todayRect.width}/${priorityBoardRect.width}`);
            if (!['auto', 'scroll'].includes(getComputedStyle(board).overflowY)) return fail('мобильная доска приоритетов не имеет собственного вертикального скролла');
            const todayHead = today.querySelector('.priority-day__head')?.getBoundingClientRect();
            if (!todayHead || todayHead.width < todayRect.width - 4) return fail('заголовок дня не занимает ширину мобильной карточки');
            const todayMainZone = today.querySelector('.priority-zone--main');
            const todayOtherZone = today.querySelector('.priority-zone--other');
            if (!todayMainZone || !todayOtherZone) return fail('зоны текущего дня не отрисованы');
            const mainZoneRect = todayMainZone.getBoundingClientRect();
            const otherZoneRect = todayOtherZone.getBoundingClientRect();
            if (mainZoneRect.height < 70 || otherZoneRect.height < 70) {
              return fail(`зоны текущего дня схлопнуты: ${mainZoneRect.height}/${otherZoneRect.height}`);
            }
            const expectedDayHeight = todayHead.height + mainZoneRect.height + otherZoneRect.height;
            if (todayRect.height + 4 < expectedDayHeight) {
              return fail(`контент дня обрезается: day=${Math.round(todayRect.height)} parts=${Math.round(expectedDayHeight)} mainTop=${Math.round(mainZoneRect.top)} otherTop=${Math.round(otherZoneRect.top)}`);
            }
            const boardCenter = (priorityBoardRect.top + priorityBoardRect.bottom) / 2;
            const todayCenter = (todayRect.top + todayRect.bottom) / 2;
            if (Math.abs(todayCenter - boardCenter) > Math.max(32, priorityBoardRect.height * 0.12)) {
              return fail(`текущий день не расположен по центру мобильной доски: day=${Math.round(todayCenter)} board=${Math.round(boardCenter)} scroll=${Math.round(board.scrollTop)}`);
            }
            const priorityActionButtons = [...today.querySelectorAll('.priority-card__actions button')];
            if (priorityActionButtons.some(button => button.getBoundingClientRect().height < 39)) return fail('действия приоритетов слишком маленькие для касания');
            if (!weekActions || weekActions.querySelectorAll('.btn').length !== 3) return fail('неполная навигация по неделям на мобильном');
            const weekRect = weekActions.getBoundingClientRect();
            if (weekRect.left < -1 || weekRect.right > window.innerWidth + 1) return fail('навигация по неделям выходит за экран');
            const boardRect = board.getBoundingClientRect();
            const lastDayRect = days.at(-1).getBoundingClientRect();
            if (board.scrollWidth > board.clientWidth + 1) return fail(`недельная доска требует горизонтальной прокрутки: ${board.scrollWidth}/${board.clientWidth}`);
            if (lastDayRect.right > boardRect.right + 1 || lastDayRect.left < boardRect.left) return fail('последний день недели не помещается в мобильную доску');
            if (document.documentElement.scrollWidth > window.innerWidth + 1) return fail('приоритеты создают горизонтальный overflow страницы');

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
