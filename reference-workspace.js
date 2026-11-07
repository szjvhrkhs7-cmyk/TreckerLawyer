/* The journal presentation reuses existing storage and the project-scoped cloud. */
(() => {
  'use strict';
  const W = globalThis.LawyerWorkflow;
  const titles = {priorities:'Приоритеты', tasks:'Задачи', settings:'Настройки'};
  const expanded = new Set();
  let selectedDay = dateKey(new Date()), monthOpen = false, filter = 'active', order = 'manual';
  let activeDrag = null;
  const toastElement = document.getElementById('referenceToast');
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const star = '<svg class="j-star" viewBox="0 0 24 24" role="img" aria-label="Главная задача"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3L5.8 21l1.2-6.8-5-4.9 6.9-1Z"/></svg>';
  function dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function dayDate(day){return new Date(day+'T12:00:00');}
  function shiftDay(day,n){const d=dayDate(day);d.setDate(d.getDate()+n);return dateKey(d);}
  function dayLabel(day,options={day:'numeric',month:'long'}){return dayDate(day).toLocaleDateString('ru-RU',options);}
  function token(entry){return `${entry.scope}:${entry.task.id}`;}
  function entries(){return [[LS.tasks,'root'],[LS.projectTasks,'project']].flatMap(([key,scope])=>load(key).filter(valid).map(raw=>({key,scope,task:normTask(raw)})));}
  function find(value){return entries().find(e=>token(e)===value);}
  function notify(message){toastElement.textContent=message;toastElement.classList.add('show');clearTimeout(toastElement.timer);toastElement.timer=setTimeout(()=>toastElement.classList.remove('show'),4000);}
  function update(entry,patch){
    const items=load(entry.key),index=items.findIndex(t=>sameId(t.id,entry.task.id));
    if(index<0)return false;
    items[index]={...items[index],...patch,updatedAt:now()};
    if(items[index].status!=='done')delete items[index].completedAt;
    if(save(entry.key,items)===false)return false;
    return items[index];
  }
  function checkButton(action,checked,label,extra=''){return `<button type="button" class="j-check" role="checkbox" aria-checked="${checked}" aria-label="${esc(label)}" data-j-action="${action}" ${extra}><span class="j-check-box">${checked?icon('check'):''}</span></button>`;}
  function taskMeta(task){const progress=W.subtaskProgress(task);return [progress.total?`${progress.done} из ${progress.total} подзадач`:'',statusText[task.status],task.dueDate?`Срок: ${dayLabel(task.dueDate)}`:'Без срока'].filter(Boolean).join(' · ');}
  function taskMenu(entry,priority){const t=entry.task;return `<details class="j-menu"><summary aria-label="Действия задачи ${esc(t.title)}">${icon('more')}</summary><div class="j-menu-content"><button type="button" data-j-action="edit">Изменить задачу</button><button type="button" data-j-action="schedule">${priority?'Перенести на день':'Добавить в план'}</button><button type="button" data-j-action="star">${t.priorityLevel==='main'?'Сделать обычной':'Сделать главной'}</button>${priority?'<button type="button" data-j-action="unschedule">Убрать из плана</button>':''}<button type="button" data-j-action="delete" class="is-danger">Удалить задачу</button></div></details>`;}
  function subtaskList(entry){const t=entry.task,key=token(entry);return `<div class="j-subtasks" id="children-${esc(key)}">${(Array.isArray(t.subtasks)?t.subtasks:[]).filter(s=>s&&s.id!=null&&typeof s.title==='string').map(s=>`<div class="j-subtask${s.completed?' is-done':''}" data-subtask-id="${esc(s.id)}">${checkButton('sub-toggle',s.completed===true,`${s.completed?'Возобновить':'Выполнить'} подзадачу ${s.title}`)}<button class="j-subtitle" type="button" data-j-action="sub-edit" aria-label="Изменить подзадачу ${esc(s.title)}">${esc(s.title)}</button><button type="button" class="j-icon" data-j-action="sub-remove" aria-label="Удалить подзадачу ${esc(s.title)}">${icon('close')}</button></div>`).join('')}<form class="j-subform" data-j-subform><input name="title" aria-label="Новая подзадача" placeholder="Добавить подзадачу" required maxlength="2000" autocomplete="off"><button type="submit" aria-label="Добавить подзадачу">${icon('plus')}</button></form></div>`;}
  function taskRow(entry,priority=false){const t=entry.task,key=token(entry),isExpanded=expanded.has(key),done=t.status==='done';return `<article class="j-task${done?' is-done':''}" data-task-token="${esc(key)}" data-task-scope="${entry.scope}"${priority?' data-j-priority':''}><div class="j-task-line">${priority&&!done?`<button type="button" class="j-grip" data-j-drag aria-label="Перетащить задачу ${esc(t.title)}" title="Alt + стрелки: изменить порядок или день"></button>`:''}${checkButton('complete',done,`${done?'Возобновить':'Выполнить'} задачу ${t.title}`)}${t.priorityLevel==='main'?star:''}<button class="j-task-main" type="button" data-j-action="edit"><strong class="j-title">${esc(t.title||'Без названия')}</strong><span class="j-meta${overdue(t)?' is-danger':''}">${esc(priority?(t.dueDate?`Срок: ${dayLabel(t.dueDate)}`:'Без срока'):taskMeta(t))}</span></button>${!priority?`<button type="button" class="j-icon j-expand" data-j-action="expand" aria-expanded="${isExpanded}" aria-controls="children-${esc(key)}" aria-label="${isExpanded?'Свернуть':'Раскрыть'} подзадачи: ${esc(t.title)}">${icon(isExpanded?'chevron-down':'arrow-right')}</button>`:''}${taskMenu(entry,priority)}</div>${!priority&&isExpanded?subtaskList(entry):''}</article>`;}
  function header(title,action=true){return `<header class="j-head"><h2>${title}</h2>${action?`<button type="button" class="j-add" data-j-action="new" aria-label="${state.tab==='priorities'?'Добавить в план':'Новая задача'}">${icon('plus')}</button>`:''}</header>`;}
  function renderPriorities(){
    const d=dayDate(selectedDay),today=dateKey(new Date()),all=entries(),scheduled=all.filter(e=>e.task.status!=='done'&&W.validDay(e.task.priorityDate));
    const start=shiftDay(selectedDay,-((d.getDay()+6)%7));
    const days=monthOpen?W.monthDays(d.getFullYear(),d.getMonth()):Array.from({length:7},(_,i)=>shiftDay(start,i));
    const list=W.ordered(scheduled.filter(e=>e.task.priorityDate===selectedDay));
    page.innerHTML=`${header(titles.priorities)}<div class="j-priority-layout"><section class="j-calendar" aria-label="Календарь приоритетов"><div class="j-month-head"><button type="button" class="j-icon" data-j-action="calendar-prev" aria-label="${monthOpen?'Предыдущий месяц':'Предыдущая неделя'}">${icon('arrow-left')}</button><strong>${esc(dayLabel(selectedDay,{month:'long',year:'numeric'}))}</strong><button type="button" class="j-icon" data-j-action="calendar-next" aria-label="${monthOpen?'Следующий месяц':'Следующая неделя'}">${icon('arrow-right')}</button></div><div class="j-calendar-grid">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(s=>`<span class="j-weekday">${s}</span>`).join('')}${days.map(day=>day?`<button type="button" class="j-day${day===selectedDay?' is-selected':''}${day===today?' is-today':''}${scheduled.some(e=>e.task.priorityDate===day)?' has-tasks':''}" data-j-day="${day}" aria-label="${esc(dayLabel(day,{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}" aria-pressed="${day===selectedDay}"${day===today?' aria-current="date"':''}>${dayDate(day).getDate()}</button>`:'<span aria-hidden="true"></span>').join('')}</div><div class="j-calendar-actions"><button type="button" class="j-text" data-j-action="calendar-toggle" aria-expanded="${monthOpen}">${monthOpen?'Показать неделю':'Показать месяц'}</button><button type="button" class="j-text" data-j-action="calendar-today">Сегодня</button></div></section><section aria-label="Задачи выбранного дня"><header class="j-section-head"><h3>${esc(dayLabel(selectedDay,{weekday:'long',day:'numeric',month:'long'}))}</h3><p>${list.length?`В плане: ${list.length}`:'Свободный день'}</p></header><div class="j-list" data-j-priority-list>${list.map(e=>taskRow(e,true)).join('')||'<p class="j-empty">На этот день задач нет. Добавьте задачу из общего списка или создайте новую.</p>'}</div><button type="button" class="j-text" data-j-action="schedule-new">Добавить из задач</button></section></div><div class="j-drag-live" id="priorityAnnouncement" role="status" aria-live="polite"></div>`;
  }
  function renderTasks(){
    const all=entries(),active=all.filter(e=>e.task.status!=='done'),done=all.filter(e=>e.task.status==='done');
    let list=active.filter(e=>filter==='waiting'?e.task.status==='waiting':filter==='overdue'?overdue(e.task):filter==='inwork'?e.task.status==='inwork':true);
    if(order==='due')list.sort((a,b)=>(a.task.dueDate||'9999').localeCompare(b.task.dueDate||'9999'));
    else {const sorted=orderedFor('task',list.map(e=>e.task));const rank=new Map(sorted.map((t,i)=>[taskSortKey(t),i]));list.sort((a,b)=>rank.get(taskSortKey(a.task))-rank.get(taskSortKey(b.task)));}
    const filters=[['active','Активные',active.length],['waiting','Ожидание',active.filter(e=>e.task.status==='waiting').length],['inwork','В работе',active.filter(e=>e.task.status==='inwork').length],['overdue','Просрочено',active.filter(e=>overdue(e.task)).length]];
    page.innerHTML=`${header(titles.tasks)}<div class="j-controls"><div class="j-filters" role="group" aria-label="Фильтр задач">${filters.map(([id,label,count])=>`<button type="button" class="j-filter${filter===id?' active':''}" data-j-filter="${id}" aria-pressed="${filter===id}">${label} ${count}</button>`).join('')}</div><button type="button" class="j-sort" data-j-action="sort" aria-label="${order==='due'?'Сортировка по сроку. Вернуть мой порядок':'Сортировать по сроку'}">${icon('sort')}</button></div><div class="j-list" id="activeTasks">${list.map(e=>taskRow(e)).join('')||`<p class="j-empty">${active.length?'Нет задач с таким статусом.':'Задач пока нет. Нажмите плюс, чтобы добавить первую.'}</p>`}</div>${done.length?`<button type="button" class="j-completed-toggle" data-j-action="completed" aria-expanded="${state.showCompleted}">${icon(state.showCompleted?'chevron-down':'arrow-right')} Завершено · ${done.length}</button><div id="completedTasks">${state.showCompleted?done.map(e=>taskRow(e)).join(''):''}</div>`:''}`;
  }
  function cloudState(){return window.lawyerCloud?.getState?.()||{ready:false,enabled:false,state:'loading',label:'Подключаем модуль синхронизации'};}
  function renderSettings(){
    const cloud=cloudState();
    const last=cloud.lastSyncAt?new Date(cloud.lastSyncAt).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}):'Еще не выполнялась';
    const offline=window.lawyerOffline?.getState?.()||{ready:false,label:'Подготавливаем автономный запуск…'};
    page.innerHTML=`<div class="j-settings-layout">${header(titles.settings,false)}<section class="j-setting-section" aria-labelledby="cloudHeading"><h3 id="cloudHeading">Облачная синхронизация</h3><div class="j-setting-row"><div><strong>Синхронизация</strong><small>${cloud.enabled?'Включена':cloud.paused?'Приостановлена':'На этом устройстве'}</small></div><button type="button" role="switch" class="j-switch" id="cloudEnabled" aria-label="Облачная синхронизация" aria-checked="${cloud.enabled}" ${cloud.ready?'':'disabled'} data-j-action="cloud-toggle"></button></div>${cloud.email?`<div class="j-setting-row"><div><strong>Аккаунт</strong><small>${esc(cloud.email)}</small></div><button type="button" class="j-text" data-j-action="cloud-logout">Выйти</button></div>`:`<div class="j-setting-row"><div><strong>Подключить аккаунт</strong><small>Войдите с одной почтой на ваших устройствах</small></div><button type="button" class="j-text" data-j-action="cloud-login" ${cloud.ready?'':'disabled'}>Войти</button></div>`}<div class="j-setting-row"><strong>Последняя синхронизация</strong><span id="cloudLastSync">${esc(last)}</span></div><p class="j-sync-status${cloud.state==='error'?' is-danger':''}" id="cloudStatus" role="status">${esc(cloud.label)}</p><p class="j-help">Задачи, подзадачи и план будут доступны на ваших устройствах. При отключении синхронизации локальные данные сохранятся.</p>${cloud.email?`<button type="button" class="btn outline" data-j-action="cloud-sync" ${cloud.enabled?'':'disabled'}>Синхронизировать сейчас</button>`:''}</section><section class="j-setting-section" aria-labelledby="offlineHeading"><h3 id="offlineHeading">Работа без интернета</h3><div class="j-setting-row"><strong>Автономный запуск</strong><span id="offlineReady">${offline.ready?'Готов':'Подготовка'}</span></div><p class="j-help" id="offlineStatus" role="status">${esc(offline.label)}</p>${offline.updateAvailable?'<button type="button" class="btn outline" data-j-action="app-update">Обновить приложение</button><p class="j-help">Обновление уже сохранено и готово к установке.</p>':''}</section><section class="j-setting-section" aria-labelledby="appearanceHeading"><h3 id="appearanceHeading">Оформление</h3><label class="j-setting-row" for="journalTheme"><strong>Тема</strong><select class="j-select" id="journalTheme" aria-label="Цветовая тема"><option value="light">Светлая</option><option value="dark">Темная</option></select></label></section><section class="j-setting-section" aria-labelledby="dataHeading"><h3 id="dataHeading">Данные</h3><button type="button" class="j-setting-row" data-j-action="backup"><strong>Экспорт резервной копии</strong>${icon('arrow-right')}</button><button type="button" class="j-setting-row" data-j-action="restore"><strong>Восстановить из копии</strong>${icon('arrow-right')}</button><p class="j-help">Копия включает задачи, подзадачи, план и ранее сохраненные материалы.</p></section></div>`;
    document.getElementById('journalTheme').value=document.documentElement.dataset.theme==='dark'?'dark':'light';
  }
  applyTheme=function journalTheme(theme,persist=false){const next=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=next;document.documentElement.style.colorScheme=next;themeColor.content=next==='dark'?'#1d1e20':'#f7f6f2';if(persist)try{localStorage.setItem(THEME_KEY,next);}catch{}};
  render=function journalRender(){
    if(activeDrag)return;
    if(!titles[state.tab])state.tab='priorities';
    state.projectId=null;
    page.className='page';
    document.querySelectorAll('#tabs .tab').forEach(b=>{const active=b.dataset.tab===state.tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    document.title=`${titles[state.tab]} · ${APP_TITLE}`;
    if(state.tab==='priorities')renderPriorities();else if(state.tab==='tasks')renderTasks();else renderSettings();
  };
  switchTab=function journalSwitch(tab){if(!titles[tab])return;state={...state,tab,projectId:null};render();window.scrollTo({top:0,behavior:'auto'});};
  function openEditor(entry=null,defaults={}){
    const t=entry?.task||defaults;
    state.editingTask=t;
    taskSheetTitle.textContent=entry?'Изменить задачу':'Новая задача';
    taskForm.innerHTML=`<div class="sheet-fields"><div class="field"><label for="task-title">Название задачи *</label><textarea id="task-title" name="title" required maxlength="10000">${esc(t.title||'')}</textarea></div><div class="grid2"><div class="field"><label for="task-dueDate">Срок ответа</label><input id="task-dueDate" name="dueDate" type="date" value="${esc(t.dueDate||'')}"></div><div class="field"><label for="task-planDate">День работы</label><input id="task-planDate" name="priorityDate" type="date" value="${esc(t.priorityDate||'')}"></div></div><label class="j-check-label"><input type="checkbox" name="main" ${t.priorityLevel==='main'?'checked':''}>Главная задача</label><div class="field"><label for="task-status">Статус</label><select id="task-status" name="status"><option value="new">Новая</option><option value="inwork">В работе</option><option value="waiting">Ожидание</option><option value="done">Завершена</option></select></div><details class="j-more-fields" ${t.extra||t.notes||t.status==='waiting'?'open':''}><summary>Описание и дополнительные параметры</summary><div class="sheet-fields"><div class="field"><label for="task-extra">Описание</label><textarea id="task-extra" name="extra">${esc(t.extra||'')}</textarea></div><div class="field"><label for="task-notes">Заметки</label><textarea id="task-notes" name="notes">${esc(t.notes||'')}</textarea></div><div class="grid2"><div class="field"><label for="task-waitingFor">От кого ждем ответ</label><input id="task-waitingFor" name="waitingFor" value="${esc(t.waitingFor||'')}"></div><div class="field"><label for="task-checkDate">Когда напомнить</label><input id="task-checkDate" name="checkDate" type="date" value="${esc(t.checkDate||'')}"></div></div><div class="field"><label for="task-reminder">Напоминание перед сроком</label><select id="task-reminder" name="reminder"><option value="0">Нет</option><option value="1">За день</option><option value="2">За 2 дня</option><option value="3">За 3 дня</option><option value="7">За неделю</option></select></div></div></details></div><div class="sheet-actions"><button type="button" class="btn" id="cancelTask">Отмена</button><button type="submit" class="btn primary">${entry?'Сохранить':'Создать'}</button></div>`;
    taskForm.elements.status.value=t.status||'new';taskForm.elements.reminder.value=t.reminder||0;
    taskForm.onsubmit=event=>{
      event.preventDefault();const data=new FormData(taskForm),title=String(data.get('title')||'').trim();
      if(!title){taskForm.elements.title.setCustomValidity('Укажите название задачи');taskForm.elements.title.reportValidity();taskForm.elements.title.setCustomValidity('');return;}
      const dueDate=String(data.get('dueDate')||''),priorityDate=String(data.get('priorityDate')||'');
      if((dueDate&&!W.validDay(dueDate))||(priorityDate&&!W.validDay(priorityDate)))return;
      const patch={title,dueDate,priorityDate,priorityLevel:data.has('main')?'main':'other',status:String(data.get('status')),extra:String(data.get('extra')||''),notes:String(data.get('notes')||''),waitingFor:String(data.get('waitingFor')||''),checkDate:String(data.get('checkDate')||''),reminder:Number(data.get('reminder'))||0};
      const commit=()=>{let saved;if(entry){const current=find(token(entry));if(!current){notify('Задача уже удалена');return;}if(patch.status==='done')patch.completedAt=current.task.completedAt||now();saved=update(current,patch);}else{const item={...patch,id:uid(),createdAt:now(),updatedAt:now(),priority:'normal',...(patch.status==='done'?{completedAt:now()}:{})};saved=save(LS.tasks,[...load(LS.tasks),item]);}if(saved!==false){hideOverlay(taskSheet);render();notify(entry?'Изменения сохранены':'Задача добавлена');}};
      const progress=entry?W.subtaskProgress(find(token(entry))?.task||t):{done:0,total:0};
      if(patch.status==='done'&&progress.done<progress.total){askConfirm('В задаче остались невыполненные подзадачи. Завершить основную задачу?',commit);confirmAccept.textContent='Завершить';}else commit();
    };
    DateFields.enhance(taskForm);
    showOverlay(taskSheet);
  }
  openTask=function journalOpenTask(task={}){const entry=task.id?entries().find(e=>sameId(e.task.id,task.id)&&Boolean(e.task.projectId)===Boolean(task.projectId)):null;openEditor(entry,task);};
  function schedule(entry=null){
    prioritySheetTitle.textContent=entry?'Перенести задачу':'Добавить в план';
    const options=entries().filter(e=>e.task.status!=='done');
    priorityForm.innerHTML=`<div class="sheet-fields">${entry?`<p>${esc(entry.task.title)}</p>`:`<div class="field"><label for="priorityExisting">Задача</label><select id="priorityExisting" name="existing">${options.map(e=>`<option value="${esc(token(e))}">${esc(e.task.title)}${e.scope==='project'?' · из прежнего дела':''}</option>`).join('')}</select></div>`}<div class="field"><label for="priorityDay">День работы</label><input type="date" id="priorityDay" name="date" required value="${esc(entry?.task.priorityDate||selectedDay)}"></div><label class="j-check-label"><input type="checkbox" name="main" ${entry?.task.priorityLevel==='main'?'checked':''}>Главная задача</label></div><div class="sheet-actions">${!entry?'<button type="button" class="btn" data-j-create-instead>Создать новую</button>':''}<button type="button" class="btn" data-j-close-priority>Отмена</button><button type="submit" class="btn primary" ${!entry&&!options.length?'disabled':''}>Сохранить</button></div>`;
    priorityForm.querySelector('[data-j-create-instead]')?.addEventListener('click',()=>{hideOverlay(prioritySheet);openEditor(null,{priorityDate:priorityForm.elements.date.value||selectedDay});});
    priorityForm.querySelector('[data-j-close-priority]').onclick=()=>hideOverlay(prioritySheet);
    priorityForm.onsubmit=event=>{event.preventDefault();const target=entry?find(token(entry)):find(priorityForm.elements.existing.value);const date=priorityForm.elements.date.value;if(!target||!W.validDay(date))return;if(movePriority(target,date,null,priorityForm.elements.main.checked?'main':'other')){selectedDay=date;hideOverlay(prioritySheet);render();notify('План сохранен');}};
    DateFields.enhance(priorityForm);
    showOverlay(prioritySheet);
  }
  function movePriority(entry,date,before=null,level=entry.task.priorityLevel==='main'?'main':'other'){
    const previous={root:load(LS.tasks),project:load(LS.projectTasks)};
    const next=W.movePriority(previous,{scope:entry.scope,id:entry.task.id},{date,level,before:before?{scope:before.scope,id:before.task.id}:null},now());
    return next&&W.commitCollections(previous,next,(scope,items)=>save(scope==='root'?LS.tasks:LS.projectTasks,items));
  }
  function complete(entry){
    const done=entry.task.status==='done';
    const commit=()=>{const current=find(token(entry));if(!current)return;const saved=update(current,{status:done?'inwork':'done',...(!done?{completedAt:now()}:{})});if(saved){render();if(!done)window.lawyerCompletionUndo?.(entry.key,current.task,saved);else notify('Задача возвращена в работу');}};
    const progress=W.subtaskProgress(entry.task);
    if(!done&&progress.done<progress.total){askConfirm('В задаче остались невыполненные подзадачи. Завершить основную задачу?',commit);confirmAccept.textContent='Завершить';}else commit();
  }
  function editSubtask(entry,id){
    const child=entry.task.subtasks.find(s=>s&&sameId(s.id,id));if(!child)return;
    taskSheetTitle.textContent='Изменить подзадачу';taskForm.innerHTML=`<div class="field"><label for="childTitle">Название подзадачи</label><textarea id="childTitle" name="title" required maxlength="2000">${esc(child.title)}</textarea></div><div class="sheet-actions"><button type="button" class="btn" id="cancelTask">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div>`;
    taskForm.onsubmit=event=>{event.preventDefault();const current=find(token(entry));if(!current)return;const patched=W.patchSubtask(current.task,{type:'edit',id,title:taskForm.elements.title.value},now());if(patched&&update(current,patched)){hideOverlay(taskSheet);render();}};showOverlay(taskSheet);
  }
  page.addEventListener('submit',event=>{
    const form=event.target.closest('[data-j-subform]');if(!form)return;event.preventDefault();
    const entry=find(form.closest('[data-task-token]').dataset.taskToken);if(!entry)return;
    const patched=W.patchSubtask(entry.task,{type:'add',id:uid(),title:form.elements.title.value},now());
    if(patched&&update(entry,patched)){render();page.querySelector(`[data-task-token="${CSS.escape(token(entry))}"] .j-subform input`)?.focus({preventScroll:true});}
  });
  page.addEventListener('change',event=>{if(event.target.id==='journalTheme')applyTheme(event.target.value,true);});
  page.addEventListener('click',async event=>{
    const day=event.target.closest('[data-j-day]');if(day){selectedDay=day.dataset.jDay;render();return;}
    const filterButton=event.target.closest('[data-j-filter]');if(filterButton){filter=filterButton.dataset.jFilter;render();return;}
    const button=event.target.closest('[data-j-action]');if(!button)return;
    const action=button.dataset.jAction,container=button.closest('[data-task-token]'),entry=container?find(container.dataset.taskToken):null;
    if(action==='new'){openEditor(null,state.tab==='priorities'?{priorityDate:selectedDay}:{});return;}
    if(action==='calendar-toggle'){monthOpen=!monthOpen;render();return;}
    if(action==='calendar-today'){selectedDay=dateKey(new Date());render();return;}
    if(action==='calendar-prev'||action==='calendar-next'){const amount=action==='calendar-next'?1:-1;if(monthOpen){const d=dayDate(selectedDay),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+amount);const max=new Date(d.getFullYear(),d.getMonth()+1,0,12).getDate();d.setDate(Math.min(day,max));selectedDay=dateKey(d);}else selectedDay=shiftDay(selectedDay,amount*7);render();return;}
    if(action==='schedule-new'){schedule();return;}
    if(action==='completed'){state.showCompleted=!state.showCompleted;render();return;}
    if(action==='sort'){order=order==='due'?'manual':'due';render();notify(order==='due'?'Задачи упорядочены по сроку':'Восстановлен ваш порядок');return;}
    if(action==='app-update'){await window.lawyerOffline?.applyUpdate();return;}
    if(action==='backup'){backup();return;}
    if(action==='restore'){askConfirm('Данные из резервной копии заменят соответствующие разделы на этом устройстве. Выбрать файл?',()=>restoreInput.click());confirmAccept.textContent='Выбрать файл';return;}
    if(action.startsWith('cloud-')){
      const cloud=window.lawyerCloud;if(!cloud?.getState)return;
      try{if(action==='cloud-toggle')await cloud.setEnabled(!cloud.getState().enabled);else if(action==='cloud-login')cloud.open();else if(action==='cloud-sync')await cloud.syncNow();else if(action==='cloud-logout')await cloud.signOut();}
      catch{notify('Не удалось связаться с облаком. Локальные данные сохранены.');}
      return;
    }
    if(!entry)return;
    if(action==='edit')openEditor(entry);
    else if(action==='expand'){const key=token(entry);expanded.has(key)?expanded.delete(key):expanded.add(key);render();}
    else if(action==='complete')complete(entry);
    else if(action==='schedule')schedule(entry);
    else if(action==='star'){if(update(entry,{priorityLevel:entry.task.priorityLevel==='main'?'other':'main'}))render();}
    else if(action==='unschedule'){if(update(entry,{priorityDate:'',priorityOrder:undefined}))render();}
    else if(action==='delete'){askConfirm('Удалить задачу вместе с подзадачами? Отменить удаление можно только восстановлением резервной копии.',()=>{if(save(entry.key,load(entry.key).filter(t=>!sameId(t.id,entry.task.id)))!==false){render();notify('Задача удалена');}});confirmAccept.textContent='Удалить';}
    else if(action==='sub-edit')editSubtask(entry,button.closest('[data-subtask-id]').dataset.subtaskId);
    else if(action==='sub-toggle'||action==='sub-remove'){
      const id=button.closest('[data-subtask-id]').dataset.subtaskId;
      const commit=()=>{const current=find(token(entry));if(!current)return;const patched=W.patchSubtask(current.task,{type:action==='sub-toggle'?'toggle':'remove',id},now());if(patched){if(action==='sub-toggle'&&current.task.status==='done'&&patched.subtasks.some(s=>!s.completed)){patched.status='inwork';delete patched.completedAt;}if(update(current,patched))render();}};
      if(action==='sub-remove'){askConfirm('Удалить подзадачу?',commit);confirmAccept.textContent='Удалить';}else commit();
    }
  });
  function changeByKeyboard(event){
    const handle=event.target.closest('[data-j-drag]');if(!handle||!event.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();const entry=find(handle.closest('[data-task-token]').dataset.taskToken);if(!entry)return;
    const list=W.ordered(entries().filter(e=>e.task.status!=='done'&&e.task.priorityDate===selectedDay)),index=list.findIndex(e=>token(e)===token(entry));
    let date=selectedDay,before=null;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight')date=shiftDay(date,event.key==='ArrowLeft'?-1:1);
    else if(event.key==='ArrowUp'){if(index<1)return;before=list[index-1];}
    else {if(index===list.length-1)return;before=list[index+2]||null;}
    if(movePriority(entry,date,before)){selectedDay=date;render();page.querySelector(`[data-task-token="${CSS.escape(token(entry))}"] [data-j-drag]`)?.focus({preventScroll:true});notify('План сохранен');}
  }
  page.addEventListener('keydown',changeByKeyboard);
  page.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-j-drag]');if(!handle||(event.button!==0&&event.pointerType!=='touch'))return;
    event.preventDefault();const row=handle.closest('[data-task-token]'),entry=find(row.dataset.taskToken);if(!entry)return;
    const drag={id:event.pointerId,entry,handle,row,startX:event.clientX,startY:event.clientY,moved:false,target:null,date:selectedDay};activeDrag=drag;handle.setPointerCapture?.(event.pointerId);
    const clearTargets=()=>{page.querySelectorAll('.is-drop-before,.is-drop-target').forEach(el=>el.classList.remove('is-drop-before','is-drop-target'));};
    const move=e=>{if(e.pointerId!==drag.id)return;if(e.cancelable)e.preventDefault();if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<6&&!drag.moved)return;drag.moved=true;row.classList.add('is-dragging');clearTargets();drag.target=null;drag.date=null;const hit=document.elementFromPoint(e.clientX,e.clientY),day=hit?.closest('[data-j-day]');if(day){drag.date=day.dataset.jDay;day.classList.add('is-drop-target');return;}const target=hit?.closest('[data-j-priority]');if(target&&target!==row){drag.target=find(target.dataset.taskToken);drag.date=selectedDay;const rect=target.getBoundingClientRect();if(e.clientY>rect.top+rect.height/2){const next=target.nextElementSibling;drag.target=next?find(next.dataset.taskToken):null;}else target.classList.add('is-drop-before');}else if(hit?.closest('[data-j-priority-list]'))drag.date=selectedDay;};
    const finish=e=>{if(e.pointerId!==drag.id)return;window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',finish,true);window.removeEventListener('pointercancel',cancel,true);handle.removeEventListener('lostpointercapture',cancel);clearTargets();row.classList.remove('is-dragging');activeDrag=null;try{handle.releasePointerCapture(e.pointerId);}catch{}if(e.type!=='pointercancel'&&drag.moved&&drag.date){if(movePriority(drag.entry,drag.date,drag.target)){selectedDay=drag.date;render();notify('План сохранен');}else notify('Не удалось сохранить перенос');}};
    const cancel=e=>finish({pointerId:drag.id,type:'pointercancel'});
    handle.addEventListener('lostpointercapture',cancel,{once:true});window.addEventListener('pointermove',move,{passive:false,capture:true});window.addEventListener('pointerup',finish,true);window.addEventListener('pointercancel',cancel,true);
  });
  window.addEventListener('storage',event=>{if(Object.values(LS).includes(event.key)&&!document.querySelector('.overlay.show'))render();});
  window.addEventListener('lawyer-offline-state',()=>{if(state.tab==='settings'&&!document.querySelector('.overlay.show'))renderSettings();});
  window.addEventListener('lawyer-cloud-state',()=>{if(state.tab==='settings'&&!document.querySelector('.overlay.show')){const focus=document.activeElement?.id;renderSettings();if(focus)document.getElementById(focus)?.focus({preventScroll:true});}});
  document.addEventListener('keydown',event=>{if(event.key.toLowerCase()==='n'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.target.closest('input,textarea,select,[contenteditable=true]')&&!document.querySelector('.overlay.show'))openEditor(null,state.tab==='priorities'?{priorityDate:selectedDay}:{});});
  tabs.addEventListener('keydown', event => {
    const current = event.target.closest('[data-tab]');
    if (!current || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...tabs.querySelectorAll('[data-tab]')], index = items.indexOf(current);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    switchTab(items[next].dataset.tab); items[next].focus({preventScroll:true});
  });
  globalThis.openTask=openTask;globalThis.render=render;globalThis.switchTab=switchTab;
  globalThis.openPriorityCreator=()=>schedule();
  state={...state,tab:'priorities',projectId:null,showCompleted:false};applyTheme(document.documentElement.dataset.theme);render();
})();
