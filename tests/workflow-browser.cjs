const assert=require('node:assert/strict');
module.exports=async function verifyWorkflow(browser,baseURL){
 const context=await browser.newContext({viewport:{width:1440,height:1050}});
 const stamp=new Date().toISOString(),date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()-(date.getDay()||7)+1);
 const day=n=>{const d=new Date(date);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const monday=day(0),tuesday=day(1),deadline='2027-02-15';
 await context.addInitScript(({stamp,monday,deadline})=>{
  localStorage.setItem('lawyerTasks',JSON.stringify([{id:'one',title:'Первый приоритет',status:'inwork',dueDate:deadline,priorityDate:monday,priorityLevel:'main',priorityOrder:0,createdAt:stamp},{id:'two',title:'Второй приоритет',status:'new',priorityDate:monday,priorityLevel:'main',priorityOrder:1,createdAt:stamp}]));
  localStorage.setItem('lawyerProjects',JSON.stringify([{id:'case',title:'Дело для проверки',draftHtml:'<p>Исходная позиция</p>',createdAt:stamp}]));
  localStorage.setItem('lawyerProjectTasks',JSON.stringify([{id:'case-task',projectId:'case',title:'Шаг по делу',status:'inwork',dueDate:deadline,createdAt:stamp}]));
 },{stamp,monday,deadline});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const poll=async fn=>{const start=Date.now();while(Date.now()-start<7000){if(await page.evaluate(fn))return;await new Promise(r=>setTimeout(r,40));}throw new Error('Workflow state timeout');};
 try{
  await page.goto(baseURL);await page.locator('[data-tab="priorities"]').click();
  await page.locator('[data-priority-card="two"] [data-priority-drag]').press('Alt+ArrowUp');
  const order=()=>page.locator(`.priority-day[data-priority-date="${monday}"] [data-priority-card]`).evaluateAll(els=>els.map(el=>el.dataset.priorityCard));
  assert.deepEqual(await order(),['two','one']);
  // Disable the seed init script before reloading by using a second page in the same
  // context would still re-seed; persistence is checked in a context without scripts below.
  const snapshot=await page.evaluate(()=>({root:JSON.parse(localStorage.getItem('lawyerTasks')),project:JSON.parse(localStorage.getItem('lawyerProjectTasks'))}));
  assert.equal(snapshot.root.find(t=>t.id==='two').priorityOrder,0);
  assert.equal(snapshot.root.find(t=>t.id==='one').dueDate,deadline);
  await page.locator('[data-priority-card="one"] [data-priority-drag]').press('Alt+ArrowRight');
  assert.equal(await page.locator('[data-priority-card="one"]').getAttribute('data-priority-date'),tuesday);
  const from=await page.locator('[data-priority-card="two"] [data-priority-drag]').boundingBox();
  const target=await page.locator(`.priority-day[data-priority-date="${tuesday}"] [data-priority-dropzone][data-priority-level="other"]`).boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12});await page.mouse.up();
  assert.equal(await page.locator('[data-priority-card="two"]').getAttribute('data-priority-date'),tuesday);
  assert.equal(await page.locator('[data-priority-card="two"]').getAttribute('data-priority-level'),'other');
  await page.locator('[data-priority-card="one"] [data-priority-open]').click();await page.locator('[data-task-detail-edit]').click();
  await page.locator('#task-title').fill('Приоритет изменён');await page.locator('#task-status').selectOption('waiting');await page.locator('#task-waitingFor').fill('Бизнес');await page.locator('#task-checkDate').fill('2027-02-10');await page.locator('#taskForm [type="submit"]').click();
  const updated=await page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerTasks')).find(t=>t.id==='one'));
  assert.equal(updated.title,'Приоритет изменён');assert.equal(updated.dueDate,deadline);assert.equal(updated.priorityDate,tuesday);assert.equal(updated.waitingFor,'Бизнес');
  await page.locator(`[data-priority-add="main"][data-priority-date="${monday}"]`).click();await page.locator('#priorityExisting').selectOption('project:case-task');await page.locator('#priorityForm [type="submit"]').click();
  assert.equal(await page.locator('[data-priority-card="case-task"]').getAttribute('data-task-scope'),'project');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerProjectTasks'))[0].dueDate),deadline);
  await page.locator('[data-priority-card="case-task"] [data-priority-open]').click();await page.locator('[data-task-detail-edit]').click();await page.locator('#task-title').fill('Изменённый шаг дела');await page.locator('#taskForm [type="submit"]').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerProjectTasks'))[0].title),'Изменённый шаг дела');
  // Re-open with no re-seeding: remove init scripts via a new context, transferring
  // only test localStorage. Reload in that context exercises normal app persistence.
  const testStorage=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('lawyer'))));
  const recovered=await browser.newContext({viewport:{width:1440,height:1050}});const p=await recovered.newPage();
  await p.goto(baseURL);await p.evaluate(data=>{for(const [k,v]of Object.entries(data))localStorage.setItem(k,v);},testStorage);await p.reload();await p.locator('[data-tab="priorities"]').click();
  assert.equal(await p.locator('[data-priority-card="two"]').getAttribute('data-priority-date'),tuesday);
  await p.locator('[data-tab="projects"]').click();await p.locator('[data-ref-case="case"]').click();
  await p.locator('#caseDraft').fill('Вторая позиция');await pollOn(p,()=>JSON.parse(localStorage.getItem('lawyerProjects'))[0].draftHtml.includes('Вторая'));
  await p.locator('[data-ref-revisions]').click();await p.locator('[data-ref-restore-revision]').first().click();assert.match(await p.locator('#caseDraft').innerText(),/Исходная позиция/);
  assert.ok((await p.evaluate(()=>JSON.parse(localStorage.getItem('lawyerProjects'))[0].draftHistory)).some(v=>v.html.includes('Вторая')));
  for(const width of [320,390,430,768,1024,1440,1600]){
   await p.setViewportSize({width,height:900});await p.locator('[data-tab="priorities"]').click();if(width<=760)await p.locator(`[data-priority-day-target="${tuesday}"]`).click();
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'priority overflow '+width);
   assert.equal(await p.locator('#tabs .tab').count(),4);
  }
  await recovered.close();assert.deepEqual(errors,[]);
  console.log('PASS workflow browser: pointer/keyboard moves, root/project edit, deadlines, reload, draft recovery, seven widths');
 }finally{await context.close();}
};
async function pollOn(page,fn){const t=Date.now();while(Date.now()-t<7000){if(await page.evaluate(fn))return;await new Promise(r=>setTimeout(r,50));}throw Error('Draft not persisted');}
