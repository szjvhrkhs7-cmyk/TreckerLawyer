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
        if (document.querySelectorAll('.calendar-weekday').length !== 7) return finish('FAIL: в неделе не семь дней');
        if (document.querySelectorAll('.calendar-date').length !== 42) return finish('FAIL: месячная сетка неполная');
        if (document.getElementById('calendarCount')?.textContent !== '1') return finish('FAIL: счётчик событий неверен');
        const eventDate = document.querySelector(`[data-calendar-day="${date}"]`);
        if (!eventDate?.classList.contains('has-events') || !eventDate.querySelector('.calendar-date-dot:not(.is-empty)')) return finish('FAIL: дата события не отмечена красной точкой');
        eventDate.click();
        const agendaEvent = document.querySelector('.calendar-day-events [data-calendar-event="ci-calendar-event"]');
        if (!agendaEvent || !agendaEvent.textContent.includes('Заседание') || !agendaEvent.textContent.includes('10:00')) return finish('FAIL: список событий выбранной даты не появился');
        const sidebarEvent = document.querySelector('[data-sidebar-event="ci-calendar-event"]');
        if (!sidebarEvent) return finish('FAIL: событие не появилось в плане на семь дней');
        agendaEvent.click();
        if (!document.getElementById('eventSheet')?.classList.contains('show')) return finish('FAIL: событие нельзя открыть из списка выбранного дня');
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
