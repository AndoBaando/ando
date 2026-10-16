// Fælles hjælpere til spiller-, admin- og skærmvisning.

/** Byg DOM-elementer uden innerHTML (brugernavne mv. kan aldrig blive til HTML). */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export const $ = (selector, root = document) => root.querySelector(selector);

/** Som el.replaceChildren, men springer null/false over (tomme sektioner). */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

export async function api(path, { token, body, method = 'POST' } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Der skete en fejl. Prøv igen.'), { status: res.status, code: data.code });
  return data;
}

/**
 * Server-Sent Events via fetch (så tokenet kan sendes i en header i stedet for i URL'en).
 * Genforbinder automatisk med stigende pause.
 */
export function connectStream(url, { token, onEvent, onStatus, onAuthError }) {
  let stopped = false;
  let controller = null;
  let delay = 1000;
  let offlineTimer = null;

  (async () => {
    while (!stopped) {
      controller = new AbortController();
      const startedAt = Date.now();
      try {
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
          cache: 'no-store',
        });
        if (res.status === 401 || res.status === 403) {
          const body = await res.json().catch(() => ({}));
          onAuthError?.({ status: res.status, ...body });
          return;
        }
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        delay = 1000;
        clearTimeout(offlineTimer);
        onStatus?.(true);
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let index;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            let event = 'message';
            let data = '';
            for (const line of chunk.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (data) onEvent(event, JSON.parse(data));
          }
        }
      } catch {
        if (stopped) return;
      }
      // Hostingen lukker lange forbindelser jævnligt (Railway efter 15 min). Var forbindelsen sund,
      // genforbinder vi straks og viser først "Genopretter…", hvis det ikke lykkes inden for 2 sek.
      const wasHealthy = Date.now() - startedAt > 30_000;
      if (wasHealthy) delay = 300;
      clearTimeout(offlineTimer);
      offlineTimer = setTimeout(() => !stopped && onStatus?.(false), wasHealthy ? 2000 : 0);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 15000);
    }
  })();

  return {
    stop() {
      stopped = true;
      clearTimeout(offlineTimer);
      controller?.abort();
    },
  };
}

const kr = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' });
export const formatKr = (n) => (n === null || n === undefined ? '' : kr.format(n));

export function formatCountdown(ms) {
  if (ms <= 0) return 'udløbet';
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours >= 1) return `${hours} t ${String(minutes).padStart(2, '0')} min`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const formatTime = (ts) => new Date(ts).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });

/** Opdaterer alle [data-expires]-elementer. offset = servertid − lokal tid. */
export function tickCountdowns(offset = 0) {
  const now = Date.now() + offset;
  for (const el of document.querySelectorAll('[data-expires]')) {
    el.textContent = formatCountdown(Number(el.dataset.expires) - now);
  }
}

export function startCountdowns(getOffset) {
  tickCountdowns(getOffset());
  return setInterval(() => tickCountdowns(getOffset()), 1000);
}

export function toast(message, kind = '') {
  const root = document.getElementById('toasts');
  if (!root) return;
  const el = h('div', { class: `toast ${kind}`, role: 'status' }, message);
  root.append(el);
  setTimeout(() => el.remove(), kind === 'win' ? 6000 : 3500);
  while (root.children.length > 4) root.firstElementChild.remove();
}

export const STAGE_LABELS = { 1: '1 række', 2: '2 rækker', 3: 'Fuld plade' };

export function stagePills(stage, status) {
  return h(
    'div',
    { class: 'stages' },
    [1, 2, 3].map((s) =>
      h('span', { class: `stage-pill ${s === stage && status !== 'finished' ? 'current' : ''} ${s < stage || status === 'finished' ? 'done' : ''}` }, STAGE_LABELS[s]),
    ),
  );
}

export function board(drawn) {
  const set = new Set(drawn);
  const last = drawn[drawn.length - 1];
  return h(
    'div',
    { class: 'board', 'aria-label': 'Trukne tal' },
    Array.from({ length: 90 }, (_, i) => i + 1).map((n) => h('span', { class: n === last ? 'on last' : set.has(n) ? 'on' : '' }, n)),
  );
}

export const storage = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* privat browsing mv. — appen virker stadig */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignorér */
    }
  },
};
