(() => {
  'use strict';

  const STORAGE_KEY = 'lawyerSidebarCollapsed';
  const button = document.getElementById('sidebarCollapse');
  if (!button) return;

  const readPreference = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  };

  const persistPreference = collapsed => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // Local storage may be unavailable in a restricted browser context.
    }
  };

  const apply = (collapsed, { persist = false } = {}) => {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    button.setAttribute('aria-pressed', String(collapsed));
    const label = collapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель';
    button.setAttribute('aria-label', label);
    button.title = label;
    if (persist) persistPreference(collapsed);
  };

  apply(readPreference());

  button.addEventListener('click', () => {
    apply(!document.body.classList.contains('sidebar-collapsed'), { persist: true });
  });

  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    apply(event.newValue === '1');
  });
})();
