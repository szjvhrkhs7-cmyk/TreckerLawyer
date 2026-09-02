const APP_TITLE='Трекер юриста';
const A='#787774';
const THEME_KEY='lawyerTheme';
const LS={tasks:'lawyerTasks',projects:'lawyerProjects',projectTasks:'lawyerProjectTasks',notes:'lawyerNotes',calendarEvents:'lawyerCalendarEvents',taskOrder:'lawyerTaskOrder',projectTaskOrder:'lawyerProjectTaskOrder',projectOrder:'lawyerProjectOrder',noteOrder:'lawyerNoteOrder'};
const statusText={new:'Новая',inwork:'В работе','in-progress':'В работе',waiting:'Ожидание',done:'Завершена',completed:'Завершена'};
const priorityText={none:'Обычная',low:'Низкая',normal:'Обычная',medium:'Средняя',high:'Важно / срочно'};
const statusColor={new:'#2477E5',inwork:'#D97706',waiting:'#7C3AED',done:'#238B57'};
let state={tab:'tasks',filter:'active',query:'',projectId:null,editingTask:null,editingProject:null,editingNote:null,editingEvent:null,calendarAnchor:null,calendarSelectedDate:null,showCompleted:false};
let deletedNote=null,undoTimer=null,focusStack=[],confirmAction=null;
const $=s=>document.querySelector(s);
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.floor(Math.random()*1e9)}`;
const now=()=>new Date().toISOString();
function load(k){try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]}catch(e){console.warn('storage read error',k,e);return []}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));window.lawyerCloud?.onLocalSave?.(k,v)}catch(e){alert('Не удалось сохранить данные. Проверьте свободное место в браузере.')}}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function stripHtml(v){const d=document.createElement('div');d.innerHTML=String(v||'');return d.textContent||d.innerText||''}
function sanitizeNoteHtml(value){const source=document.createElement('template'),output=document.createElement('div'),allowed=new Set(['B','STRONG','UL','OL','LI','BR','P','DIV']);source.innerHTML=String(value||'');function clean(node){if(node.nodeType===3)return document.createTextNode(node.nodeValue||'');if(node.nodeType!==1)return document.createDocumentFragment();const boldSpan=node.tagName==='SPAN'&&/font-weight\s*:\s*(?:bold|[6-9]00)/i.test(node.getAttribute('style')||'');if(!allowed.has(node.tagName)&&!boldSpan){const fragment=document.createDocumentFragment();[...node.childNodes].forEach(child=>fragment.append(clean(child)));return fragment}const element=document.createElement(node.tagName==='B'||boldSpan?'strong':node.tagName.toLowerCase());[...node.childNodes].forEach(child=>element.append(clean(child)));return element}[...source.content.childNodes].forEach(child=>output.append(clean(child)));return output.innerHTML}
function noteBodyToHtml(value){const text=String(value||'');return /<\/?(?:b|strong|ul|ol|li|br|p|div)\b/i.test(text)?sanitizeNoteHtml(text):esc(text).replace(/\r?\n/g,'<br>')}
function cleanNotePreview(v){const d=document.createElement('div');d.innerHTML=noteBodyToHtml(v||'');d.querySelectorAll('li').forEach(li=>{li.insertAdjacentText('afterbegin','• ');li.append('\n')});return (d.textContent||'').replace(/\s+/g,' ').replace(/(https?:\/\/)/g,'\n$1').replace(/^\n/,'').trim()}
function fmtDate(v){return v?new Date(v+'T00:00:00').toLocaleDateString('ru-RU'):''}
function normalStatus(s){const value=s==='completed'?'done':s==='in-progress'?'inwork':s;return ['new','inwork','waiting','done'].includes(value)?value:'new'}
function valid(o){return !!(o&&o.id!==undefined&&o.id!==null&&String(o.id))}
function sameId(a,b){return String(a)===String(b)}
function autoGrow(el){if(!el)return;el.style.height='auto';el.style.height=Math.max(el.scrollHeight,96)+'px'}
function bindAutoGrow(root=document){root.querySelectorAll('textarea').forEach(el=>{if(!el.dataset.autogrowBound){el.dataset.autogrowBound='1';el.addEventListener('input',()=>autoGrow(el))}requestAnimationFrame(()=>autoGrow(el))})}
function applyTheme(theme,persist=false){const next=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=next;document.documentElement.style.colorScheme=next;themeColor.content=next==='dark'?'#191919':'#f7f7f5';themeToggle.setAttribute('aria-label',next==='dark'?'Включить светлую тему':'Включить тёмную тему');themeToggle.title=themeToggle.getAttribute('aria-label');if(persist)try{localStorage.setItem(THEME_KEY,next)}catch{}}
function showOverlay(element){focusStack.push({element,focus:document.activeElement});element.classList.add('show');element.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';requestAnimationFrame(()=>element.querySelector('input,textarea,select,[contenteditable="true"],button')?.focus())}
function hideOverlay(element){element.classList.remove('show');element.setAttribute('aria-hidden','true');if(!document.querySelector('.overlay.show'))document.body.style.overflow='';let index=-1;for(let i=focusStack.length-1;i>=0;i--)if(focusStack[i].element===element){index=i;break}const previous=index>=0?focusStack.splice(index,1)[0]?.focus:null;if(previous instanceof HTMLElement)previous.focus()}
function askConfirm(message,action){confirmMessage.textContent=message;confirmAction=action;showOverlay(confirmDialog)}
function inferredCreatedAt(t){if(t.createdAt&&!Number.isNaN(Date.parse(t.createdAt)))return t.createdAt;const n=Number(String(t.id||'').slice(0,13));return Number.isFinite(n)&&n>1e12?new Date(n).toISOString():now()}
function normTask(t){const priority=['none','low','normal','medium','high'].includes(t.priority)?t.priority:'normal';return {...t,status:normalStatus(t.status),priority,title:t.title||t.summary||'',extra:t.extra||t.additionalInfo||'',dueDate:t.dueDate||t.responseDate||'',reminder:+(t.reminder??t.reminderDays)||0,notes:t.notes||'',createdAt:inferredCreatedAt(t)}}
function allProjects(){return load(LS.projects).filter(valid).map(p=>({...p,title:p.title||p.name||'',description:p.description||'',createdAt:inferredCreatedAt(p)}))}
function allNotes(){return load(LS.notes).filter(valid)}
function tasks(){const arr=load(state.projectId?LS.projectTasks:LS.tasks).filter(valid).map(normTask);return state.projectId?arr.filter(t=>sameId(t.projectId,state.projectId)):arr}
function putTasks(arr){if(state.projectId){const rest=load(LS.projectTasks).filter(t=>!sameId(t.projectId,state.projectId));save(LS.projectTasks,[...rest,...arr])}else save(LS.tasks,arr)}
function counts(){return{tasks:load(LS.tasks).filter(t=>valid(t)&&normalStatus(t.status)!=='done').length,projects:allProjects().length,notes:allNotes().length,calendar:globalThis.upcomingCalendarEvents?.().length||0}}
function statsLine(){const ts=tasks();return `${ts.filter(t=>t.status==='inwork').length} в работе · ${ts.filter(overdue).length} просрочено · ${ts.filter(t=>t.status==='done').length} завершено`}
function overdue(t){return t.dueDate&&t.status!=='done'&&new Date(t.dueDate+'T23:59:59')<new Date()}
function urgent(t){return t.priority==='high'||overdue(t)}
function taskSort(a,b){return Number(urgent(b))-Number(urgent(a))||b.createdAt.localeCompare(a.createdAt)}
function noteSort(a,b){return (b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||'')}
function sortConfig(kind){
  if(kind==='task')return{key:state.projectId?LS.projectTaskOrder:LS.taskOrder,items:load(state.projectId?LS.projectTasks:LS.tasks).filter(valid).map(normTask),compare:taskSort};
  if(kind==='project'){
    const projectTasks=load(LS.projectTasks).filter(valid).map(normTask),hasUrgent=p=>projectTasks.some(t=>sameId(t.projectId,p.id)&&t.status!=='done'&&urgent(t));
    return{key:LS.projectOrder,items:allProjects(),compare:(a,b)=>Number(hasUrgent(b))-Number(hasUrgent(a))||b.createdAt.localeCompare(a.createdAt)};
  }
  return{key:LS.noteOrder,items:allNotes(),compare:noteSort};
}
function orderedItems(items,key,compare){
  const rank=new Map(load(key).map((id,index)=>[String(id),index]));
  return [...items].sort((a,b)=>{
    const aRank=rank.get(String(a.id)),bRank=rank.get(String(b.id)),aKnown=aRank!==undefined,bKnown=bRank!==undefined;
    if(aKnown&&bKnown)return aRank-bRank;
    if(aKnown!==bKnown)return aKnown?1:-1;
    return compare(a,b);
  });
}
function orderedFor(kind,items){const config=sortConfig(kind);return orderedItems(items,config.key,config.compare)}
function persistSortableOrder(kind,visibleIds){
  const config=sortConfig(kind),complete=orderedItems(config.items,config.key,config.compare).map(item=>String(item.id)),visible=visibleIds.map(String),visibleSet=new Set(visible);
  const slots=[];complete.forEach((id,index)=>{if(visibleSet.has(id))slots.push(index)});
  slots.forEach((index,position)=>{if(visible[position]!==undefined)complete[index]=visible[position]});
  save(config.key,complete);
}
function dragHandle(label){return `<button type="button" class="drag-handle" data-drag-handle aria-label="Перетащить ${esc(label)}" title="Перетащить выше или ниже"><span class="drag-grip" aria-hidden="true"></span></button>`}
function bindSortable(root,kind){
  const list=root?.matches?.('.list')?root:root?.querySelector?.('.list');
  if(!list||list.querySelectorAll('[data-sort-id]').length<2)return;
  const requestFrame=window.requestAnimationFrame?.bind(window)||((callback)=>setTimeout(callback,16));
  const cancelFrame=window.cancelAnimationFrame?.bind(window)||clearTimeout;
  const supportsPointer=typeof window.PointerEvent==='function';
  const layoutAnimations=new WeakMap();
  const persist=()=>persistSortableOrder(kind,[...list.querySelectorAll('[data-sort-id]')].map(item=>item.dataset.sortId));
  list.querySelectorAll('[data-drag-handle]').forEach(handle=>{
    const item=handle.closest('[data-sort-id]');
    let dragging=false,pointerId=null,moved=false,startX=0,startY=0,floating=null,originRect=null,frameId=0,pendingPoint=null,lastPoint=null;
    const animateLayout=(before)=>{
      [...list.children].forEach(element=>{
        if(element===item||!element.matches('[data-sort-id]'))return;
        const oldTop=before.get(element),previous=layoutAnimations.get(element);
        previous?.cancel?.();layoutAnimations.delete(element);
        const newTop=element.getBoundingClientRect().top,delta=oldTop===undefined?0:oldTop-newTop;
        if(!delta)return;
        if(typeof element.animate==='function'){
          const animation=element.animate(
            [{transform:`translate3d(0,${delta}px,0)`},{transform:'translate3d(0,0,0)'}],
            {duration:240,easing:'cubic-bezier(.16,1,.3,1)'}
          );
          layoutAnimations.set(element,animation);
          animation.onfinish=()=>{if(layoutAnimations.get(element)===animation)layoutAnimations.delete(element)};
        }else{
          element.style.transition='none';element.style.transform=`translate3d(0,${delta}px,0)`;void element.offsetHeight;element.style.transition='transform 240ms cubic-bezier(.16,1,.3,1)';element.style.transform='';
          setTimeout(()=>{element.style.transition='';element.style.transform=''},260);
        }
      });
    };
    const positionFloating=(clientX,clientY)=>{
      if(!floating)return;
      const dx=clientX-startX,dy=clientY-startY,rotation=Math.max(-2.4,Math.min(2.4,dx/35));
      floating.style.transform=`translate3d(${dx}px,${dy}px,0) rotate(${rotation}deg) scale(1.025)`;
    };
    const moveItem=(clientX,clientY)=>{
      if(!dragging)return;
      if(Math.abs(clientY-startY)>4)moved=true;
      positionFloating(clientX,clientY);
      const edge=88;
      let scrollSpeed=0;
      if(clientY<edge)scrollSpeed=-Math.ceil((edge-clientY)/5);
      else if(clientY>window.innerHeight-edge)scrollSpeed=Math.ceil((clientY-(window.innerHeight-edge))/5);
      scrollSpeed=Math.max(-18,Math.min(18,scrollSpeed));
      if(scrollSpeed)window.scrollBy(0,scrollSpeed);
      const siblings=[...list.children].filter(element=>element!==item&&element.matches('[data-sort-id]'));
      const rects=siblings.map(element=>[element,element.getBoundingClientRect()]);
      const before=rects.find(([,rect])=>clientY<rect.top+rect.height/2)?.[0];
      let changed=false;
      if(before){if(item.nextElementSibling!==before){const positions=new Map(rects.map(([element,rect])=>[element,rect.top]));list.insertBefore(item,before);animateLayout(positions);changed=true}}
      else if(item!==list.lastElementChild){const positions=new Map(rects.map(([element,rect])=>[element,rect.top]));list.append(item);animateLayout(positions);changed=true}
      return scrollSpeed!==0||changed;
    };
    const drawFrame=()=>{
      frameId=0;
      if(!dragging)return;
      const point=pendingPoint||lastPoint;
      pendingPoint=null;
      if(!point)return;
      lastPoint=point;
      const keepAnimating=moveItem(point.clientX,point.clientY);
      if(keepAnimating&&dragging)frameId=requestFrame(drawFrame);
    };
    const queueMove=(clientX,clientY,event)=>{
      if(!dragging)return;
      event?.preventDefault?.();
      pendingPoint={clientX,clientY};
      if(!frameId)frameId=requestFrame(drawFrame);
    };
    const onPointerMove=event=>{if(pointerId!==null&&event.pointerId!==pointerId)return;queueMove(event.clientX,event.clientY,event)};
    const onTouchMove=event=>{const touch=event.touches[0];if(touch)queueMove(touch.clientX,touch.clientY,event)};
    const removeGlobalListeners=()=>{
      document.removeEventListener('pointermove',onPointerMove);
      document.removeEventListener('pointerup',finish);
      document.removeEventListener('pointercancel',finish);
      document.removeEventListener('touchmove',onTouchMove);
      document.removeEventListener('touchend',finish);
      document.removeEventListener('touchcancel',finish);
    };
    function finish(event){
      if(!dragging)return;
      if(pointerId!==null&&event?.pointerId!==undefined&&event.pointerId!==pointerId)return;
      if(frameId){cancelFrame(frameId);frameId=0}
      if(pendingPoint){const point=pendingPoint;pendingPoint=null;moveItem(point.clientX,point.clientY)}
      dragging=false;pointerId=null;lastPoint=null;removeGlobalListeners();list.classList.remove('is-sorting');document.body.classList.remove('drag-reordering');handle.setAttribute('aria-pressed','false');persist();
      if(floating&&originRect){
        const target=item.getBoundingClientRect(),dx=target.left-originRect.left,dy=target.top-originRect.top;
        floating.style.transition='transform 190ms cubic-bezier(.2,.8,.2,1),opacity 190ms ease';
        floating.style.transform=`translate3d(${dx}px,${dy}px,0) rotate(0deg) scale(1)`;
        floating.style.opacity='0.9';
        setTimeout(()=>{floating?.remove();floating=null;item.classList.remove('dragging','drag-placeholder')},205);
      }else item.classList.remove('dragging','drag-placeholder');
    }
    const begin=(clientX,clientY,id,event)=>{
      if(dragging){event.preventDefault();return}
      if(event.type==='pointerdown'&&event.button!==undefined&&event.button!==0)return;
      event.preventDefault();dragging=true;pointerId=id??null;moved=false;startX=clientX;startY=clientY;originRect=item.getBoundingClientRect();lastPoint={clientX,clientY};pendingPoint=null;
      floating=item.cloneNode(true);floating.classList.add('drag-floating');floating.classList.remove('dragging','drag-placeholder');floating.setAttribute('aria-hidden','true');floating.style.left=`${originRect.left}px`;floating.style.top=`${originRect.top}px`;floating.style.width=`${originRect.width}px`;floating.style.height=`${originRect.height}px`;document.body.append(floating);
      item.classList.add('dragging','drag-placeholder');list.classList.add('is-sorting');document.body.classList.add('drag-reordering');handle.setAttribute('aria-pressed','true');
      if(supportsPointer){
        handle.setPointerCapture?.(id);
        document.addEventListener('pointermove',onPointerMove,{passive:false});
        document.addEventListener('pointerup',finish);
        document.addEventListener('pointercancel',finish);
      }else{
        document.addEventListener('touchmove',onTouchMove,{passive:false});
        document.addEventListener('touchend',finish);
        document.addEventListener('touchcancel',finish);
      }
    };
    if(supportsPointer)handle.addEventListener('pointerdown',event=>begin(event.clientX,event.clientY,event.pointerId,event));
    else handle.addEventListener('touchstart',event=>{const touch=event.touches[0];if(touch)begin(touch.clientX,touch.clientY,null,event)},{passive:false});
    handle.addEventListener('click',event=>{if(moved){event.preventDefault();event.stopPropagation()}moved=false});
    handle.addEventListener('keydown',event=>{
      if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;
      event.preventDefault();const items=[...list.querySelectorAll('[data-sort-id]')],index=items.indexOf(item),target=items[index+(event.key==='ArrowUp'?-1:1)];if(!target)return;
      if(event.key==='ArrowUp')list.insertBefore(item,target);else list.insertBefore(item,target.nextSibling);persist();handle.focus();
    });
  });
}
function updateHeader(){const c=counts(),project=allProjects().find(p=>sameId(p.id,state.projectId)),priorityCount=document.getElementById('prioritiesCount');tasksCount.textContent=c.tasks;projectsCount.textContent=c.projects;notesCount.textContent=c.notes;calendarCount.textContent=c.calendar;if(priorityCount)priorityCount.textContent=globalThis.priorityTaskCount?.()||0;stats.textContent=state.tab==='calendar'&&!project?(globalThis.calendarStatsLine?.()||'Планирование недели'):statsLine();navline.classList.toggle('hidden',!project);tabs.classList.toggle('hidden',!!project);sidebarAgenda.classList.toggle('hidden',!!project);mainTitle.classList.toggle('hidden',!!project);mainTitle.textContent=state.tab==='calendar'?'Календарь':state.tab==='priorities'?'Приоритеты':'Рабочее пространство';document.title=project?`${project.title} · ${APP_TITLE}`:state.tab==='calendar'?`Календарь · ${APP_TITLE}`:state.tab==='priorities'?`Приоритеты · ${APP_TITLE}`:APP_TITLE;if(project)contextTitle.textContent=project.title;document.querySelectorAll('.tab').forEach(b=>{const active=b.dataset.tab===state.tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});globalThis.updateSidebarAgenda?.()}
function render(){updateHeader();page.innerHTML='';page.classList.toggle('calendar-page',state.tab==='calendar'&&!state.projectId);page.classList.toggle('priorities-page',state.tab==='priorities'&&!state.projectId);if(state.projectId||state.tab==='tasks')renderTasks();else if(state.tab==='priorities')globalThis.renderPriorities?.();else if(state.tab==='projects')renderProjects();else if(state.tab==='notes')renderNotes();else renderCalendar();bindAutoGrow(page)}
function renderFilters(){return `<div class="filters" aria-label="Фильтр задач">${[['active','Все активные'],['new','Новые'],['inwork','В работе'],['waiting','Ожидание']].map(([value,label])=>`<button type="button" class="chip ${state.filter===value?'active':''}" data-filter="${value}" aria-pressed="${state.filter===value}">${label}</button>`).join('')}</div>`}
function taskMatchesQuery(t){const q=state.query.trim().toLocaleLowerCase('ru');return !q||[t.title,t.extra,t.notes].some(value=>stripHtml(value||'').toLocaleLowerCase('ru').includes(q))}
function taskPass(t){return (state.filter==='active'?t.status!=='done':t.status===state.filter)&&taskMatchesQuery(t)}
function taskCard(t,done=false){const id=esc(String(t.id)),isUrgent=urgent(t),statusClass=isUrgent?'status-urgent':`status-${t.status}`,stripe=isUrgent?'#D92D20':statusColor[t.status]||A;return `<article class="card" data-sort-id="${id}" style="--stripe:${stripe}">${dragHandle(`задачу ${t.title}`)}<h3>${esc(t.title)}</h3>${t.extra?`<p class="extra">${esc(t.extra)}</p>`:''}<div class="badges"><span class="badge ${statusClass}">${isUrgent?'Важно / срочно':statusText[t.status]||t.status}</span>${isUrgent?'':`<span class="badge pr-${t.priority}">${priorityText[t.priority]||t.priority}</span>`}${t.dueDate?`<span class="date ${overdue(t)?'hot':''}">${fmtDate(t.dueDate)}</span>`:''}</div><div class="buttons"><button type="button" class="btn" data-edit-task="${id}">Изменить</button>${!done&&t.status!=='done'?`<button type="button" class="btn ok" data-done-task="${id}">Готово</button>`:''}<button type="button" class="btn" data-ics-task="${id}">Календарь</button><button type="button" class="btn danger" data-del-task="${id}">Удалить</button></div></article>`}
function sortedTasksHtml(list){if(!list.length)return '<div class="empty"><svg class="icon" aria-hidden="true"><use href="#i-inbox"></use></svg>Подходящих задач нет</div>';return `<div class="list">${orderedFor('task',list).map(t=>taskCard(t,t.status==='done')).join('')}</div>`}
function renderTasks(){const ts=tasks();page.innerHTML=`<div class="view-heading"><h2>${state.projectId?'Задачи проекта':'Мои задачи'}</h2><span class="rule"></span></div><div class="search-wrap"><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg><input class="search" id="taskSearch" type="search" autocomplete="off" placeholder="Поиск по задачам" value="${esc(state.query)}" aria-label="Поиск по задачам"></div>${renderFilters()}<div id="activeTasks"></div>${!state.projectId?`<div class="bottom-actions"><button type="button" class="btn" id="csvBtn">Экспорт CSV</button><button type="button" class="btn" id="backupBtn">Резервная копия</button><button type="button" class="btn" id="restoreBtn">Восстановить</button></div>`:''}<section class="completed-section"><button type="button" class="completed-link" id="toggleCompleted" aria-expanded="${state.showCompleted}"></button><div id="completedTasks"></div></section>`;const input=$('#taskSearch'),active=$('#activeTasks'),completed=$('#completedTasks'),toggle=$('#toggleCompleted');function draw(){state.query=input.value;const done=ts.filter(t=>t.status==='done'&&taskMatchesQuery(t)),list=ts.filter(taskPass);active.innerHTML=sortedTasksHtml(list);toggle.textContent=`${state.showCompleted?'▴':'▾'} Завершённые (${done.length})`;toggle.setAttribute('aria-expanded',String(state.showCompleted));completed.innerHTML=state.showCompleted?sortedTasksHtml(done):'';bindSortable(active,'task');if(state.showCompleted)bindSortable(completed,'task')}input.oninput=draw;draw()}
function renderProjects(){const pts=load(LS.projectTasks).filter(valid).map(normTask);page.innerHTML=`<div class="view-heading"><h2>Проекты</h2><span class="rule"></span></div><div class="search-wrap"><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg><input class="search" id="projectSearch" type="search" autocomplete="off" placeholder="Поиск проектов" value="${esc(state.query)}" aria-label="Поиск проектов"></div><div class="list" id="projectsList"></div>`;const input=$('#projectSearch'),list=$('#projectsList');function draw(){state.query=input.value;const q=state.query.toLocaleLowerCase('ru'),hasUrgent=p=>pts.some(t=>String(t.projectId)===String(p.id)&&t.status!=='done'&&urgent(t));const projects=orderedFor('project',allProjects().filter(p=>!q||JSON.stringify(p).toLocaleLowerCase('ru').includes(q)));list.innerHTML=projects.map(p=>{const id=esc(String(p.id)),sub=pts.filter(t=>String(t.projectId)===String(p.id)),done=sub.filter(t=>t.status==='done').length,pr=sub.length?Math.round(done/sub.length*100):0,important=hasUrgent(p);return `<article class="card project-card" data-sort-id="${id}">${dragHandle(`проект ${p.title}`)}<h3 data-open-project="${id}"><svg class="icon" aria-hidden="true"><use href="#i-folder"></use></svg>${esc(p.title)}</h3>${p.description?`<p class="extra">${esc(p.description)}</p>`:''}${important?'<div class="badges"><span class="badge status-urgent">Есть важные / срочные задачи</span></div>':''}<p class="meta">Задач: ${sub.length} · активных: ${sub.length-done} · выполнено: ${pr}%</p><div class="progress" role="progressbar" aria-label="Выполнение проекта" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pr}"><span style="width:${pr}%"></span></div><div class="buttons"><button type="button" class="btn" data-open-project="${id}">Открыть</button><button type="button" class="btn" data-edit-project="${id}">Изменить</button><button type="button" class="btn danger" data-del-project="${id}">Удалить</button></div></article>`}).join('')||'<div class="empty"><svg class="icon" aria-hidden="true"><use href="#i-folder"></use></svg>Проекты не найдены</div>';bindSortable(list,'project')}input.oninput=draw;draw()}
function renderNotes(){page.innerHTML=`<div class="view-heading"><h2>Заметки</h2><span class="rule"></span></div><div class="search-wrap"><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg><input class="search" id="noteSearch" type="search" autocomplete="off" placeholder="Поиск заметок" value="${esc(state.query)}" aria-label="Поиск заметок"></div><div class="list" id="notesList"></div>`;const input=$('#noteSearch'),list=$('#notesList');function draw(){state.query=input.value;const q=state.query.toLocaleLowerCase('ru');const notes=orderedFor('note',allNotes().filter(n=>!q||`${n.title||''} ${stripHtml(n.body||'')}`.toLocaleLowerCase('ru').includes(q)));list.innerHTML=notes.map(n=>{const id=esc(String(n.id)),preview=cleanNotePreview(n.body).slice(0,700);return `<div class="swipe-row" data-note-row="${id}" data-sort-id="${id}"><div class="swipe-action"><button type="button" class="swipe-delete" data-delete-note="${id}" aria-label="Удалить заметку">Удалить</button></div><article class="card note-card" data-open-note="${id}" tabindex="0" role="button" aria-label="Открыть заметку ${esc(n.title||'Без заголовка')}">${dragHandle(`заметку ${n.title||'Без заголовка'}`)}<h3>${esc(n.title||'Без заголовка')}</h3><p class="extra note-preview">${esc(preview)||'Пустая заметка'}</p></article></div>`}).join('')||'<div class="empty"><svg class="icon" aria-hidden="true"><use href="#i-note"></use></svg>Заметки не найдены</div>';bindNoteSwipe();bindSortable(list,'note')}input.oninput=draw;draw()}
function bindNoteSwipe(){let openRow=null;document.querySelectorAll('.swipe-row').forEach(row=>{const card=row.querySelector('.note-card');let startX=0,startY=0,startOffset=0,current=0,dragging=false,moved=false;const set=x=>{current=Math.max(-96,Math.min(0,x));card.style.transform=`translateX(${current}px)`};card.addEventListener('pointerdown',e=>{if(e.target.closest('[data-drag-handle]'))return;if(openRow&&openRow!==row){const other=openRow.querySelector('.note-card');other.style.transform='translateX(0)';openRow=null}dragging=true;moved=false;startX=e.clientX;startY=e.clientY;startOffset=current;card.classList.add('swiping');card.setPointerCapture?.(e.pointerId)});card.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-startX,dy=e.clientY-startY;if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>8){dragging=false;card.classList.remove('swiping');set(startOffset);return}if(Math.abs(dx)>5)moved=true;set(startOffset+dx)});const finish=()=>{if(!dragging)return;dragging=false;card.classList.remove('swiping');if(current<-42){set(-96);openRow=row}else{set(0);if(openRow===row)openRow=null}setTimeout(()=>{card.dataset.swipeMoved=moved?'1':'0'},0)};card.addEventListener('pointerup',finish);card.addEventListener('pointercancel',finish);card.addEventListener('click',e=>{if(card.dataset.swipeMoved==='1'){e.preventDefault();e.stopPropagation();card.dataset.swipeMoved='0'}})})}
function deleteNote(id){const arr=allNotes(),idx=arr.findIndex(n=>sameId(n.id,id));if(idx<0)return;deletedNote={note:arr[idx],index:idx};arr.splice(idx,1);save(LS.notes,arr);render();clearTimeout(undoTimer);undoToast.classList.add('show');undoTimer=setTimeout(()=>{deletedNote=null;undoToast.classList.remove('show')},4000)}
function undoNoteDelete(){if(!deletedNote)return;const arr=allNotes();arr.splice(Math.min(deletedNote.index,arr.length),0,deletedNote.note);save(LS.notes,arr);deletedNote=null;clearTimeout(undoTimer);undoToast.classList.remove('show');render()}
function openTask(t={}){state.editingTask=t;taskSheetTitle.textContent=t.id?'Редактирование задачи':'Новая задача';taskForm.innerHTML=`<div class="sheet-fields"><div class="field"><label>Краткая суть задачи *</label><textarea name="title" required>${esc(t.title||'')}</textarea></div><div class="field"><label>Что требуется дополнительно</label><textarea name="extra">${esc(t.extra||'')}</textarea></div><div class="grid2"><div class="field"><label>Дата ответа</label><input type="date" name="dueDate" value="${esc(t.dueDate||'')}"></div><div class="field"><label>Напоминание</label><select name="reminder"><option value="0">Нет</option><option value="1">За 1 день</option><option value="2">За 2 дня</option><option value="3">За 3 дня</option><option value="7">За неделю</option></select></div></div><div class="grid2"><div class="field"><label>Категория срочности</label><select name="priority"><option value="normal">Обычная</option><option value="low">Низкая</option><option value="medium">Средняя</option><option value="high">Важно / срочно</option></select></div><div class="field"><label>Статус</label><select name="status"><option value="new">Новая</option><option value="inwork">В работе</option><option value="waiting">Ожидание</option><option value="done">Завершена</option></select></div></div><div class="field"><label>Заметки</label><textarea name="notes" data-autogrow="true">${esc(stripHtml(t.notes||''))}</textarea></div></div><div class="sheet-actions"><button type="button" class="btn" id="cancelTask">Отмена</button><button type="submit" class="btn primary">${t.id?'Сохранить':'Создать'}</button></div>`;taskForm.reminder.value=t.reminder??0;taskForm.priority.value=t.priority||'normal';taskForm.status.value=t.status||'new';showOverlay(taskSheet);bindAutoGrow(taskForm)}
function saveTaskForm(e){e.preventDefault();const f=new FormData(taskForm),arr=tasks(),old=state.editingTask?.id&&arr.find(x=>sameId(x.id,state.editingTask.id)),title=(f.get('title')||'').trim();if(!title){const control=taskForm.elements.namedItem('title');control.setCustomValidity('Укажите краткую суть задачи');control.reportValidity();control.setCustomValidity('');return}const status=f.get('status'),timestamp=now();const obj={...(old||{}),id:old?.id||uid(),projectId:state.projectId||old?.projectId,title,extra:(f.get('extra')||'').trim(),dueDate:f.get('dueDate'),reminder:+f.get('reminder')||0,priority:f.get('priority'),status,notes:f.get('notes')||'',createdAt:old?.createdAt||timestamp,updatedAt:timestamp,completedAt:status==='done'?(old?.completedAt||timestamp):undefined};old?arr.splice(arr.indexOf(old),1,obj):arr.push(obj);putTasks(arr);hideOverlay(taskSheet);render()}
function openProject(p={}){state.editingProject=p;projectSheetTitle.textContent=p.id?'Редактирование проекта':'Новый проект';projectForm.innerHTML=`<div class="sheet-fields"><div class="field"><label>Название проекта *</label><input name="title" required value="${esc(p.title||'')}"></div><div class="field"><label>Описание</label><textarea name="description">${esc(p.description||'')}</textarea></div></div><div class="sheet-actions"><button type="button" class="btn" id="cancelProject">Отмена</button><button type="submit" class="btn primary">${p.id?'Сохранить':'Создать'}</button></div>`;showOverlay(projectSheet);bindAutoGrow(projectForm)}
function saveProjectForm(e){e.preventDefault();const f=new FormData(projectForm),arr=allProjects(),old=state.editingProject?.id&&arr.find(x=>sameId(x.id,state.editingProject.id)),title=(f.get('title')||'').trim();if(!title){const control=projectForm.elements.namedItem('title');control.setCustomValidity('Укажите название проекта');control.reportValidity();control.setCustomValidity('');return}const obj={...(old||{}),id:old?.id||uid(),title,description:(f.get('description')||'').trim(),createdAt:old?.createdAt||now(),updatedAt:now()};old?arr.splice(arr.indexOf(old),1,obj):arr.push(obj);save(LS.projects,arr);hideOverlay(projectSheet);render()}
function openNote(n={}){state.editingNote=n;noteSheetTitle.textContent=n.id?'Редактирование заметки':'Новая заметка';noteForm.innerHTML=`<div class="sheet-fields"><div class="field"><label>Заголовок</label><input name="title" value="${esc(n.title||'')}"></div><div class="field"><label>Текст</label><div class="editor-wrap"><div class="editor-toolbar" role="toolbar" aria-label="Форматирование текста"><button type="button" class="editor-btn bold" data-note-command="bold" aria-label="Полужирный текст">B</button><button type="button" class="editor-btn" data-note-command="insertUnorderedList" aria-label="Маркированный список">• Список</button><button type="button" class="editor-btn" data-note-command="undo" aria-label="Отменить последнее изменение">↶ Отменить</button></div><div id="noteBodyEditor" class="note-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Введите текст заметки"></div></div></div></div><div class="sheet-actions"><button type="button" class="btn" id="cancelNote">Отмена</button><button type="submit" class="btn primary">${n.id?'Сохранить':'Создать'}</button></div>`;const editor=$('#noteBodyEditor');editor.innerHTML=noteBodyToHtml(n.body||'');noteForm.querySelectorAll('[data-note-command]').forEach(button=>{button.addEventListener('pointerdown',e=>e.preventDefault());button.addEventListener('click',()=>{editor.focus();document.execCommand(button.dataset.noteCommand,false,null)})});showOverlay(noteSheet)}
function saveNoteForm(e){e.preventDefault();const f=new FormData(noteForm),arr=allNotes(),old=state.editingNote?.id&&arr.find(x=>sameId(x.id,state.editingNote.id)),editor=$('#noteBodyEditor');let body=sanitizeNoteHtml(editor?.innerHTML||'');if(!stripHtml(body).trim())body='';const obj={...(old||{}),id:old?.id||uid(),title:(f.get('title')||'').trim(),body,attachments:old?.attachments||[],createdAt:old?.createdAt||now(),updatedAt:now()};old?arr.splice(arr.indexOf(old),1,obj):arr.push(obj);save(LS.notes,arr);hideOverlay(noteSheet);render()}
function download(name,data,type){const a=document.createElement('a'),u=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500)}
function csvSafe(v){v=String(v??'');if(/^[=+\-@]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
function exportCsv(){const rows=[['title','extra','dueDate','reminder','priority','status'],...load(LS.tasks).filter(valid).map(normTask).map(t=>[t.title,t.extra,t.dueDate,t.reminder,t.priority,t.status])];download('tasks.csv',rows.map(r=>r.map(csvSafe).join(',')).join('\n'),'text/csv')}
function backup(){download('lawyer-backup.json',JSON.stringify({version:8,tasks:load(LS.tasks),projects:load(LS.projects),projectTasks:load(LS.projectTasks),notes:load(LS.notes),calendarEvents:load(LS.calendarEvents),taskOrder:load(LS.taskOrder),projectTaskOrder:load(LS.projectTaskOrder),projectOrder:load(LS.projectOrder),noteOrder:load(LS.noteOrder)},null,2),'application/json')}
function restore(file){if(!file)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);['tasks','projects','projectTasks','notes','calendarEvents','taskOrder','projectTaskOrder','projectOrder','noteOrder'].forEach(k=>Array.isArray(d[k])&&save(LS[k],d[k]));render()}catch{alert('Не удалось прочитать файл резервной копии')}};r.readAsText(file)}
function icsSafe(v){return String(v??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/([,;])/g,'\\$1')}
function makeIcs(t){const dt=(t?.dueDate||new Date().toISOString().slice(0,10)).replaceAll('-','');download('task.ics',`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Lawyer Tracker//RU\r\nBEGIN:VEVENT\r\nUID:${icsSafe(t?.id||uid())}\r\nSUMMARY:${icsSafe(t?.title||'Задача')}\r\nDTSTART;VALUE=DATE:${dt}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,'text/calendar;charset=utf-8')}
function switchTab(tab){state={...state,tab,query:'',projectId:null,filter:'active',showCompleted:false};render()}
tabs.onclick=e=>{const b=e.target.closest('.tab');if(b)switchTab(b.dataset.tab)};
backBtn.onclick=()=>{state.projectId=null;state.filter='active';state.query='';state.showCompleted=false;render()};
fab.onclick=()=>state.tab==='projects'&&!state.projectId?openProject():state.tab==='notes'&&!state.projectId?openNote():state.tab==='calendar'&&!state.projectId?openCalendarEvent():openTask();
page.onclick=e=>{
  if(e.target.closest('[data-drag-handle]'))return;
  let id;
  if(e.target.dataset.filter){state.filter=e.target.dataset.filter;state.showCompleted=false;render()}
  if(e.target.id==='toggleCompleted'){state.showCompleted=!state.showCompleted;render()}
  id=e.target.dataset.editTask;if(id)openTask(tasks().find(t=>sameId(t.id,id)));
  id=e.target.dataset.doneTask;if(id){const arr=tasks(),t=arr.find(x=>sameId(x.id,id));if(t){const timestamp=now();t.status='done';t.completedAt=t.completedAt||timestamp;t.updatedAt=timestamp;putTasks(arr);render()}}
  id=e.target.dataset.delTask;if(id){const taskId=id;askConfirm('Задача будет удалена без возможности восстановления.',()=>{putTasks(tasks().filter(t=>!sameId(t.id,taskId)));render()})}
  id=e.target.dataset.icsTask;if(id)makeIcs(tasks().find(t=>sameId(t.id,id)));
  id=e.target.closest('[data-open-project]')?.dataset.openProject;if(id){state.projectId=id;state.filter='active';state.query='';state.showCompleted=false;render()}
  id=e.target.dataset.editProject;if(id)openProject(allProjects().find(p=>sameId(p.id,id)));
  id=e.target.dataset.delProject;if(id){const projectId=id;askConfirm('Проект и все его задачи будут удалены без возможности восстановления.',()=>{save(LS.projects,allProjects().filter(p=>!sameId(p.id,projectId)));save(LS.projectTasks,load(LS.projectTasks).filter(t=>!sameId(t.projectId,projectId)));render()})}
  id=e.target.dataset.deleteNote;if(id){e.stopPropagation();deleteNote(id);return}
  id=e.target.closest('[data-open-note]')?.dataset.openNote;if(id&&!e.target.closest('.swipe-action'))openNote(allNotes().find(n=>sameId(n.id,id)));
  if(e.target.id==='csvBtn')exportCsv();if(e.target.id==='backupBtn')backup();if(e.target.id==='restoreBtn')restoreInput.click();
};
undoDelete.onclick=undoNoteDelete;
themeToggle.onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark',true);
confirmCancel.onclick=()=>{confirmAction=null;hideOverlay(confirmDialog)};
confirmAccept.onclick=()=>{const action=confirmAction;confirmAction=null;hideOverlay(confirmDialog);action?.()};
taskForm.onsubmit=saveTaskForm;projectForm.onsubmit=saveProjectForm;noteForm.onsubmit=saveNoteForm;restoreInput.onchange=()=>restore(restoreInput.files[0]);
document.addEventListener('click',e=>{if(e.target.id==='cancelTask')hideOverlay(taskSheet);if(e.target.id==='cancelProject')hideOverlay(projectSheet);if(e.target.id==='cancelNote')hideOverlay(noteSheet);if(e.target.classList.contains('overlay')){if(e.target===confirmDialog)confirmAction=null;hideOverlay(e.target)}});
document.addEventListener('keydown',e=>{const open=[...document.querySelectorAll('.overlay.show')].at(-1);if(e.key==='Escape'&&open){e.preventDefault();e.stopImmediatePropagation();if(open===confirmDialog)confirmAction=null;hideOverlay(open);return}if(e.key==='Tab'&&open){const focusable=[...open.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden);if(focusable.length){const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-open-note]')){e.preventDefault();openNote(allNotes().find(n=>sameId(n.id,e.target.dataset.openNote)))}});
const systemTheme=matchMedia('(prefers-color-scheme: dark)');systemTheme.addEventListener?.('change',event=>{let saved=null;try{saved=localStorage.getItem(THEME_KEY)}catch{}if(!saved)applyTheme(event.matches?'dark':'light')});
if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{})}
applyTheme(document.documentElement.dataset.theme);
render();
