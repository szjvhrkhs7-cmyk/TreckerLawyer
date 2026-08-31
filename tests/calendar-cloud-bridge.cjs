const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../calendar-cloud-bridge.js', `file://${__filename}`), 'utf8');

class Storage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class MutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
}

function makeContext(initial = {}) {
  const localStorage = new Storage(initial);
  const forwarded = [];
  const listeners = {};
  const syncButton = { dataset: { state: 'synced' } };
  const window = {
    lawyerCloud: {
      onLocalSave(key, value) { forwarded.push({ key, value }); }
    },
    addEventListener(type, callback) { listeners[type] = callback; }
  };
  const context = {
    LS: { calendarEvents: 'lawyerCalendarEvents', noteOrder: 'lawyerNoteOrder' },
    localStorage,
    window,
    document: {
      visibilityState: 'visible',
      getElementById(id) { return id === 'syncButton' ? syncButton : null; },
      addEventListener(type, callback) { listeners[type] = callback; }
    },
    MutationObserver,
    setTimeout() { return 0; },
    clearTimeout() {},
    render() {},
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Map,
    console
  };
  window.window = window;
  vm.runInNewContext(source, context, { filename: 'calendar-cloud-bridge.js' });
  return { context, localStorage, forwarded, syncButton };
}

function parseCarrier(order) {
  const prefix = '__TRECKER_CALENDAR_V1__:';
  const value = order.find(item => typeof item === 'string' && item.startsWith(prefix));
  assert(value, 'calendar carrier must exist');
  return JSON.parse(value.slice(prefix.length));
}

(function testLocalCalendarSaveUsesExistingNoteOrderCloudKey() {
  const { context, localStorage, forwarded } = makeContext({
    lawyerNoteOrder: JSON.stringify(['note-1']),
    lawyerCalendarEvents: '[]',
    lawyerCloudDirty: JSON.stringify({ lawyerCalendarEvents: '2026-08-31T10:00:00.000Z' })
  });
  const events = [{ id: 'event-1', title: 'Суд', date: '2026-09-01', startTime: '10:00', endTime: '11:00' }];
  context.window.lawyerCloud.onLocalSave('lawyerCalendarEvents', events);

  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].key, 'lawyerNoteOrder');
  assert.equal(forwarded.some(item => item.key === 'lawyerCalendarEvents'), false, 'calendarEvents must never be sent as a storage_key');
  const packed = JSON.parse(localStorage.getItem('lawyerNoteOrder'));
  assert.equal(packed[0], 'note-1');
  assert.deepEqual(parseCarrier(packed).events, events);
  const dirty = JSON.parse(localStorage.getItem('lawyerCloudDirty'));
  assert.equal(dirty.lawyerCalendarEvents, undefined, 'legacy failed calendar dirty marker must be removed');
})();

(function testRemoteNewerCalendarIsRestoredLocally() {
  const remoteEvents = [{ id: 'event-remote', title: 'Встреча', date: '2026-09-02', startTime: '12:00', endTime: '13:00' }];
  const remoteCarrier = `__TRECKER_CALENDAR_V1__:${JSON.stringify({ version: 1, updatedAt: '2026-08-31T14:00:00.000Z', events: remoteEvents })}`;
  const { context, localStorage } = makeContext({
    lawyerNoteOrder: JSON.stringify(['note-1', remoteCarrier]),
    lawyerCalendarEvents: JSON.stringify([{ id: 'old', title: 'Старое' }]),
    lawyerCalendarCloudUpdatedAt: '2026-08-31T12:00:00.000Z'
  });

  context.window.lawyerCalendarCloudBridge.reconcile();
  assert.deepEqual(JSON.parse(localStorage.getItem('lawyerCalendarEvents')), remoteEvents);
  assert.equal(localStorage.getItem('lawyerCalendarCloudUpdatedAt'), '2026-08-31T14:00:00.000Z');
})();

(function testNoteReorderKeepsCalendarCarrier() {
  const events = [{ id: 'event-1', title: 'Суд' }];
  const { context, localStorage, forwarded } = makeContext({
    lawyerNoteOrder: JSON.stringify(['note-1']),
    lawyerCalendarEvents: JSON.stringify(events),
    lawyerCalendarCloudUpdatedAt: '2026-08-31T13:00:00.000Z'
  });

  context.window.lawyerCloud.onLocalSave('lawyerNoteOrder', ['note-2', 'note-1']);
  const packed = JSON.parse(localStorage.getItem('lawyerNoteOrder'));
  assert.deepEqual(packed.slice(0, 2), ['note-2', 'note-1']);
  assert.deepEqual(parseCarrier(packed).events, events);
  assert.equal(forwarded.at(-1).key, 'lawyerNoteOrder');
})();

console.log('calendar cloud bridge tests passed');
