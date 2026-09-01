(() => {
  'use strict';

  const RESTORED_STATUS = 'new';

  function findStoredTask(id) {
    for (const key of [LS.tasks, LS.projectTasks]) {
      const items = load(key);
      const index = items.findIndex(item => valid(item) && sameId(item.id, id));
      if (index >= 0) return { key, items, index, task: normTask(items[index]) };
    }
    return null;
  }

  function reopenParentProject(task) {
    if (!task?.projectId) return;
    const projects = load(LS.projects);
    const index = projects.findIndex(project => valid(project) && sameId(project.id, task.projectId));
    if (index < 0) return;
    const project = projects[index];
    if (project.status !== 'done' && !project.completedAt) return;
    const reopened = { ...project, status: 'active', updatedAt: now() };
    delete reopened.completedAt;
    projects[index] = reopened;
    save(LS.projects, projects);
  }

  function restoreTask(id) {
    const stored = findStoredTask(id);
    if (!stored || stored.task.status !== 'done') return false;
    const restored = { ...stored.items[stored.index], status: RESTORED_STATUS, updatedAt: now() };
    delete restored.completedAt;
    stored.items[stored.index] = restored;
    save(stored.key, stored.items);
    reopenParentProject(stored.task);
    return true;
  }

  function showRestoreToast() {
    let toast = document.getElementById('workspaceToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'workspaceToast';
      toast.className = 'workspace-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.append(toast);
    }
    toast.textContent = 'Задача возвращена в работу';
    toast.classList.add('show');
    clearTimeout(showRestoreToast.timer);
    showRestoreToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function enhanceCompletedRows(root = page) {
    root?.querySelectorAll?.('.workspace-task-row.is-done[data-sort-id]').forEach(row => {
      const id = row.dataset.sortId;
      const actions = row.querySelector('.workspace-row-actions');
      if (!actions || actions.querySelector('[data-restore-task]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn workspace-restore-inline';
      button.dataset.restoreTask = id;
      button.textContent = 'Вернуть';
      button.setAttribute('aria-label', 'Вернуть задачу в работу');
      actions.prepend(button);
    });
  }

  function enhanceTaskDetail() {
    const task = state.editingTask?.id ? normTask(state.editingTask) : null;
    if (!task || task.status !== 'done') return;
    const actions = taskForm.querySelector('.task-detail__actions');
    if (!actions || actions.querySelector('[data-restore-task]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn primary workspace-restore-detail';
    button.dataset.restoreTask = String(task.id);
    button.textContent = 'Вернуть в работу';
    actions.prepend(button);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-restore-task]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const id = button.dataset.restoreTask;
    if (!restoreTask(id)) return;
    if (taskSheet.contains(button)) hideOverlay(taskSheet);
    render();
    showRestoreToast();
  }, true);

  const pageObserver = new MutationObserver(() => enhanceCompletedRows());
  pageObserver.observe(page, { childList: true, subtree: true });

  const taskObserver = new MutationObserver(() => enhanceTaskDetail());
  taskObserver.observe(taskForm, { childList: true, subtree: true });

  enhanceCompletedRows();
  enhanceTaskDetail();
})();
