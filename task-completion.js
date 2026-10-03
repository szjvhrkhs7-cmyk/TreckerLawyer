(() => {
  'use strict';

  const COMPLETE_LABEL = 'Выполнить';
  const COMPLETED_SECTION_LABEL = 'Завершено';

  function completionUndo(key, previous, completed) {
    let toast = document.getElementById('workspaceToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'workspaceToast';
      toast.className = 'workspace-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.append(toast);
    }
    const message = document.createElement('span');
    message.textContent = 'Задача выполнена';
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = 'Отменить';
    undo.setAttribute('aria-label', `Отменить выполнение задачи «${previous.title || ''}»`);
    toast.replaceChildren(message, undo);
    toast.classList.add('show');
    clearTimeout(toast.hideTimer);
    toast.hideTimer = setTimeout(() => toast.classList.remove('show'), 8000);
    undo.onclick = () => {
      const items = load(key);
      const index = items.findIndex(item => sameId(item.id, previous.id));
      const current = items[index];
      // Undo only this completion; never overwrite a later edit or cloud update.
      if (!current || normalStatus(current.status) !== 'done' || current.updatedAt !== completed.updatedAt) {
        toast.textContent = 'Задача уже изменена. Откройте ее, чтобы проверить статус.';
      } else {
        const restored = { ...current, status: normalStatus(previous.status), updatedAt: now() };
        if (previous.completedAt) restored.completedAt = previous.completedAt;
        else delete restored.completedAt;
        items[index] = restored;
        save(key, items);
        render();
        [...page.querySelectorAll('[data-edit-task]')].find(button => sameId(button.dataset.editTask, previous.id))?.focus({ preventScroll: true });
        toast.textContent = 'Выполнение отменено';
      }
      clearTimeout(toast.hideTimer);
      toast.hideTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    };
  }

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
    const task = action.hasAttribute('data-done-task') ? tasks().find(item => sameId(item.id, action.dataset.doneTask)) : state.editingTask;
    const id = task?.id;
    const key = task?.projectId ? LS.projectTasks : LS.tasks;
    const previous = load(key).find(item => sameId(item.id, id));
    if (!previous || normalStatus(previous.status) === 'done') return;
    // A trusted pointer event can flush microtasks between capture and bubble
    // listeners. Wait until the existing completion handler has finished.
    setTimeout(() => {
      const completed = load(key).find(item => sameId(item.id, id));
      if (completed && normalStatus(completed.status) === 'done') completionUndo(key, previous, completed);
    }, 0);
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
