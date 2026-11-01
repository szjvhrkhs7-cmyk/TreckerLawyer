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
function harness({ fetch, saved = initialSession, storage, locks, hash = '' } = {}) {
  const localStorage = storage || new Storage({
    lawyerCloudSession_qwnkigorqsgugcctnfmj: JSON.stringify(saved),
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
    location: { hash, pathname: '/', search: '', reload() {} }, history: { replaceState() {} },
    document: { visibilityState: 'visible', getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element, addEventListener: (name, fn) => events.set(name, fn) },
    addEventListener: (name, fn) => events.set(name, fn),
    MutationObserver: class { observe() {} },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), setInterval: () => 0,
    AbortController, Date: Clock, JSON, Map, Promise, URLSearchParams, FormData, atob,
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
  const legacySession = JSON.stringify(initialSession);
  const legacyStorage = new Storage({ lawyerCloudSession: legacySession, lawyerTasks: '[{"id":"legacy-task"}]', lawyerCloudDirty: '{"lawyerTasks":"2099-01-01T00:00:00Z"}' });
  const legacy = harness({ storage: legacyStorage }); await settle();
  assert.equal(legacy.requests.length, 0, 'old project credentials are never sent to the new project');
  assert.equal(legacyStorage.getItem('lawyerCloudSession'), legacySession, 'old session retained as backup');
  assert.equal(legacyStorage.getItem('lawyerTasks'), '[{"id":"legacy-task"}]', 'local tasks remain intact');
  assert(legacyStorage.getItem('lawyerCloudDirty'), 'local dirty queue remains intact');
  assert.match(legacy.elements.get('syncButton').title, /войдите/i, 'one-time reconnection is explained');
  class FullStorage extends Storage { setItem(key, value) { if (key.startsWith('lawyerCloudBackup_')) throw new Error('QuotaExceededError'); super.setItem(key, value); } }
  const full = harness({ storage: new FullStorage({ lawyerCloudSession_qwnkigorqsgugcctnfmj: JSON.stringify(freshSession), lawyerTasks: '[{"id":"safe"}]' }) }); await settle();
  assert.equal(full.requests.length, 0, 'backup failure blocks cloud reconciliation');
  assert.equal(full.elements.get('syncButton').dataset.state, 'error', 'backup failure is visible');
  assert.equal(full.localStorage.getItem('lawyerTasks'), '[{"id":"safe"}]');
  full.elements.get('syncButton').onclick();
  assert.match(full.elements.get('syncContent').innerHTML, /До сохранения резервной копии подключение остановлено/);
  full.elements.get('cloudAuthForm').onsubmit({ preventDefault() {} }); await settle();
  assert.equal(full.requests.length, 0, 'sign-in cannot bypass a failed backup');
  const oldJwt = 'header.' + Buffer.from(JSON.stringify({ iss: 'https://cfkpxrvinkcutbtqpufa.supabase.co/auth/v1' })).toString('base64url') + '.signature';
  const redirect = harness({ saved: null, hash: '#access_token=' + oldJwt + '&refresh_token=old-refresh' }); await settle();
  assert.equal(redirect.requests.length, 0, 'redirect token from obsolete project is rejected before fetch');
  assert.equal(redirect.localStorage.getItem('lawyerCloudSession_qwnkigorqsgugcctnfmj'), null);
  const reconnectStorage = new Storage({ lawyerCloudSession_qwnkigorqsgugcctnfmj: JSON.stringify(freshSession), lawyerTasks: '[{"id":"local","title":"Keep previously synced"},{"id":"shared","title":"Local wins"}]', lawyerTaskOrder: '["local","shared"]' });
  const reconnect = harness({ saved: freshSession, storage: reconnectStorage, fetch: url => url.includes('/rest/v1/lawyer_store?user_id=') ? response(200, [{ storage_key: 'tasks', value: [{ id: 'remote', title: 'Keep cloud too' }, { id: 'shared', title: 'Old cloud title' }], updated_at: '2099-01-01T00:00:00Z' }, { storage_key: 'taskOrder', value: ['remote','shared'], updated_at: '2099-01-01T00:00:00Z' }]) : null });
  await settle();
  assert.deepEqual(JSON.parse(reconnectStorage.getItem('lawyerTasks')).map(x => x.id).sort(), ['local','remote','shared'], 'first connection preserves both local and cloud tasks without dirty markers');
  const migrationUpload = reconnect.requests.find(r => r.url.includes('on_conflict=') && JSON.parse(r.options.body)[0].storage_key === 'tasks');
  assert(migrationUpload, 'merged tasks are queued for upload');
  assert.equal(JSON.parse(migrationUpload.options.body)[0].value.length, 3);
  assert.equal(JSON.parse(reconnectStorage.getItem('lawyerTasks')).find(x => x.id === 'shared').title, 'Local wins');
  assert.deepEqual(JSON.parse(reconnectStorage.getItem('lawyerTaskOrder')), ['local','shared','remote'], 'order IDs are combined without duplicates');
  const backup = JSON.parse(reconnectStorage.getItem('lawyerCloudBackup_before_qwnkigorqsgugcctnfmj'));
  assert.equal(backup.values.lawyerTasks[0].title, 'Keep previously synced', 'permanent snapshot retains original local data');
  const recovered = harness(); await settle();
  assert.equal(JSON.parse(recovered.localStorage.getItem('lawyerCloudSession_qwnkigorqsgugcctnfmj')).refresh_token, 'refresh-2');
  assert.equal(recovered.refreshes().length, 1, 'startup has one refresh owner');
  assert(recovered.requests.some(r => r.url.includes('on_conflict=')), 'pending local data uploaded after refresh');

  for (const status of [400, 429, 503]) {
    let fail = true;
    const h = harness({ fetch: url => url.includes('grant_type=refresh_token') && fail ? response(status, { code: status === 400 ? 'request_timeout' : 'unexpected_failure' }) : null });
    await settle();
    if (status === 503) await h.runTimer(300); // existing transport retry
    assert.equal(JSON.parse(h.localStorage.getItem('lawyerCloudSession_qwnkigorqsgugcctnfmj')).refresh_token, 'refresh-1', `HTTP ${status} preserves login`);
    assert(h.localStorage.getItem('lawyerCloudDirty'), 'pending data survives temporary failure');
    assert([...h.timers.values()].some(t => t.delay === 5000), 'refresh retry remains scheduled');
    fail = false;
    if (status === 503) await h.runTimer(5000);
    else { h.events.get('online')(); await settle(); }
    assert.equal(JSON.parse(h.localStorage.getItem('lawyerCloudSession_qwnkigorqsgugcctnfmj')).refresh_token, 'refresh-2', 'online event recovers without login');
  }

  let unavailable = true;
  const outage = harness({ saved: freshSession, fetch: url => unavailable && url.includes('/rest/v1/lawyer_store?user_id=') ? response(503, { message: 'Service unavailable' }) : null });
  await settle();
  assert(outage.localStorage.getItem('lawyerCloudSession_qwnkigorqsgugcctnfmj'), 'data outage keeps the signed-in session');
  assert.match(outage.elements.get('syncButton').title, /временно недоступно/i, 'server outage is identified without asking the user to sign in again');
  assert([...outage.timers.values()].some(t => t.delay === 5000), 'failed cloud reads retry automatically before the polling interval');
  await outage.runTimer(5000);
  assert([...outage.timers.values()].some(t => t.delay === 10000), 'repeated outages back off');
  unavailable = false;
  await outage.runTimer(10000);
  assert.equal(outage.elements.get('syncButton').dataset.state, 'synced', 'cloud read retries resume queued local uploads after server recovery');
  assert(outage.requests.some(r => r.url.includes('on_conflict=')), 'queued tasks upload after recovery');

  const forbidden = harness({ saved: freshSession, fetch: url => url.includes('/rest/v1/lawyer_store?user_id=') ? response(403, { code: '42501' }) : null });
  await settle();
  assert(![...forbidden.timers.values()].some(t => t.delay === 5000), 'permission errors do not retry as outages');

  const revoked = harness({ fetch: url => url.includes('grant_type=refresh_token') ? response(400, { code: 'refresh_token_not_found' }) : null });
  await settle();
  assert.equal(revoked.localStorage.getItem('lawyerCloudSession_qwnkigorqsgugcctnfmj'), null, 'revoked session requires login');
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
  assert.equal(JSON.parse(slow.localStorage.getItem('lawyerCloudSession_qwnkigorqsgugcctnfmj')).refresh_token, 'refresh-2');

  for (const newer of [null, { ...freshSession, refresh_token: 'new-login' }]) {
    let finish;
    const h = harness({ fetch: url => url.includes('grant_type=refresh_token') ? new Promise(resolve => { finish = resolve; }) : null });
    await settle();
    if (newer) h.localStorage.setItem('lawyerCloudSession_qwnkigorqsgugcctnfmj', JSON.stringify(newer));
    else h.localStorage.removeItem('lawyerCloudSession_qwnkigorqsgugcctnfmj');
    h.events.get('storage')({ key: 'lawyerCloudSession_qwnkigorqsgugcctnfmj' });
    finish(response(200, freshSession)); await settle();
    assert.equal(JSON.parse(h.localStorage.getItem('lawyerCloudSession_qwnkigorqsgugcctnfmj'))?.refresh_token ?? null, newer?.refresh_token ?? null, 'late refresh cannot undo logout or replace newer login');
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
  assert(network.localStorage.getItem('lawyerCloudSession_qwnkigorqsgugcctnfmj'), 'network failure while navigator is online preserves login');
  failNetwork = false; network.events.get('online')(); await settle();
  assert.equal(JSON.parse(network.localStorage.getItem('lawyerCloudSession_qwnkigorqsgugcctnfmj')).refresh_token, 'refresh-2');

  const hung = harness({ fetch: (url, options) => url.includes('grant_type=refresh_token') ? new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))) : null });
  await settle(); await hung.runTimer(20000);
  assert(hung.localStorage.getItem('lawyerCloudSession_qwnkigorqsgugcctnfmj'), 'request timeout preserves login');
  assert([...hung.timers.values()].some(t => t.delay === 5000), 'timeout releases request and schedules recovery');
  console.log('sync recovery tests passed: expiry, temporary errors, offline recovery, token locking, resume, logout races and timeout');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
