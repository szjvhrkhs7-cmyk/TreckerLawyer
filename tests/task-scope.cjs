const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(new URL('../app-core.js',`file://${__filename}`),'utf8');
const functions=['taskSortKey','sortConfig','orderedItems','orderedFor','persistSortableOrder'].map(name=>{const start=source.indexOf('function '+name+'(');assert.ok(start>=0,'scope-safe list ordering needs '+name);const end=source.indexOf('\nfunction ',start+1);return source.slice(start,end<0?undefined:end);}).join('\n');
const root=[{id:'same',createdAt:'2026-01-01'},{id:'b',createdAt:'2026-01-01'}],project=[{id:'same',projectId:'case',createdAt:'2026-01-01'}];
const db={tasks:root,projectTasks:project,taskOrder:['b','same']};
const ctx={LS:{tasks:'tasks',projectTasks:'projectTasks',taskOrder:'taskOrder'},state:{projectId:null},load:key=>db[key]||[],save:(key,v)=>db[key]=v,valid:()=>true,normTask:t=>t,taskSort:(a,b)=>String(a.id).localeCompare(b.id)};vm.createContext(ctx);vm.runInContext(functions,ctx);
ctx.items=[...root,...project];
assert.equal(vm.runInContext("orderedFor('task',items).filter(t=>!t.projectId).map(t=>t.id).join(',')",ctx),'b,same');
vm.runInContext("persistSortableOrder('task',['root:same','project:same','root:b'])",ctx);
assert.equal(db.taskOrder.join(','),'root:same,project:same,root:b');
assert.equal(vm.runInContext("orderedFor('task',items).map(taskSortKey).join(',')",ctx),'root:same,project:same,root:b');
console.log('PASS task list: legacy root order, equal ids in different scopes, persistent unified sorting');
root[0].title='Root CSV';project[0].title='Legacy CSV';
let csv='';ctx.csvSafe=v=>String(v??'');ctx.download=(name,value)=>csv=value;
const csvStart=source.indexOf('function exportCsv('),csvEnd=source.indexOf('\nfunction ',csvStart+1);
vm.runInContext(source.slice(csvStart,csvEnd)+';exportCsv();',ctx);
assert.ok(csv.includes('Legacy CSV'),'CSV must include visible legacy project tasks');
// Journal lookups use scope-qualified tokens; the browser regression exercises edits
// with the same task ID in both collections and checks their independent persistence.
