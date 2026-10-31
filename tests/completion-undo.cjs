const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class El{constructor(){this.children=[];this.textContent='';this.classList={add(){},remove(){}};}matches(){return false;}querySelectorAll(){return [];}setAttribute(){}replaceChildren(...nodes){this.children=nodes;}}
const nodes=new Map();const body=new El();body.append=el=>nodes.set(el.id,el);
const document={body,getElementById:id=>nodes.get(id),createElement:()=>new El(),addEventListener(){}};
const previous={id:'one',title:'Task',status:'inwork'},completed={...previous,status:'done',updatedAt:'completed'};
let rendered=false;
const ctx={document,HTMLElement:El,MutationObserver:class{observe(){}},page:new El(),taskForm:new El(),setTimeout:()=>1,clearTimeout(){},load:()=>structuredClone([completed]),save:()=>false,normalStatus:x=>x,sameId:(a,b)=>String(a)===String(b),now:()=>'',render:()=>rendered=true};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../task-completion.js',`file://${__filename}`),'utf8'),ctx);
ctx.lawyerCompletionUndo('tasks',previous,completed);const toast=nodes.get('workspaceToast');toast.children[1].onclick();
assert.notEqual(toast.textContent,'Выполнение отменено','failed save cannot announce successful undo');
assert.match(toast.textContent,/Не удалось/);assert.equal(rendered,false);
console.log('PASS failed completion undo reports the write error and preserves current UI');
