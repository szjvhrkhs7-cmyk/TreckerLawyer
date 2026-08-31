(() => {
  'use strict';

  const isProjectDone = project => project?.status === 'done' || Boolean(project?.completedAt);

  function projectCard(project, projectTasks, completed = false) {
    const id = esc(String(project.id));
    const sub = projectTasks.filter(task => sameId(task.projectId, project.id));
    const doneCount = sub.filter(task => task.status === 'done').length;
    const progress = sub.length ? Math.round(doneCount / sub.length * 100) : 0;
    const important = sub.some(task => task.status !== 'done' && urgent(task));
    const completedLabel = project.completedAt ? new Date(project.completedAt).toLocaleDateString('ru-RU') : '';

    return `<article class="card project-card" data-sort-id="${id}">
      ${completed ? '' : dragHandle(`проект ${project.title}`)}
      <h3 data-open-project="${id}"><svg class="icon" aria-hidden="true"><use href="#i-folder"></use></svg>${esc(project.title)}</h3>
      ${project.description ? `<p class="extra">${esc(project.description)}</p>` : ''}
      ${completed ? '<div class="badges"><span class="badge status-done">Завершён</span></div>' : important ? '<div class="badges"><span class="badge status-urgent">Есть важные / срочные задачи</span></div>' : ''}
      <p class="meta">Задач: ${sub.length} · выполнено: ${doneCount}${completedLabel ? ` · завершён ${completedLabel}` : ` · ${progress}%`}</p>
      <div class="progress" role="progressbar" aria-label="Выполнение проекта" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completed ? 100 : progress}"><span style="width:${completed ? 100 : progress}%"></span></div>
      <div class="buttons">
        <button type="button" class="btn" data-open-project="${id}">Открыть</button>
        <button type="button" class="btn" data-edit-project="${id}">Изменить</button>
        ${completed ? '' : `<button type="button" class="btn ok" data-complete-project="${id}">Готово</button>`}
        <button type="button" class="btn danger" data-del-project="${id}">Удалить</button>
      </div>
    </article>`;
  }

  function enhancedRenderProjects() {
    const projectTasks = load(LS.projectTasks).filter(valid).map(normTask);
    page.innerHTML = `<div class="view-heading"><h2>Проекты</h2><span class="rule"></span></div>
      <div class="search-wrap"><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg><input class="search" id="projectSearch" type="search" autocomplete="off" placeholder="Поиск проектов" value="${esc(state.query)}" aria-label="Поиск проектов"></div>
      <div class="list" id="projectsList"></div>
      <section class="completed-section"><button type="button" class="completed-link" id="toggleCompletedProjects" aria-expanded="${Boolean(state.showCompletedProjects)}"></button><div id="completedProjects"></div></section>`;

    const input = $('#projectSearch');
    const activeList = $('#projectsList');
    const completedList = $('#completedProjects');
    const toggle = $('#toggleCompletedProjects');

    function draw() {
      state.query = input.value;
      const query = state.query.toLocaleLowerCase('ru');
      const matching = allProjects().filter(project => !query || JSON.stringify(project).toLocaleLowerCase('ru').includes(query));
      const active = orderedFor('project', matching.filter(project => !isProjectDone(project)));
      const completed = orderedFor('project', matching.filter(isProjectDone));

      activeList.innerHTML = active.map(project => projectCard(project, projectTasks, false)).join('') || '<div class="empty"><svg class="icon" aria-hidden="true"><use href="#i-folder"></use></svg>Активных проектов нет</div>';
      toggle.textContent = `${state.showCompletedProjects ? '▴' : '▾'} Завершённые проекты (${completed.length})`;
      toggle.setAttribute('aria-expanded', String(Boolean(state.showCompletedProjects)));
      completedList.innerHTML = state.showCompletedProjects ? completed.map(project => projectCard(project, projectTasks, true)).join('') : '';
      bindSortable(activeList, 'project');
    }

    input.oninput = draw;
    draw();
  }

  function enhancedRenderNotes() {
    page.innerHTML = `<div class="view-heading"><h2>Заметки</h2><span class="rule"></span></div><div class="search-wrap"><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg><input class="search" id="noteSearch" type="search" autocomplete="off" placeholder="Поиск заметок" value="${esc(state.query)}" aria-label="Поиск заметок"></div><div class="list" id="notesList"></div>`;
    const input = $('#noteSearch');
    const list = $('#notesList');

    function draw() {
      state.query = input.value;
      const query = state.query.toLocaleLowerCase('ru');
      const notes = orderedFor('note', allNotes().filter(note => !query || `${note.title || ''} ${stripHtml(note.body || '')}`.toLocaleLowerCase('ru').includes(query)));
      list.innerHTML = notes.map(note => {
        const id = esc(String(note.id));
        const preview = cleanNotePreview(note.body).slice(0, 700);
        return `<div class="swipe-row" data-note-row="${id}" data-sort-id="${id}">
          <div class="swipe-action"><button type="button" class="swipe-delete" data-delete-note="${id}" aria-label="Удалить заметку">Удалить</button></div>
          <article class="card note-card" data-open-note="${id}" tabindex="0" role="button" aria-label="Открыть заметку ${esc(note.title || 'Без заголовка')}">
            ${dragHandle(`заметку ${note.title || 'Без заголовка'}`)}
            <h3>${esc(note.title || 'Без заголовка')}</h3>
            <p class="extra note-preview">${esc(preview) || 'Пустая заметка'}</p>
            <div class="buttons"><button type="button" class="btn danger" data-delete-note="${id}">Удалить</button></div>
          </article>
        </div>`;
      }).join('') || '<div class="empty"><svg class="icon" aria-hidden="true"><use href="#i-note"></use></svg>Заметки не найдены</div>';
      bindNoteSwipe();
      bindSortable(list, 'note');
    }

    input.oninput = draw;
    draw();
  }

  function completeProject(projectId) {
    const projects = allProjects();
    const project = projects.find(item => sameId(item.id, projectId));
    if (!project || isProjectDone(project)) return;

    const completedAt = now();
    project.status = 'done';
    project.completedAt = completedAt;
    project.updatedAt = completedAt;
    save(LS.projects, projects);

    const projectTasks = load(LS.projectTasks).filter(valid).map(task => {
      if (!sameId(task.projectId, projectId)) return task;
      return {
        ...task,
        status: 'done',
        completedAt: task.completedAt || completedAt,
        updatedAt: completedAt
      };
    });
    save(LS.projectTasks, projectTasks);
    render();
  }

  const originalRenderProjects = renderProjects;
  const originalRenderNotes = renderNotes;
  renderProjects = enhancedRenderProjects;
  renderNotes = enhancedRenderNotes;
  globalThis.renderProjects = enhancedRenderProjects;
  globalThis.renderNotes = enhancedRenderNotes;

  page.addEventListener('click', event => {
    const completeButton = event.target.closest('[data-complete-project]');
    if (completeButton) {
      event.preventDefault();
      event.stopPropagation();
      const projectId = completeButton.dataset.completeProject;
      const project = allProjects().find(item => sameId(item.id, projectId));
      if (!project) return;
      const taskCount = load(LS.projectTasks).filter(task => valid(task) && sameId(task.projectId, projectId)).length;
      askConfirm(`Проект «${project.title}» будет завершён. Все ${taskCount} задач внутри проекта будут отмечены как завершённые.`, () => completeProject(projectId));
      return;
    }

    if (event.target.id === 'toggleCompletedProjects') {
      event.preventDefault();
      state.showCompletedProjects = !state.showCompletedProjects;
      enhancedRenderProjects();
    }
  });

  if (typeof render === 'function') render();
})();
