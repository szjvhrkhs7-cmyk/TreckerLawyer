(() => {
  'use strict';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
      document.head.append(script);
    });
  }

  async function loadCloudCoreWithoutCalendar() {
    const calendarKey = LS.calendarEvents;
    LS.calendarEvents = `${calendarKey}__cloud-disabled`;
    try {
      await loadScript('sync-core.js?v=20260831-sync-calendar-compat-2');
    } finally {
      LS.calendarEvents = calendarKey;
    }
  }

  // Local UX enhancements must remain available even when the cloud is offline.
  loadScript('drag-sortable-fix.js?v=20260831-drag-cancel-recovery')
    .catch(error => console.error('Drag recovery module loading failed', error));

  loadScript('project-lifecycle.js?v=20260901-workspace-final')
    .then(() => loadScript('workspace-pages.js?v=20260901-workspace-final'))
    .then(() => loadScript('workspace-task-restore.js?v=20260901-mobile-fix'))
    .catch(error => console.error('Workspace page modules loading failed', error));

  loadScript('qwen-enhancements.js?v=20260901-workspace-final')
    .catch(error => console.error('Local enhancement module loading failed', error));

  // Cloud modules are isolated so a network or Supabase failure cannot disable local UI modules.
  loadScript('sync-recovery.js?v=20260831-sync-repair-1')
    .then(() => window.lawyerCloudRecoveryReady || Promise.resolve())
    .then(() => loadScript('sync-diagnostic.js?v=20260831-sync-diagnostic-1'))
    .then(() => loadCloudCoreWithoutCalendar())
    .then(() => loadScript('calendar-cloud-bridge.js?v=20260831-calendar-cloud-1'))
    .catch(error => console.error('Cloud sync module loading failed', error));
})();