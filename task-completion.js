(() => {
  'use strict';

  const COMPLETE_LABEL = 'Выполнить';
  const COMPLETED_SECTION_LABEL = 'Завершено';

  function taskTitleForButton(button) {
    const rowTitle = button.closest('.workspace-task-row')?.querySelector('.workspace-task-main strong')?.textContent?.trim();
    if (rowTitle) return rowTitle;
    const detailTitle = state?.editingTask?.title?.trim?.();
    return detailTitle || 'задачу';
  }

  function enhanceCompleteButton(button) {
    if (!(button instanceof HTMLElement)) return;
    button.textContent = COMPLETE_LABEL;
    button.classList.add('workspace-complete-action');
    button.setAttribute('aria-label', `Выполнить задачу «${taskTitleForButton(button)}»`);
  }

  function enhanceCompletedToggle(toggle) {
    if (!(toggle instanceof HTMLElement)) return;
    const count = toggle.textContent.match(/\((\d+)\)/)?.[1] || '0';
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.textContent = `${expanded ? '▴' : '▾'} ${COMPLETED_SECTION_LABEL} (${count})`;
  }

  function enhanceTaskCompletionUi(root = document) {
    if (root.matches?.('[data-done-task], [data-task-detail-done]')) enhanceCompleteButton(root);
    root.querySelectorAll?.('[data-done-task], [data-task-detail-done]').forEach(enhanceCompleteButton);

    if (root.matches?.('#toggleCompleted')) enhanceCompletedToggle(root);
    root.querySelectorAll?.('#toggleCompleted').forEach(enhanceCompletedToggle);
  }

  // Open the completed section before the existing completion handler re-renders the page.
  // The actual status update remains in the established task logic, so root and project
  // tasks keep the same persistence and cloud-sync path.
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-done-task], [data-task-detail-done]');
    if (!action) return;
    if (typeof state !== 'undefined') state.showCompleted = true;
  }, true);

  const pageObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof HTMLElement) enhanceTaskCompletionUi(node);
    }));
  });
  pageObserver.observe(page, { childList: true, subtree: true });

  const taskFormObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof HTMLElement) enhanceTaskCompletionUi(node);
    }));
  });
  taskFormObserver.observe(taskForm, { childList: true, subtree: true });

  enhanceTaskCompletionUi(page);
  enhanceTaskCompletionUi(taskForm);
})();
