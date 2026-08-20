const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../sync.js', `file://${__filename}`), 'utf8');

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

async function main() {
  const keys = {
    tasks: 'lawyerTasks', projects: 'lawyerProjects', projectTasks: 'lawyerProjectTasks', notes: 'lawyerNotes',
    taskOrder: 'lawyerTaskOrder', projectTaskOrder: 'lawyerProjectTaskOrder', projectOrder: 'lawyerProjectOrder', noteOrder: 'lawyerNoteOrder'
  };
  const localStorage = new Storage({
    lawyerCloudSession: JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'user/one', email: 'owner@example.test' } }),
    lawyerTasks: '[]',
    lawyerProjects: JSON.stringify([{ id: 'local-project', title: 'Local copy' }])
  });
  const elements = new Map(['syncButton', 'syncButtonText', 'syncSheet', 'syncContent'].map(id => [id, new Element()]));
  const requests = [];
  const fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/rest/v1/lawyer_store?user_id=eq.user%2Fone')) {
      return response(200, [{ storage_key: 'tasks', value: [{ id: 'remote-task', title: 'Remote copy' }], updated_at: '2026-08-20T10:00:00.000Z' }]);
    }
    if (String(url).includes('/rest/v1/lawyer_store?on_conflict=')) return response(201, null);
    throw new Error(`Unexpected request: ${url}`);
  };
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
  vm.runInNewContext(source, context, { filename: 'sync.js' });
  await new Promise(resolve => setTimeout(resolve, 80));

  assert.deepEqual(JSON.parse(localStorage.getItem(keys.tasks)), [{ id: 'remote-task', title: 'Remote copy' }]);
  assert.deepEqual(JSON.parse(localStorage.getItem(keys.projects)), [{ id: 'local-project', title: 'Local copy' }]);
  const upload = requests.find(request => request.url.includes('on_conflict='));
  assert(upload, 'existing local data must be uploaded when the cloud key is absent');
  assert.equal(JSON.parse(upload.options.body)[0].storage_key, 'projects');
  assert(requests.some(request => request.url.includes('user_id=eq.user%2Fone')), 'cloud reads must be filtered to the signed-in user');
  console.log('sync tests passed');
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body === null ? '' : JSON.stringify(body) };
}

main().catch(error => { console.error(error); process.exitCode = 1; });
