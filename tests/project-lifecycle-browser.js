(() => {
  'use strict';

  const projectId = 'ci-project-1';
  const now = new Date().toISOString();
  localStorage.setItem('lawyerProjects', JSON.stringify([
    { id: projectId, title: 'CI проект', description: 'Проверка завершения проекта', createdAt: now, updatedAt: now }
  ]));
  localStorage.setItem('lawyerProjectTasks', JSON.stringify([
    { id: 'ci-project-task-1', projectId, title: 'Задача проекта 1', status: 'new', priority: 'normal', createdAt: now, updatedAt: now },
    { id: 'ci-project-task-2', projectId, title: 'Задача проекта 2', status: 'inwork', priority: 'normal', createdAt: now, updatedAt: now }
  ]));
  localStorage.setItem('lawyerTasks', '[]');
  localStorage.setItem('lawyerNotes', JSON.stringify([
    { id: 'ci-note-1', title: 'CI заметка', body: 'Тест удаления', createdAt: now, updatedAt: now }
  ]));

  function fail(message) {
    const result = document.createElement('div');
    result.id = 'project-lifecycle-test-result';
    result.textContent = `FAIL: ${message}`;
    document.body.append(result);
  }

  function pass() {
    const result = document.createElement('div');
    result.id = 'project-lifecycle-test-result';
    result.textContent = 'PROJECT_LIFECYCLE_PASS';
    document.body.append(result);
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        document.querySelector('[data-tab="projects"]')?.click();
        const complete = document.querySelector(`[data-complete-project="${projectId}"]`);
        if (!complete) return fail('нет кнопки завершения проекта');
        if (!document.querySelector(`[data-del-project="${projectId}"]`)) return fail('нет кнопки удаления проекта');

        complete.click();
        document.getElementById('confirmAccept')?.click();

        setTimeout(() => {
          try {
            const projects = JSON.parse(localStorage.getItem('lawyerProjects') || '[]');
            const tasks = JSON.parse(localStorage.getItem('lawyerProjectTasks') || '[]');
            if (projects[0]?.status !== 'done') return fail('проект не получил статус done');
            if (!projects[0]?.completedAt) return fail('у проекта нет completedAt');
            if (tasks.length !== 2 || tasks.some(task => task.status !== 'done')) return fail('не все задачи проекта завершены');

            const toggle = document.getElementById('toggleCompletedProjects');
            if (!toggle || !toggle.textContent.includes('(1)')) return fail('проект не попал в завершённые');
            toggle.click();
            if (!document.getElementById('completedProjects')?.textContent.includes('CI проект')) return fail('завершённый проект не отображается');

            document.querySelector('[data-tab="notes"]')?.click();
            if (!document.querySelector('[data-delete-note="ci-note-1"]')) return fail('нет явной кнопки удаления заметки');
            if (!document.querySelector('.workspace-notes-page')) return fail('новый экран заметок не активен');

            document.querySelector('[data-tab="tasks"]')?.click();
            setTimeout(() => {
              if (!document.querySelector('.workspace-tasks-page')) return fail('новый экран задач не активен');
              if (document.querySelectorAll('.workspace-summary-item').length !== 3) return fail('сводка задач не отрисована');
              pass();
            }, 120);
          } catch (error) {
            fail(error?.message || String(error));
          }
        }, 100);
      } catch (error) {
        fail(error?.message || String(error));
      }
    }, 200);
  });
})();