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

  loadScript('drag-sortable-fix.js?v=20260831-drag-cancel-recovery')
    .catch(error => console.error('Drag recovery module loading failed', error));

  loadScript('project-lifecycle.js?v=20260831-project-completion')
    .catch(error => console.error('Project lifecycle module loading failed', error));

  loadScript('sync-recovery.js?v=20260831-sync-repair-1')
    .then(() => window.lawyerCloudRecoveryReady || Promise.resolve())
    .then(() => loadScript('sync-diagnostic.js?v=20260831-sync-diagnostic-1'))
    .then(() => loadScript('sync-core.js?v=20260831-sync-diagnostic-1'))
    .then(() => loadScript('qwen-enhancements.js?v=20260831-qwen-merge'))
    .then(() => loadScript('dashboard-stats.js?v=20260831-project-completion'))
    .catch(error => console.error('Tracker module loading failed', error));
})();
