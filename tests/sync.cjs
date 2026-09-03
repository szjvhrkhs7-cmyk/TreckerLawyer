const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../sync-core.js', `file://${__filename}`), 'utf8');

class Storage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class Element {
  constructor() {
    this.dataset = {};
    this.textContent = '';
    this.title = '';
    this.innerHTML = '';
    this.classList = { contains: () => false };
  }
  setAttribute() {}
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body === null ? '' : JSON.stringify(body) };
}

function makeContext(localStorage, fetch) {
  const keys = {
    tasks: 'lawyerTasks', projects: 'lawyerProjects', projectTasks: 'lawyerProjectTasks', notes: 'lawyerNotes', calendarEvents: 'lawyerCalendarEvents',
    taskOrder: 'lawyerTaskOrder', projectTaskOrder: 'lawyerProjectTaskOrder', projectOrder: 'lawyerProjectOrder', noteOrder: 'lawyerNoteOrder'
  };
  const elements = new Map(['syncButton', 'syncButtonText', 'syncSheet', 'syncContent'].map(id => [id, new Element()]));
  const load = key => {
    try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
    catch { return []; }
  };
  const shortTimeout = (callback, delay = 0) => delay > 1000 ? 0 : setTimeout(callback, delay);
  const context = {
    LS: keys,
    localStorage,
    fetch,
    navigator: { onLine: true },
    location: { hash: '', origin: 'https://example.test', pathname: '/tracker/', search: '' },
    history: { replaceState() {} },
    document: { visibilityState: 'visible', getElementById: id => elements.get(id) || new Element(), addEventListener() {} },
    window: { addEventListener() {} },
    render() {}, load, esc: value => String(value), showOverlay() {}, hideOverlay() {},
    setTimeout: shortTimeout, clearTimeout, setInterval: () => 0, console, Date, JSON, Map, URLSearchParams, FormData
  };
  context.window.window = context.window;
  return { context, keys };
}

async function basicSyncCase() {
  const localStorage = new Storage({
    lawyerCloudSession: JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'user/one', email: 'owner@example.test' } }),
    lawyerTasks: '[]',
    lawyerCalendarEvents: JSON.stringify([{ id: 'local-event', title: 'Calendar copy', date: '2026-08-31', startTime: '10:00', endTime: '11:00' }]),
    lawyerProjects: JSON.stringify([{ id: 'local-project', title: 'Local copy' }])
  });
  const requests = [];
  const fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/rest/v1/lawyer_store?user_id=eq.user%2Fone')) {
      return response(200, [{ storage_key: 'tasks', value: [{ id: 'remote-task', title: 'Remote copy' }], updated_at: '2026-08-20T10:00:00.000Z' }]);
    }
    if (String(url).includes('/rest/v1/lawyer_store?on_conflict=')) return response(201, null);
    throw new Error(`Unexpected request: ${url}`);
  };
  const { context, keys } = makeContext(localStorage, fetch);
  vm.runInNewContext(source, context, { filename: 'sync.js' });
  await new Promise(resolve => setTimeout(resolve, 80));

  assert.deepEqual(JSON.parse(localStorage.getItem(keys.tasks)), [{ id: 'remote-task', title: 'Remote copy' }]);
  assert.deepEqual(JSON.parse(localStorage.getItem(keys.projects)), [{ id: 'local-project', title: 'Local copy' }]);
  assert.deepEqual(JSON.parse(localStorage.getItem(keys.calendarEvents)), [{ id: 'local-event', title: 'Calendar copy', date: '2026-08-31', startTime: '10:00', endTime: '11:00' }]);
  const upload = requests.find(request => request.url.includes('on_conflict='));
  assert(upload, 'existing local data must be uploaded when the cloud key is absent');
  assert.equal(JSON.parse(upload.options.body)[0].storage_key, 'projects');
  assert(requests.some(request => request.url.includes('on_conflict=') && JSON.parse(request.options.body)[0].storage_key === 'calendarEvents'), 'local calendar events must be uploaded when the cloud key is absent');
  assert(requests.some(request => request.url.includes('user_id=eq.user%2Fone')), 'cloud reads must be filtered to the signed-in user');
}

async function concurrentMergeCase() {
  const localUpdated = '2026-09-03T07:10:00.000Z';
  const remoteUpdated = '2026-09-03T07:05:00.000Z';
  const dirtyAt = '2026-09-03T07:11:00.000Z';
  const localStorage = new Storage({
    lawyerCloudSession: JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'user-merge', email: 'owner@example.test' } }),
    lawyerCloudDirty: JSON.stringify({ lawyerTasks: dirtyAt }),
    lawyerTasks: JSON.stringify([
      { id: 'task-a', title: 'Local edit', updatedAt: localUpdated },
      { id: 'task-b', title: 'Old B', updatedAt: '2026-09-03T06:00:00.000Z' }
    ])
  });
  const requests = [];
  const fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/rest/v1/lawyer_store?user_id=eq.user-merge')) {
      return response(200, [{
        storage_key: 'tasks',
        value: [
          { id: 'task-a', title: 'Old A', updatedAt: '2026-09-03T06:30:00.000Z' },
          { id: 'task-b', title: 'Remote edit', updatedAt: remoteUpdated }
        ],
        updated_at: '2026-09-03T07:09:00.000Z'
      }]);
    }
    if (String(url).includes('/rest/v1/lawyer_store?on_conflict=')) return response(201, null);
    throw new Error(`Unexpected request: ${url}`);
  };
  const { context, keys } = makeContext(localStorage, fetch);
  vm.runInNewContext(source, context, { filename: 'sync.js' });
  await new Promise(resolve => setTimeout(resolve, 100));

  const merged = JSON.parse(localStorage.getItem(keys.tasks));
  assert.equal(merged.find(task => task.id === 'task-a')?.title, 'Local edit', 'newer local entity edit must survive');
  assert.equal(merged.find(task => task.id === 'task-b')?.title, 'Remote edit', 'newer remote entity edit must survive');
  const upload = requests.find(request => request.url.includes('on_conflict=') && JSON.parse(request.options.body)[0].storage_key === 'tasks');
  assert(upload, 'merged task array must be uploaded');
  const uploadedTasks = JSON.parse(upload.options.body)[0].value;
  assert.equal(uploadedTasks.find(task => task.id === 'task-a')?.title, 'Local edit');
  assert.equal(uploadedTasks.find(task => task.id === 'task-b')?.title, 'Remote edit');
}

async function main() {
  await basicSyncCase();
  await concurrentMergeCase();
  console.log('sync tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
