(() => {
  'use strict';

  const SUPABASE_URL = 'https://cfkpxrvinkcutbtqpufa.supabase.co';
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
        if (args[1]?.signal?.aborted) throw error;
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

  function diagnosticText() {
    const diagnostic = readJson(sessionStorage, DIAGNOSTIC_KEY);
    if (!diagnostic) return 'Облачная сессия дала сбой. Локальные данные сохранены.';
    if (diagnostic.kind === 'data' && diagnostic.status === 403) return 'Облако отклонило доступ к данным. Переподключение безопасно; если ошибка повторится, потребуется проверить права RLS.';
    if (diagnostic.kind === 'data' && diagnostic.status === 404) return 'Облачная таблица недоступна. Локальные данные сохранены.';
    if (diagnostic.kind === 'data' && diagnostic.status === 409) return 'Облако вернуло конфликт структуры данных. Локальная копия не потеряна.';
    if (diagnostic.status === 0) return 'Соединение с облаком прервалось. Локальная копия сохранена.';
    if (diagnostic.kind === 'refresh') return 'Не удалось продлить подключение. Аккаунт сохранён, приложение повторит попытку автоматически.';
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
  // Session restoration is owned by sync-core, including refresh locking and retries.
  window.lawyerCloudRecoveryReady = Promise.resolve();
})();
