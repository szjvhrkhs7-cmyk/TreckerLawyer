const assert=require('node:assert/strict');
module.exports=async function(browser,baseURL){
 const user={id:'simple-qa-user',email:'qa@example.test'},stamp=new Date(Date.now()-60000).toISOString(),contexts=[],errors=[];
 const rows=new Map(Object.entries({tasks:[{id:'root',title:'Общая задача',status:'inwork',createdAt:stamp}],projectTasks:[{id:'legacy',projectId:'case',title:'Задача прежнего дела',status:'inwork',createdAt:stamp}],projects:[{id:'case',title:'Сохранённое дело',draftHtml:'<p>Сохранённый текст</p>',createdAt:stamp}],notes:[{id:'note',projectId:'case',body:'Сохранённая заметка',createdAt:stamp}]}).map(([storage_key,value])=>[storage_key,{storage_key,value,updated_at:stamp}]));
 const poll=async fn=>{const t=Date.now();while(Date.now()-t<10000){if(await fn())return;await new Promise(r=>setTimeout(r,60));}throw Error('Cloud state timeout');};
 async function device(){
  const context=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(context);
  await context.addInitScript(({user})=>{if(!localStorage.getItem('lawyerCloudSession'))localStorage.setItem('lawyerCloudSession',JSON.stringify({access_token:'qa-access',refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user}));},{user});
  await context.route('https://cfkpxrvinkcutbtqpufa.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
   if(url.pathname.startsWith('/auth/v1/')){await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(url.pathname.endsWith('/user')?user:{access_token:'qa-access',refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user})});return;}
   assert.equal(req.headers().authorization,'Bearer qa-access');
   if(req.method()==='GET'){assert.equal(url.searchParams.get('user_id'),'eq.'+user.id);await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify([...rows.values()])});return;}
   if(req.method()==='POST'){for(const row of req.postDataJSON()){assert.equal(row.user_id,user.id);rows.set(row.storage_key,structuredClone(row));}await route.fulfill({status:201,headers,body:''});return;}
   await route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(baseURL);await poll(()=>page.evaluate(()=>document.getElementById('syncButton').dataset.state==='synced'&&Boolean(window.lawyerCalendarCloudBridge)));return{page,context};
 }
 try{
  const a=await device(),b=await device();await a.page.locator('[data-tab="tasks"]').click();
  assert.equal(await a.page.locator('.workspace-task-row').count(),2);
  await a.page.locator('.workspace-task-row[data-task-scope="project"] [data-edit-task]').first().click();await a.page.locator('[data-task-detail-edit]').click();await a.page.locator('#task-title').fill('Изменённая задача без раздела дел');await a.page.locator('#taskForm [type="submit"]').click();
  await poll(()=>rows.get('projectTasks').value[0].title==='Изменённая задача без раздела дел');
  await b.page.reload();await poll(()=>b.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerProjectTasks'))[0].title==='Изменённая задача без раздела дел'));
  assert.equal(rows.get('projects').value[0].draftHtml,'<p>Сохранённый текст</p>');assert.equal(rows.get('notes').value[0].body,'Сохранённая заметка');
  await a.context.setOffline(true);await a.page.locator('.workspace-task-row[data-task-scope="root"] [data-edit-task]').first().click();await a.page.locator('[data-task-detail-edit]').click();await a.page.locator('#task-title').fill('Офлайн изменение');await a.page.locator('#taskForm [type="submit"]').click();
  assert.equal(await a.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0].title),'Офлайн изменение');
  await a.context.setOffline(false);await poll(()=>rows.get('tasks').value[0].title==='Офлайн изменение');assert.deepEqual(errors,[]);
  console.log('PASS cloud simulation: root/legacy task edits, two devices, offline retry, preserved case/notes');
 }finally{for(const context of contexts)await context.close();}
};
