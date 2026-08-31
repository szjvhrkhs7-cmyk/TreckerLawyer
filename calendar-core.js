(() => {
  'use strict';

  const eventOverlay = document.getElementById('eventSheet');
  const eventFormElement = document.getElementById('eventForm');
  const eventTitleElement = document.getElementById('eventSheetTitle');
  const sidebar = document.getElementById('sidebarAgenda');

  function pad(value) { return String(value).padStart(2, '0'); }
  function localYmd(value = new Date()) { return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`; }
  function parseYmd(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return localYmd(date) === value ? date : null;
  }
  function addDays(value, amount) { const date = new Date(value); date.setDate(date.getDate() + amount); return date; }
  function minutesFromTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const hours = Number(match[1]), minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
  }
  function timeFromMinutes(value) {
    const safe = Math.max(0, Math.min(1439, value));
    return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
  }
  function defaultTime() {
    const current = new Date();
    const rounded = Math.min(23 * 60 + 30, Math.ceil((current.getHours() * 60 + current.getMinutes()) / 30) * 30);
    return timeFromMinutes(rounded);
  }

  function normalizeCalendarEvent(event) {
    if (!valid(event)) return null;
    return {
      ...event,
      title: String(event.title || 'Без названия'),
      date: parseYmd(event.date) ? event.date : localYmd(),
      startTime: minutesFromTime(event.startTime) === null ? '09:00' : event.startTime,
      endTime: minutesFromTime(event.endTime) === null ? '' : event.endTime,
      notes: String(event.notes || event.details || ''),
      createdAt: inferredCreatedAt(event)
    };
  }

  function allCalendarEvents() {
    return load(LS.calendarEvents).map(normalizeCalendarEvent).filter(Boolean).sort((a, b) =>
      `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`) || a.title.localeCompare(b.title, 'ru')
    );
  }

  function upcomingCalendarEvents() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const boundary = addDays(today, 6);
    return allCalendarEvents().filter(event => {
      const date = parseYmd(event.date);
      const weekday = date?.getDay();
      return date && date >= today && date <= boundary && weekday !== 0 && weekday !== 6;
    });
  }

  function eventTime(event) {
    return event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime;
  }

  function calendarStatsLine() {
    const events = upcomingCalendarEvents();
    if (!events.length) return 'На ближайшие 7 дней событий нет';
    const todayCount = events.filter(event => event.date === localYmd()).length;
    return `${events.length} на ближайшие 7 дней${todayCount ? ` · ${todayCount} сегодня` : ''}`;
  }

  function shortEventDate(event) {
    const date = parseYmd(event.date);
    if (!date) return '';
    if (event.date === localYmd()) return 'Сегодня';
    if (event.date === localYmd(addDays(new Date(), 1))) return 'Завтра';
    return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
  }

  function updateSidebarAgenda() {
    if (!sidebar) return;
    const events = upcomingCalendarEvents();
    sidebar.innerHTML = `<p class="sidebar-agenda__title">Ближайшие 7 дней · пн–пт</p>${events.length
      ? events.slice(0, 7).map(event => `<button class="sidebar-event" type="button" data-sidebar-event="${esc(event.id)}"><span>${esc(shortEventDate(event))} · ${esc(eventTime(event))}</span><strong>${esc(event.title)}</strong></button>`).join('')
      : '<p class="sidebar-agenda__empty">Запланированных дел нет</p>'}`;
  }

  function monthCells(monthDate, events) {
    const year = monthDate.getFullYear(), month = monthDate.getMonth();
    const first = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
    const today = localYmd();
    const countByDate = new Map();
    events.forEach(event => countByDate.set(event.date, (countByDate.get(event.date) || 0) + 1));
    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(gridStart, index);
      const key = localYmd(date), count = countByDate.get(key) || 0;
      const classes = [
        date.getMonth() === month ? '' : 'outside',
        key === today ? 'today' : '',
        key === state.calendarSelectedDate ? 'selected' : ''
      ].filter(Boolean).join(' ');
      const label = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      return `<button type="button" class="calendar-day ${classes}" data-calendar-date="${key}" aria-label="${esc(label)}${count ? `, событий: ${count}` : ''}" aria-pressed="${key === state.calendarSelectedDate}"><span>${date.getDate()}</span>${count ? `<i aria-hidden="true">${count > 3 ? count : '•'.repeat(count)}</i>` : ''}</button>`;
    }).join('');
  }

  function selectedEventsHtml(events) {
    const selected = events.filter(event => event.date === state.calendarSelectedDate);
    if (!selected.length) return '<div class="calendar-empty">На эту дату событий нет</div>';
    return selected.map(event => `<article class="calendar-event-card"><div class="calendar-event-time">${esc(eventTime(event))}</div><div class="calendar-event-content"><h3>${esc(event.title)}</h3>${event.notes ? `<p>${esc(event.notes)}</p>` : ''}</div><div class="calendar-event-actions"><button type="button" class="btn" data-edit-event="${esc(event.id)}">Изменить</button><button type="button" class="btn danger" data-delete-event="${esc(event.id)}">Удалить</button></div></article>`).join('');
  }

  function renderCalendar() {
    const today = new Date();
    const anchor = parseYmd(state.calendarAnchor) || new Date(today.getFullYear(), today.getMonth(), 1);
    const month = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    state.calendarAnchor = localYmd(month);
    state.calendarSelectedDate = parseYmd(state.calendarSelectedDate) ? state.calendarSelectedDate : localYmd(today);
    const events = allCalendarEvents();
    const monthTitle = month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const selectedTitle = parseYmd(state.calendarSelectedDate).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    page.innerHTML = `<section class="calendar-view" aria-label="Календарь">
      <div class="calendar-heading"><div><h2>Календарь</h2><p>События по датам и времени</p></div><button type="button" class="btn primary" data-calendar-new>Добавить событие</button></div>
      <div class="calendar-layout">
        <section class="calendar-panel" aria-label="Календарь на ${esc(monthTitle)}">
          <div class="calendar-toolbar"><button type="button" class="calendar-nav" data-calendar-prev aria-label="Предыдущий месяц">‹</button><h3>${esc(monthTitle)}</h3><button type="button" class="calendar-nav" data-calendar-next aria-label="Следующий месяц">›</button><button type="button" class="btn calendar-today" data-calendar-today>Сегодня</button></div>
          <div class="calendar-weekdays" aria-hidden="true"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div>
          <div class="calendar-grid">${monthCells(month, events)}</div>
        </section>
        <section class="calendar-agenda">
          <div class="calendar-agenda-head"><div><span>События</span><h3>${esc(selectedTitle)}</h3></div><button type="button" class="calendar-add-small" data-calendar-new aria-label="Добавить событие">+</button></div>
          <div class="calendar-events">${selectedEventsHtml(events)}</div>
        </section>
      </div>
    </section>`;
  }

  function openCalendarEvent(event = {}, selection = {}) {
    const value = {
      date: state.calendarSelectedDate || localYmd(),
      startTime: defaultTime(),
      endTime: '',
      ...event,
      ...selection
    };
    state.editingEvent = event.id ? event : null;
    eventTitleElement.textContent = event.id ? 'Редактирование события' : 'Новое событие';
    eventFormElement.innerHTML = `<div class="field"><label>Название *</label><input name="title" required maxlength="160" value="${esc(value.title || '')}" placeholder="Например, судебное заседание"></div>
      <div class="field"><label>Дата *</label><input type="date" name="date" required value="${esc(value.date)}"></div>
      <div class="grid2"><div class="field"><label>Время *</label><input type="time" name="startTime" required value="${esc(value.startTime)}"></div><div class="field"><label>Окончание интервала</label><input type="time" name="endTime" value="${esc(value.endTime || '')}"><small>Оставьте пустым, если нужно указать точное время</small></div></div>
      <div class="field"><label>Описание</label><textarea name="notes" data-autogrow="true">${esc(value.notes || '')}</textarea></div>
      ${event.id ? '<div class="event-utility-actions"><button type="button" class="btn" data-export-current-event>Добавить в календарь iPhone</button></div>' : ''}
      <div class="sheet-actions"><button type="button" class="btn" data-cancel-event>Отмена</button><button class="btn primary">Сохранить</button></div>`;
    showOverlay(eventOverlay);
    bindAutoGrow(eventFormElement);
  }

  function saveCalendarEvent(submitEvent) {
    submitEvent.preventDefault();
    const form = new FormData(eventFormElement);
    const title = String(form.get('title') || '').trim();
    const date = String(form.get('date') || '');
    const startTime = String(form.get('startTime') || '');
    const endTime = String(form.get('endTime') || '');
    const startMinutes = minutesFromTime(startTime), endMinutes = endTime ? minutesFromTime(endTime) : null;
    if (!title || !parseYmd(date) || startMinutes === null) return;
    if (endTime && (endMinutes === null || endMinutes <= startMinutes)) {
      const control = eventFormElement.elements.namedItem('endTime');
      control.setCustomValidity('Окончание должно быть позже начала');
      control.reportValidity();
      control.setCustomValidity('');
      return;
    }
    const events = allCalendarEvents();
    const old = state.editingEvent?.id ? events.find(event => sameId(event.id, state.editingEvent.id)) : null;
    const value = {
      ...(old || {}),
      id: old?.id || uid(),
      title,
      date,
      startTime,
      endTime,
      notes: String(form.get('notes') || '').trim(),
      createdAt: old?.createdAt || now(),
      updatedAt: now()
    };
    old ? events.splice(events.indexOf(old), 1, value) : events.push(value);
    save(LS.calendarEvents, events);
    state.calendarAnchor = date;
    state.calendarSelectedDate = date;
    state.editingEvent = null;
    hideOverlay(eventOverlay);
    render();
  }

  function deleteCalendarEvent(event) {
    askConfirm('Событие будет удалено без возможности восстановления.', () => {
      save(LS.calendarEvents, allCalendarEvents().filter(item => !sameId(item.id, event.id)));
      render();
    });
  }

  function icsTimestamp(value = new Date()) { return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function compactDate(value) { return value.replaceAll('-', ''); }
  function compactTime(value) { return value.replace(':', '') + '00'; }
  function exportCalendarEvent(event) {
    if (!event) return;
    const start = minutesFromTime(event.startTime) || 0;
    const endTime = event.endTime || timeFromMinutes(Math.min(1439, start + 30));
    const content = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'PRODID:-//TreckerLawyer//Calendar//RU', 'BEGIN:VEVENT', `UID:${icsSafe(event.id)}@treckerlawyer`, `DTSTAMP:${icsTimestamp()}`, `DTSTART:${compactDate(event.date)}T${compactTime(event.startTime)}`, `DTEND:${compactDate(event.date)}T${compactTime(endTime)}`, `SUMMARY:${icsSafe(event.title)}`, event.notes ? `DESCRIPTION:${icsSafe(event.notes)}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n') + '\r\n';
    download('calendar-event.ics', content, 'text/calendar;charset=utf-8');
  }

  page.addEventListener('click', clickEvent => {
    if (state.tab !== 'calendar') return;
    const target = clickEvent.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-calendar-prev')) {
      const anchor = parseYmd(state.calendarAnchor) || new Date();
      state.calendarAnchor = localYmd(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
      render();
    } else if (target.hasAttribute('data-calendar-next')) {
      const anchor = parseYmd(state.calendarAnchor) || new Date();
      state.calendarAnchor = localYmd(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));
      render();
    } else if (target.hasAttribute('data-calendar-today')) {
      state.calendarAnchor = localYmd();
      state.calendarSelectedDate = localYmd();
      render();
    } else if (target.dataset.calendarDate) {
      state.calendarSelectedDate = target.dataset.calendarDate;
      render();
    } else if (target.hasAttribute('data-calendar-new')) {
      openCalendarEvent();
    } else if (target.dataset.editEvent) {
      openCalendarEvent(allCalendarEvents().find(event => sameId(event.id, target.dataset.editEvent)) || {});
    } else if (target.dataset.deleteEvent) {
      const event = allCalendarEvents().find(item => sameId(item.id, target.dataset.deleteEvent));
      if (event) deleteCalendarEvent(event);
    }
  });

  eventFormElement.addEventListener('submit', saveCalendarEvent);
  eventFormElement.addEventListener('click', clickEvent => {
    if (clickEvent.target.closest('[data-cancel-event]')) hideOverlay(eventOverlay);
    if (clickEvent.target.closest('[data-export-current-event]')) exportCalendarEvent(state.editingEvent);
  });
  sidebar?.addEventListener('click', clickEvent => {
    const id = clickEvent.target.closest('[data-sidebar-event]')?.dataset.sidebarEvent;
    const event = allCalendarEvents().find(item => sameId(item.id, id));
    if (!event) return;
    state.calendarAnchor = event.date;
    state.calendarSelectedDate = event.date;
    switchTab('calendar');
  });

  globalThis.allCalendarEvents = allCalendarEvents;
  globalThis.upcomingCalendarEvents = upcomingCalendarEvents;
  globalThis.calendarStatsLine = calendarStatsLine;
  globalThis.updateSidebarAgenda = updateSidebarAgenda;
  globalThis.renderCalendar = renderCalendar;
  globalThis.openCalendarEvent = openCalendarEvent;
  globalThis.exportCalendarEvent = exportCalendarEvent;
  updateHeader();
})();
