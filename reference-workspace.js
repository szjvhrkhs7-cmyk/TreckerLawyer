(() => {
  'use strict';

  const baseRenderTasks = renderTasks;
  const baseOpenProject = openProject;
  const baseOpenTask = openTask;
  const titles = { today: 'Сегодня', tasks: 'Задачи', projects: 'Дела', priorities: 'Приоритеты' };
  let draftTimer, pendingDraft = null, toastTimer, fileProjectId = null;
  let casePanel = 'draft';
  let selectionRange = null;
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const doneProject = project => project.status === 'done' || Boolean(project.completedAt);
  const projectTasks = id => load(LS.projectTasks).filter(valid).map(normTask).filter(task => sameId(task.projectId,id));
  const entries = () => [...load(LS.tasks).filter(valid).map(task => ({task:normTask(task), key:LS.tasks})), ...load(LS.projectTasks).filter(valid).map(task => ({task:normTask(task), key:LS.projectTasks}))];
  const taskById = (id, key) => entries().find(entry => sameId(entry.task.id,id) && (!key || entry.key === key));
  const humanTime = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';

  function toast(message) {
    const element = document.getElementById('referenceToast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('show'), 3200);
  }
  function updateProject(id, patch) {
    const items = allProjects(), index = items.findIndex(project => sameId(project.id,id));
    if(index < 0) return false;
    items[index] = {...items[index],...patch,updatedAt:now()};
    return save(LS.projects,items) !== false;
  }
  function flushDraft() {
    clearTimeout(draftTimer);
    if(!pendingDraft) return true;
    const current = pendingDraft;
    const saved = updateProject(current.id,{draftHtml:sanitizeNoteHtml(current.html)});
    if(saved) pendingDraft = null;
    const label = document.getElementById('draftSaveStatus');
    if(label) label.textContent = saved ? `Сохранено ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}` : 'Не удалось сохранить';
    return saved;
  }
  function pageHeader(title, subtitle, action = 'task') {
    const button = action === 'project' ? `<button class="btn primary" data-ref-new-project type="button">${icon('plus')}Новое дело</button>` : action === 'event' ? `<button class="btn primary" data-ref-new-event type="button">${icon('plus')}Событие</button>` : `<button class="btn primary" data-ref-new-task type="button">${icon('plus')}Задача</button>`;
    return `<header class="ref-header"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><div class="ref-header-actions"><button class="ref-icon-button" type="button" data-ref-sync aria-label="Синхронизация и учетная запись" title="Синхронизация">${icon('cloud')}</button>${button}</div></header>`;
  }
  function due(task) {
    if(!task.dueDate) return 'Без срока';
    if(overdue(task)) return `Просрочено · ${fmtDate(task.dueDate)}`;
    if(task.dueDate === localDay()) return 'Сегодня';
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    return task.dueDate === localDay(tomorrow) ? 'Завтра' : fmtDate(task.dueDate);
  }
  function taskRow(entry) {
    const task = entry.task, isDone = task.status === 'done';
    const project = allProjects().find(item => sameId(item.id,task.projectId));
    return `<article class="ref-row ${isDone?'is-done':''}"><button class="ref-check" type="button" data-ref-toggle-task="${esc(task.id)}" data-key="${entry.key}" aria-label="${isDone?'Возобновить':'Завершить'} задачу ${esc(task.title)}">${isDone?icon('check'):''}</button><button class="ref-row-main" type="button" data-ref-task="${esc(task.id)}" data-key="${entry.key}"><strong>${esc(task.title)}</strong><small>${esc((state.projectId?null:project?.title) || task.extra || statusText[task.status])}</small><span class="ref-due ${overdue(task)?'is-danger':''}">${icon('calendar')}${esc(due(task))}</span></button>${icon('arrow-right')}</article>`;
  }
  function projectRow(project) {
    const sub = projectTasks(project.id), active = sub.filter(task=>task.status!=='done'), next = active.sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'))[0];
    return `<button class="ref-row" type="button" data-ref-case="${esc(project.id)}"><span class="ref-case-icon">${icon('folder')}</span><span class="ref-row-main"><strong>${esc(project.title)}</strong><small>${next?`Следующий шаг: ${esc(next.title)}`:`${active.length} активных задач`}</small></span>${icon('arrow-right')}</button>`;
  }
  function renderToday() {
    const active = entries().filter(entry=>entry.task.status!=='done').sort((a,b)=>Number(overdue(b.task))-Number(overdue(a.task))||Number(b.task.priority==='high')-Number(a.task.priority==='high')||(a.task.dueDate||'9999').localeCompare(b.task.dueDate||'9999'));
    const attention = active.filter(entry=>overdue(entry.task)||entry.task.dueDate===localDay()||entry.task.priority==='high').slice(0,4);
    const focus = attention.length ? attention : active.filter(entry=>entry.task.status!=='waiting').slice(0,3);
    page.innerHTML = `<div class="ref-body ref-today-body"><div class="ref-grid"><section class="ref-panel"><div class="ref-panel-heading"><h3>Требует внимания <span class="ref-count">${focus.length}</span></h3><button type="button" data-ref-tab="tasks">Все задачи →</button></div>${focus.map(taskRow).join('')||'<div class="ref-empty"><strong>Все под контролем</strong>Добавьте задачу или создайте новое дело.</div>'}</section><section class="ref-panel"><div class="ref-panel-heading"><h3>Ожидают ответа</h3></div>${active.filter(entry=>entry.task.status==='waiting').slice(0,3).map(taskRow).join('')||'<div class="ref-empty">Нет задач в ожидании</div>'}</section></div><div class="ref-priority-link"><button class="btn" type="button" data-ref-tab="priorities">${icon('flag')}План приоритетов на неделю</button></div></div>`;
  }
  function renderCases() {
    page.innerHTML = pageHeader('Мои дела','Запросы, задачи и материалы в одном месте','project') + `<div class="ref-body"><div class="search-wrap ref-project-search">${icon('search')}<input class="search" id="caseSearch" type="search" aria-label="Поиск по делам" placeholder="Найти дело" value="${esc(state.query)}"></div><div class="filters"><button class="chip ${!state.showCompletedProjects?'active':''}" data-ref-cases-filter="active" type="button">В работе</button><button class="chip ${state.showCompletedProjects?'active':''}" data-ref-cases-filter="done" type="button">Завершенные</button></div><div class="ref-case-list" id="refCaseList"></div></div>`;
    const input = document.getElementById('caseSearch');
    const draw = () => {
      state.query = input.value;
      const q = input.value.trim().toLocaleLowerCase('ru');
      const cases = orderedFor('project',allProjects().filter(project=>doneProject(project)===Boolean(state.showCompletedProjects)&&(!q||`${project.title} ${project.description}`.toLocaleLowerCase('ru').includes(q))));
      document.getElementById('refCaseList').innerHTML = cases.map(project=>{
        const items = projectTasks(project.id), completed = items.filter(task=>task.status==='done').length;
        return `<article class="ref-case-card"><span class="ref-case-icon">${icon('folder')}</span><button class="ref-case-main" type="button" data-ref-case="${esc(project.id)}"><strong>${esc(project.title)}</strong><span>${esc(project.description||'Описание пока не добавлено')}</span><small>${items.length-completed} активных · ${completed}/${items.length} выполнено</small></button><span class="ref-case-status ${doneProject(project)?'is-done':''}">${doneProject(project)?'Завершено':'В работе'}</span><div class="ref-case-actions"><button class="ref-icon-button" type="button" data-ref-edit-case="${esc(project.id)}" aria-label="Изменить дело ${esc(project.title)}">${icon('edit')}</button><button class="ref-icon-button" type="button" data-ref-delete-case="${esc(project.id)}" aria-label="Удалить дело ${esc(project.title)}">${icon('close')}</button></div></article>`;
      }).join('')||`<div class="ref-empty"><strong>${q?'Дело не найдено':state.showCompletedProjects?'Завершенных дел пока нет':'Создайте первое дело'}</strong>${q?'Попробуйте другой запрос':'Объедините задачи, заметки и материалы по одному вопросу.'}</div>`;
    };
    input.addEventListener('input',draw);draw();
    page.querySelector('.filters').style.marginBottom='20px';
  }
  function caseFiles(project) {
    return (Array.isArray(project.attachments)?project.attachments:[]).map(file=>`<div class="ref-file"><span class="ref-file-icon ${String(file.name).toLowerCase().endsWith('.docx')?'docx':''}">${esc(String(file.name).split('.').pop().toUpperCase().slice(0,5))}</span><button class="ref-file-name" type="button" data-ref-file="${esc(file.id)}"><strong>${esc(file.name)}</strong><span>${(Number(file.size||0)/1024/1024).toFixed(1)} МБ · Скачать</span></button><button class="ref-icon-button" type="button" data-ref-delete-file="${esc(file.id)}" aria-label="Удалить файл ${esc(file.name)}">${icon('close')}</button></div>`).join('')||'<p class="ref-caption">Добавьте документы по делу</p>';
  }
  function renderCase(project) {
    const sub = projectTasks(project.id), active = sub.filter(task=>task.status!=='done'), next = [...active].sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'))[0];
    const notes = allNotes().filter(note=>sameId(note.projectId,project.id)).sort(noteSort);
    page.innerHTML = `<header class="ref-header ref-case-header"><div class="ref-breadcrumb"><button type="button" data-ref-tab="projects">${icon('arrow-left')} Дела</button><span>/</span><span>${esc(project.title)}</span><span class="ref-case-status ${doneProject(project)?'is-done':''}">${doneProject(project)?'Завершено':'В работе'}</span></div><div class="ref-case-headline"><div><h2>${esc(project.title)}</h2><p>${next?`${esc(next.title)} · ${esc(due(next))}`:'Контекст, задачи и проект заключения'}</p></div><div class="ref-header-actions"><button class="ref-icon-button" type="button" data-ref-edit-case="${esc(project.id)}" aria-label="Изменить дело">${icon('edit')}</button><button class="btn" type="button" data-ref-project-status="${esc(project.id)}">${icon('check')}${doneProject(project)?'Возобновить дело':'Завершить дело'}</button></div></div></header><nav class="ref-case-tabs" aria-label="Содержимое дела">${[['draft','Заключение'],['context','Контекст'],['helper','Помощник']].map(([id,label])=>`<button class="${casePanel===id?'active':''}" type="button" data-ref-panel="${id}" aria-pressed="${casePanel===id}">${label}</button>`).join('')}</nav><div class="ref-case-layout" data-mobile-panel="${casePanel}"><aside class="ref-context"><h3>Контекст дела</h3><span class="ref-context-label">Запрос бизнеса</span><p class="ref-description">${esc(project.description||'Добавьте описание, чтобы сохранить обстоятельства и цель работы.')}</p><button class="btn" type="button" data-ref-edit-case="${esc(project.id)}">${icon('edit')}Изменить описание</button><section class="ref-context-section"><header><h4>Материалы</h4><button class="ref-icon-button" type="button" data-ref-upload aria-label="Добавить файл">${icon('plus')}</button></header>${caseFiles(project)}<p class="ref-caption">Файлы хранятся в этом браузере. Резервная копия содержит их названия, без содержимого.</p></section><section class="ref-context-section"><header><h4>Следующие шаги</h4><button class="ref-icon-button" type="button" data-ref-new-task aria-label="Добавить задачу дела">${icon('plus')}</button></header><div class="ref-case-task-list">${sub.map(task=>taskRow({task,key:LS.projectTasks})).join('')||'<p class="ref-caption">Добавьте первый шаг по делу</p>'}</div></section><section class="ref-context-section"><header><h4>Заметки</h4><button class="ref-icon-button" type="button" data-ref-note aria-label="Добавить заметку">${icon('plus')}</button></header>${notes.slice(0,5).map(note=>`<div class="ref-case-note">${esc(stripHtml(note.body||note.content||note.title||''))}<time>${esc(humanTime(note.updatedAt||note.createdAt))}</time></div>`).join('')||'<p class="ref-caption">Встречи, уточнения и рабочие мысли</p>'}</section><div class="ref-mobile-actions"><button class="btn" type="button" data-ref-project-status="${esc(project.id)}">${doneProject(project)?'Возобновить дело':'Завершить дело'}</button></div></aside><section class="ref-editor-column"><div class="ref-editor-heading"><h3>Проект заключения</h3><span class="ref-editor-label">Черновик</span></div><div class="ref-editor-toolbar" role="toolbar" aria-label="Форматирование заключения"><button type="button" data-ref-format="bold" aria-label="Полужирный" title="Полужирный"><strong>B</strong></button><button type="button" data-ref-format="italic" aria-label="Курсив" title="Курсив"><em>I</em></button><span class="toolbar-divider"></span><button type="button" data-ref-format="insertUnorderedList" aria-label="Маркированный список" title="Маркированный список">${icon('tasks')}</button><button type="button" data-ref-format="insertOrderedList" aria-label="Нумерованный список" title="Нумерованный список">1.</button><span class="toolbar-divider"></span><button type="button" data-ref-format="undo" aria-label="Отменить изменение" title="Отменить">↶</button><button type="button" data-ref-format="redo" aria-label="Повторить изменение" title="Повторить">↷</button><button class="toolbar-export" type="button" data-ref-export-draft>Скачать текст</button></div><div class="ref-editor" id="caseDraft" role="textbox" aria-multiline="true" aria-label="Текст заключения" contenteditable="true" spellcheck="true" data-placeholder="Обстоятельства\n\nВопросы для проверки\n\nПроект ответа">${sanitizeNoteHtml(project.draftHtml||'')}</div><footer class="ref-editor-footer"><span>${icon('check')}<span id="draftSaveStatus">${project.draftHtml?'Все изменения сохранены':'Черновик сохраняется автоматически'}</span></span><button type="button" data-ref-note>${icon('note')}Добавить заметку</button></footer></section><aside class="ref-assistant"><h3><span class="ref-spark" aria-hidden="true">✦</span>Помощник</h3><div class="ref-helper-card"><h4>${icon('calendar')}Собрать хронологию</h4><p>Даты создания дела, задач и заметок из вашего рабочего пространства.</p><button class="btn" type="button" data-ref-helper="timeline">${icon('calendar')}Показать события</button></div><div class="ref-helper-card"><h4>${icon('check-square')}Проверить комплектность</h4><p>Проверка описания, вложений, следующего шага и срока задачи.</p><button class="btn" type="button" data-ref-helper="checklist">${icon('check')}Проверить дело</button></div><div class="ref-helper-card"><h4>${icon('note')}Зафиксировать следующий шаг</h4><p>Сохраните заметку и при необходимости создайте задачу после проверки.</p><button class="btn" type="button" data-ref-note>${icon('plus')}Добавить заметку</button></div><p class="ref-caption">Помощник проверяет заполнение карточки. Он не анализирует право и содержимое файлов.</p></aside></div>`;
    const editor = document.getElementById('caseDraft');
    editor.addEventListener('input',()=>{
      pendingDraft={id:project.id,html:editor.innerHTML};
      document.getElementById('draftSaveStatus').textContent='Сохраняем…';
      clearTimeout(draftTimer);draftTimer=setTimeout(flushDraft,450);
    });
    editor.addEventListener('blur',flushDraft);
    editor.addEventListener('paste',event=>{
      event.preventDefault();
      const text=event.clipboardData?.getData('text/plain')||'';
      document.execCommand('insertText',false,text);
    });
    selectionRange=null;
  }
  function openNote() {
    const project=allProjects().find(item=>sameId(item.id,state.projectId));
    if(!project)return;
    const form=document.getElementById('noteForm');
    form.innerHTML=`<p class="ref-caption">${esc(project.title)}</p><div class="field"><label for="noteBody">Текст заметки</label><textarea id="noteBody" name="body" required placeholder="Что обсудили и что нужно сделать дальше"></textarea></div><div class="ref-note-preview"><label class="ref-note-toggle"><input type="checkbox" name="createTask" id="noteCreateTask">Создать задачу из заметки</label><div id="noteTaskFields" class="hidden"><div class="field"><label for="noteTaskTitle">Название задачи</label><input id="noteTaskTitle" name="taskTitle" placeholder="Следующее действие" maxlength="500"></div><div class="field"><label for="noteTaskDue">Срок задачи</label><input id="noteTaskDue" name="dueDate" type="date"></div><p class="ref-caption">Проверьте название и срок перед сохранением</p></div></div><div class="sheet-actions"><button class="btn" type="button" data-ref-close-note>Отмена</button><button class="btn primary" type="submit">Сохранить заметку</button></div>`;
    form.dataset.projectId=project.id;
    document.getElementById('noteCreateTask').addEventListener('change',event=>{
      document.getElementById('noteTaskFields').classList.toggle('hidden',!event.target.checked);
      document.getElementById('noteTaskTitle').required=event.target.checked;
      if(event.target.checked&&!document.getElementById('noteTaskTitle').value) document.getElementById('noteTaskTitle').value=document.getElementById('noteBody').value.trim().split(/\n/)[0].slice(0,150);
      form.querySelector('[type="submit"]').textContent=event.target.checked?'Сохранить заметку и задачу':'Сохранить заметку';
    });
    showOverlay(document.getElementById('noteSheet'));
  }
  document.getElementById('noteForm').addEventListener('submit',event=>{
    event.preventDefault();const form=event.currentTarget,data=new FormData(form),body=String(data.get('body')||'').trim(),projectId=form.dataset.projectId;
    if(!body){toast('Введите текст заметки');return;}
    const createTask=data.get('createTask')==='on',title=String(data.get('taskTitle')||'').trim();
    if(createTask&&!title){toast('Укажите название задачи');return;}
    if(!allProjects().some(project=>sameId(project.id,projectId))){toast('Дело больше не существует');return;}
    const timestamp=now(),notes=allNotes(),note={id:uid(),projectId,title:body.split(/\n/)[0].slice(0,80),body,createdAt:timestamp,updatedAt:timestamp};
    // Persist both records atomically locally, then notify the existing cloud bridge.
    const tasksBefore=localStorage.getItem(LS.projectTasks),notesBefore=localStorage.getItem(LS.notes);
    const taskItems=load(LS.projectTasks);
    if(createTask)taskItems.push({id:uid(),projectId,title,extra:'Из заметки по делу',dueDate:String(data.get('dueDate')||''),status:'new',priority:'normal',createdAt:timestamp,updatedAt:timestamp});
    try{
      if(createTask)localStorage.setItem(LS.projectTasks,JSON.stringify(taskItems));
      localStorage.setItem(LS.notes,JSON.stringify([...notes,note]));
    }catch{
      try{tasksBefore===null?localStorage.removeItem(LS.projectTasks):localStorage.setItem(LS.projectTasks,tasksBefore);notesBefore===null?localStorage.removeItem(LS.notes):localStorage.setItem(LS.notes,notesBefore);}catch{}
      toast('Не удалось сохранить. Проверьте свободное место в браузере.');return;
    }
    if(createTask)window.lawyerCloud?.onLocalSave?.(LS.projectTasks,taskItems);
    window.lawyerCloud?.onLocalSave?.(LS.notes,[...notes,note]);
    hideOverlay(document.getElementById('noteSheet'));render();toast(createTask?'Заметка и задача сохранены':'Заметка сохранена');
  });
  function showHelper(kind) {
    const project=allProjects().find(item=>sameId(item.id,state.projectId));if(!project)return;
    const sub=projectTasks(project.id),notes=allNotes().filter(note=>sameId(note.projectId,project.id));
    document.getElementById('helperTitle').textContent=kind==='timeline'?'Хронология дела':'Комплектность карточки';
    let html;
    if(kind==='timeline'){
      const events=[{title:'Дело создано',time:project.createdAt},...sub.map(task=>({title:`Создана задача: ${task.title}`,time:task.createdAt})),...sub.filter(task=>task.completedAt).map(task=>({title:`Завершена задача: ${task.title}`,time:task.completedAt})),...notes.map(note=>({title:`Заметка: ${note.title||stripHtml(note.body||'').slice(0,80)}`,time:note.createdAt}))].filter(event=>event.time&&!Number.isNaN(Date.parse(event.time))).sort((a,b)=>a.time.localeCompare(b.time));
      html=events.map(event=>`<div class="ref-case-note">${esc(event.title)}<time>${esc(humanTime(event.time))}</time></div>`).join('')||'<p>Датированных событий пока нет</p>';
    }else{
      const checks=[['Описание запроса',Boolean(project.description.trim())],['Материалы по делу',Boolean(project.attachments?.length)],['Следующий шаг',sub.some(task=>task.status!=='done')],['Срок следующего шага',sub.some(task=>task.status!=='done'&&task.dueDate)]];
      html=checks.map(([label,ok])=>`<div class="ref-helper-warning">${icon(ok?'check':'inbox')}<span>${esc(label)}: ${ok?'добавлено':'не заполнено'}</span></div>`).join('')+'<p class="ref-caption">Это проверка заполнения карточки, а не юридической достаточности документов.</p>';
    }
    document.getElementById('helperContent').innerHTML=html;showOverlay(document.getElementById('helperSheet'));
  }
  function openFileDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('lawyerCaseFiles',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});}
  async function fileStore(action,id,value){
    const db=await openFileDb();return new Promise((resolve,reject)=>{const tx=db.transaction('files',action==='get'?'readonly':'readwrite'),store=tx.objectStore('files'),request=action==='put'?store.put(value,id):action==='delete'?store.delete(id):store.get(id);let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error||new Error('Storage aborted'));};});
  }
  document.getElementById('caseFileInput').addEventListener('change',async event=>{
    const projectId=fileProjectId,files=[...event.target.files];event.target.value='';
    for(const file of files){
      if(file.size>20*1024*1024){toast(`Файл «${file.name}» больше 20 МБ`);continue;}
      const id=uid();
      try{
        await fileStore('put',id,file);
        const project=allProjects().find(item=>sameId(item.id,projectId));
        if(!project || !updateProject(projectId,{attachments:[...(project.attachments||[]),{id,name:file.name,size:file.size,type:file.type,createdAt:now()}]})){await fileStore('delete',id);throw new Error('Metadata not saved');}
      }catch{toast('Не удалось добавить файл. Проверьте доступ к хранилищу.');}
    }
    if(sameId(state.projectId,projectId))render();
  });
  async function downloadFile(id){
    try{const file=await fileStore('get',id);if(!file){toast('Файл отсутствует в этом браузере. Добавьте его повторно.');return;}download(file.name||'document',file,file.type||'application/octet-stream');}catch{toast('Не удалось прочитать файл');}
  }
  function openFoundTask(entry){
    if(!entry)return;
    flushDraft();
    state.taskOriginProject=state.projectId;
    // Existing task editing code chooses storage using this scope.
    state.projectId=entry.task.projectId||null;
    baseOpenTask(entry.task);
  }
  updateHeader=function referenceHeader(){
    const project=allProjects().find(item=>sameId(item.id,state.projectId));
    tasksCount.textContent=String(entries().filter(entry=>entry.task.status!=='done').length);
    projectsCount.textContent=String(allProjects().filter(item=>!doneProject(item)).length);
    fab.classList.toggle('hidden',Boolean(project));
    const active=project?'projects':state.tab;
    document.querySelectorAll('#tabs .tab').forEach(button=>{const selected=button.dataset.tab===active;button.classList.toggle('active',selected);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
    tabs.classList.remove('hidden');
    document.title=`${project?.title||titles[state.tab]||APP_TITLE} · ${APP_TITLE}`;
    document.body.classList.toggle('reference-today',state.tab==='today'&&!project);
    fab.setAttribute('aria-label',state.tab==='projects'&&!project?'Новое дело':'Новая задача');
  };
  render=function referenceRender(){
    flushDraft();
    if(!titles[state.tab])state.tab='today';
    const project=allProjects().find(item=>sameId(item.id,state.projectId));
    if(state.projectId&&!project)state.projectId=null;
    updateHeader();
    page.classList.toggle('calendar-page',state.tab==='calendar'&&!project);
    page.classList.toggle('priorities-page',state.tab==='priorities'&&!project);
    if(project){renderCase(project);return;}
    if(state.tab==='today')renderToday();
    else if(state.tab==='projects')renderCases();
    else if(state.tab==='tasks'){baseRenderTasks();page.querySelector('.workspace-page-head')?.insertAdjacentHTML('beforeend',`<button class="ref-icon-button" type="button" data-ref-sync aria-label="Синхронизация">${icon('cloud')}</button>`);}
    else if(state.tab==='priorities')globalThis.renderPriorities();
    bindAutoGrow(page);
  };
  switchTab=function referenceSwitchTab(tab){
    if(!titles[tab])return;
    if(!flushDraft())return;
    state={...state,tab,query:'',projectId:null,filter:'active',showCompleted:false};
    casePanel='draft';render();window.scrollTo({top:0,behavior:'auto'});
  };
  openTask=function referenceOpenTask(task={}){if(task.id){const entry=taskById(task.id,task.projectId?LS.projectTasks:LS.tasks);openFoundTask(entry);}else baseOpenTask(task);};
  globalThis.openTask=openTask;
  globalThis.switchTab=switchTab;globalThis.render=render;
  openProject=function referenceOpenProject(project={}){baseOpenProject(project);projectSheetTitle.textContent=project.id?'Изменить дело':'Новое дело';projectForm.querySelector('label[for="project-title"]').textContent='Название дела *';};
  globalThis.openProject=openProject;
  applyTheme=function referenceApplyTheme(){document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark';themeColor.content='#17191c';};
  globalThis.applyTheme=applyTheme;applyTheme();
  fab.onclick=()=>state.tab==='projects'&&!state.projectId?openProject():openTask();
  document.addEventListener('selectionchange',()=>{const editor=document.getElementById('caseDraft'),selection=window.getSelection();if(editor&&selection?.rangeCount&&editor.contains(selection.anchorNode)&&editor.contains(selection.focusNode))selectionRange=selection.getRangeAt(0).cloneRange();});
  page.addEventListener('mousedown',event=>{if(event.target.closest('[data-ref-format]'))event.preventDefault();});
  page.addEventListener('click',async event=>{
    const target=event.target.closest('[data-ref-tab],[data-ref-new-task],[data-ref-new-project],[data-ref-new-event],[data-ref-sync],[data-ref-case],[data-ref-task],[data-ref-toggle-task],[data-ref-edit-case],[data-ref-delete-case],[data-ref-project-status],[data-ref-cases-filter],[data-ref-panel],[data-ref-format],[data-ref-export-draft],[data-ref-note],[data-ref-helper],[data-ref-upload],[data-ref-file],[data-ref-delete-file],[data-ref-found-note],[data-ref-event]');
    if(!target)return;event.preventDefault();event.stopImmediatePropagation();
    if(target.dataset.refTab){switchTab(target.dataset.refTab);return;}
    if(target.hasAttribute('data-ref-new-task')){openTask();return;}
    if(target.hasAttribute('data-ref-new-project')){openProject();return;}
    if(target.hasAttribute('data-ref-new-event')){globalThis.openCalendarEvent();return;}
    if(target.hasAttribute('data-ref-sync')){syncButton.click();return;}
    if(target.dataset.refCase){if(!flushDraft())return;state.projectId=target.dataset.refCase;state.tab='projects';state.query='';casePanel='draft';render();window.scrollTo(0,0);return;}
    if(target.dataset.refTask){openFoundTask(taskById(target.dataset.refTask,target.dataset.key));return;}
    if(target.dataset.refToggleTask){
      const entry=taskById(target.dataset.refToggleTask,target.dataset.key);if(!entry)return;
      const list=load(entry.key),index=list.findIndex(task=>sameId(task.id,entry.task.id));const completed=entry.task.status==='done';
      list[index]={...list[index],status:completed?'inwork':'done',completedAt:completed?undefined:now(),updatedAt:now()};
      if(save(entry.key,list)!==false){render();toast(completed?'Задача возобновлена':'Задача завершена');}return;
    }
    if(target.dataset.refEditCase){openProject(allProjects().find(project=>sameId(project.id,target.dataset.refEditCase)));return;}
    if(target.dataset.refDeleteCase){const id=target.dataset.refDeleteCase;askConfirm('Дело, его задачи и заметки будут удалены. Продолжить?',()=>{deleteCase(id);});return;}
    if(target.dataset.refProjectStatus){
      const project=allProjects().find(item=>sameId(item.id,target.dataset.refProjectStatus));if(!project)return;
      if(doneProject(project)){updateProject(project.id,{status:'inwork',completedAt:undefined});render();return;}
      askConfirm(`Завершить дело «${project.title}»? Незавершенные задачи внутри сохранят свой статус.`,()=>{updateProject(project.id,{status:'done',completedAt:now()});render();});
      confirmAccept.textContent='Завершить';return;
    }
    if(target.dataset.refCasesFilter){state.showCompletedProjects=target.dataset.refCasesFilter==='done';render();return;}
    if(target.dataset.refPanel){casePanel=target.dataset.refPanel;document.querySelector('.ref-case-layout').dataset.mobilePanel=casePanel;page.querySelectorAll('[data-ref-panel]').forEach(button=>{button.classList.toggle('active',button.dataset.refPanel===casePanel);button.setAttribute('aria-pressed',String(button.dataset.refPanel===casePanel));});return;}
    if(target.dataset.refFormat){const editor=document.getElementById('caseDraft');if(!editor)return;editor.focus();if(selectionRange){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(selectionRange);}document.execCommand(target.dataset.refFormat,false);editor.dispatchEvent(new Event('input',{bubbles:true}));return;}
    if(target.hasAttribute('data-ref-export-draft')){flushDraft();const editor=document.getElementById('caseDraft'),project=allProjects().find(item=>sameId(item.id,state.projectId));download(`${(project?.title||'Заключение').replace(/[\\/:*?"<>|]/g,'_')}.txt`,editor?.innerText||'','text/plain;charset=utf-8');return;}
    if(target.hasAttribute('data-ref-note')){openNote();return;}
    if(target.dataset.refHelper){showHelper(target.dataset.refHelper);return;}
    if(target.hasAttribute('data-ref-upload')){fileProjectId=state.projectId;document.getElementById('caseFileInput').click();return;}
    if(target.dataset.refFile){await downloadFile(target.dataset.refFile);return;}
    if(target.dataset.refDeleteFile){const id=target.dataset.refDeleteFile,projectId=state.projectId;askConfirm('Удалить файл из материалов дела?',async()=>{const project=allProjects().find(item=>sameId(item.id,projectId));if(!project)return;if(updateProject(projectId,{attachments:(project.attachments||[]).filter(file=>!sameId(file.id,id))})){try{await fileStore('delete',id);}catch{}render();}});return;}
    if(target.dataset.refFoundNote){const note=allNotes().find(item=>sameId(item.id,target.dataset.refFoundNote));if(!note)return;document.getElementById('helperTitle').textContent=note.title||'Заметка';document.getElementById('helperContent').innerHTML=`<p class="ref-description">${esc(stripHtml(note.body||note.content||''))}</p>`;showOverlay(document.getElementById('helperSheet'));return;}
    if(target.dataset.refEvent){const item=globalThis.allCalendarEvents().find(event=>sameId(event.id,target.dataset.refEvent));if(item)globalThis.openCalendarEvent(item);}
  },true);
  async function deleteCase(id){
    const project=allProjects().find(item=>sameId(item.id,id));if(!project)return;
    flushDraft();save(LS.projects,allProjects().filter(item=>!sameId(item.id,id)));save(LS.projectTasks,load(LS.projectTasks).filter(item=>!sameId(item.projectId,id)));save(LS.notes,allNotes().filter(item=>!sameId(item.projectId,id)));
    for(const file of project.attachments||[]){try{await fileStore('delete',file.id);}catch{}}
    if(sameId(state.projectId,id))state.projectId=null;render();toast('Дело удалено');
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-ref-close-note]'))hideOverlay(document.getElementById('noteSheet'));if(event.target.closest('#closeHelper'))hideOverlay(document.getElementById('helperSheet'));});
  document.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'&&state.projectId){event.preventDefault();flushDraft();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flushDraft();});
  window.addEventListener('pagehide',flushDraft);
  window.addEventListener('storage',event=>{if(Object.values(LS).includes(event.key)&&!document.querySelector('.overlay.show')&&!pendingDraft&&document.activeElement?.id!=='caseDraft')render();});
  const previousHideOverlay=hideOverlay;
  hideOverlay=function referenceHideOverlay(element){previousHideOverlay(element);if(element===taskSheet&&state.taskOriginProject!==undefined){state.projectId=state.taskOriginProject;delete state.taskOriginProject;render();}};
  const previousConfirm=askConfirm;
  askConfirm=function referenceConfirm(message,action){confirmAccept.textContent='Удалить';previousConfirm(message,action);};
  state={...state,tab:'today',projectId:null,query:'',filter:'active'};
  render();
})();
