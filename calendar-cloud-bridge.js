(() => {
  'use strict';

  const CARRIER_PREFIX = '__TRECKER_CALENDAR_V1__:';
  const META_KEY = 'lawyerCalendarCloudUpdatedAt';
  const DIRTY_KEY = 'lawyerCloudDirty';
  const calendarKey = LS.calendarEvents;
  const noteOrderKey = LS.noteOrder;
  const syncButton = document.getElementById('syncButton');

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function readMeta() {
    try {
      const value = localStorage.getItem(META_KEY) || '';
      return Number.isNaN(Date.parse(value)) ? '' : value;
    } catch {
      return '';
    }
  }

  function writeMeta(value) {
    try { localStorage.setItem(META_KEY, value); } catch {}
  }

  function cleanLegacyCalendarDirtyFlag() {
    try {
      const dirty = JSON.parse(localStorage.getItem(DIRTY_KEY) || '{}');
      if (!dirty || typeof dirty !== 'object' || Array.isArray(dirty) || !dirty[calendarKey]) return;
      delete dirty[calendarKey];
      localStorage.setItem(DIRTY_KEY, JSON.stringify(dirty));
    } catch {}
  }

  function latestEventTimestamp(events) {
    let latest = 0;
    for (const event of events) {
      if (!event || typeof event !== 'object') continue;
      for (const candidate of [event.updatedAt, event.createdAt]) {
        const parsed = Date.parse(candidate || '');
        if (Number.isFinite(parsed)) latest = Math.max(latest, parsed);
      }
    }
    return latest ? new Date(latest).toISOString() : '';
  }

  function ensureInitialMeta() {
    const current = readMeta();
    if (current) return current;
    const events = readArray(calendarKey);
    if (!events.length) return '';
    const derived = latestEventTimestamp(events) || new Date().toISOString();
    writeMeta(derived);
    return derived;
  }

  function parseCarrier(value) {
    if (typeof value !== 'string' || !value.startsWith(CARRIER_PREFIX)) return null;
    try {
      const payload = JSON.parse(value.slice(CARRIER_PREFIX.length));
      if (!payload || payload.version !== 1 || !Array.isArray(payload.events)) return null;
      if (!payload.updatedAt || Number.isNaN(Date.parse(payload.updatedAt))) return null;
      return { version: 1, updatedAt: payload.updatedAt, events: payload.events };
    } catch {
      return null;
    }
  }

  function carrierFromOrder(order) {
    for (const item of order) {
      const parsed = parseCarrier(item);
      if (parsed) return parsed;
    }
    return null;
  }

  function buildCarrier(events, updatedAt) {
    return `${CARRIER_PREFIX}${JSON.stringify({ version: 1, updatedAt, events })}`;
  }

  function packOrder(order, events = readArray(calendarKey), updatedAt = readMeta()) {
    const cleanOrder = (Array.isArray(order) ? order : []).filter(item => !(typeof item === 'string' && item.startsWith(CARRIER_PREFIX)));
    if (!updatedAt) return cleanOrder;
    return [...cleanOrder, buildCarrier(events, updatedAt)];
  }

  function persistPackedOrder(order) {
    try { localStorage.setItem(noteOrderKey, JSON.stringify(order)); } catch {}
  }

  function writeCalendarDirect(events, updatedAt) {
    try {
      localStorage.setItem(calendarKey, JSON.stringify(Array.isArray(events) ? events : []));
      writeMeta(updatedAt);
    } catch {}
  }

  function refreshUi() {
    try { if (typeof render === 'function') render(); } catch {}
  }

  cleanLegacyCalendarDirtyFlag();
  ensureInitialMeta();

  const cloud = window.lawyerCloud;
  if (!cloud?.onLocalSave) return;
  const originalOnLocalSave = cloud.onLocalSave.bind(cloud);

  function queuePackedOrder(order) {
    const packed = packOrder(order);
    persistPackedOrder(packed);
    originalOnLocalSave(noteOrderKey, packed);
  }

  function onLocalSave(localKey, value) {
    if (localKey === calendarKey) {
      const updatedAt = new Date().toISOString();
      writeMeta(updatedAt);
      const packed = packOrder(readArray(noteOrderKey), Array.isArray(value) ? value : [], updatedAt);
      persistPackedOrder(packed);
      originalOnLocalSave(noteOrderKey, packed);
      return;
    }
    if (localKey === noteOrderKey) {
      queuePackedOrder(Array.isArray(value) ? value : []);
      return;
    }
    originalOnLocalSave(localKey, value);
  }

  window.lawyerCloud = { ...cloud, onLocalSave };

  function reconcileCarrier() {
    const order = readArray(noteOrderKey);
    const remote = carrierFromOrder(order);
    const localEvents = readArray(calendarKey);
    let localUpdatedAt = readMeta();
    if (!localUpdatedAt && localEvents.length) {
      localUpdatedAt = latestEventTimestamp(localEvents) || new Date().toISOString();
      writeMeta(localUpdatedAt);
    }

    if (!remote) {
      if (localUpdatedAt) queuePackedOrder(order);
      return;
    }

    const remoteTime = Date.parse(remote.updatedAt);
    const localTime = Date.parse(localUpdatedAt || 0);
    if (remoteTime > localTime) {
      writeCalendarDirect(remote.events, remote.updatedAt);
      refreshUi();
      return;
    }

    if (localTime > remoteTime) {
      queuePackedOrder(order);
    }
  }

  const initialOrder = readArray(noteOrderKey);
  const initialMeta = readMeta();
  if (initialMeta && !carrierFromOrder(initialOrder)) {
    persistPackedOrder(packOrder(initialOrder));
  }

  if (syncButton && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      if (syncButton.dataset.state === 'synced') setTimeout(reconcileCarrier, 0);
    }).observe(syncButton, { attributes: true, attributeFilter: ['data-state'] });
  }

  window.addEventListener('online', () => setTimeout(reconcileCarrier, 250));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(reconcileCarrier, 250);
  });
  setTimeout(reconcileCarrier, 500);

  window.lawyerCalendarCloudBridge = {
    reconcile: reconcileCarrier,
    carrierPrefix: CARRIER_PREFIX
  };
})();
