(() => {
  'use strict';

  const SUPABASE_URL = 'https://cfkpxrvinkcutbtqpufa.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VAKzxSJ53hXxd4Tvk0FFlw_D_sNbFq9';
  const SESSION_KEY = 'lawyerCloudSession';
  const DIRTY_KEY = 'lawyerCloudDirty';
  const storageEntries = [
    [LS.tasks, 'tasks'],
    [LS.projects, 'projects'],
    [LS.projectTasks, 'projectTasks'],
    [LS.notes, 'notes'],
    [LS.calendarEvents, 'calendarEvents'],
    [LS.taskOrder, 'taskOrder'],
    [LS.projectTaskOrder, 'projectTaskOrder'],
    [LS.projectOrder, 'projectOrder'],
    [LS.noteOrder, 'noteOrder']
  ];
  const storageKeyByLocal = new Map(storageEntries);
  const syncButton = document.getElementById('syncButton');
  const syncButtonText = document.getElementById('syncButtonText');
  const syncSheet = document.getElementById('syncSheet');
  const syncContent = document.getElementById('syncContent');

  let session = null;
  let applyingRemote = false;
  let syncState = 'local';
  let syncLabel = 'Данные сохраняются на устройстве';
  let lastSyncAt = null;
  let refreshTimer = null;
  let flushTimer = null;
  let retryTimer = null;
  let syncPromise = null;
  let flushPromise = null;
  let revision = 0;
  const pending = new Map();
  const lastRemoteAt = new Map();
  let dirty = readObject(DIRTY_KEY);

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function readSession() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return value && value.access_token && value.refresh_token ? value : null;
    } catch {
      return null;
    }
  }

  function persistDirty() {
    try {
      localStorage.setItem(DIRTY_KEY, JSON.stringify(dirty));
    } catch (error) {
      console.warn('Could not persist cloud queue', error);
    }
  }

  function markDirty(localKey) {
    dirty[localKey] = new Date().toISOString();
    persistDirty();
    return dirty[localKey];
  }

  function clearDirty(localKey, expectedTimestamp) {
    if (expectedTimestamp && dirty[localKey] !== expectedTimestamp) return;
    delete dirty[localKey];
    persistDirty();
  }

  function cloneArray(value) {
    return JSON.parse(JSON.stringify(Array.isArray(value) ? value : []));
  }

  function normalizeDateString(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  function itemTimestamp(item) {
    if (!item || typeof item !== 'object') return 0;
    const raw = item.updatedAt || item.completedAt || item.createdAt || '';
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function mergeEntityArrays(localValue, remoteValue) {
    const local = cloneArray(localValue);
    const remote = cloneArray(remoteValue);
    const result = new Map();
    const ingest = (item, source) => {
      if (!item || item.id === undefined || item.id === null || String(item.id) === '') return;
      const id = String(item.id);
      const existing = result.get(id);
      if (!existing) {
        result.set(id, { item, source, timestamp: itemTimestamp(item) });
        return;
      }
      const timestamp = itemTimestamp(item);
      if (timestamp > existing.timestamp || (timestamp === existing.timestamp && source === 'local')) {
        result.set(id, { item, source, timestamp });
      }
    };
    remote.forEach(item => ingest(item, 'remote'));
    local.forEach(item => ingest(item, 'local'));
    return [...result.values()].map(entry => entry.item);
  }

  function queueValue(localKey, value, timestamp = dirty[localKey] || markDirty(localKey)) {
    pending.set(localKey, { value: cloneArray(value), timestamp, revision: ++revision });
  }

  function onLocalSave(localKey, value) {
    if (applyingRemote || !storageKeyByLocal.has(localKey)) return;
    const timestamp = markDirty(localKey);
    queueValue(localKey, value, timestamp);
    if (!session) {
      setStatus('local', 'Изменения сохранены на устройстве');
      return;
    }
    if (!navigator.onLine) {
      setStatus('offline', 'Изменения сохранены локально и будут отправлены позже');
      return;
    }
    setStatus('syncing', 'Сохраняем изменения в облаке');
    scheduleFlush(350);
  }

  window.lawyerCloud = { onLocalSave };

  function setStatus(nextState, label) {
    syncState = nextState;
    syncLabel = label;
    const buttonLabels = {
      local: 'Локально',
      connecting: 'Подключение',
      syncing: 'Синхронизация',
      synced: 'Сохранено',
      offline: 'Без сети',
      error: 'Ошибка'
    };
    syncButton.dataset.state = nextState;
    syncButtonText.textContent = buttonLabels[nextState] || 'Синхронизация';
    syncButton.title = label;
    syncButton.setAttribute('aria-label', label);
    if (syncSheet.classList.contains('show')) renderSyncPanel();
  }

  function saveSession(nextSession) {
    session = nextSession;
    if (session) {
      if (!session.expires_at && session.expires_in) {
        session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in);
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      scheduleRefresh();
    } else {
      localStorage.removeItem(SESSION_KEY);
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!session?.expires_at) return;
    const delay = Math.max(15000, (Number(session.expires_at) * 1000) - Date.now() - 60000);
    refreshTimer = setTimeout(() => refreshSession().catch(() => {}), Math.min(delay, 2147483647));
  }

  function authHeaders(token) {
    const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function parseResponse(response) {
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
    if (!response.ok) {
      const message = data?.msg || data?.message || data?.error_description || data?.error || `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function authRequest(path, options = {}) {
    const { token, headers, ...requestOptions } = options;
    const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      ...requestOptions,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { ...authHeaders(token), ...(headers || {}) }
    });
    return parseResponse(response);
  }

  async function refreshSession() {
    if (!session?.refresh_token) return null;
    try {
      const next = await authRequest('/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      saveSession({ ...next, user: next.user || session.user });
      return session;
    } catch (error) {
      if (!navigator.onLine) {
        setStatus('offline', 'Нет сети, локальная копия доступна');
        return session;
      }
      saveSession(null);
      setStatus('local', 'Сеанс завершён, данные остаются на устройстве');
      throw error;
    }
  }

  async function ensureSession() {
    if (!session) return null;
    if (Number(session.expires_at || 0) * 1000 <= Date.now() + 60000) {
      await refreshSession();
    }
    return session;
  }

  async function dataRequest(path, options = {}, retried = false) {
    await ensureSession();
    if (!session?.access_token) throw new Error('AUTH_REQUIRED');
    const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      ...options,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { ...authHeaders(session.access_token), ...(options.headers || {}) }
    });
    if (response.status === 401 && !retried && session?.refresh_token) {
      await refreshSession();
      return dataRequest(path, options, true);
    }
    return parseResponse(response);
  }

  async function loadUser() {
    if (!session?.access_token || session.user?.id) return session?.user || null;
    const user = await authRequest('/user', { method: 'GET', token: session.access_token });
    saveSession({ ...session, user });
    return user;
  }

  async function fetchCloudRows() {
    const user = session?.user || await loadUser();
    if (!user?.id) throw new Error('AUTH_REQUIRED');
    const rows = await dataRequest(`/lawyer_store?user_id=eq.${encodeURIComponent(user.id)}&select=storage_key,value,updated_at`);
    if (!Array.isArray(rows)) throw new Error('INVALID_CLOUD_DATA');
    return rows;
  }

  async function upsertCloudValue(localKey, entry) {
    const storageKey = storageKeyByLocal.get(localKey);
    const user = session?.user || await loadUser();
    if (!storageKey || !user?.id) throw new Error('AUTH_REQUIRED');
    await dataRequest('/lawyer_store?on_conflict=user_id,storage_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        user_id: user.id,
        storage_key: storageKey,
        value: entry.value,
        updated_at: normalizeDateString(entry.timestamp) || new Date().toISOString()
      }])
    });
  }

  function scheduleFlush(delay = 0) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flushPending().catch(() => {}), delay);
  }

  async function flushPending() {
    if (flushPromise) return flushPromise;
    if (!session || !pending.size) return;
    if (!navigator.onLine) {
      setStatus('offline', 'Нет сети, изменения сохранены локально');
      return;
    }
    flushPromise = (async () => {
      setStatus('syncing', 'Сохраняем изменения в облаке');
      try {
        for (const [localKey, entry] of [...pending.entries()]) {
          await upsertCloudValue(localKey, entry);
          const current = pending.get(localKey);
          if (current?.revision === entry.revision) {
            pending.delete(localKey);
            clearDirty(localKey, entry.timestamp);
            lastRemoteAt.set(localKey, entry.timestamp);
          }
        }
        lastSyncAt = new Date();
        setStatus('synced', 'Локальная и сетевая копии сохранены');
      } catch (error) {
        console.warn('Cloud save failed', error);
        setStatus(navigator.onLine ? 'error' : 'offline', friendlyError(error));
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => flushPending().catch(() => {}), 5000);
        throw error;
      } finally {
        flushPromise = null;
      }
    })();
    return flushPromise;
  }

  async function syncFromCloud() {
    if (syncPromise) return syncPromise;
    if (!session) {
      setStatus('local', 'Данные сохраняются только на устройстве');
      return;
    }
    if (!navigator.onLine) {
      setStatus('offline', 'Нет сети, локальная копия доступна');
      return;
    }
    syncPromise = (async () => {
      setStatus('syncing', 'Получаем сетевую копию');
      try {
        await loadUser();
        const rows = await fetchCloudRows();
        const remoteByKey = new Map(rows.map(row => [row.storage_key, row]));
        let changed = false;
        applyingRemote = true;
        try {
          for (const [localKey, storageKey] of storageEntries) {
            const remote = remoteByKey.get(storageKey);
            const localDirtyAt = dirty[localKey];
            if (!remote) {
              const localValue = load(localKey);
              if (localValue.length || localDirtyAt) {
                queueValue(localKey, localValue, localDirtyAt || markDirty(localKey));
              }
              continue;
            }
            if (!Array.isArray(remote.value)) throw new Error('INVALID_CLOUD_DATA');
            const remoteTime = Date.parse(remote.updated_at || 0);
            const dirtyTime = Date.parse(localDirtyAt || 0);
            if (localDirtyAt && dirtyTime > remoteTime) {
              const merged = mergeEntityArrays(load(localKey), remote.value);
              localStorage.setItem(localKey, JSON.stringify(merged));
              changed = true;
              queueValue(localKey, merged, localDirtyAt);
              continue;
            }
            if (lastRemoteAt.get(localKey) !== remote.updated_at || localDirtyAt) {
              const merged = localDirtyAt ? mergeEntityArrays(load(localKey), remote.value) : remote.value;
              localStorage.setItem(localKey, JSON.stringify(merged));
              changed = true;
              if (localDirtyAt && JSON.stringify(merged) !== JSON.stringify(remote.value)) queueValue(localKey, merged, localDirtyAt);
            }
            if (!pending.has(localKey)) {
              clearDirty(localKey);
              lastRemoteAt.set(localKey, remote.updated_at);
            }
          }
        } finally {
          applyingRemote = false;
        }
        if (changed) render();
        if (pending.size) await flushPending();
        else {
          lastSyncAt = new Date();
          setStatus('synced', 'Локальная и сетевая копии совпадают');
        }
      } catch (error) {
        console.warn('Cloud sync failed', error);
        setStatus(navigator.onLine ? 'error' : 'offline', friendlyError(error));
        throw error;
      } finally {
        syncPromise = null;
      }
    })();
    return syncPromise;
  }

  function friendlyError(error) {
    const message = String(error?.message || '').toLowerCase();
    if (!navigator.onLine || message.includes('failed to fetch')) return 'Нет сети, данные сохранены локально';
    if (message.includes('invalid login')) return 'Неверная электронная почта или пароль';
    if (message.includes('email not confirmed')) return 'Сначала подтвердите электронную почту';
    if (message.includes('already registered') || message.includes('already been registered')) return 'Аккаунт уже создан, нажмите «Войти»';
    if (message.includes('password')) return 'Проверьте пароль. Для нового аккаунта используйте не менее 12 символов.';
    if (message.includes('lawyer_store') || error?.status === 404) return 'Облачная таблица пока недоступна';
    if (message.includes('auth_required') || error?.status === 401) return 'Нужно войти заново';
    if (message.includes('invalid_cloud_data')) return 'Сетевая копия имеет неверный формат';
    return 'Не удалось связаться с облачным хранилищем';
  }

  function formatLastSync() {
    if (!lastSyncAt) return 'Синхронизация ещё не выполнялась';
    return `Последняя синхронизация: ${lastSyncAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function renderSyncPanel(message = '', messageType = '') {
    if (!session?.user) {
      syncContent.innerHTML = `
        <p class="sync-intro">Войдите с одной и той же почтой на всех устройствах. Текущие данные останутся в браузере и будут скопированы в защищённое сетевое хранилище.</p>
        <form class="form" id="cloudAuthForm">
          <div class="field"><label for="cloudEmail">Электронная почта</label><input id="cloudEmail" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="cloudPassword">Пароль</label><input id="cloudPassword" name="password" type="password" minlength="6" autocomplete="current-password" required></div>
          <p class="sync-message ${messageType}" id="cloudAuthMessage" role="status" aria-live="polite">${esc(message)}</p>
          <div class="sync-actions">
            <button class="btn" id="closeSync" type="button">Закрыть</button>
            <button class="btn primary" type="submit">Войти</button>
            <button class="btn wide" id="createCloudAccount" type="button">Создать аккаунт</button>
          </div>
        </form>`;
      const form = document.getElementById('cloudAuthForm');
      document.getElementById('closeSync').onclick = () => hideOverlay(syncSheet);
      document.getElementById('createCloudAccount').onclick = () => submitAuth(form, true);
      form.onsubmit = event => { event.preventDefault(); submitAuth(form, false); };
      return;
    }
    const email = esc(session.user.email || 'Аккаунт подключён');
    syncContent.innerHTML = `
      <div class="sync-status-card">
        <div class="sync-status-line"><span class="sync-dot ${syncState}"></span><span>${esc(syncLabel)}</span></div>
        <p class="sync-last-update">${esc(formatLastSync())}</p>
      </div>
      <p class="sync-account">Подключённый аккаунт: <strong>${email}</strong></p>
      <p class="sync-intro">Локальная копия и ручное резервное копирование сохранены. При отсутствии сети изменения отправятся в облако после восстановления соединения.</p>
      <p class="sync-message ${messageType}" role="status" aria-live="polite">${esc(message)}</p>
      <div class="sync-actions">
        <button class="btn" id="closeSync" type="button">Закрыть</button>
        <button class="btn primary" id="syncNow" type="button">Синхронизировать</button>
        <button class="btn danger wide" id="cloudLogout" type="button">Выйти из аккаунта</button>
      </div>`;
    document.getElementById('closeSync').onclick = () => hideOverlay(syncSheet);
    document.getElementById('syncNow').onclick = async () => {
      try { await syncFromCloud(); renderSyncPanel('Синхронизация завершена', 'success'); }
      catch (error) { renderSyncPanel(friendlyError(error), 'error'); }
    };
    document.getElementById('cloudLogout').onclick = signOut;
  }

  function setFormBusy(form, busy) {
    form.querySelectorAll('button,input').forEach(element => { element.disabled = busy; });
  }

  async function submitAuth(form, createAccount) {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    if (createAccount && password.length < 12) {
      renderSyncPanel('Для нового аккаунта используйте пароль не короче 12 символов.', 'error');
      return;
    }
    setFormBusy(form, true);
    try {
      const path = createAccount
        ? `/signup?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`
        : '/token?grant_type=password';
      const result = await authRequest(path, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (!result?.access_token) {
        renderSyncPanel('Проверьте почту и подтвердите регистрацию. Затем вернитесь в приложение и войдите.', 'success');
        return;
      }
      saveSession(result);
      setStatus('connecting', 'Подключаем сетевое хранилище');
      await loadUser();
      renderSyncPanel('Вход выполнен', 'success');
      await syncFromCloud();
      hideOverlay(syncSheet);
    } catch (error) {
      renderSyncPanel(friendlyError(error), 'error');
    } finally {
      const currentForm = document.getElementById('cloudAuthForm');
      if (currentForm) setFormBusy(currentForm, false);
    }
  }

  async function signOut() {
    try {
      if (session?.access_token && navigator.onLine) {
        await authRequest('/logout?scope=local', { method: 'POST', token: session.access_token });
      }
    } catch (error) {
      console.warn('Cloud logout failed', error);
    }
    saveSession(null);
    pending.clear();
    lastRemoteAt.clear();
    setStatus('local', 'Данные сохранены на этом устройстве');
    renderSyncPanel('Вы вышли. Локальная копия сохранена.', 'success');
  }

  function sessionFromHash() {
    if (!location.hash) return null;
    const params = new URLSearchParams(location.hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return null;
    const expiresIn = Number(params.get('expires_in') || 3600);
    history.replaceState(null, '', location.pathname + location.search);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: params.get('token_type') || 'bearer',
      expires_in: expiresIn,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn
    };
  }

  async function initialize() {
    syncButton.onclick = () => { renderSyncPanel(); showOverlay(syncSheet); };
    const redirected = sessionFromHash();
    saveSession(redirected || readSession());
    if (!session) {
      setStatus('local', 'Данные сохраняются на устройстве');
      return;
    }
    setStatus('connecting', 'Восстанавливаем подключение');
    try {
      await ensureSession();
      await loadUser();
      await syncFromCloud();
    } catch (error) {
      setStatus(navigator.onLine ? 'error' : 'offline', friendlyError(error));
    }
  }

  window.addEventListener('online', () => {
    if (!session) return;
    setStatus('syncing', 'Соединение восстановлено');
    syncFromCloud().catch(() => scheduleFlush(1000));
  });
  window.addEventListener('offline', () => setStatus('offline', 'Нет сети, локальная копия доступна'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && session) syncFromCloud().catch(() => {});
  });
  setInterval(() => {
    if (session && navigator.onLine && document.visibilityState === 'visible') syncFromCloud().catch(() => {});
  }, 45000);

  initialize();
})();
