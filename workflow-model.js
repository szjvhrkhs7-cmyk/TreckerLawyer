/* Shared, pure operations. Scheduling is independent of deadlines and collection ids. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LawyerWorkflow=api;})(globalThis,()=>{
  'use strict';
  const same=(a,b)=>String(a.id)===String(b.id)&&a.scope===b.scope;
  function validDay(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const d=new Date(value+'T12:00:00');return !Number.isNaN(+d)&&`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`===value;}
  function ordered(entries){return entries.map((entry,index)=>({entry,index})).sort((a,b)=>(Number.isFinite(a.entry.task.priorityOrder)?a.entry.task.priorityOrder:a.index)-(Number.isFinite(b.entry.task.priorityOrder)?b.entry.task.priorityOrder:b.index)||a.index-b.index).map(x=>x.entry);}
  function movePriority(collections,ref,destination,timestamp=new Date().toISOString()){
    if(!['root','project'].includes(ref.scope)||!validDay(destination.date)||!['main','other'].includes(destination.level))return null;
    const entries=Object.entries(collections).flatMap(([scope,items])=>items.map(task=>({scope,task,id:task.id})));
    const current=entries.find(e=>same(e,ref));
    if(!current||['done','completed'].includes(current.task.status))return null;
    const target=ordered(entries.filter(e=>!same(e,ref)&&e.task.priorityDate===destination.date));
    const index=destination.before?target.findIndex(e=>same(e,destination.before)):-1;
    target.splice(index<0?target.length:index,0,current);
    const next={};
    for(const [scope,items] of Object.entries(collections))next[scope]=items.map(task=>{
      const order=target.findIndex(e=>same(e,{scope,id:task.id}));
      if(order<0)return {...task};
      return {...task,priorityDate:destination.date,priorityLevel:same({scope,id:task.id},ref)?destination.level:(task.priorityLevel==='other'?'other':'main'),priorityOrder:order,updatedAt:timestamp};
    });
    return next;
  }
  function commitCollections(previous,next,write){
    const changed=Object.keys(next).filter(key=>JSON.stringify(previous[key])!==JSON.stringify(next[key]));
    const attempted=[];
    try{for(const key of changed){attempted.push(key);if(write(key,next[key])===false)throw new Error('WRITE_FAILED');}return true;}
    catch{for(const key of attempted.reverse()){try{write(key,previous[key]);}catch{}}return false;}
  }
  function draftPatch(project,html,timestamp){
    if((project.draftHtml||'')===html)return null;
    const revision=(Number(project.draftRevision)||0)+1;
    let history=Array.isArray(project.draftHistory)?project.draftHistory.filter(x=>x&&typeof x.html==='string'):[];
    if(project.draftHtml)history=[{id:String(revision),html:project.draftHtml,savedAt:project.updatedAt||timestamp},...history];
    return {draftHtml:html,draftHistory:history.slice(0,10),draftRevision:revision};
  }
  function monthDays(year, month) {
    if (!Number.isInteger(year) || year < 100 || year > 9999 || !Number.isInteger(month) || month < 0 || month > 11) return [];
    const offset = (new Date(year, month, 1, 12).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0, 12).getDate();
    return Array.from({length: Math.ceil((offset + count) / 7) * 7}, (_, i) => {
      const day = i - offset + 1;
      return day < 1 || day > count ? null : `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    });
  }
  function subtaskProgress(task) {
    const items = Array.isArray(task.subtasks) ? task.subtasks.filter(s => s && s.id != null && typeof s.title === 'string') : [];
    return {done: items.filter(s => s.completed === true).length, total: items.length};
  }
  function patchSubtask(task, operation, timestamp) {
    const items = Array.isArray(task.subtasks) ? task.subtasks.map(s => s && typeof s === 'object' ? {...s} : s) : [];
    const index = items.findIndex(s => s && String(s.id) === String(operation.id));
    const title = typeof operation.title === 'string' ? operation.title.trim() : '';
    if (operation.type === 'add') {
      if (!title || operation.id == null || !String(operation.id) || index >= 0) return null;
      items.push({id: operation.id, title, completed: false, createdAt: timestamp, updatedAt: timestamp});
    } else {
      if (index < 0) return null;
      if (operation.type === 'edit') { if (!title) return null; items[index] = {...items[index], title, updatedAt: timestamp}; }
      else if (operation.type === 'toggle') items[index] = {...items[index], completed: !items[index].completed, updatedAt: timestamp};
      else if (operation.type === 'remove') items.splice(index, 1);
      else return null;
    }
    return {...task, subtasks: items, updatedAt: timestamp};
  }
  return {validDay,ordered,movePriority,commitCollections,draftPatch,monthDays,subtaskProgress,patchSubtask};
});
