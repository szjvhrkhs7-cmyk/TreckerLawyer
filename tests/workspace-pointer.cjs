// Real pointer interactions complement the in-page DOM regression checks.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const file = path.resolve(root, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end(); return; }
  try {
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    response.setHeader('Content-Type', type);
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.TEST_BROWSER_EXECUTABLE,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.querySelector('.workspace-tasks-page'));
    await page.waitForFunction(() => [...document.scripts].some(script => script.src.includes('task-completion.js')));

    const title = 'Проверка <удобства> интерфейса';
    await page.locator('#fab').click();
    await page.getByLabel('Краткая суть задачи *', { exact: true }).fill(title);
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    const row = page.locator('#activeTasks .workspace-task-row').filter({ hasText: title });
    await row.locator('.workspace-task-main').click();
    await page.getByRole('button', { name: 'Изменить', exact: true }).click();
    await page.getByLabel('Статус', { exact: true }).selectOption('inwork');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await row.locator('[data-done-task]').click();
    await page.getByRole('button', { name: `Отменить выполнение задачи «${title}»`, exact: true }).click();
    assert.equal(await page.evaluate(title => JSON.parse(localStorage.getItem('lawyerTasks')).find(task => task.title === title).status, title), 'inwork');
    await row.locator('.workspace-task-main').click();
    await page.locator('[data-task-detail-done]').click();
    await page.getByRole('button', { name: `Отменить выполнение задачи «${title}»`, exact: true }).click();
    assert.equal(await page.evaluate(title => JSON.parse(localStorage.getItem('lawyerTasks')).find(task => task.title === title).status, title), 'inwork');

    await page.locator('.workspace-summary-item[data-filter="inwork"] strong').click();
    assert.equal(await page.locator('.filters [data-filter="inwork"]').getAttribute('aria-pressed'), 'true');
    await page.getByLabel('Сортировка задач', { exact: true }).selectOption('due');
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
    await page.locator('#taskSearch').fill('несуществующая задача');
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
    await row.waitFor({ state: 'visible' });

    await page.locator('[data-tab="projects"]').click();
    await page.locator('#fab').click();
    await page.getByLabel('Название проекта *', { exact: true }).fill('Проверка проекта');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.locator('.workspace-project-title').filter({ hasText: 'Проверка проекта' }).click();
    await page.locator('#fab').click();
    await page.getByLabel('Краткая суть задачи *', { exact: true }).fill('Задача проекта');
    await page.getByLabel('Статус', { exact: true }).selectOption('inwork');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.locator('#activeTasks [data-done-task]').click();
    await page.getByRole('button', { name: 'Отменить выполнение задачи «Задача проекта»', exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lawyerProjectTasks')).find(task => task.title === 'Задача проекта').status), 'inwork');
    assert.deepEqual(errors, []);
    console.log('WORKSPACE_POINTER_PASS: create, edit, root/detail/project undo, filters, sorting and search');
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
