const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async function(browser,baseURL,screenshots){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),user={id:'offline-user',email:'offline@example.test'},stamp=new Date(Date.now()-60000).toISOString();
 const rows=new Map([['tasks',{storage_key:'tasks',updated_at:stamp,value:[{id:'remote',title:'Договор',status:'inwork',createdAt:stamp}]}]]);
 let cloudRequests=0;
 const errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const poll=async fn=>{const start=Date.now();while(Date.now()-start<15000){if(await fn())return;await new Promise(r=>setTimeout(r,60));}throw Error('Offline state timeout');};
 await context.addInitScript(({user})=>{if(!localStorage.getItem('offlineSeed')){localStorage.setItem('offlineSeed','1');localStorage.setItem('lawyerCloudSession_qwnkigorqsgugcctnfmj',JSON.stringify({access_token:'offline-token',refresh_token:'offline-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user}));}},{user});
 await context.route('https://qwnkigorqsgugcctnfmj.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  cloudRequests++;
  if(url.pathname.startsWith('/auth/v1/')){await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(url.pathname.endsWith('/user')?user:{access_token:'offline-token',refresh_token:'offline-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user})});return;}
  assert.equal(req.headers().authorization,'Bearer offline-token');
  if(req.method()==='GET'){assert.equal(url.searchParams.get('user_id'),'eq.'+user.id);await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify([...rows.values()])});return;}
  for(const row of req.postDataJSON()){assert.equal(row.user_id,user.id);rows.set(row.storage_key,structuredClone(row));}
  await route.fulfill({status:201,headers,body:''});
 });
 let page=await context.newPage();
 const read=key=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),key);
 const tab=name=>page.locator(`[data-tab="${name}"]`).click();
 try{
  await page.goto(baseURL);
  await poll(()=>page.evaluate(()=>window.lawyerOffline?.getState().ready&&navigator.serviceWorker.controller&&window.lawyerCloud?.getState?.().state==='synced'));
  const publicCache=await page.evaluate(async()=>{const keys=await caches.keys();return(await Promise.all(keys.map(async key=>(await(await caches.open(key)).keys()).map(req=>req.url)))).flat();});
  assert(publicCache.length>=19);assert(publicCache.every(url=>new URL(url).origin===locationOrigin(baseURL)),'only public same-origin assets cached');
  // Close, reopen and reload without HTTP cache or network, with an expired session.
  await context.setOffline(true);await page.waitForFunction(()=>!navigator.onLine);
  await page.evaluate(()=>{const key='lawyerCloudSession_qwnkigorqsgugcctnfmj',s=JSON.parse(localStorage.getItem(key));s.expires_at=1;localStorage.setItem(key,JSON.stringify(s));});
  const before=cloudRequests;await page.close();page=await context.newPage();await page.goto(baseURL+'/?source=pwa&v=offline-cold');
  await poll(()=>page.evaluate(()=>window.lawyerOffline?.getState().ready&&window.lawyerCloud?.getState?.().state==='offline'));
  await tab('tasks');await page.locator('[data-task-token="root:remote"] [data-j-action=edit]').first().click();await page.locator('#task-title').fill('Договор: правка без сети');await page.locator('#taskForm [type=submit]').click();
  await tab('priorities');await page.locator('[data-j-action=new]').click();await page.locator('#task-title').fill('Автономная задача');await require('./date-forms-browser.cjs').pickDate(page,'task-dueDate','2026-12-12');await page.locator('#taskForm [type=submit]').click();
  let created=(await read('lawyerTasks')).find(t=>t.id!=='remote');assert(created.priorityDate);assert.equal(created.dueDate,'2026-12-12');
  await tab('tasks');const parent=page.locator(`[data-task-token="root:${created.id}"]`);await parent.locator('[data-j-action=expand]').click();await parent.getByRole('textbox',{name:'Новая подзадача',exact:true}).fill('Локальная подзадача');await parent.getByRole('button',{name:'Добавить подзадачу',exact:true}).click();await parent.locator('[data-j-action=sub-toggle]').click();
  await tab('settings');assert.match(await page.locator('#offlineReady').innerText(),/Готов/);const download=page.waitForEvent('download');await page.getByRole('button',{name:'Экспорт резервной копии',exact:true}).click();const backup=JSON.parse(await fs.readFile(await(await download).path(),'utf8'));assert(backup.tasks.some(t=>t.subtasks?.[0]?.completed));
  await page.reload();await poll(()=>page.evaluate(()=>window.lawyerCloud?.getState?.().state==='offline'));await tab('tasks');assert.equal((await read('lawyerTasks')).find(t=>t.id==='remote').title,'Договор: правка без сети');created=(await read('lawyerTasks')).find(t=>t.id===created.id);assert.equal(created.subtasks[0].completed,true);assert(created.priorityDate);assert.equal(created.dueDate,'2026-12-12');assert.equal(cloudRequests,before,'no auth or sync traffic while offline, including cold restart');
  await tab('settings');await page.screenshot({path:path.join(screenshots,'offline-settings-390.png'),fullPage:true});
  console.log('PASS offline cold launch: cached navigation/query aliases, expired login retained, task/subtask/plan/date edits, backup and second offline reload');
  await context.setOffline(false);await poll(()=>rows.get('tasks').value.some(t=>t.title==='Автономная задача'&&t.subtasks?.[0]?.completed));await poll(()=>rows.get('tasks').value.some(t=>t.title==='Договор: правка без сети'));await poll(()=>page.evaluate(()=>window.lawyerCloud.getState().state==='synced'));assert(cloudRequests>before);
  // An explicit pause remains effective through offline/online and a cold restart.
  await tab('settings');await page.locator('#cloudEnabled').click();await context.setOffline(true);const pausedCount=cloudRequests;await page.close();page=await context.newPage();await page.goto(baseURL+'/?source=pwa&v=paused-cold');await poll(()=>page.evaluate(()=>window.lawyerCloud?.getState?.().paused));
  await tab('tasks');await page.locator('[data-task-token="root:remote"] [data-j-action=edit]').first().click();await page.locator('#task-title').fill('Локально при паузе');await page.locator('#taskForm [type=submit]').click();await context.setOffline(false);await page.waitForTimeout(500);assert.equal(cloudRequests,pausedCount);assert(!rows.get('tasks').value.some(t=>t.title==='Локально при паузе'));
  await tab('settings');await page.locator('#cloudEnabled').click();await poll(()=>rows.get('tasks').value.some(t=>t.title==='Локально при паузе'));
  // Cache eviction must be detected and recoverable without touching local records.
  await page.evaluate(async()=>{for(const key of await caches.keys())if(key.startsWith('lawyer-shell:'))await caches.delete(key);});
  const detected=await page.evaluate(()=>new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=event=>resolve(event.data.type);navigator.serviceWorker.controller.postMessage({type:'CHECK_READY'},[channel.port2]);}));
  assert.equal(detected,'NOT_READY');await page.evaluate(()=>window.lawyerOffline.prepare());
  await poll(()=>page.evaluate(async()=>{const keys=(await caches.keys()).filter(key=>key.startsWith('lawyer-shell:'));return keys.length>0&&(await(await caches.open(keys[0])).keys()).length>=19&&window.lawyerOffline.getState().ready;}));
  assert((await read('lawyerTasks')).some(t=>t.title==='Локально при паузе'));
  console.log('PASS offline cache eviction: readiness detects missing assets and online preparation repairs them');
  assert.deepEqual(errors,[]);console.log('OFFLINE_BROWSER_PASS: reconnect drains durable queue, paused sync stays paused, no private API/auth cache');
 }finally{await context.close();}
};
function locationOrigin(url){return new URL(url).origin;}
