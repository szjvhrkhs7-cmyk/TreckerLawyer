(() => {
  'use strict';

  const SUPABASE_URL = 'https://cfkpxrvinkcutbtqpufa.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VAKzxSJ53hXxd4Tvk0FFlw_D_sNbFq9';
  const SESSION_KEY = 'lawyerCloudSession';
  const DIAGNOSTIC_KEY = 'lawyerCloudDiagnostic';
  const inheritedFetch = globalThis.fetch.bind(globalThis);

  function requestUrl(input) {
    return typeof input === 'string' ? input : String(input?.url || '');
  }

  globalThis.fetch = async (input, init = {}) => {
    const url = requestUrl(input);
    if (!url.startsWith(SUPABASE_URL)) return inheritedFetch(input, init);

    // The original working implementation used the browser's normal redirect handling.
    // Keep credentials omitted, but allow same-project redirects that some edge paths may use.
    const nextInit = { ...init };
    if (nextInit.redirect === 'error') nextInit.redirect = 'follow';

    const response = await inheritedFetch(input, nextInit);
    const finalUrl = String(response?.url || url);
    if (!finalUrl.startsWith(SUPABASE_URL)) {
      throw new Error('UNSAFE_SUPABASE_REDIRECT');
    }
    return response;
  };

  function readJson(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  async function payload(response) {
    try {
      const text = await response.clone().text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  function codeFrom(data) {
    return String(data?.code || data?.error_code || data?.error || '').slice(0, 80);
  }

  function technicalLine(label, result) {
    const suffix = result.code ? ` • ${result.code}` : '';
    return `${label}: HTTP ${result.status || 'сеть'}${suffix}`;
  }

  async function check(url, token) {
    try {
      const response = await globalThis.fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await payload(response);
      return { status: response.status, code: codeFrom(data) };
    } catch (error) {
      return { status: 0, code: String(error?.message || 'network_error').slice(0, 80) };
    }
  }

  function diagnosis(auth, data) {
    if (auth.status === 200 && data.status === 200) {
      return 'Авторизация и чтение облачной таблицы работают. Если обычная синхронизация всё ещё падает, проблема находится на этапе записи; технический код последней записи будет показан ниже.';
    }
    if (auth.status === 200 && data.status === 401) {
      return 'Auth принимает сессию, но Data API отклоняет тот же JWT. Это совпадает с недавним инцидентом Supabase с HTTP 401. Для такого случая Supabase рекомендует перезапуск проекта.';
    }
    if (data.code === '42501' || data.status === 403) {
      return 'Data API доступен, но база отклоняет права. Нужно проверить GRANT для authenticated и RLS-политики таблицы lawyer_store.';
    }
    if (auth.status === 401) {
      return 'Сама пользовательская сессия недействительна. Нужен повторный вход в облачный аккаунт.';
    }
    if (auth.status === 0 || data.status === 0) {
      return 'Браузер не смог завершить сетевой запрос к Supabase. Локальные данные при этом не затрагиваются.';
    }
    return 'Получен серверный ответ, который нужно проверять по техническому коду ниже. Локальные данные не изменялись.';
  }

  function lastStoredDiagnostic() {
    const item = readJson(sessionStorage, DIAGNOSTIC_KEY);
    if (!item) return '';
    const code = item.code ? ` • ${String(item.code).slice(0, 80)}` : '';
    return `Последняя ошибка синхронизации: ${String(item.kind || 'cloud').toUpperCase()} HTTP ${item.status || 'сеть'}${code}`;
  }

  function ensureBox() {
    const syncButton = document.getElementById('syncButton');
    const syncContent = document.getElementById('syncContent');
    if (!syncButton || !syncContent) return;
    if (document.getElementById('cloudDiagnosticBox')) return;
    if (!syncContent.children.length && syncButton.dataset.state !== 'error') return;

    const box = document.createElement('div');
    box.id = 'cloudDiagnosticBox';
    box.className = 'sync-status-card';

    const title = document.createElement('p');
    title.className = 'sync-intro';
    title.textContent = 'Если синхронизация не работает, можно безопасно проверить соединение. Проверка только читает статус и не меняет ваши данные.';

    const output = document.createElement('p');
    output.className = 'sync-message';
    output.id = 'cloudDiagnosticOutput';
    output.textContent = lastStoredDiagnostic();

    const button = document.createElement('button');
    button.className = 'btn wide';
    button.type = 'button';
    button.textContent = 'Диагностика облака';
    button.addEventListener('click', async () => {
      const session = readJson(localStorage, SESSION_KEY);
      if (!session?.access_token) {
        output.className = 'sync-message error';
        output.textContent = 'Облачная сессия отсутствует. Сначала войдите в аккаунт синхронизации.';
        return;
      }

      button.disabled = true;
      output.className = 'sync-message';
      output.textContent = 'Проверяем Auth и Data API…';
      const auth = await check(`${SUPABASE_URL}/auth/v1/user`, session.access_token);
      const data = await check(`${SUPABASE_URL}/rest/v1/lawyer_store?select=storage_key&limit=1`, session.access_token);
      output.className = data.status === 200 && auth.status === 200 ? 'sync-message success' : 'sync-message error';
      output.textContent = `${diagnosis(auth, data)} ${technicalLine('Auth', auth)}. ${technicalLine('Data API', data)}.`;
      button.disabled = false;
    });

    box.append(title, output, button);
    syncContent.append(box);
  }

  function installUi() {
    const syncButton = document.getElementById('syncButton');
    const syncContent = document.getElementById('syncContent');
    if (!syncButton || !syncContent) return;
    syncButton.addEventListener('click', () => setTimeout(ensureBox, 0));
    new MutationObserver(() => setTimeout(ensureBox, 0)).observe(syncContent, { childList: true });
  }

  installUi();
})();
