(() => {
  'use strict';

  const COLORS = new Set(['blue', 'green', 'orange', 'purple', 'red']);
  const SLOT_MINUTES = 30;
  const SLOTS_PER_DAY = 48;
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

  function weekLabel(start) {
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    if (sameMonth) return `${start.getDate()}-${end.getDate()} ${end.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`;
    return `${start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  function eventSlotMarkup(event, slotIndex) {
    const startMinutes = minutesFromTime(event.startTime) ?? 0;
    const endMinutes = minutesFromTime(event.endTime) ?? startMinutes + SLOT_MINUTES;
    const duration = Math.max(1, Math.min(SLOTS_PER_DAY - slotIndex, Math.ceil((endMinutes - startMinutes) / SLOT_MINUTES)));
    return `<button type="button" class="calendar-event calendar-color-${event.color}" data-calendar-event="${esc(event.id)}" data-duration-slots="${duration}" aria-label="${esc(`${event.title}, с ${event.startTime} до ${event.endTime}`)}"><strong>${esc(event.title)}</strong><span>${esc(event.startTime)}-${esc(event.endTime)}${event.location ? ` · ${esc(event.location)}` : ''}</span></button>`;
  }

  function renderCalendar() {
    const today = new Date();
    const anchor = parseYmd(state.calendarAnchor) || today;
    const start = weekStart(anchor);
    const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    const dayKeys = days.map(localYmd);
    const preferred = state.calendarSelectedDate && dayKeys.includes(state.calendarSelectedDate) ? state.calendarSelectedDate : dayKeys.includes(localYmd(today)) ? localYmd(today) : dayKeys[0];
    state.calendarAnchor = localYmd(anchor);
    state.calendarSelectedDate = preferred;
    const events = allCalendarEvents();
    const weekEvents = events.filter(event => dayKeys.includes(event.date));
    const dayHeaders = days.map(date => {
      const key = localYmd(date), selected = key === preferred, current = key === localYmd(today);
      return `<button class="calendar-day-head ${selected ? 'is-selected' : ''} ${current ? 'is-today' : ''}" type="button" data-calendar-day="${key}" aria-pressed="${selected}"><span>${date.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '')}</span><strong>${date.getDate()}</strong></button>`;
    }).join('');
    const timeLabels = Array.from({ length: SLOTS_PER_DAY }, (_, slot) => `<div class="calendar-time-label">${slot % 2 === 0 ? timeFromMinutes(slot * SLOT_MINUTES) : ''}</div>`).join('');
    const columns = days.map(date => {
      const key = localYmd(date), selected = key === preferred;
      const slots = Array.from({ length: SLOTS_PER_DAY }, (_, slot) => {
        const slotMinutes = slot * SLOT_MINUTES;
        const slotEvents = weekEvents.filter(event => event.date === key && Math.floor((minutesFromTime(event.startTime) ?? 0) / SLOT_MINUTES) === slot);
        const currentSlot = key === localYmd(today) && Math.floor((today.getHours() * 60 + today.getMinutes()) / SLOT_MINUTES) === slot;
        return `<div class="calendar-slot ${currentSlot ? 'is-current' : ''}" data-calendar-slot data-date="${key}" data-time="${timeFromMinutes(slotMinutes)}" role="button" tabindex="0" aria-label="${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, ${timeFromMinutes(slotMinutes)}">${slotEvents.map(event => eventSlotMarkup(event, slot)).join('')}</div>`;
      }).join('');
      return `<div class="calendar-day-column ${selected ? 'is-selected' : ''}" data-calendar-column="${key}">${slots}</div>`;
    }).join('');

    page.innerHTML = `<section class="calendar-view" aria-label="Недельный календарь">
      <div class="calendar-toolbar">
        <div><p class="calendar-kicker">Неделя</p><h2>${esc(weekLabel(start))}</h2></div>
        <div class="calendar-toolbar__actions">
          <button class="btn calendar-nav" type="button" data-calendar-prev aria-label="Предыдущая неделя">‹</button>
          <button class="btn" type="button" data-calendar-today>Сегодня</button>
          <button class="btn calendar-nav" type="button" data-calendar-next aria-label="Следующая неделя">›</button>
          <button class="btn primary" type="button" data-calendar-new>Новое событие</button>
        </div>
      </div>
      <div class="calendar-week-strip">${dayHeaders}</div>
      <div class="calendar-scroll" id="calendarScroll">
        <div class="calendar-schedule"><div class="calendar-time-column" aria-hidden="true">${timeLabels}</div>${columns}</div>
      </div>
      <p class="calendar-hint">Нажмите на время, чтобы создать событие. На компьютере можно протянуть мышью и сразу выбрать интервал.</p>
    </section>`;
    bindCalendarRangeSelection();
    requestAnimationFrame(() => {
      const scroller = document.getElementById('calendarScroll');
      if (!scroller) return;
      const selectedEvents = weekEvents.filter(event => event.date === preferred);
      const firstMinutes = selectedEvents.length ? minutesFromTime(selectedEvents[0].startTime) : dayKeys.includes(localYmd(today)) ? today.getHours() * 60 + today.getMinutes() : 8 * 60;
      scroller.scrollTop = Math.max(0, (firstMinutes || 0) - 150);
    });
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

  let selection = null;
  let suppressSlotClick = false;
  function selectionSlots() {
    if (!selection) return [];
    const low = Math.min(selection.start, selection.end), high = Math.max(selection.start, selection.end);
    return [...page.querySelectorAll(`[data-calendar-column="${selection.date}"] [data-calendar-slot]`)].filter(slot => {
      const index = Math.floor((minutesFromTime(slot.dataset.time) ?? 0) / SLOT_MINUTES);
      return index >= low && index <= high;
    });
  }
  function paintSelection() { page.querySelectorAll('.is-selecting').forEach(slot => slot.classList.remove('is-selecting')); selectionSlots().forEach(slot => slot.classList.add('is-selecting')); }
  function bindCalendarRangeSelection() {
    if (!matchMedia('(pointer:fine)').matches) return;
    page.querySelectorAll('[data-calendar-slot]').forEach(slot => {
      slot.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('[data-calendar-event]')) return;
        const start = Math.floor((minutesFromTime(slot.dataset.time) ?? 0) / SLOT_MINUTES);
        selection = { date: slot.dataset.date, start, end: start };
        event.preventDefault();
        paintSelection();
      });
      slot.addEventListener('pointerenter', () => {
        if (!selection || slot.dataset.date !== selection.date) return;
        selection.end = Math.floor((minutesFromTime(slot.dataset.time) ?? 0) / SLOT_MINUTES);
        paintSelection();
      });
    });
  }
  document.addEventListener('pointerup', () => {
    if (!selection) return;
    const low = Math.min(selection.start, selection.end), high = Math.max(selection.start, selection.end);
    const value = { date: selection.date, startTime: timeFromMinutes(low * SLOT_MINUTES), endTime: timeFromMinutes(Math.min(1439, (high + 1) * SLOT_MINUTES)) };
    suppressSlotClick = true;
    setTimeout(() => { suppressSlotClick = false; }, 0);
    selection = null;
    page.querySelectorAll('.is-selecting').forEach(slot => slot.classList.remove('is-selecting'));
    openCalendarEvent({}, value);
  });

  page.addEventListener('click', event => {
    if (state.tab !== 'calendar') return;
    const calendarEventId = event.target.closest('[data-calendar-event]')?.dataset.calendarEvent;
    if (calendarEventId) { event.stopPropagation(); openCalendarEvent(allCalendarEvents().find(item => sameId(item.id, calendarEventId))); return; }
    if (event.target.closest('[data-calendar-prev]')) { state.calendarAnchor = localYmd(addDays(weekStart(parseYmd(state.calendarAnchor) || new Date()), -7)); state.calendarSelectedDate = state.calendarAnchor; render(); return; }
    if (event.target.closest('[data-calendar-next]')) { state.calendarAnchor = localYmd(addDays(weekStart(parseYmd(state.calendarAnchor) || new Date()), 7)); state.calendarSelectedDate = state.calendarAnchor; render(); return; }
    if (event.target.closest('[data-calendar-today]')) { state.calendarAnchor = localYmd(); state.calendarSelectedDate = localYmd(); render(); return; }
    if (event.target.closest('[data-calendar-new]')) { openCalendarEvent(); return; }
    const day = event.target.closest('[data-calendar-day]')?.dataset.calendarDay;
    if (day) { state.calendarSelectedDate = day; render(); return; }
    const slot = event.target.closest('[data-calendar-slot]');
    if (slot) {
      if (suppressSlotClick) { suppressSlotClick = false; return; }
      const start = minutesFromTime(slot.dataset.time) ?? 0;
      openCalendarEvent({}, { date: slot.dataset.date, startTime: timeFromMinutes(start), endTime: timeFromMinutes(Math.min(1439, start + 60)) });
    }
  });

  page.addEventListener('keydown', event => {
    if (event.target.closest?.('[data-calendar-event]')) return;
    const slot = event.target.closest?.('[data-calendar-slot]');
    if (state.tab === 'calendar' && slot && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const start = minutesFromTime(slot.dataset.time) ?? 0;
      openCalendarEvent({}, { date: slot.dataset.date, startTime: timeFromMinutes(start), endTime: timeFromMinutes(Math.min(1439, start + 60)) });
    }
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
