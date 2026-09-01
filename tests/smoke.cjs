const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
const appSource = fs.readFileSync(new URL('../app-core.js', `file://${__filename}`), 'utf8');
const css = fs.readFileSync(new URL('../app.css', `file://${__filename}`), 'utf8');
const themeCss = fs.readFileSync(new URL('../merriweather-theme.css', `file://${__filename}`), 'utf8');
const resetCacheHtml = fs.readFileSync(new URL('../reset-cache.html', `file://${__filename}`), 'utf8');
const syncSource = fs.readFileSync(new URL('../sync-core.js', `file://${__filename}`), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', `file://${__filename}`), 'utf8'));

for (const [index, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) {
  assert.doesNotThrow(() => new Function(match[1]), `inline script ${index + 1} must parse`);
}
assert.doesNotThrow(() => new Function(syncSource), 'sync.js must parse');
assert.equal(manifest.name, 'Трекер юриста');
assert.match(themeCss, /--font:\s*var\(--merriweather\)/);
assert.match(themeCss, /font-family:\s*"Merriweather"/);
assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com|family=Inter/);
assert.doesNotMatch(themeCss, /--font:\s*Inter/);
assert.match(resetCacheHtml, /font-family:"Iowan Old Style",Iowan/);
assert.doesNotMatch(resetCacheHtml, /font-family:Inter/);
assert.deepEqual(manifest.icons.map(icon => icon.src), ['tracker-icon-graphite-192.png', 'tracker-icon-graphite-512.png']);
assert.match(html, /apple-touch-icon[^>]+tracker-icon-graphite-180\.png/);
assert.match(resetCacheHtml, /tracker-icon-graphite-180\.png/);

class ClassList {
  constructor(owner) { this.owner = owner; this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
}

class Element {
  constructor(id = '', isHandle = false) {
    this.dataset = id ? { sortId: id } : {};
    this.isHandle = isHandle;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = {};
    this.listeners = new Map();
    this.classList = new ClassList(this);
    this.removed = false;
    this.rect = { left: 10, top: 0, width: 300, height: 90 };
  }
  matches(selector) { return selector === '.list' ? this.classList.contains('list') : selector === '[data-sort-id]' ? this.dataset.sortId !== undefined : false; }
  closest(selector) { return selector === '[data-sort-id]' ? (this.dataset.sortId !== undefined ? this : this.parentNode?.closest(selector)) : null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    const visit = node => {
      for (const child of node.children) {
        if ((selector === '[data-sort-id]' && child.dataset.sortId !== undefined) || (selector === '[data-drag-handle]' && child.isHandle)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  append(child) { this.insertBefore(child, null); }
  insertBefore(child, before) {
    if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
    child.parentNode = this;
    const index = before ? this.children.indexOf(before) : -1;
    if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
    this.reflow();
  }
  reflow() { this.children.forEach((child, index) => { child.rect.top = 20 + index * 102; }); }
  getBoundingClientRect() { return { ...this.rect }; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener)); }
  dispatch(type, init = {}) {
    const event = { type, button: 0, pointerId: 1, clientX: 40, clientY: 40, key: '', touches: [], preventDefault() {}, stopPropagation() {}, ...init };
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
  cloneNode() { const copy = new Element(this.dataset.sortId); copy.rect = { ...this.rect }; return copy; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() {}
  remove() { this.removed = true; if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); }
  get nextElementSibling() { const index = this.parentNode?.children.indexOf(this) ?? -1; return index >= 0 ? this.parentNode.children[index + 1] || null : null; }
  get nextSibling() { return this.nextElementSibling; }
  get lastElementChild() { return this.children.at(-1) || null; }
  get offsetHeight() { return this.rect.height; }
}

function extractFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  let depth = 0;
  let bodyStarted = false;
  for (let index = start; index < appSource.length; index++) {
    if (appSource[index] === '{') { depth++; bodyStarted = true; }
    if (appSource[index] === '}') depth--;
    if (bodyStarted && depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

async function testDrag() {
  const document = new Element();
  document.body = new Element();
  document.body.classList = new ClassList(document.body);
  const window = {
    innerHeight: 800,
    PointerEvent: function PointerEvent() {},
    scrollBy() {},
    requestAnimationFrame(callback) { return setTimeout(callback, 0); },
    cancelAnimationFrame(id) { clearTimeout(id); }
  };
  const list = new Element();
  list.classList.add('list');
  const items = ['a', 'b', 'c'].map(id => {
    const item = new Element(id);
    const handle = new Element('', true);
    handle.parentNode = item;
    item.children.push(handle);
    return item;
  });
  items.forEach(item => list.append(item));
  const persisted = [];
  const context = { document, window, persistSortableOrder: (kind, ids) => persisted.push([kind, ids]), setTimeout, clearTimeout };
  vm.runInNewContext(`${extractFunction('bindSortable')}; bindSortable(root, 'task');`, { ...context, root: list });
  const firstHandle = items[0].children[0];
  firstHandle.dispatch('pointerdown', { clientY: 40 });
  assert.equal(document.body.children.length, 1, 'dragging creates a floating card');
  document.dispatch('pointermove', { clientY: 180 });
  await new Promise(resolve => setTimeout(resolve, 5));
  document.dispatch('pointerup');
  assert.deepEqual(list.children.map(item => item.dataset.sortId), ['b', 'a', 'c']);
  assert.equal(JSON.stringify(persisted.at(-1)), JSON.stringify(['task', ['b', 'a', 'c']]));
  await new Promise(resolve => setTimeout(resolve, 230));
  assert.equal(document.body.children.length, 0, 'floating card is removed after landing');
  assert.equal(items[0].classList.contains('drag-placeholder'), false);

  const lastHandle = items[2].children[0];
  lastHandle.dispatch('pointerdown', { clientY: 245 });
  document.dispatch('pointermove', { clientY: 10 });
  await new Promise(resolve => setTimeout(resolve, 5));
  document.dispatch('pointerup');
  assert.deepEqual(list.children.map(item => item.dataset.sortId), ['c', 'b', 'a']);

  const touchDocument = new Element();
  touchDocument.body = new Element();
  touchDocument.body.classList = new ClassList(touchDocument.body);
  const touchWindow = {
    innerHeight: 800,
    scrollBy() {},
    requestAnimationFrame(callback) { return setTimeout(callback, 0); },
    cancelAnimationFrame(id) { clearTimeout(id); }
  };
  const touchList = new Element();
  touchList.classList.add('list');
  const touchItems = ['x', 'y'].map(id => {
    const item = new Element(id);
    const handle = new Element('', true);
    handle.parentNode = item;
    item.children.push(handle);
    return item;
  });
  touchItems.forEach(item => touchList.append(item));
  vm.runInNewContext(`${extractFunction('bindSortable')}; bindSortable(root, 'note');`, {
    document: touchDocument,
    window: touchWindow,
    persistSortableOrder() {},
    setTimeout,
    clearTimeout,
    root: touchList
  });
  touchItems[0].children[0].dispatch('touchstart', { touches: [{ clientX: 40, clientY: 40 }] });
  touchDocument.dispatch('touchmove', { touches: [{ clientX: 40, clientY: 180 }] });
  await new Promise(resolve => setTimeout(resolve, 5));
  touchDocument.dispatch('touchend');
  assert.deepEqual(touchList.children.map(item => item.dataset.sortId), ['y', 'x']);
}

function testSyncSecurityShape() {
  assert.match(syncSource, /\/lawyer_store\?user_id=eq\.\$\{encodeURIComponent\(user\.id\)\}/);
  assert.match(syncSource, /\/logout\?scope=local/);
  assert.doesNotMatch(syncSource, /service_role|sb_secret_|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i);
  assert.match(html, /Content-Security-Policy/);
  assert.match(appSource, /function icsSafe/);
  assert.match(html, /calendar-core\.js/);
  assert.match(syncSource, /\[LS\.calendarEvents, 'calendarEvents'\]/);
}

testSyncSecurityShape();
testDrag().then(() => console.log('smoke tests passed'));
