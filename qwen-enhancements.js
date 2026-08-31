(() => {
  'use strict';

  const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
  const MAX_RECORDS_PER_SECTION = 10000;
  const BACKUP_VERSION = 8;
  const BACKUP_ENTITY_KEYS = ['tasks', 'projects', 'projectTasks', 'notes', 'calendarEvents'];
  const BACKUP_ORDER_KEYS = ['taskOrder', 'projectTaskOrder', 'projectOrder', 'noteOrder'];
  const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const NOTIFICATION_STATE_KEY = 'lawyerOverdueNotificationSignature';

  function safeObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const clean = Object.create(null);
    for (const [key, entry] of Object.entries(value)) {
      if (!DANGEROUS_KEYS.has(key)) clean[key] = entry;
    }
    return clean;
  }

  function validateEntityArray(name, value) {
    if (!Array.isArray(value)) throw new Error(`Поле ${name} имеет неверный формат`);
    if (value.length > MAX_RECORDS_PER_SECTION) throw new Error(`Слишком много записей в разделе ${name}`);
    return value.map((item, index) => {
      const clean = safeObject(item);
      if (!clean || clean.id === undefined || clean.id === null || String(clean.id) === '') {
        throw new Error(`Некорректная запись ${index + 1} в разделе ${name}`);
      }
      return clean;
    });
  }

  function validateOrderArray(name, value) {
    if (!Array.isArray(value)) throw new Error(`Поле ${name} имеет неверный формат`);
    if (value.length > MAX_RECORDS_PER_SECTION) throw new Error(`Слишком много записей в разделе ${name}`);
    return value.map((id, index) => {
      if (typeof id !== 'string' && typeof id !== 'number') {
        throw new Error(`Некорректный идентификатор ${index + 1} в разделе ${name}`);
      }
      return String(id);
    });
  }

  function timestampForFile() {
    return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  }

  window.backup = function backupWithValidationMetadata() {
    const payload = {
      version: BACKUP_VERSION,
      backupDate: new Date().toISOString(),
      tasks: load(LS.tasks),
      projects: load(LS.projects),
      projectTasks: load(LS.projectTasks),
      notes: load(LS.notes),
      calendarEvents: load(LS.calendarEvents),
      taskOrder: load(LS.taskOrder),
      projectTaskOrder: load(LS.projectTaskOrder),
      projectOrder: load(LS.projectOrder),
      noteOrder: load(LS.noteOrder)
    };
    download(`lawyer-backup-${timestampForFile()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  window.restore = function restoreValidatedBackup(file) {
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      alert('Файл слишком большой. Максимальный размер резервной копии 5 МБ.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Корневой объект резервной копии имеет неверный формат');
        }
        if (parsed.version !== undefined) {
          const version = Number(parsed.version);
          if (!Number.isFinite(version) || version < 1) throw new Error('Некорректная версия резервной копии');
          if (version > BACKUP_VERSION) {
            alert('Резервная копия создана более новой версией приложения. Сначала обновите приложение.');
            return;
          }
        }

        const validated = {};
        for (const key of BACKUP_ENTITY_KEYS) {
          if (Object.prototype.hasOwnProperty.call(parsed, key)) validated[key] = validateEntityArray(key, parsed[key]);
        }
        for (const key of BACKUP_ORDER_KEYS) {
          if (Object.prototype.hasOwnProperty.call(parsed, key)) validated[key] = validateOrderArray(key, parsed[key]);
        }

        if (!Object.keys(validated).length) throw new Error('В файле нет данных трекера');

        for (const key of BACKUP_ENTITY_KEYS) {
          if (validated[key]) save(LS[key], validated[key]);
        }
        for (const key of BACKUP_ORDER_KEYS) {
          if (validated[key]) save(LS[key], validated[key]);
        }
        render();
        alert('Резервная копия успешно восстановлена.');
      } catch (error) {
        console.error('backup restore error', error);
        alert('Не удалось восстановить резервную копию. Проверьте формат и целостность файла.');
      }
    };
    reader.onerror = () => alert('Не удалось прочитать файл резервной копии.');
    reader.readAsText(file);
  };

  function allOverdueTasks() {
    const sources = [...load(LS.tasks), ...load(LS.projectTasks)];
    const seen = new Set();
    const result = [];
    for (const raw of sources) {
      if (!valid(raw)) continue;
      const task = normTask(raw);
      const id = `${task.projectId || 'root'}:${task.id}`;
      if (seen.has(id) || task.status === 'done' || !overdue(task)) continue;
      seen.add(id);
      result.push(task);
    }
    return result;
  }

  function notificationSignature(tasksList) {
    return tasksList.map(task => `${task.projectId || 'root'}:${task.id}:${task.dueDate || ''}`).sort().join('|');
  }

  function checkOverdueAndNotify() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const overdueTasks = allOverdueTasks();
    const signature = notificationSignature(overdueTasks);
    let previous = '';
    try { previous = sessionStorage.getItem(NOTIFICATION_STATE_KEY) || ''; } catch {}
    if (!overdueTasks.length) {
      try { sessionStorage.removeItem(NOTIFICATION_STATE_KEY); } catch {}
      return;
    }
    if (signature === previous) return;
    try {
      new Notification('Трекер юриста', {
        body: `${overdueTasks.length} просроченных задач требуют внимания`,
        icon: 'tracker-icon-blue-192.png',
        badge: 'tracker-icon-blue-192.png',
        tag: 'lawyer-overdue-tasks'
      });
      sessionStorage.setItem(NOTIFICATION_STATE_KEY, signature);
    } catch (error) {
      console.warn('Notification failed', error);
    }
  }

  function requestNotificationPermissionOnce() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    try {
      const result = Notification.requestPermission();
      result?.then?.(() => checkOverdueAndNotify()).catch?.(() => {});
    } catch (error) {
      console.warn('Notification permission request failed', error);
    }
  }

  document.addEventListener('pointerdown', requestNotificationPermissionOnce, { once: true, passive: true });
  setTimeout(checkOverdueAndNotify, 1500);
  setInterval(checkOverdueAndNotify, 5 * 60 * 1000);

  // The current main build already contains a restrictive CSP and a whitelist-based HTML sanitizer.
  // Qwen's older CSP is intentionally not substituted here because it would block the existing Supabase sync.
  // Meta X-Frame-Options is also not copied because browsers do not enforce X-Frame-Options from a meta tag.
})();
