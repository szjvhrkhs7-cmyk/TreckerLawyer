(() => {
  'use strict';

  let scheduled = false;

  function summary() {
    const source = load(LS.tasks).filter(valid).map(normTask);
    return {
      active: source.filter(task => task.status !== 'done').length,
      inwork: source.filter(task => task.status === 'inwork').length,
      overdue: source.filter(task => overdue(task)).length,
      done: source.filter(task => task.status === 'done').length
    };
  }

  function card(label, value, tone, caption) {
    return `<article class="executive-stat executive-stat--${tone}">
      <div class="executive-stat__top"><span class="executive-stat__label">${label}</span><span class="executive-stat__mark" aria-hidden="true"></span></div>
      <strong class="executive-stat__value">${value}</strong>
      <span class="executive-stat__caption">${caption}</span>
    </article>`;
  }

  function ensureStats() {
    scheduled = false;
    const page = document.getElementById('page');
    if (!page) return;

    const shouldShow = typeof state !== 'undefined' && state.tab === 'tasks' && !state.projectId;
    const existing = page.querySelector('.executive-stats');
    if (!shouldShow) {
      existing?.remove();
      return;
    }

    const heading = page.querySelector('.view-heading');
    if (!heading) return;

    const data = summary();
    const signature = `${data.active}|${data.inwork}|${data.overdue}|${data.done}`;
    if (existing?.dataset.signature === signature) return;

    const html = [
      card('Активные задачи', data.active, 'blue', 'Текущая нагрузка'),
      card('В работе', data.inwork, 'indigo', 'Задачи в исполнении'),
      card('Просрочено', data.overdue, 'red', data.overdue ? 'Требуют внимания' : 'Всё под контролем'),
      card('Завершено', data.done, 'green', 'За всё время')
    ].join('');

    if (existing) {
      existing.dataset.signature = signature;
      existing.innerHTML = html;
      return;
    }

    const container = document.createElement('section');
    container.className = 'executive-stats';
    container.dataset.signature = signature;
    container.setAttribute('aria-label', 'Статистика задач');
    container.innerHTML = html;
    heading.insertAdjacentElement('afterend', container);
  }

  function scheduleStats() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(ensureStats);
  }

  const page = document.getElementById('page');
  if (page) {
    new MutationObserver(scheduleStats).observe(page, { childList: true, subtree: true });
  }

  scheduleStats();
})();
