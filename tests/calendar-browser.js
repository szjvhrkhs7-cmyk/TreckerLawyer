(() => {
  'use strict';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = value => String(value).padStart(2, '0');
  const date = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  const now = new Date().toISOString();
  localStorage.setItem('lawyerCalendarEvents', JSON.stringify([{
    id: 'ci-calendar-event', title: 'Заседание', date, startTime: '10:00', endTime: '11:30',
    location: 'Суд', notes: 'Взять материалы', color: 'blue', reminder: 15, createdAt: now, updatedAt: now
  }]));

  function finish(message) {
    const result = document.createElement('div');
    result.id = 'calendar-test-result';
    result.textContent = message;
    document.body.append(result);
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        document.querySelector('[data-tab="calendar"]')?.click();
        if (!document.querySelector('.calendar-view')) return finish('FAIL: календарь не открылся');
        if (document.querySelectorAll('.calendar-day-head').length !== 7) return finish('FAIL: в неделе не семь дней');
        if (document.querySelectorAll('.calendar-time-column .calendar-time-label').length !== 48) return finish('FAIL: отсутствует полная временная шкала');
        if (document.getElementById('calendarCount')?.textContent !== '1') return finish('FAIL: счётчик событий неверен');
        const sidebarEvent = document.querySelector('[data-sidebar-event="ci-calendar-event"]');
        if (!sidebarEvent) return finish('FAIL: событие не появилось в плане на семь дней');
        sidebarEvent.click();
        if (!document.getElementById('eventSheet')?.classList.contains('show')) return finish('FAIL: событие нельзя открыть из боковой панели');
        if (!document.querySelector('[data-export-current-event]')) return finish('FAIL: нет экспорта в календарь iPhone');
        const title = document.querySelector('#eventForm [name="title"]');
        title.value = 'Заседание обновлено';
        document.getElementById('eventForm').requestSubmit();
        const stored = JSON.parse(localStorage.getItem('lawyerCalendarEvents') || '[]');
        if (stored[0]?.title !== 'Заседание обновлено') return finish('FAIL: изменение события не сохранилось');
        finish('CALENDAR_PASS');
      } catch (error) {
        finish(`FAIL: ${error?.message || String(error)}`);
      }
    }, 200);
  });
})();
