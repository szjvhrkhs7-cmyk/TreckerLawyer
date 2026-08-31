const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../sync-recovery.js', `file://${__filename}`), 'utf8');

class Storage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class Element {
  constructor() {
    this.dataset = {};
    this.children = [];
    this.className = '';
    this.textContent = '';
  }
  addEventListener() {}
  append(...items) { this.children.push(...items); }
}

class MutationObserver {
  constructor() {}
  observe() {}
}

function response(status, body) {
  const text = body === null ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    clone() { return response(status, body); },
    async text() { return text; }
  };
}

async function runCase({ refreshStatus, refreshBody }) {
  const localStorage = new Storage({
    lawyerCloudSession: JSON.stringify({
      access_token: 'expired-access',
      refresh_token: 'old-refresh',
      expires_at: Math.floor(Date.now() / 1000) - 60,
      user: { id: 'user-1', email: 'owner@example.test' }
    }),
    lawyerTasks: JSON.stringify([{ id: 'task-1', title: 'Do not lose me' }]),
    lawyerCloudDirty: JSON.stringify({ lawyerTasks: '2026-08-31T10:00:00.000Z' })
  });
  const sessionStorage = new Storage();
  const elements = new Map([
    ['syncButton', new Element()],
    ['syncContent', new Element()]
  ]);
  const requests = [];
  const fetch = async url => {
    requests.push(String(url));
    if (String(url).includes('/auth/v1/user')) return response(401, { code: 'bad_jwt', message: 'JWT expired' });
    if (String(url).includes('grant_type=refresh_token')) return response(refreshStatus, refreshBody);
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = {
    fetch,
    localStorage,
    sessionStorage,
    navigator: { onLine: true },
    location: { reload() {} },
    document: {
      getElementById: id => elements.get(id) || null,
      createElement: () => new Element()
    },
    MutationObserver,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    JSON,
    console,
    window: {},
    globalThis: null
  };
  context.globalThis = context;
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'sync-recovery.js' });
  await context.lawyerCloudRecoveryReady;
  return { localStorage, sessionStorage, requests };
}

async function main() {
  const recovered = await runCase({
    refreshStatus: 200,
    refreshBody: { access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 3600, user: { id: 'user-1', email: 'owner@example.test' } }
  });
  const recoveredSession = JSON.parse(recovered.localStorage.getItem('lawyerCloudSession'));
  assert.equal(recoveredSession.access_token, 'fresh-access');
  assert.equal(recoveredSession.refresh_token, 'fresh-refresh');
  assert.deepEqual(JSON.parse(recovered.localStorage.getItem('lawyerTasks')), [{ id: 'task-1', title: 'Do not lose me' }]);
  assert(recovered.requests.some(url => url.includes('/auth/v1/user')));
  assert(recovered.requests.some(url => url.includes('grant_type=refresh_token')));

  const expired = await runCase({
    refreshStatus: 400,
    refreshBody: { code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' }
  });
  assert.equal(expired.localStorage.getItem('lawyerCloudSession'), null, 'invalid cloud session must be cleared');
  assert.deepEqual(JSON.parse(expired.localStorage.getItem('lawyerTasks')), [{ id: 'task-1', title: 'Do not lose me' }], 'local tasks must survive session recovery');
  assert.equal(expired.localStorage.getItem('lawyerCloudDirty'), JSON.stringify({ lawyerTasks: '2026-08-31T10:00:00.000Z' }), 'dirty queue must survive session recovery');
  assert.equal(expired.sessionStorage.getItem('lawyerCloudNeedsRelogin'), '1');

  console.log('sync recovery tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
