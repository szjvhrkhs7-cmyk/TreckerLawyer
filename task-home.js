(() => {
  'use strict';

  const originalSwitchTab = typeof switchTab === 'function' ? switchTab : null;

  function activateTasksHome() {
    document.querySelector('[data-tab="today"]')?.remove();

    if (typeof state !== 'undefined') {
      state = {
        ...state,
        tab: 'tasks',
        query: '',
        projectId: null,
        filter: state.filter || 'active',
        showCompleted: Boolean(state.showCompleted)
      };
    }

    if (originalSwitchTab) {
      switchTab = tab => originalSwitchTab(tab === 'today' ? 'tasks' : tab);
      globalThis.switchTab = switchTab;
    }

    document.querySelectorAll('#tabs .tab').forEach(tab => {
      const active = tab.dataset.tab === 'tasks';
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    if (typeof render === 'function') render();
  }

  function allTaskRecords() {
    if (typeof load !== 'function' || typeof normTask !== 'function' || typeof LS === 'undefined') return [];
    return [
      ...load(LS.tasks),
      ...load(LS.projectTasks)
    ].filter(task => typeof valid !== 'function' || valid(task)).map(normTask);
  }

  function taskById(id) {
    return allTaskRecords().find(task => typeof sameId === 'function' ? sameId(task.id, id) : String(task.id) === String(id));
  }

  function detailBlock(label, text, modifier) {
    const block = document.createElement('span');
    block.className = `workspace-task-detail-block workspace-task-detail-block--${modifier}`;

    const heading = document.createElement('span');
    heading.className = 'workspace-task-detail-label';
    heading.textContent = label;

    const body = document.createElement('span');
    body.className = 'workspace-task-detail-text';
    body.textContent = text;

    block.append(heading, body);
    return block;
  }

  function enhanceTaskRow(row) {
    if (!(row instanceof HTMLElement) || row.dataset.taskHomeEnhanced === '1') return;

    const task = taskById(row.dataset.sortId);
    const main = row.querySelector('.workspace-task-main');
    if (!task || !main) return;

    row.dataset.taskHomeEnhanced = '1';
    main.querySelectorAll('.workspace-task-description').forEach(node => node.remove());

    const extra = String(task.extra || '').trim();
    const notes = typeof stripHtml === 'function' ? stripHtml(task.notes || '').trim() : String(task.notes || '').trim();
    if (!extra && !notes) return;

    const details = document.createElement('span');
    details.className = 'workspace-task-details';
    if (extra) details.append(detailBlock('Что требуется', extra, 'extra'));
    if (notes) details.append(detailBlock('Заметки', notes, 'notes'));
    main.append(details);
  }

  function enhanceTaskPage(root = document) {
    root.querySelectorAll?.('.workspace-task-row').forEach(enhanceTaskRow);
    if (root.matches?.('.workspace-task-row')) enhanceTaskRow(root);

    const page = document.querySelector('.workspace-tasks-page');
    const eyebrow = page?.querySelector('.workspace-page-eyebrow');
    if (eyebrow) eyebrow.textContent = 'Главный экран';
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement) enhanceTaskPage(node);
      }
    }
    enhanceTaskPage(document);
  });

  activateTasksHome();
  enhanceTaskPage(document);
  observer.observe(document.getElementById('page') || document.body, { childList: true, subtree: true });
})();
