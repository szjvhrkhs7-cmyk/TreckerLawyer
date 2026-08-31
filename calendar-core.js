(() => {
  'use strict';

  const COLORS = new Set(['blue', 'green', 'orange', 'purple', 'red']);
  const SLOT_MINUTES = 30;
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
  function weekStart(value) { const date = new Date(value); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date; }
  function minutesFromTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return Number(match[1]) < 24 && Number(match[2]) < 60 ? minutes : null;
  }
  function timeFromMinutes(value) { const safe = Math.max(0, Math.min(1439, value)); return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`; }
  function eventDateTime(event, end = false) { return new Date(`${event.date}T${end ? event.endTime : event.startTime}:00`); }
  function roundToHalfHour(value = new Date()) {
    const minutes = value.getHours() * 60 + value.getMinutes();
    return Math.min(23 * 60, Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES);
  }

  function normalizeCalendarEvent(event) {
    if (!valid(event)) return null;
    const date = parseYmd(event.date) ? event.date : localYmd();
    const startMinutes = minutesFromTime(event.startTime) ?? 9 * 60;
    let endMinutes = minutesFromTime(event.endTime) ?? startMinutes + 60;
    if (endMinutes <= startMinutes) endMinutes = Math.min(1439, startMinutes + 60);
    return {
      ...event,
      title: String(event.title || 'Без названия'),
      date,
      startTime: timeFromMinutes(startMinutes),
      endTime: timeFromMinutes(endMinutes),
      location: String(event.location || ''),
      notes: String(event.notes || ''),
      color: COLORS.has(event.color) ? event.color : 'blue',
      reminder: Math.max(0, Number(event.reminder) || 0),
      createdAt: inferredCreatedAt(event)
    };
  }

  function allCalendarEvents() {
    return load(LS.calendarEvents).map(normalizeCalendarEvent).filter(Boolean).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  }

  function upcomingCalendarEvents() {
    const current = new Date();
    const boundary = addDays(new Date(current.getFullYear(), current.getMonth(), current.getDate()), 7);
    return allCalendarEvents().filter(event => eventDateTime(event, true) >= current && eventDateTime(event) < boundary);
  }

  function calendarStatsLine() {
    const events = upcomingCalendarEvents();
    if (!events.length) return 'На ближайшие 7 дней событий нет';
    const today = localYmd();
    const todayCount = events.filter(event => event.date === today).length;
    return `${events.length} на неделю${todayCount ? ` · ${todayCount} сегодня` : ''}`;
  }

  function shortEventDate(event) {
    const date = parseYmd(event.date);
    if (!date) return '';
    const today = localYmd();
    const tomorrow = localYmd(addDays(new Date(), 1));
    if (event.date === today) return 'Сегодня';
    if (event.date === tomorrow) return 'Завтра';
    return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
  }

  function updateSidebarAgenda() {
    if (!sidebar) return;
    const events = upcomingCalendarEvents();
    sidebar.innerHTML = `<p class="sidebar-agenda__title">Ближайшие 7 дней</p>${events.length ? events.map(event => `<button class="sidebar-event" type="button" data-sidebar-event="${esc(event.id)}"><span class="sidebar-event__dot calendar-color-${event.color}" aria-hidden="true"></span><span class="sidebar-event__body"><strong>${esc(event.title)}</strong><small>${esc(shortEventDate(event))} · ${esc(event.startTime)}</small></span></button>`).join('') : '<p class="sidebar-agenda__empty">Событий пока нет</p>'}`;
  }

  function monthStart(value) { return new Date(value.getFullYear(), value.getMonth(), 1); }
  function addMonths(value, amount) { return new Date(value.getFullYear(), value.getMonth() + amount, 1); }
  function capitalized(value) { return value ? value[0].toLocaleUpperCase('ru-RU') + value.slice(1) : ''; }

  function renderCalendar() {
    const today = new Date();
    const anchor = parseYmd(state.calendarAnchor) || today;
    const start = monthStart(anchor);
    const gridStart = weekStart(start);
    const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
    const selected = parseYmd(state.calendarSelectedDate);
    const preferred = selected && selected.getMonth() === start.getMonth() && selected.getFullYear() === start.getFullYear()
      ? localYmd(selected)
      : today.getMonth() === start.getMonth() && today.getFullYear() === start.getFullYear() ? localYmd(today) : localYmd(start);
    state.calendarAnchor = localYmd(anchor);
    state.calendarSelectedDate = preferred;
    const events = allCalendarEvents();
    const eventDates = new Set(events.map(event => event.date));
    const monthName = capitalized(start.toLocaleDateString('ru-RU', { month: 'long' }));
    const weekdayHeaders = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => `<div class="calendar-weekday">${day}</div>`).join('');
    const dateCells = days.map(date => {
      const key = localYmd(date);
      const outside = date.getMonth() !== start.getMonth();
      const current = key === localYmd(today);
      const isSelected = key === preferred;
      const hasEvents = eventDates.has(key);
      const eventCount = events.filter(item => item.date === key).length;
      const label = `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}${eventCount ? `, событий: ${eventCount}` : ''}`;
      return `<button class="calendar-date ${outside ? 'is-outside' : ''} ${current ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${hasEvents ? 'has-events' : ''}" type="button" data-calendar-day="${key}" aria-label="${esc(label)}" aria-pressed="${isSelected}"><span class="calendar-date-dot ${hasEvents ? '' : 'is-empty'}" aria-hidden="true"></span><span class="calendar-date-number">${date.getDate()}</span></button>`;
    }).join('');
    const selectedDate = parseYmd(preferred) || today;
    const selectedEvents = events.filter(event => event.date === preferred);
    const selectedLabel = capitalized(selectedDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
    const eventList = selectedEvents.length
      ? selectedEvents.map(event => `<button type="button" class="calendar-agenda-event" data-calendar-event="${esc(event.id)}"><span class="calendar-agenda-event__time">${esc(event.startTime)}<small>${esc(event.endTime)}</small></span><span class="calendar-agenda-event__body"><strong>${esc(event.title)}</strong>${event.location ? `<small>${esc(event.location)}</small>` : ''}</span><span class="calendar-agenda-event__chevron" aria-hidden="true">›</span></button>`).join('')
      : '<p class="calendar-agenda-empty">На этот день событий нет</p>';

    page.innerHTML = `<section class="calendar-view" aria-label="Календарь на месяц">
      <div class="calendar-toolbar">
        <div class="calendar-month-title"><h2>${esc(monthName)}</h2><span>${start.getFullYear()}</span></div>
        <div class="calendar-toolbar__actions">
          <button class="btn calendar-nav" type="button" data-calendar-prev aria-label="Предыдущий месяц">‹</button>
          <button class="btn" type="button" data-calendar-today>Сегодня</button>
          <button class="btn calendar-nav" type="button" data-calendar-next aria-label="Следующий месяц">›</button>
        </div>
      </div>
      <div class="calendar-month" role="grid" aria-label="${esc(`${monthName} ${start.getFullYear()}`)}">
        <div class="calendar-weekdays" role="row">${weekdayHeaders}</div>
        <div class="calendar-month-grid">${dateCells}</div>
      </div>
      <div class="calendar-day-events" aria-live="polite">
        <div class="calendar-agenda-heading"><div><p>Выбранная дата</p><h3>${esc(selectedLabel)}</h3></div><button class="btn" type="button" data-calendar-new-for-day>+ Добавить</button></div>
        <div class="calendar-agenda-list">${eventList}</div>
      </div>
    </section>`;
  }

  function defaultEventTimes() {
    const startMinutes = roundToHalfHour();
    return { startTime: timeFromMinutes(startMinutes), endTime: timeFromMinutes(Math.min(1439, startMinutes + 60)) };
  }

  function openCalendarEvent(event = {}, selection = {}) {
    const defaults = defaultEventTimes();
    const value = { date: state.calendarSelectedDate || localYmd(), ...defaults, color: 'blue', reminder: 15, ...event, ...selection };
    state.editingEvent = event.id ? event : null;
    eventTitleElement.textContent = event.id ? 'Редактирование события' : 'Новое событие';
    eventFormElement.innerHTML = `<div class="field"><label>Название *</label><input name="title" required maxlength="160" value="${esc(value.title || '')}" placeholder="Например, встреча по проекту"></div>
      <div class="field"><label>Дата</label><input type="date" name="date" required value="${esc(value.date)}"></div>
      <div class="grid2"><div class="field"><label>Начало</label><input type="time" name="startTime" step="1800" required value="${esc(value.startTime)}"></div><div class="field"><label>Окончание</label><input type="time" name="endTime" step="1800" required value="${esc(value.endTime)}"></div></div>
      <div class="field"><label>Место</label><input name="location" maxlength="240" value="${esc(value.location || '')}" placeholder="Офис, суд или ссылка на встречу"></div>
      <div class="grid2"><div class="field"><label>Цвет</label><select name="color"><option value="blue">Синий</option><option value="green">Зелёный</option><option value="orange">Оранжевый</option><option value="purple">Фиолетовый</option><option value="red">Красный</option></select></div><div class="field"><label>Напомнить</label><select name="reminder"><option value="0">Не напоминать</option><option value="5">За 5 минут</option><option value="10">За 10 минут</option><option value="15">За 15 минут</option><option value="30">За 30 минут</option><option value="60">За 1 час</option><option value="1440">За 1 день</option></select></div></div>
      <div class="field"><label>Заметка</label><textarea name="notes" data-autogrow="true">${esc(value.notes || '')}</textarea></div>
      ${event.id ? `<div class="event-utility-actions"><button type="button" class="btn" data-export-current-event>Добавить в календарь iPhone</button><button type="button" class="btn danger" data-delete-current-event>Удалить</button></div>` : ''}
      <div class="sheet-actions"><button type="button" class="btn" data-cancel-event>Отмена</button><button class="btn primary">Сохранить</button></div>`;
    eventFormElement.color.value = COLORS.has(value.color) ? value.color : 'blue';
    eventFormElement.reminder.value = String(value.reminder ?? 15);
    showOverlay(eventOverlay);
    bindAutoGrow(eventFormElement);
  }

  function saveCalendarEvent(event) {
    event.preventDefault();
    const form = new FormData(eventFormElement);
    const title = String(form.get('title') || '').trim();
    const date = String(form.get('date') || '');
    const startTime = String(form.get('startTime') || '');
    const endTime = String(form.get('endTime') || '');
    const startMinutes = minutesFromTime(startTime), endMinutes = minutesFromTime(endTime);
    if (!title || !parseYmd(date) || startMinutes === null || endMinutes === null) return;
    if (endMinutes <= startMinutes) {
      const endControl = eventFormElement.elements.namedItem('endTime');
      endControl.setCustomValidity('Окончание должно быть позже начала');
      endControl.reportValidity();
      endControl.setCustomValidity('');
      return;
    }
    const events = allCalendarEvents();
    const old = state.editingEvent?.id ? events.find(item => sameId(item.id, state.editingEvent.id)) : null;
    const value = {
      ...(old || {}), id: old?.id || uid(), title, date, startTime, endTime,
      location: String(form.get('location') || '').trim(), notes: String(form.get('notes') || '').trim(),
      color: COLORS.has(form.get('color')) ? form.get('color') : 'blue', reminder: Number(form.get('reminder')) || 0,
      createdAt: old?.createdAt || now(), updatedAt: now()
    };
    if (old) events.splice(events.indexOf(old), 1, value); else events.push(value);
    save(LS.calendarEvents, events);
    state.calendarAnchor = date;
    state.calendarSelectedDate = date;
    state.editingEvent = null;
    hideOverlay(eventOverlay);
    render();
  }

  function deleteCalendarEvent(event) {
    if (!event?.id) return;
    askConfirm('Событие будет удалено без возможности восстановления.', () => {
      save(LS.calendarEvents, allCalendarEvents().filter(item => !sameId(item.id, event.id)));
      state.editingEvent = null;
      hideOverlay(eventOverlay);
      render();
    });
  }

  function compactIcsDate(value) { return String(value).replaceAll('-', ''); }
  function compactIcsTime(value) { return String(value).replace(':', '') + '00'; }
  function icsTimestamp(value = new Date()) { return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function safeFilename(value) { return String(value || 'event').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 70) || 'event'; }
  function exportCalendarEvent(event) {
    if (!event) return;
    const alarm = event.reminder ? `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:${icsSafe(event.title)}\r\nTRIGGER:${event.reminder === 1440 ? '-P1D' : `-PT${event.reminder}M`}\r\nEND:VALARM\r\n` : '';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'PRODID:-//TreckerLawyer//Calendar//RU', 'BEGIN:VEVENT', `UID:${icsSafe(event.id)}@treckerlawyer`, `DTSTAMP:${icsTimestamp()}`, `DTSTART:${compactIcsDate(event.date)}T${compactIcsTime(event.startTime)}`, `DTEND:${compactIcsDate(event.date)}T${compactIcsTime(event.endTime)}`, `SUMMARY:${icsSafe(event.title)}`];
    if (event.location) lines.push(`LOCATION:${icsSafe(event.location)}`);
    if (event.notes) lines.push(`DESCRIPTION:${icsSafe(event.notes)}`);
    const content = `${lines.join('\r\n')}\r\n${alarm}END:VEVENT\r\nEND:VCALENDAR\r\n`;
    download(`${safeFilename(event.title)}.ics`, content, 'text/calendar;charset=utf-8');
  }

  page.addEventListener('click', event => {
    if (state.tab !== 'calendar') return;
    const calendarEventId = event.target.closest('[data-calendar-event]')?.dataset.calendarEvent;
    if (calendarEventId) { event.stopPropagation(); openCalendarEvent(allCalendarEvents().find(item => sameId(item.id, calendarEventId))); return; }
    if (event.target.closest('[data-calendar-prev]')) { state.calendarAnchor = localYmd(addMonths(monthStart(parseYmd(state.calendarAnchor) || new Date()), -1)); state.calendarSelectedDate = state.calendarAnchor; render(); return; }
    if (event.target.closest('[data-calendar-next]')) { state.calendarAnchor = localYmd(addMonths(monthStart(parseYmd(state.calendarAnchor) || new Date()), 1)); state.calendarSelectedDate = state.calendarAnchor; render(); return; }
    if (event.target.closest('[data-calendar-today]')) { state.calendarAnchor = localYmd(); state.calendarSelectedDate = localYmd(); render(); return; }
    if (event.target.closest('[data-calendar-new], [data-calendar-new-for-day]')) { openCalendarEvent({}, { date: state.calendarSelectedDate || localYmd() }); return; }
    const day = event.target.closest('[data-calendar-day]')?.dataset.calendarDay;
    if (day) { state.calendarAnchor = day; state.calendarSelectedDate = day; render(); }
  });

  eventFormElement.addEventListener('submit', saveCalendarEvent);
  eventFormElement.addEventListener('click', event => {
    if (event.target.closest('[data-cancel-event]')) hideOverlay(eventOverlay);
    if (event.target.closest('[data-export-current-event]')) exportCalendarEvent(state.editingEvent);
    if (event.target.closest('[data-delete-current-event]')) deleteCalendarEvent(state.editingEvent);
  });
  sidebar?.addEventListener('click', event => {
    const id = event.target.closest('[data-sidebar-event]')?.dataset.sidebarEvent;
    if (!id) return;
    const calendarEvent = allCalendarEvents().find(item => sameId(item.id, id));
    if (!calendarEvent) return;
    state.calendarAnchor = calendarEvent.date;
    state.calendarSelectedDate = calendarEvent.date;
    switchTab('calendar');
    openCalendarEvent(calendarEvent);
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
