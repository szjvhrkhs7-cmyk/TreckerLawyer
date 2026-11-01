const assert = require('node:assert/strict');

// Uses isolated contexts and a memory-backed API; never sends test data to the real account.
module.exports = async function verifyCloudAndFocus(browser,baseURL) {
  const user={id:'qa-sync-user',email:'qa@example.test'};
  const timestamp=new Date(Date.now()-60000).toISOString();
  const rows=new Map([
    ['projects',{storage_key:'projects',updated_at:timestamp,value:[{id:'cloud-case',title:'Облачное дело',description:'Исходный запрос',draftHtml:'<p>Сохраненная позиция</p>',attachments:[{id:'existing-file',name:'Материалы.pdf',size:1024}],createdAt:timestamp,updatedAt:timestamp}]}],
    ['tasks',{storage_key:'tasks',updated_at:timestamp,value:[{id:'cloud-root',title:'Существующая задача',status:'inwork',priority:'normal',createdAt:timestamp}]}],
    ['projectTasks',{storage_key:'projectTasks',updated_at:timestamp,value:[]}],
    ['notes',{storage_key:'notes',updated_at:timestamp,value:[{id:'old-note',projectId:'cloud-case',title:'Существующая заметка',body:'Не терять исходный текст',createdAt:timestamp}]}]
  ]);
  const requests=[],errors=[];
  const contexts=[];
  const poll=async predicate=>{const start=Date.now();while(Date.now()-start<12000){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,60));}throw new Error('Cloud roundtrip timed out');};
  async function device(){
    const context=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(context);
    await context.addInitScript(({user})=>localStorage.setItem('lawyerCloudSession_qwnkigorqsgugcctnfmj',JSON.stringify({access_token:'qa-access-token',refresh_token:'qa-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,user})),{user});
    await context.route('https://qwnkigorqsgugcctnfmj.supabase.co/**',async route=>{
      const req=route.request(),url=new URL(req.url());
      const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
      if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
      requests.push({method:req.method(),path:url.pathname,query:url.search});
      if(url.pathname.startsWith('/auth/v1/')){
        await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(url.pathname.endsWith('/user')?user:{access_token:'qa-access-token',refresh_token:'qa-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,user})});return;
      }
      assert.equal(req.headers().authorization,'Bearer qa-access-token');
      if(req.method()==='GET'){
        assert.equal(url.searchParams.get('user_id'),'eq.qa-sync-user');
        await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify([...rows.values()])});return;
      }
      if(req.method()==='POST'){
        for(const row of req.postDataJSON()){
          assert.equal(row.user_id,user.id);
          assert.notEqual(row.storage_key,'calendarEvents','calendar must use the established carrier contract');
          rows.set(row.storage_key,JSON.parse(JSON.stringify(row)));
        }
        await route.fulfill({status:201,headers,body:''});return;
      }
      await route.abort();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(baseURL);
    await poll(()=>page.evaluate(()=>document.querySelector('#syncButton').dataset.state==='synced'&&Boolean(window.lawyerCalendarCloudBridge)));
    return {context,page};
  }
  try{
    const a=await device(),b=await device();
    for(const {page} of [a,b])assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0].title),'Существующая задача');
    await a.page.locator('[data-tab="projects"]').click();await a.page.locator('[data-ref-case="cloud-case"]').click();
    await a.page.locator('#caseDraft').fill('Новая позиция из устройства A');
    await poll(()=>rows.get('projects').value[0].draftHtml.includes('Новая позиция'));
    assert.equal(rows.get('projects').value[0].attachments[0].id,'existing-file');
    await a.page.locator('.ref-context [data-ref-note]').click();await a.page.locator('#noteBody').fill('Следующий шаг из облачной заметки');await a.page.locator('#noteCreateTask').check();await a.page.locator('#noteForm [type="submit"]').click();
    await poll(()=>rows.get('notes').value.length===2&&rows.get('projectTasks').value.length===1);
    await b.page.reload();
    await poll(()=>b.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerNotes')).length===2));
    assert.match(await b.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerProjects'))[0].draftHtml),/Новая позиция/);
    assert.equal(await b.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerProjectTasks'))[0].title),'Следующий шаг из облачной заметки');
    assert.equal(rows.get('notes').value[0].body,'Не терять исходный текст');

    await a.context.setOffline(true);
    await a.page.locator('#caseDraft').fill('Позиция сохранена без сети');
    await poll(()=>a.page.evaluate(()=>Boolean(JSON.parse(localStorage.getItem('lawyerCloudDirty')||'{}').lawyerProjects)));
    assert.ok(!rows.get('projects').value[0].draftHtml.includes('без сети'));
    await a.context.setOffline(false);
    await poll(()=>rows.get('projects').value[0].draftHtml.includes('без сети'));
    await b.page.reload();await poll(()=>b.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerProjects'))[0].draftHtml.includes('без сети')));

    await b.page.evaluate(()=>save(LS.calendarEvents,[{id:'retained-cloud-event',title:'Облачное событие',date:'2026-10-20',startTime:'10:00',endTime:'11:00',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]));
    await poll(()=>rows.get('noteOrder')?.value.some(item=>typeof item==='string'&&item.includes('Облачное событие')));
    await a.page.reload();await poll(()=>a.page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerCalendarEvents')||'[]').some(event=>event.title==='Облачное событие')));
    assert.ok(requests.some(request=>request.method==='POST'));
    assert.deepEqual(errors,[]);
    console.log('PASS cloud browser roundtrip: two devices, existing data, draft, attachments metadata, notes, tasks, offline queue and calendar carrier');

    const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});contexts.push(mobile);
    const phone=await mobile.newPage();await phone.goto(baseURL);
    const checkFocusedControls=async root=>{
      const controls=phone.locator(`${root} input:not([type="checkbox"]):visible,${root} textarea:visible,${root} select:visible,${root} [contenteditable="true"]:visible`);
      for(let i=0;i<await controls.count();i++){
        const state=await controls.nth(i).evaluate(el=>{el.focus();return{font:parseFloat(getComputedStyle(el).fontSize),scale:window.visualViewport?.scale||1,tag:el.tagName};});
        assert.ok(state.font>=16,`${state.tag} must use at least 16px on mobile`);
        assert.equal(state.scale,1,'focus must not change viewport scale');
      }
    };
    await phone.locator('#fab').click();await checkFocusedControls('#taskForm');await phone.keyboard.press('Escape');
    await phone.locator('[data-tab="tasks"]').click();await checkFocusedControls('#page');
    await phone.locator('[data-tab="projects"]').click();await phone.locator('#fab').click();await checkFocusedControls('#projectForm');await phone.locator('#project-title').fill('Проверка телефона');await phone.locator('#projectForm [type="submit"]').click();await phone.locator('[data-ref-case]').click();await checkFocusedControls('#page');await phone.locator('[data-ref-panel="context"]').click();await phone.locator('.ref-context [data-ref-note]').click();await checkFocusedControls('#noteForm');await phone.keyboard.press('Escape');
    await phone.locator('[data-tab="today"]').click();
    await poll(()=>phone.evaluate(()=>Boolean(window.lawyerCloud)));await phone.locator('#syncButton').click();await checkFocusedControls('#syncContent');
    const viewport=await phone.locator('meta[name="viewport"]').getAttribute('content');assert.ok(!/user-scalable=no|maximum-scale=1/.test(viewport),'manual pinch zoom remains available');
    assert.equal(await phone.locator('#tabs .tab').first().evaluate(el=>getComputedStyle(el).touchAction),'manipulation');
    console.log('PASS mobile focus: tasks, cases, editor, notes and cloud login use >=16px; viewport scale unchanged; three touch tabs avoid double-tap zoom');
  }finally{for(const context of contexts)await context.close();}
};
