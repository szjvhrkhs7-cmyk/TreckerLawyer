const assert=require('node:assert/strict');
module.exports=async function(browser,baseURL){
 const user={id:'journal-test-user',email:'qa@example.test'},stamp=new Date(Date.now()-60000).toISOString(),contexts=[],errors=[];
 const rows=new Map([['tasks',{storage_key:'tasks',value:[{id:'root',title:'Облачная задача',status:'inwork',createdAt:stamp,priorityDate:'2026-11-09',priorityLevel:'main'}],updated_at:stamp}],['projectTasks',{storage_key:'projectTasks',value:[{id:'legacy',projectId:'case',title:'Задача прежнего дела',status:'waiting',createdAt:stamp}],updated_at:stamp}]]);
 let requests=0,failRead=false,holdRead=null;
 const poll=async fn=>{const t=Date.now();while(Date.now()-t<12000){if(await fn())return;await new Promise(r=>setTimeout(r,60));}throw Error('Cloud condition timeout');};
 async function device(){
  const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
  await context.addInitScript(({user})=>{if(!localStorage.getItem('cloudSeed')){localStorage.setItem('cloudSeed','1');localStorage.setItem('lawyerCloudSession_qwnkigorqsgugcctnfmj',JSON.stringify({access_token:'qa-access',refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user}));}},{user});
  await context.route('https://qwnkigorqsgugcctnfmj.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
   if(url.pathname.startsWith('/auth/v1/')){await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(url.pathname.endsWith('/user')?user:{access_token:'qa-access',refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user})});return;}
   requests++;assert.equal(req.headers().authorization,'Bearer qa-access');
   if(req.method()==='GET'){assert.equal(url.searchParams.get('user_id'),'eq.'+user.id);if(holdRead)await holdRead;if(failRead){await route.fulfill({status:503,headers,body:'unavailable'});return;}await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify([...rows.values()])});return;}
   if(req.method()==='POST'){for(const row of req.postDataJSON()){assert.equal(row.user_id,user.id);rows.set(row.storage_key,structuredClone(row));}await route.fulfill({status:201,headers,body:''});return;}
   await route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(baseURL);await poll(()=>page.evaluate(()=>window.lawyerCloud?.getState?.().state==='synced'));return{page,context};
 }
 try{
  const a=await device(),b=await device();await a.page.locator('[data-tab="tasks"]').click();
  const parent=a.page.locator('[data-task-token="root:root"]');await parent.locator('[data-j-action="expand"]').click();await parent.getByRole('textbox',{name:'Новая подзадача',exact:true}).fill('Синхронизируемая подзадача');await parent.getByRole('button',{name:'Добавить подзадачу',exact:true}).click();
  await poll(()=>rows.get('tasks').value[0].subtasks?.length===1);await b.page.evaluate(()=>window.lawyerCloud.syncNow());await poll(()=>b.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0].subtasks?.length===1));
  await parent.locator('[data-j-action="sub-toggle"]').click();await poll(()=>rows.get('tasks').value[0].subtasks[0].completed===true);
  await b.page.reload();await poll(()=>b.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0].subtasks?.[0].completed===true));
  console.log('PASS cloud simulation: subtask add/completion reaches second device and survives reload');
  await a.page.locator('[data-tab="settings"]').click();await a.page.locator('#cloudEnabled').click();await poll(()=>a.page.evaluate(()=>window.lawyerCloud.getState().paused));
  const count=requests;await a.page.locator('[data-tab="tasks"]').click();await parent.locator('[data-j-action="edit"]').first().click();await a.page.locator('#task-title').fill('Изменено при паузе');await a.page.locator('#taskForm [type=submit]').click();
  await a.page.waitForTimeout(600);assert.equal(requests,count);assert.equal(rows.get('tasks').value[0].title,'Облачная задача');
  await a.page.reload();await a.page.waitForFunction(()=>window.lawyerCloud?.getState?.().ready);assert.equal(await a.page.evaluate(()=>window.lawyerCloud.getState().paused),true);assert.equal(requests,count);
  await a.page.locator('[data-tab="settings"]').click();await a.page.locator('#cloudEnabled').click();await poll(()=>rows.get('tasks').value[0].title==='Изменено при паузе');assert(await a.page.evaluate(()=>Boolean(window.lawyerCloud.getState().lastSyncAt)));
  console.log('PASS cloud pause persists on reload, sends no requests, retains local changes and resumes upload');
  await a.context.setOffline(true);await a.page.locator('[data-tab="tasks"]').click();await parent.locator('[data-j-action="edit"]').first().click();await a.page.locator('#task-title').fill('Изменено без сети');await a.page.locator('#taskForm [type=submit]').click();assert.equal(await a.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0].title),'Изменено без сети');await a.context.setOffline(false);await poll(()=>rows.get('tasks').value[0].title==='Изменено без сети');
  failRead=true;await a.page.evaluate(()=>window.lawyerCloud.syncNow().catch(()=>{}));await a.page.locator('[data-tab="settings"]').click();await poll(()=>a.page.evaluate(()=>window.lawyerCloud.getState().state==='error'));assert.match(await a.page.locator('#cloudStatus').innerText(),/недоступно|связаться/);failRead=false;await a.page.getByRole('button',{name:'Синхронизировать сейчас',exact:true}).click();await poll(()=>a.page.evaluate(()=>window.lawyerCloud.getState().state==='synced'));
  // Pause an in-flight read; its stale result must not overwrite a local mutation.
  let release;holdRead=new Promise(r=>release=r);const syncing=a.page.evaluate(()=>window.lawyerCloud.syncNow().catch(()=>{}));await a.page.waitForTimeout(150);await a.page.evaluate(()=>window.lawyerCloud.setEnabled(false));await a.page.evaluate(()=>{const list=JSON.parse(localStorage.getItem('lawyerTasks'));list[0].title='Сохранить после паузы';save(LS.tasks,list);});release();holdRead=null;await syncing;assert.equal(await a.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0].title),'Сохранить после паузы');
  console.log('PASS offline edits/retry, visible server failure and manual recovery, pause during in-flight read');
  await a.page.evaluate(()=>window.lawyerCloud.signOut());assert.equal(await a.page.evaluate(()=>window.lawyerCloud.getState().email),'');assert.equal(await a.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0].title),'Сохранить после паузы');
  assert.deepEqual(errors,[]);console.log('JOURNAL_CLOUD_PASS (controlled server simulation, no real account writes)');
 }finally{for(const context of contexts)await context.close();}
};
