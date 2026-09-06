(() => {
  'use strict';

  const setLabel = button => {
    if (!(button instanceof HTMLElement)) return;
    button.textContent = 'Приоритет';
    button.setAttribute('aria-label', 'Приоритет');
  };

  const apply = root => {
    if (root?.matches?.('[data-set-priority]')) setLabel(root);
    root?.querySelectorAll?.('[data-set-priority]').forEach(setLabel);
  };

  apply(document);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node instanceof HTMLElement) apply(node);
  }))).observe(document.body, { childList: true, subtree: true });
})();
