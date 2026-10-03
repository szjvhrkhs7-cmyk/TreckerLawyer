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

  activateTasksHome();
})();
