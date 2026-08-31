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

  loadScript('sync-core.js?v=20260831-qwen-merge')
    .then(() => loadScript('qwen-enhancements.js?v=20260831-qwen-merge'))
    .then(() => loadScript('dashboard-stats.js?v=20260831-blue-sidebar-stats'))
    .catch(error => console.error('Tracker module loading failed', error));
})();
