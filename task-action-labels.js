(() => {
  'use strict';

  function normalizePriorityLabel(root = document) {
    if (root.matches?.('[data-set-priority]')) {
      root.textContent = 'Приоритет';
      root.setAttribute('aria-label', 'Приоритет');
    }
    root.querySelectorAll?.('[data-set-priority]').forEach(button => {
      button.textContent = 'Приоритет';
      button.setAttribute('aria-label', 'Приоритет');
    });
  }

  normalizePriorityLabel(document);

  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof HTMLElement) normalizePriorityLabel(node);
    }));
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
