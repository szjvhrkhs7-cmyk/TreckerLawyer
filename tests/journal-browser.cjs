const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
const baseURL=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';let server;
const screenshots=process.env.TEST_SCREENSHOT_DIR||'/tmp/journal-qa';
(async()=>{
 if(!process.env.TEST_BASE_URL){const root=path.resolve(__dirname,'..');server=require('node:http').createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,baseURL).pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error();const content=await fs.readFile(file),type={'.js':'application/javascript','.html':'text/html','.css':'text/css','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'text/plain';res.writeHead(200,{'content-type':type+'; charset=utf-8'});res.end(content);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(8765,'127.0.0.1',r));}
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.TEST_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
 await fs.mkdir(screenshots,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[],csp=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/content security policy|refused to/i.test(m.text()))csp.push(m.text());});page.on('requestfailed',r=>{if(r.url().startsWith(baseURL))failed.push(r.url());});
  page.on('dialog',d=>d.accept());
  const stamp=new Date().toISOString();
  await context.addInitScript(({stamp})=>{if(localStorage.getItem('journalSeed'))return;localStorage.setItem('journalSeed','1');for(const [key,value] of Object.entries({lawyerTasks:[{id:'same',title:'Общая задача',status:'inwork',dueDate:'2026-11-20',createdAt:stamp,legacyFlag:'retain'}],lawyerProjectTasks:[{id:'same',projectId:'case',title:'Задача прежнего дела',status:'waiting',createdAt:stamp}],lawyerProjects:[{id:'case',title:'Сохраненное дело',draftHtml:'<p>Сохраненный текст</p>'}],lawyerNotes:[{id:'note',body:'Старая заметка'}],lawyerCalendarEvents:[{id:'event',title:'Сохраненное событие',date:'2026-11-11'}]}))localStorage.setItem(key,JSON.stringify(value));},{stamp});
  const tab=async name=>page.locator(`[data-tab="${name}"]`).click();
  const row=token=>page.locator(`[data-task-token="${token}"]`);
  const read=key=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'[]'),key);
  await page.goto(baseURL);await page.waitForFunction(()=>window.lawyerCloud?.getState?.().ready);
  assert.deepEqual(await page.locator('#tabs [data-tab]').evaluateAll(bs=>bs.map(b=>b.dataset.tab)),['priorities','tasks','settings']);
  await page.locator('[data-tab=priorities]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-tab=tasks]').getAttribute('aria-selected'),'true');await page.keyboard.press('End');assert.equal(await page.locator('[data-tab=settings]').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('[data-tab=priorities]').getAttribute('aria-selected'),'true');
  await tab('tasks');assert.equal(await page.locator('#activeTasks .j-task').count(),2);
  await row('project:same').locator('[data-j-action="edit"]').first().click();await page.locator('#task-title').fill('Измененная задача прежнего дела');await page.locator('#taskForm [type=submit]').click();
  assert.equal((await read('lawyerTasks'))[0].title,'Общая задача');assert.equal((await read('lawyerProjectTasks'))[0].title,'Измененная задача прежнего дела');
  console.log('PASS same task IDs in root/project remain independent');
  await row('root:same').locator('[data-j-action="expand"]').click();
  for(const title of ['Собрать условия','Проверить практику','Подготовить выводы']){await row('root:same').getByRole('textbox',{name:'Новая подзадача',exact:true}).fill(title);await row('root:same').getByRole('button',{name:'Добавить подзадачу',exact:true}).click();}
  assert.equal((await read('lawyerTasks'))[0].subtasks.length,3);assert.equal((await read('lawyerTasks'))[0].legacyFlag,'retain');
  await row('root:same').locator('[data-j-action="sub-toggle"]').first().click();assert.match(await row('root:same').innerText(),/1 из 3/);
  await row('root:same').locator('[data-j-action="sub-edit"]').nth(1).click();await page.locator('#childTitle').fill('Проверить актуальную практику');await page.locator('#taskForm [type=submit]').click();
  await page.reload();await tab('tasks');await row('root:same').locator('[data-j-action="expand"]').click();assert.equal(await row('root:same').locator('.j-subtask').count(),3);assert.match(await row('root:same').innerText(),/Проверить актуальную практику/);
  await row('root:same').locator('[data-j-action="complete"]').click();await page.locator('#confirmCancel').click();assert.notEqual((await read('lawyerTasks'))[0].status,'done');
  await row('root:same').locator('[data-j-action="complete"]').click();await page.locator('#confirmAccept').click();assert.equal((await read('lawyerTasks'))[0].status,'done');
  await page.getByRole('button',{name:'Отменить выполнение задачи «Общая задача»',exact:true}).click();assert.equal((await read('lawyerTasks'))[0].status,'inwork');assert.equal((await read('lawyerTasks'))[0].subtasks.length,3);
  console.log('PASS nested subtasks: add/edit/complete/reload, parent confirmation/cancel and undo');
  // Schedule an existing task without changing its deadline, then test month layout and keyboard reorder.
  await tab('priorities');await page.locator('[data-j-action="schedule-new"]').click();await page.locator('#priorityExisting').selectOption('root:same');await require('./date-forms-browser.cjs').pickDate(page,'priorityDay','2026-11-09');await page.locator('#priorityForm [name=main]').check();await page.locator('#priorityForm [type=submit]').click();
  assert.equal((await read('lawyerTasks'))[0].dueDate,'2026-11-20');assert.equal(await page.locator('.j-star').count(),1);
  await page.locator('[data-j-action="calendar-toggle"]').click();assert.equal(await page.locator('[data-j-day]').count(),30);
  assert.equal(await page.locator('[data-j-day="2026-11-01"]').evaluate(el=>[...el.parentElement.children].indexOf(el)),13,'Sunday November 1 follows seven labels and six blanks');
  await page.locator('[data-j-action="calendar-next"]').click();assert.equal(await page.locator('[data-j-day]').count(),31);await page.locator('[data-j-action="calendar-prev"]').click();
  await page.locator('[data-j-day="2026-11-09"]').click();await page.locator('[data-j-action="calendar-toggle"]').click();
  await row('root:same').locator('[data-j-drag]').press('Alt+ArrowRight');assert.equal((await read('lawyerTasks'))[0].priorityDate,'2026-11-10');assert.equal((await read('lawyerTasks'))[0].dueDate,'2026-11-20');
  // Creating a task inside priorities plans it on the selected date.
  await page.locator('[data-j-action="new"]').click();await page.locator('#task-title').fill('Вторая задача с длинным названием для проверки переноса и безопасного отображения <img src=x onerror=alert(1)>');await page.locator('#taskForm [type=submit]').click();
  const created=(await read('lawyerTasks')).find(t=>t.id!=='same');assert.equal(created.priorityDate,'2026-11-10');assert.equal(await page.locator('.j-task img').count(),0);
  await row('root:'+created.id).locator('[data-j-drag]').press('Alt+ArrowUp');assert.equal((await read('lawyerTasks')).find(t=>t.id===created.id).priorityOrder,0);
  console.log('PASS calendar week/month/year navigation, legacy scheduling, independent deadlines, red star, keyboard ordering, safe text');
  await page.setViewportSize({width:1280,height:900});
  const from=await row('root:'+created.id).locator('[data-j-drag]').boundingBox(),target=await page.locator('[data-j-day="2026-11-11"]').boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12});await page.mouse.up();
  assert.equal((await read('lawyerTasks')).find(t=>t.id===created.id).priorityDate,'2026-11-11');
  console.log('PASS pointer drag to calendar day');
  for(const width of [320,360,390,430,768,1024,1440]){
   await page.setViewportSize({width,height:844});
   for(const name of ['priorities','tasks','settings']){
    await tab(name);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} overflow at ${width}`);
    const nav=await page.locator('#tabs').boundingBox();assert(nav.x>=0&&nav.x+nav.width<=width+1);assert(nav.height>=60);
    if(width===390||width===1440)await page.screenshot({path:path.join(screenshots,`journal-${name}-${width}.png`),fullPage:true});
   }
  }
  // In both orientations controls remain 16px and keyboard/modal actions reachable.
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);await tab('tasks');await page.locator('[data-j-action="new"]').click();
   const controls=page.locator('#taskForm input:not([type=checkbox]):visible,#taskForm textarea:visible,#taskForm select:visible');
   for(let i=0;i<await controls.count();i++)assert(await controls.nth(i).evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
   await page.keyboard.press('Escape');assert.equal(await page.locator('#taskSheet').getAttribute('aria-hidden'),'true');
  }
  console.log('PASS seven responsive widths, floating navigation bounds, portrait/landscape focus controls');
  await tab('settings');await page.getByRole('button',{name:'Экспорт резервной копии',exact:true}).click({trial:true});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Экспорт резервной копии',exact:true}).click();const file=await download,backup=JSON.parse(await fs.readFile(await file.path(),'utf8'));
  assert.equal(backup.tasks.find(t=>t.id==='same').subtasks.length,3);assert.equal(backup.projects[0].draftHtml,'<p>Сохраненный текст</p>');assert.equal(backup.notes[0].body,'Старая заметка');assert.equal(backup.calendarEvents[0].title,'Сохраненное событие');
  await page.getByRole('button',{name:'Восстановить из копии',exact:true}).click();await page.locator('#confirmAccept').click();await page.locator('#restoreInput').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.waitForTimeout(100);assert.equal((await read('lawyerTasks'))[0].subtasks.length,3);
  await page.getByRole('button',{name:'Войти',exact:true}).click();assert(await page.locator('#syncSheet.show').count());assert(await page.locator('#cloudEmail').count());await page.keyboard.press('Escape');
  await page.locator('#journalTheme').selectOption('dark');await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await tab('settings');await page.locator('#journalTheme').selectOption('light');
  console.log('PASS backup/restore includes subtasks and historical materials, login entry, persistent theme');
  assert.deepEqual(errors,[],'no browser exceptions');assert.deepEqual(csp,[],'no CSP violations');assert.deepEqual(failed,[],'no failed application assets');await context.close();
  await require('./journal-cloud-browser.cjs')(browser,baseURL);
  await require('./date-forms-browser.cjs')(browser,baseURL,screenshots);
  console.log('JOURNAL_WORKSPACE_PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server?.close());
