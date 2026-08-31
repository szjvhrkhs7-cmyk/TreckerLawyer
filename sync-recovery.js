(() => {
  'use strict';

  const SUPABASE_URL = 'https://cfkpxrvinkcutbtqpufa.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VAKzxSJ53hXxd4Tvk0FFlw_D_sNbFq9';
  const SESSION_KEY = 'lawyerCloudSession';
  const DIAGNOSTIC_KEY = 'lawyerCloudDiagnostic';
  const RELOGIN_KEY = 'lawyerCloudNeedsRelogin';
  const originalFetch = globalThis.fetch.bind(globalThis);

  function readJson(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  function writeSession(session) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  }

  function clearSessionForRelogin() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    try { sessionStorage.setItem(RELOGIN_KEY, '1'); } catch {}
  }

  function endpointKind(url) {
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) return 'refresh';
    if (url.includes('/auth/v1/token?grant_type=password')) return 'login';
    if (url.includes('/auth/v1/user')) return 'user';
    if (url.includes('/rest/v1/lawyer_store')) return 'data';
    return 'supabase';
  }

  function storeDiagnostic(kind, status, code = '') {
    try {
      sessionStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify({ kind, status, code: String(code || '').slice(0, 80), at: Date.now() }));
    } catch {}
  }

  function clearDiagnostic() {
    try { sessionStorage.removeItem(DIAGNOSTIC_KEY); } catch {}
  }

  async function responsePayload(response) {
    try {
      const text = await response.clone().text();
      if (!text) return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function responseCode(payload) {
    return payload?.code || payload?.error_code || payload?.error || '';
  }

  function isTerminalRefreshFailure(status, payload) {
    if (status !== 400 && status !== 401) return false;
    const code = String(responseCode(payload)).toLowerCase();
    const message = String(payload?.message || payload?.msg || payload?.error_description || '').toLowerCase();
    return code.includes('refresh_token_not_found')
      || code.includes('refresh_token_already_used')
      || message.includes('invalid refresh token')
      || message.includes('refresh token not found')
      || message.includes('refresh token already used');
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  globalThis.fetch = async (...args) => {
    const requestUrl = typeof args[0] === 'string' ? args[0] : String(args[0]?.url || '');
    const isSupabase = requestUrl.startsWith(SUPABASE_URL);
    if (!isSupabase) return originalFetch(...args);

    const kind = endpointKind(requestUrl);
    const retryableRefresh = kind === 'refresh';
    const attempts = retryableRefresh ? 2 : 1;
    let lastError;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await originalFetch(...args);
        if (response.ok) {
          if (kind === 'data' || kind === 'login') clearDiagnostic();
          if (kind === 'login') {
            try { sessionStorage.removeItem(RELOGIN_KEY); } catch {}
          }
          return response;
        }

        const payload = await responsePayload(response);
        storeDiagnostic(kind, response.status, responseCode(payload));
        if (retryableRefresh && response.status >= 500 && attempt + 1 < attempts) {
          await wait(300);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        storeDiagnostic(kind, 0, 'network_error');
        if (retryableRefresh && attempt + 1 < attempts) {
          await wait(300);
          continue;
        }
      }
    }

    throw lastError || new Error('Supabase request failed');
  };

  async function refreshSavedSession(saved) {
    const response = await originalFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: saved.refresh_token })
    });
    const payload = await responsePayload(response);
    if (response.ok && payload?.access_token && payload?.refresh_token) {
      const next = { ...payload, user: payload.user || saved.user };
      if (!next.expires_at && next.expires_in) next.expires_at = Math.floor(Date.now() / 1000) + Number(next.expires_in);
      writeSession(next);
      clearDiagnostic();
      try { sessionStorage.removeItem(RELOGIN_KEY); } catch {}
      return true;
    }
    storeDiagnostic('refresh', response.status, responseCode(payload));
    if (isTerminalRefreshFailure(response.status, payload)) clearSessionForRelogin();
    return false;
  }

  async function preflightSavedSession() {
    const saved = readJson(localStorage, SESSION_KEY);
    if (!saved?.access_token || !saved?.refresh_token || !navigator.onLine) return;

    try {
      const userResponse = await originalFetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${saved.access_token}`, 'Content-Type': 'application/json' }
      });

      const expiresSoon = Number(saved.expires_at || 0) * 1000 <= Date.now() + 60000;
      if (userResponse.ok && !expiresSoon) {
        clearDiagnostic();
        return;
      }

      if (!userResponse.ok && userResponse.status !== 401) {
        const payload = await responsePayload(userResponse);
        storeDiagnostic('user', userResponse.status, responseCode(payload));
        return;
      }

      await refreshSavedSession(saved);
    } catch {
      storeDiagnostic('user', 0, 'network_error');
    }
  }

  function diagnosticText() {
    const diagnostic = readJson(sessionStorage, DIAGNOSTIC_KEY);
    if (!diagnostic) return 'Облачная сессия дала сбой. Локальные данные сохранены.';
    if (diagnostic.kind === 'data' && diagnostic.status === 403) return 'Облако отклонило доступ к данным. Переподключение безопасно; если ошибка повторится, потребуется проверить права RLS.';
    if (diagnostic.kind === 'data' && diagnostic.status === 404) return 'Облачная таблица недоступна. Локальные данные сохранены.';
    if (diagnostic.kind === 'data' && diagnostic.status === 409) return 'Облако вернуло конфликт структуры данных. Локальная копия не потеряна.';
    if (diagnostic.status === 401 || diagnostic.kind === 'refresh') return 'Облачная сессия устарела. Переподключите аккаунт, локальные данные останутся на месте.';
    if (diagnostic.status === 0) return 'Соединение с облаком прервалось. Локальная копия сохранена.';
    if (diagnostic.status >= 500) return 'Supabase временно не ответил корректно. Локальные данные сохранены.';
    return `Сбой облачной синхронизации (код ${diagnostic.status || 'сети'}). Локальная копия сохранена.`;
  }

  function needsRelogin() {
    try { return sessionStorage.getItem(RELOGIN_KEY) === '1'; } catch { return false; }
  }

  function appendRecoveryUi() {
    const syncButton = document.getElementById('syncButton');
    const syncContent = document.getElementById('syncContent');
    if (!syncButton || !syncContent) return;
    if (document.getElementById('cloudRecoveryBox')) return;
    if (syncButton.dataset.state !== 'error' && !needsRelogin()) return;

    const box = document.createElement('div');
    box.id = 'cloudRecoveryBox';
    box.className = 'sync-status-card';

    const message = document.createElement('p');
    message.className = 'sync-message error';
    message.textContent = needsRelogin()
      ? 'Старая облачная сессия больше не действует. Просто войдите ещё раз. Задачи, проекты, заметки и события на этом устройстве не удалены.'
      : diagnosticText();
    box.append(message);

    if (!needsRelogin()) {
      const button = document.createElement('button');
      button.className = 'btn wide';
      button.type = 'button';
      button.textContent = 'Переподключить облако';
      button.addEventListener('click', () => {
        clearSessionForRelogin();
        clearDiagnostic();
        location.reload();
      });
      box.append(button);
    }

    syncContent.append(box);
  }

  function installRecoveryUi() {
    const syncButton = document.getElementById('syncButton');
    const syncContent = document.getElementById('syncContent');
    if (!syncButton || !syncContent) return;

    syncButton.addEventListener('click', () => setTimeout(appendRecoveryUi, 0));
    new MutationObserver(() => setTimeout(appendRecoveryUi, 0)).observe(syncButton, { attributes: true, attributeFilter: ['data-state'] });
    new MutationObserver(() => {
      if (syncButton.dataset.state === 'error' || needsRelogin()) setTimeout(appendRecoveryUi, 0);
    }).observe(syncContent, { childList: true });
  }

  installRecoveryUi();
  window.lawyerCloudRecoveryReady = preflightSavedSession();
})();
