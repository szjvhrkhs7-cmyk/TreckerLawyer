const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
const baseURL=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';let server;
(async()=>{
 if(!process.env.TEST_BASE_URL){const root=path.resolve(__dirname,'..');server=require('node:http').createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,baseURL).pathname);const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error();const content=await fs.readFile(file),type={'.js':'application/javascript','.html':'text/html','.css':'text/css','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'text/plain';res.writeHead(200,{'content-type':type+'; charset=utf-8'});res.end(content);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(8765,'127.0.0.1',r));}
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.TEST_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
 try{
  await require('./workflow-browser.cjs')(browser,baseURL);
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(baseURL);
  await page.locator('#fab').click();await page.locator('#task-title').fill('Проверить договор');await page.locator('#taskForm [type="submit"]').click();await page.locator('[data-tab="tasks"]').click();
  assert.equal(await page.locator('[data-tab="projects"]').count(),0);
  await page.locator('[data-done-task]').click();await page.getByRole('button',{name:'Отменить выполнение задачи «Проверить договор»',exact:true}).click();
  assert.notEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0].status),'done');
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.locator('[data-tab="tasks"]').click();await page.locator('[data-edit-task]').first().click();await page.locator('[data-task-detail-edit]').click();
   const controls=page.locator('#taskForm input:visible,#taskForm textarea:visible,#taskForm select:visible');
   for(let i=0;i<await controls.count();i++){const state=await controls.nth(i).evaluate(el=>{el.focus();return{font:parseFloat(getComputedStyle(el).fontSize),scale:visualViewport.scale};});assert.ok(state.font>=16,'touch inputs remain >=16px in landscape');assert.equal(state.scale,1);}
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).touchAction),'manipulation');
   assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).touchAction),'manipulation');
  }
  await page.locator('[data-tab="priorities"]').click();await page.locator('[data-priority-create]').click();await page.locator('#priorityExisting').selectOption({label:'Проверить договор'});await page.locator('#priorityLevel').selectOption('main');await page.locator('#priorityForm [type="submit"]').click();
  assert.equal(await page.locator('.priority-star').count(),1);
  const d=process.env.TEST_SCREENSHOT_DIR||'/tmp/tracker-reference-qa';await fs.mkdir(d,{recursive:true});await page.screenshot({path:path.join(d,'simple-priorities.png'),fullPage:true});
  assert.deepEqual(errors,[]);await context.close();
  await require('./simple-cloud-browser.cjs')(browser,baseURL);
  console.log('SIMPLE_WORKSPACE_PASS: three tabs, one priority list, red star, preserved tasks, touch focus portrait/landscape, undo and cloud roundtrip');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server?.close());
