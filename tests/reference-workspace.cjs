/* Behavioral and layout checks for the reference redesign. Run against an isolated browser context. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright'); }
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
let staticServer;
async function startServer(){
  if(process.env.TEST_BASE_URL)return;
  const root=path.resolve(__dirname,'..');
  staticServer=require('node:http').createServer(async(request,response)=>{
    try{const pathname=decodeURIComponent(new URL(request.url,baseURL).pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
      const content=await fs.readFile(file);
      const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
      response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});response.end(content);
    }catch{response.writeHead(404);response.end('Not found');}
  });
  await new Promise(resolve=>staticServer.listen(8765,'127.0.0.1',resolve));
}
const screenshotDir = process.env.TEST_SCREENSHOT_DIR || '/tmp/tracker-reference-qa';
const test = async () => {
  await startServer();
  const browser = await playwright.chromium.launch({ headless:true, executablePath:process.env.TEST_BROWSER_EXECUTABLE || undefined, args:['--no-sandbox'] });
  const context = await browser.newContext({ viewport:{width:1440,height:1000}, acceptDownloads:true });
  // Simulate the missing UI assets seen on the production phone screenshot.
  // The release must remain styled and functional without these requests.
  await context.route(/\/(?:priorities\.css|calendar\.css|reference-workspace\.(?:css|js))(?:\?|$)/, route => route.abort());
  const page = await context.newPage();
  const errors = [], failures = [];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>{if(request.url().startsWith(baseURL))failures.push(request.url());});
  const log = title => console.log('PASS', title);
  // Poll from the runner: older Playwright versions compile waitForFunction with eval,
  // which is correctly rejected by the application's strict CSP.
  const waitFor = async (predicate, timeout = 6000) => {
    const started = Date.now();
    while(Date.now()-started < timeout) {
      const result = await page.evaluate(predicate);
      if(result) return result;
      await new Promise(resolve => setTimeout(resolve,50));
    }
    throw new Error('Timed out waiting for stored application state');
  };
  const stored = key => page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),key);
  const tab = name => page.locator(`#tabs [data-tab="${name}"]`).click();
  const openCase = async () => {await tab('projects');await page.locator('[data-ref-case]').first().click();};
  const noOverflow = async () => assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page must not overflow horizontally');
  const close = async () => {await page.keyboard.press('Escape');};
  await fs.mkdir(screenshotDir,{recursive:true});
  try {
    await page.goto(baseURL);
    await page.waitForSelector('.ref-header');
    assert.equal(await page.locator('#tabs .tab').count(),5);
    assert.equal(await page.locator('[data-tab="sessions"],[data-tab="documents"],[data-tab="more"]').count(),0);
    assert.match(await page.locator('#page').innerText(),/Обзор дня/);
    assert.equal(await page.locator('#releaseStyles').count(),1);
    assert.equal(await page.locator('#releaseWorkspace').count(),1);
    assert.ok(await page.locator('#tabs .icon').first().evaluate(el=>el.getBoundingClientRect().width)<=24);
    assert.ok(await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily.includes('sans-serif')));
    log('embedded mobile UI survives missing CSS and workspace JS asset requests');
    log('empty startup, five working sections, removed sections absent');

    await tab('projects');
    await page.locator('[data-ref-new-project]').click();
    await page.locator('#project-title').fill('Заключение по счету эскроу');
    await page.locator('#project-description').fill('Проверить условия возврата средств и подготовить ответ клиенту. Запрос розничного бизнеса.');
    await page.locator('#projectForm [type="submit"]').click();
    assert.equal((await stored('lawyerProjects')).length,1);
    await page.locator('[data-ref-case]').click();
    const caseId=(await stored('lawyerProjects'))[0].id;
    log('case creation and opening');

    await page.locator('#caseDraft').fill('Обстоятельства\nКлиент направил заявление о возврате средств.\nВопросы для проверки\nУсловия договора.\nПроект ответа\nСогласовать позицию с руководителем.');
    await waitFor(()=>JSON.parse(localStorage.getItem('lawyerProjects'))[0].draftHtml?.includes('Клиент направил'));
    await page.locator('#caseDraft').focus();
    await page.keyboard.press('Control+Home');
    await page.keyboard.down('Shift');await page.keyboard.press('End');await page.keyboard.up('Shift');
    await page.locator('[data-ref-format="bold"]').click();
    await waitFor(()=>/<(?:b|strong)>/i.test(JSON.parse(localStorage.getItem('lawyerProjects'))[0].draftHtml));
    await page.locator('[data-ref-format="italic"]').click();
    await waitFor(()=>/<(?:i|em)>/i.test(JSON.parse(localStorage.getItem('lawyerProjects'))[0].draftHtml));
    await tab('today');await openCase();
    assert.match(await page.locator('#caseDraft').innerText(),/Клиент направил/);
    const beforeReload=(await stored('lawyerProjects'))[0].draftHtml;
    await page.reload();await openCase();
    assert.equal(await page.locator('#caseDraft').innerHTML(),beforeReload);
    const textDownload=page.waitForEvent('download');await page.locator('[data-ref-export-draft]').click();
    const textFile=await textDownload;assert.match(await fs.readFile(await textFile.path(),'utf8'),/Согласовать позицию/);
    log('draft autosave, bold, italic, reload persistence and text download');

    await page.locator('.ref-context [data-ref-new-task]').click();
    await page.locator('#task-title').fill('Проверить комплект документов');
    await page.locator('#task-dueDate').fill('2026-10-20');
    await page.locator('#taskForm [type="submit"]').click();
    assert.equal((await stored('lawyerProjectTasks')).length,1);
    assert.equal((await stored('lawyerProjectTasks'))[0].projectId,caseId);
    assert.equal((await stored('lawyerTasks')).length,0);
    await page.locator('[data-ref-toggle-task]').click();
    assert.equal((await stored('lawyerProjectTasks'))[0].status,'done');
    await page.locator('[data-ref-toggle-task]').click();
    assert.equal((await stored('lawyerProjectTasks'))[0].status,'inwork');
    log('case task creation, completion, reopening, correct storage scope');

    await page.locator('.ref-context [data-ref-note]').click();
    await page.locator('#noteBody').fill('Запросить подтверждение отправки заявления после встречи');
    await page.locator('#noteCreateTask').check();
    await page.locator('#noteTaskDue').fill('2026-10-21');
    await page.locator('#noteForm [type="submit"]').click();
    assert.equal((await stored('lawyerNotes')).length,1);
    assert.equal((await stored('lawyerProjectTasks')).length,2);
    assert.equal((await stored('lawyerProjectTasks'))[1].dueDate,'2026-10-21');
    log('note and user-confirmed task saved together');

    const pdf=Buffer.from('%PDF-1.4\nTest local legal document');
    const fileChooserPromise=page.waitForEvent('filechooser');
    await page.locator('[data-ref-upload]').click();
    const fileChooser=await fileChooserPromise;
    await fileChooser.setFiles({name:'ДДУ.pdf',mimeType:'application/pdf',buffer:pdf});
    await waitFor(()=>JSON.parse(localStorage.getItem('lawyerProjects'))[0].attachments?.length===1);
    await page.waitForSelector('[data-ref-file]');
    await page.reload();await openCase();
    const fileDownload=page.waitForEvent('download');await page.locator('[data-ref-file]').click();
    const downloaded=await fileDownload;assert.deepEqual(await fs.readFile(await downloaded.path()),pdf);
    log('upload, local blob persistence, download after reload');

    await page.locator('[data-ref-helper="timeline"]').click();
    assert.match(await page.locator('#helperContent').innerText(),/Дело создано/);
    assert.match(await page.locator('#helperContent').innerText(),/Проверить комплект/);
    await close();
    await page.locator('[data-ref-helper="checklist"]').click();
    assert.match(await page.locator('#helperContent').innerText(),/Материалы по делу: добавлено/);
    await close();log('helper chronology and card completeness use real records');

    await tab('today');await page.locator('[data-ref-new-task]').click();
    await page.locator('#task-title').fill('Ответ по возврату перевода');
    await page.locator('#task-extra').fill('Платежи, запрос операционного блока');
    await page.locator('#task-status').selectOption('inwork');
    await page.locator('#taskForm [type="submit"]').click();
    assert.equal((await stored('lawyerTasks')).length,1);
    await tab('tasks');await page.locator('[data-edit-task]').first().click();
    await page.locator('[data-task-detail-edit]').click();await page.locator('#task-title').fill('Ответ по возврату перевода: обновлено');
    await page.locator('#taskForm [type="submit"]').click();
    assert.equal((await stored('lawyerTasks'))[0].title,'Ответ по возврату перевода: обновлено');
    await page.locator('#activeTasks [data-done-task]').first().click();
    await waitFor(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0].status==='done');
    await page.getByRole('button',{name:'Отменить выполнение задачи «Ответ по возврату перевода: обновлено»',exact:true}).click();
    await waitFor(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0].status==='inwork');
    await page.locator('#activeTasks [data-done-task]').first().click();
    await page.locator('#completedTasks [data-restore-task]').first().click();
    await waitFor(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0].status==='new');

    await page.locator('[data-set-priority]').first().click();
    assert.equal(await page.locator('#prioritySheet').getAttribute('aria-hidden'),'false');await close();
    await tab('today');await page.locator('[data-ref-tab="priorities"]').click();
    assert.ok(await page.locator('.priority-week').count() || await page.locator('.priority-day').count());
    log('standalone task edit and preserved weekly priorities');

    await tab('search');await page.locator('#globalSearch').fill('отправки');
    assert.ok(await page.locator('#globalResults [data-ref-task]').count());
    assert.ok(await page.locator('#globalResults [data-ref-found-note]').count());
    await page.locator('#globalResults [data-ref-task]').first().click();
    await page.locator('[data-task-detail-edit]').click();await page.locator('#task-title').fill('Получить подтверждение отправки');
    await page.locator('#taskForm [type="submit"]').click();
    assert.equal((await stored('lawyerTasks')).length,1,'editing a project task from search must not create a root task');
    assert.ok((await stored('lawyerProjectTasks')).some(task=>task.title==='Получить подтверждение отправки'));
    await page.keyboard.press('Control+k');assert.equal(await page.locator('#globalSearch').evaluate(el=>el===document.activeElement),true);
    await page.locator('#globalSearch').fill('<script>alert(1)</script>');assert.match(await page.locator('#globalResults').innerText(),/Ничего не найдено/);
    log('global search, cross-scope edit, keyboard shortcut, escaped user input');

    await tab('calendar');await page.locator('[data-calendar-new-for-day]').click();
    await page.locator('#eventForm [name="title"]').fill('Согласование позиции');
    await page.locator('#eventForm [name="date"]').fill('2026-10-20');
    await page.locator('#eventForm [name="startTime"]').fill('10:00');
    await page.locator('#eventForm [name="endTime"]').fill('09:00');
    await page.locator('#eventForm [type="submit"]').click();
    assert.equal((await stored('lawyerCalendarEvents')).length,0,'invalid event must not save');
    await page.locator('#eventForm [name="endTime"]').fill('11:00');
    await page.locator('#eventForm [type="submit"]').click();
    assert.equal((await stored('lawyerCalendarEvents')).length,1);
    await page.locator('[data-calendar-next]').click();await page.locator('[data-calendar-prev]').click();
    await page.locator('[data-calendar-day="2026-10-20"]').click();
    await page.locator('[data-calendar-event]').click();
    const icsPromise=page.waitForEvent('download');await page.locator('[data-export-current-event]').click();
    assert.match(await fs.readFile(await (await icsPromise).path(),'utf8'),/SUMMARY:Согласование позиции/);
    await close();log('calendar validation, creation, navigation, event export');

    await openCase();
    await page.screenshot({path:path.join(screenshotDir,'desktop-case.png'),fullPage:true});
    await tab('today');await page.screenshot({path:path.join(screenshotDir,'desktop-today.png'),fullPage:true});
    for(const width of [320,360,390,430,768,1024,1440]) {
      await page.setViewportSize({width,height:844});
      for(const name of ['today','tasks','projects','calendar','search']){await tab(name);await noOverflow();}
      await openCase();await noOverflow();
      if(width<=760){
        await page.locator('[data-ref-panel="context"]').click();
        await page.locator('[data-ref-panel="helper"]').click();
        await page.locator('[data-ref-helper="timeline"]').click();await close();
        await page.locator('[data-ref-panel="draft"]').click();
        assert.ok(await page.locator('#caseDraft').isVisible());
      }
      if(width===390){
        await page.waitForTimeout(220);await page.screenshot({path:path.join(screenshotDir,'mobile-case.png'),fullPage:false});
        await page.locator('[data-ref-panel="context"]').click();await page.screenshot({path:path.join(screenshotDir,'mobile-context.png'),fullPage:true});
        await page.locator('.ref-context [data-ref-note]').click();await page.waitForTimeout(220);await page.screenshot({path:path.join(screenshotDir,'mobile-note.png'),fullPage:false});await close();
        await tab('today');await page.waitForTimeout(220);await page.screenshot({path:path.join(screenshotDir,'mobile-today.png'),fullPage:false});
      }
    }
    log('seven viewport widths: all navigation screens and case panels without horizontal overflow');

    await page.setViewportSize({width:1440,height:1000});
    await tab('tasks');
    await page.locator('.workspace-utilities summary').click();
    const backupPromise=page.waitForEvent('download');await page.locator('#backupBtn').click();
    const backup=JSON.parse(await fs.readFile(await (await backupPromise).path(),'utf8'));
    assert.equal(backup.projects[0].draftHtml,(await stored('lawyerProjects'))[0].draftHtml);
    assert.equal(backup.notes.length,1);assert.equal(backup.calendarEvents.length,1);
    await page.locator('[data-ref-sync]').click();await page.waitForSelector('#syncSheet.show');await close();
    log('backup includes draft, notes, events; sync entry point opens');

    await openCase();await page.locator('[data-ref-delete-file]').click();await page.locator('#confirmCancel').click();
    assert.equal((await stored('lawyerProjects'))[0].attachments.length,1);
    await page.locator('[data-ref-delete-file]').click();await page.locator('#confirmAccept').click();
    await waitFor(()=>JSON.parse(localStorage.getItem('lawyerProjects'))[0].attachments.length===0);
    await page.locator('[data-ref-project-status]').first().click();await page.locator('#confirmAccept').click();
    assert.equal((await stored('lawyerProjects'))[0].status,'done');
    assert.ok((await stored('lawyerProjectTasks')).some(task=>task.status!=='done'));
    await page.locator('[data-ref-project-status]').first().click();assert.equal((await stored('lawyerProjects'))[0].status,'inwork');
    await tab('projects');await page.locator('[data-ref-delete-case]').click();await page.locator('#confirmAccept').click();
    await waitFor(()=>JSON.parse(localStorage.getItem('lawyerProjects')).length===0);
    assert.equal((await stored('lawyerProjectTasks')).length,0);assert.equal((await stored('lawyerNotes')).length,0);
    assert.equal((await stored('lawyerTasks')).length,1);
    log('confirmed attachment deletion, case completion/reopen and scoped cascade deletion');
    assert.deepEqual(errors,[],'no uncaught browser errors');assert.deepEqual(failures,[],'no failed application assets');
    await require('./reference-cloud-browser.cjs')(browser,baseURL);
    console.log('REFERENCE_WORKSPACE_PASS');
  } finally {await browser.close();if(staticServer)await new Promise(resolve=>staticServer.close(resolve));}
};
test().catch(error=>{console.error(error);process.exitCode=1;});
