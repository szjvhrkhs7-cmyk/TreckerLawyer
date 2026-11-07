const assert=require('node:assert/strict'),path=require('node:path');
async function pickDate(page,id,value){
 await page.locator('#'+id+'-trigger').click();
 const target=value.slice(0,7);
 for(let i=0;i<120;i++){
  const current=await page.locator('#datePicker').getAttribute('data-month');if(current===target)break;
  await page.locator(current<target?'[data-date-next]':'[data-date-prev]').click();
 }
 await page.locator(`[data-date-value="${value}"]`).click();
}
module.exports=async function(browser,baseURL,screenshotDir){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(baseURL);await page.waitForFunction(()=>window.lawyerCloud?.getState?.().ready);
  // Open only a local draft. The dates are serialized through the unchanged ISO names.
  await page.evaluate(()=>openTask({title:'Проверить договор',dueDate:'2026-11-20',priorityDate:'2026-11-03',waitingFor:'Коллеги',checkDate:'2026-11-10',status:'waiting'}));
  assert.equal(await page.locator('#task-dueDate').getAttribute('type'),'hidden');
  assert.match(await page.locator('#task-dueDate-trigger').innerText(),/20\.11\.2026/);
  await page.locator('#taskForm .j-more-fields').evaluate(el=>el.open=true);
  const waiting=await page.locator('#task-waitingFor').boundingBox(),check=await page.locator('#task-checkDate-trigger').boundingBox();
  assert.equal(waiting.width,check.width);assert.equal(waiting.height,check.height);assert.equal(waiting.x,check.x);
  await pickDate(page,'task-dueDate','2026-12-05');
  assert.equal(await page.locator('#task-dueDate').inputValue(),'2026-12-05');assert.equal(await page.locator('#task-planDate').inputValue(),'2026-11-03');
  assert.equal(await page.locator('#datePicker').getAttribute('aria-hidden'),'true');assert.equal(await page.locator('#taskSheet').getAttribute('aria-hidden'),'false');
  assert.equal(await page.locator('#task-dueDate-trigger').evaluate(el=>el===document.activeElement),true,'date choice returns focus to field');
  await page.locator('#task-dueDate-trigger').click();await page.locator('[data-date-clear]').click();assert.equal(await page.locator('#task-dueDate').inputValue(),'');
  await pickDate(page,'task-dueDate','2026-11-20');await pickDate(page,'task-checkDate','2026-11-12');
  // Keyboard and Escape close only the nested calendar; no unexpected save occurs.
  await page.locator('#task-planDate-trigger').click();await page.locator('[data-date-value="2026-11-03"]').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.equal(await page.locator('#task-planDate').inputValue(),'2026-11-04');
  await page.locator('#task-planDate-trigger').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#datePicker').getAttribute('aria-hidden'),'true');assert.equal(await page.locator('#taskSheet').getAttribute('aria-hidden'),'false');
  await page.locator('#taskForm [type=submit]').click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lawyerTasks'))[0]);assert.equal(saved.dueDate,'2026-11-20');assert.equal(saved.priorityDate,'2026-11-04');assert.equal(saved.checkDate,'2026-11-12');
  await page.reload();await page.locator('[data-tab=tasks]').click();await page.locator('[data-j-action=edit]').first().click();assert.match(await page.locator('#task-checkDate-trigger').innerText(),/12\.11\.2026/);await page.keyboard.press('Escape');
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>applyTheme(theme),theme);
   for(const width of [320,390,430,844]){
    await page.setViewportSize({width,height:width===844?390:844});
    await page.locator('[data-tab=tasks]').click();await page.locator('[data-j-action=edit]').first().click();
    const sheet=await page.locator('#taskSheet .sheet').boundingBox();assert(sheet.x>=0&&sheet.x+sheet.width<=width+1);
    for(const selector of ['#task-dueDate-trigger','#task-planDate-trigger','#task-waitingFor','#task-checkDate-trigger']){
     const box=await page.locator(selector).boundingBox();assert(box.x>=sheet.x&&box.x+box.width<=sheet.x+sheet.width+1,`${selector} exceeds modal at ${width}`);assert.equal(Math.round(box.height),48);
    }
    if(width===390)await page.screenshot({path:path.join(screenshotDir,`date-form-${theme}.png`),fullPage:false});
    await page.locator('#task-dueDate-trigger').click();const popup=await page.locator('.j-date-picker').boundingBox();
    assert(popup.width<=320&&popup.x>=0&&popup.x+popup.width<=width+1);assert(popup.y>=0&&popup.y+popup.height<=(width===844?390:844)+1);
    assert.equal(await page.locator('#datePicker [data-date-value]').count(),30);
    if(width===390)await page.screenshot({path:path.join(screenshotDir,`date-picker-${theme}.png`),fullPage:false});
    await page.keyboard.press('Escape');await page.keyboard.press('Escape');
    await page.locator('[data-tab=priorities]').click();await page.locator('[data-j-action=schedule-new]').click();
    const priority=await page.locator('#prioritySheet .sheet').boundingBox(),control=await page.locator('#priorityDay-trigger').boundingBox();
    assert(Math.abs((priority.x+priority.width/2)-width/2)<1,'priority modal horizontally centered');assert(control.x>=priority.x&&control.x+control.width<=priority.x+priority.width+1);
    const buttons=page.locator('#priorityForm .sheet-actions .btn');for(let i=0;i<await buttons.count();i++){const box=await buttons.nth(i).boundingBox();assert(box.x>=priority.x&&box.x+box.width<=priority.x+priority.width+1);}
    if(width===390)await page.screenshot({path:path.join(screenshotDir,`priority-form-${theme}.png`),fullPage:false});
    await page.locator('#priorityDay-trigger').click();assert.equal(await page.locator('[data-date-clear]').count(),0,'required plan day cannot be cleared');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
   }
  }
  assert.deepEqual(errors,[]);
  console.log('DATE_FORMS_PASS: equal 48px fields, compact picker, ISO persistence, independent dates, nested Escape/focus, both themes and 320/390/430/844 layouts');
 }finally{await context.close();}
};
module.exports.pickDate=pickDate;
