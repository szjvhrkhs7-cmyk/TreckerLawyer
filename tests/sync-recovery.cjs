const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const core = fs.readFileSync(new URL('../sync-core.js', `file://${__filename}`), 'utf8');
const recovery = fs.readFileSync(new URL('../sync-recovery.js', `file://${__filename}`), 'utf8');
const initialSession = { access_token: 'expired', refresh_token: 'refresh-1', expires_at: 1, user: { id: 'user-1', email: 'test@example.test' } };
const freshSession = { ...initialSession, access_token: 'fresh', refresh_token: 'refresh-2', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 };
class Storage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
function response(status, body) {
  return { ok: status >= 200 && status < 300, status, clone: () => response(status, body), text: async () => JSON.stringify(body) };
}
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function harness({ fetch, saved = initialSession, storage, locks } = {}) {
  const localStorage = storage || new Storage({
    lawyerCloudSession: JSON.stringify(saved),
    lawyerTasks: JSON.stringify([{ id: 'task-1', title: 'Keep local data' }]),
    lawyerCloudDirty: JSON.stringify({ lawyerTasks: '2099-01-01T00:00:00Z' })
  });
  const elements = new Map();
  const element = () => ({ dataset: {}, classList: { contains: () => false }, setAttribute() {}, addEventListener() {}, append() {} });
  const events = new Map();
  const timers = new Map();
  let nextTimer = 0;
  const requests = [];
  let clock = Date.now();
  class Clock extends Date { static now() { return clock; } }
  const context = {
    LS: Object.fromEntries(['tasks', 'projects', 'projectTasks', 'notes', 'calendarEvents', 'taskOrder', 'projectTaskOrder', 'projectOrder', 'noteOrder'].map(k => [k, 'lawyer' + k[0].toUpperCase() + k.slice(1)])),
    localStorage, sessionStorage: new Storage(),
    navigator: { onLine: true, locks },
    location: { hash: '', pathname: '/', search: '', reload() {} }, history: { replaceState() {} },
    document: { visibilityState: 'visible', getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element, addEventListener: (name, fn) => events.set(name, fn) },
    addEventListener: (name, fn) => events.set(name, fn),
    MutationObserver: class { observe() {} },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), setInterval: () => 0,
    AbortController, Date: Clock, JSON, Map, Promise, URLSearchParams, FormData,
    console: { warn() {}, error() {}, log() {} }, render() {}, esc: String, showOverlay() {}, hideOverlay() {},
    load: key => JSON.parse(localStorage.getItem(key) || '[]'),
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (fetch) { const result = await fetch(url, options); if (result) return result; }
      if (url.includes('grant_type=refresh_token')) return response(200, { ...freshSession, expires_at: Math.floor(clock / 1000) + 3600 });
      return response(200, []);
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(recovery, context);
  vm.runInNewContext(core, context);
  const refreshes = () => requests.filter(r => r.url.includes('grant_type=refresh_token'));
  const runTimer = async delay => {
    const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
    assert(entry, `timer ${delay} must be scheduled`);
    clock += delay; timers.delete(entry[0]); entry[1].fn(); await settle();
  };
  return { context, localStorage, requests, events, timers, elements, refreshes, runTimer, advance: ms => { clock += ms; } };
}
async function main() {
  const recovered = harness(); await settle();
  assert.equal(JSON.parse(recovered.localStorage.getItem('lawyerCloudSession')).refresh_token, 'refresh-2');
  assert.equal(recovered.refreshes().length, 1, 'startup has one refresh owner');
  assert(recovered.requests.some(r => r.url.includes('on_conflict=')), 'pending local data uploaded after refresh');

  for (const status of [400, 429, 503]) {
    let fail = true;
    const h = harness({ fetch: url => url.includes('grant_type=refresh_token') && fail ? response(status, { code: status === 400 ? 'request_timeout' : 'unexpected_failure' }) : null });
    await settle();
    if (status === 503) await h.runTimer(300); // existing transport retry
    assert.equal(JSON.parse(h.localStorage.getItem('lawyerCloudSession')).refresh_token, 'refresh-1', `HTTP ${status} preserves login`);
    assert(h.localStorage.getItem('lawyerCloudDirty'), 'pending data survives temporary failure');
    assert([...h.timers.values()].some(t => t.delay === 5000), 'refresh retry remains scheduled');
    fail = false;
    if (status === 503) await h.runTimer(5000);
    else { h.events.get('online')(); await settle(); }
    assert.equal(JSON.parse(h.localStorage.getItem('lawyerCloudSession')).refresh_token, 'refresh-2', 'online event recovers without login');
  }

  const revoked = harness({ fetch: url => url.includes('grant_type=refresh_token') ? response(400, { code: 'refresh_token_not_found' }) : null });
  await settle();
  assert.equal(revoked.localStorage.getItem('lawyerCloudSession'), null, 'revoked session requires login');
  assert(revoked.localStorage.getItem('lawyerTasks').includes('Keep local data'));
  assert(revoked.localStorage.getItem('lawyerCloudDirty'), 'revocation does not delete pending local changes');

  let resolveRefresh;
  const slow = harness({ fetch: url => url.includes('grant_type=refresh_token') ? new Promise(resolve => { resolveRefresh = resolve; }) : null });
  await settle();
  slow.events.get('pageshow')();
  slow.events.get('visibilitychange')();
  slow.context.lawyerCloud.onLocalSave('lawyerTasks', [{ id: 'task-1', title: 'Edited while refreshing' }]);
  await slow.runTimer(350);
  assert.equal(slow.refreshes().length, 1, 'resume, upload and startup share the same refresh');
  resolveRefresh(response(200, freshSession)); await settle();
  assert.equal(JSON.parse(slow.localStorage.getItem('lawyerCloudSession')).refresh_token, 'refresh-2');

  for (const newer of [null, { ...freshSession, refresh_token: 'new-login' }]) {
    let finish;
    const h = harness({ fetch: url => url.includes('grant_type=refresh_token') ? new Promise(resolve => { finish = resolve; }) : null });
    await settle();
    if (newer) h.localStorage.setItem('lawyerCloudSession', JSON.stringify(newer));
    else h.localStorage.removeItem('lawyerCloudSession');
    h.events.get('storage')({ key: 'lawyerCloudSession' });
    finish(response(200, freshSession)); await settle();
    assert.equal(JSON.parse(h.localStorage.getItem('lawyerCloudSession'))?.refresh_token ?? null, newer?.refresh_token ?? null, 'late refresh cannot undo logout or replace newer login');
  }

  let lockTail = Promise.resolve();
  const locks = { request(name, callback) { assert.equal(name, 'lawyer-cloud-session-refresh'); const next = lockTail.then(callback); lockTail = next.catch(() => {}); return next; } };
  const tab1 = harness({ locks });
  const tab2 = harness({ locks, storage: tab1.localStorage });
  await settle(); await settle();
  assert.equal(tab1.refreshes().length + tab2.refreshes().length, 1, 'two tabs rotate a shared token only once');

  const wake = harness({ saved: freshSession }); await settle();
  wake.advance(3600000);
  wake.events.get('pageshow')(); await settle();
  assert.equal(wake.refreshes().length, 1, 'returning from sleep refreshes an expired token');

  let failNetwork = true;
  const network = harness({ fetch: url => {
    if (failNetwork && url.includes('grant_type=refresh_token')) throw new TypeError('Failed to fetch');
  } });
  await settle(); await network.runTimer(300);
  assert(network.localStorage.getItem('lawyerCloudSession'), 'network failure while navigator is online preserves login');
  failNetwork = false; network.events.get('online')(); await settle();
  assert.equal(JSON.parse(network.localStorage.getItem('lawyerCloudSession')).refresh_token, 'refresh-2');

  const hung = harness({ fetch: (url, options) => url.includes('grant_type=refresh_token') ? new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))) : null });
  await settle(); await hung.runTimer(20000);
  assert(hung.localStorage.getItem('lawyerCloudSession'), 'request timeout preserves login');
  assert([...hung.timers.values()].some(t => t.delay === 5000), 'timeout releases request and schedules recovery');
  console.log('sync recovery tests passed: expiry, temporary errors, offline recovery, token locking, resume, logout races and timeout');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
