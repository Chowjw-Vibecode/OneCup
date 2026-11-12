// Anonymous country/region check-in. This module never uses DecaidClient.
export const USAGE_ENDPOINT = 'https://home.zhouchenxing.com/usage-stats/api/v1/check-in';
export const USAGE_STORAGE_KEY = 'thiscup.usage.v1';
export const USAGE_COOKIE_NAME = 'thiscup_usage_v1';
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const RETRY = 15 * 60 * 1000;
const START_DELAY = 60_000;
const IDLE_RECHECK = 30_000;
const REQUEST_TIMEOUT = 4_000;
const ID = /^[0-9a-f]{32}$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const validVersion = value => typeof value === 'string' && value.length <= 64 && VERSION.test(value);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const IDLE = new Set(['idle', 'schedidle', 'sleeping']);
const PREVIEW = /(?:^|[\/_.-])(?:scene|mock|preview|prototype|test|tests|验证)(?:$|[\/_.-])/i;

function storedState(raw) {
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key=>!['enabled','install_id','next_at','attempt_version','retry_at'].includes(key)) ||
      !['enabled','install_id','next_at'].every(key=>Object.hasOwn(value,key)) ||
      ('retry_at' in value && (!Number.isFinite(value.retry_at) || value.retry_at < 0)) ||
      ('attempt_version' in value && value.attempt_version !== null && !validVersion(value.attempt_version)) ||
      typeof value.enabled !== 'boolean' ||
      (value.install_id !== null && (typeof value.install_id !== 'string' || !ID.test(value.install_id))) ||
      !Number.isFinite(value.next_at) || value.next_at < 0) throw Error('Invalid statistics preference');
  return value;
}

// Cookies share localhost across ports. Never fall back to a new per-port ID
// when this store is blocked, corrupt, or disappears during the page lifetime.
export function createUsageCookieStorage({
  document:doc = globalThis.document,
  location:page = globalThis.location,
  legacyStorage,
} = {}) {
  let checkedLegacy = false, seenCookie = false, unavailable = false;
  function guard(fn) {
    if (unavailable) throw Error('Statistics storage unavailable');
    try {
      if (page?.hostname !== 'localhost' || !['http:','https:'].includes(page.protocol)) throw Error('Not a native skin origin');
      return fn();
    } catch {
      unavailable = true;
      throw Error('Statistics storage unavailable');
    }
  }
  function readCookie() {
    const matches=doc.cookie.split(';').map(part=>part.trim()).filter(part=>part.startsWith(USAGE_COOKIE_NAME+'='));
    if (matches.length > 1) throw Error('Ambiguous statistics cookie');
    if (!matches.length) {
      if (seenCookie) throw Error('Statistics cookie disappeared');
      return null;
    }
    const raw=decodeURIComponent(matches[0].slice(USAGE_COOKIE_NAME.length+1));
    storedState(raw);
    seenCookie = true;
    return raw;
  }
  function writeCookie(raw) {
    storedState(raw);
    doc.cookie = `${USAGE_COOKIE_NAME}=${encodeURIComponent(raw)}; Path=/; SameSite=Lax; Max-Age=31536000`;
    if (readCookie() !== raw) throw Error('Statistics cookie was not saved');
  }
  return {
    getItem(key) {
      if (key !== USAGE_STORAGE_KEY) return null;
      return guard(() => {
        const raw=readCookie();
        if (raw !== null) { checkedLegacy = true; return raw; }
        if (checkedLegacy) return null;
        checkedLegacy = true;
        const legacy=legacyStorage === undefined ? globalThis.localStorage : legacyStorage;
        const previous=legacy?.getItem(USAGE_STORAGE_KEY) ?? null;
        if (previous === null) return null;
        storedState(previous);
        writeCookie(previous);
        // The verified cookie is authoritative from this point onward.
        try { legacy?.removeItem?.(USAGE_STORAGE_KEY); } catch {}
        return previous;
      });
    },
    setItem(key,raw) {
      if (key !== USAGE_STORAGE_KEY) throw Error('Unexpected statistics key');
      guard(() => writeCookie(raw));
    },
  };
}

export function isUsageEnvironment(context) {
  try {
    const page = new URL(context.pageUrl), api = new URL(context.apiUrl);
    // The native skin uses localhost. Its assigned port can temporarily change
    // after a conflict; the API remains on a separate port.
    if (context.host?.app !== 'decent.app' ||
        !['android', 'ios', 'macos', 'windows', 'linux'].includes(context.host.platform) ||
        !['http:', 'https:'].includes(page.protocol) || !['http:', 'https:'].includes(api.protocol) ||
        page.hostname !== 'localhost' || !LOOPBACK.has(api.hostname) ||
        page.username || page.password || api.username || api.password) return false;
    for (const url of [page, api]) {
      if (PREVIEW.test(decodeURIComponent(url.pathname))) return false;
      for (const key of url.searchParams.keys()) {
        if (/^(scene|mock|preview|demo|test|simulation)$/i.test(key)) return false;
      }
    }
    return true;
  } catch { return false; }
}

function isIdleConnection(context) {
  return isUsageEnvironment(context) &&
    Array.isArray(context.settings?.simulatedDevices) && context.settings.simulatedDevices.length === 0 &&
    context.connection?.connected === true && context.connection.machineConnected === true &&
    context.connection.stale === false && IDLE.has(context.machineState) && !context.busy;
}

export function createUsageReporter({
  getContext = () => ({}),
  currentVersion,
  storage,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  cryptoImpl = globalThis.crypto,
  now = () => Date.now(),
  setTimer = (fn, delay) => setTimeout(fn, delay),
  clearTimer = timer => clearTimeout(timer),
  events = globalThis.window,
} = {}) {
  if (storage === undefined) storage = createUsageCookieStorage();
  const version = validVersion(currentVersion) ? currentVersion : null;
  let state = {enabled:true, install_id:null, next_at:0};
  let preferenceOverride = null;
  let hasStoredState = false;
  let timer = null, requestTimer = null, controller = null;
  let active = false, disposed = false, revision = 0, readyAt = 0, blockedUntil = 0;

  function read() {
    try {
      if (!isUsageEnvironment(context())) return false;
      const raw = storage.getItem(USAGE_STORAGE_KEY);
      if (raw === null && hasStoredState) return false;
      const value = raw === null ? {enabled:true,install_id:null,next_at:0} : storedState(raw);
      if (raw !== null) hasStoredState = true;
      state = {
        enabled:preferenceOverride ?? value.enabled,
        install_id:value.install_id,
        next_at:value.next_at,
        ...('attempt_version' in value ? {attempt_version:value.attempt_version} : {}),
        ...('retry_at' in value ? {retry_at:value.retry_at} : {}),
      };
      // Shorten a previous transport failure's one-day reservation after an
      // upgrade. Preserve the ID, opt-out and successful weekly schedule.
      if (state.retry_at > now() + RETRY) {
        const previousRetry = state.retry_at;
        state.retry_at = now() + RETRY;
        if (state.next_at === previousRetry) state.next_at = state.retry_at;
        return persist();
      }
      return true;
    } catch { return false; }
  }
  function persist() {
    try {
      const raw = JSON.stringify(state);
      storage.setItem(USAGE_STORAGE_KEY, raw);
      const saved=storage.getItem(USAGE_STORAGE_KEY) === raw;
      if (saved) hasStoredState = true;
      return saved;
    } catch { return false; }
  }
  function context() { try { return getContext(); } catch { return {}; } }
  function cancelTimer() { if (timer !== null) clearTimer(timer); timer = null; }
  function cancelRequest() {
    revision++;
    controller?.abort(); controller = null;
    if (requestTimer !== null) clearTimer(requestTimer);
    requestTimer = null;
  }
  function schedule(delay) {
    cancelTimer();
    if (!active || disposed || !state.enabled) return;
    timer = setTimer(() => { timer = null; void tick(); }, Math.max(0, Math.min(delay, WEEK)));
  }
  // Failure/in-flight reservation is shared by every version, including old open pages.
  function dueAt() { return Math.max(state.retry_at ?? 0, version && state.attempt_version !== version ? 0 : state.next_at); }
  async function tick() {
    if (!active || disposed || !state.enabled || controller) return;
    if (!read()) { blockedUntil = now() + DAY; schedule(DAY); return; }
    if (!state.enabled) return;
    const wait = Math.max(readyAt, blockedUntil, dueAt()) - now();
    if (wait > 0) { schedule(wait); return; }
    const current = context();
    if (!isUsageEnvironment(current)) return;
    if (!isIdleConnection(current)) { schedule(IDLE_RECHECK); return; }
    if (typeof fetchImpl !== 'function' || typeof cryptoImpl?.getRandomValues !== 'function') return;

    if (!state.install_id) {
      try {
        const bytes = new Uint8Array(16);
        cryptoImpl.getRandomValues(bytes);
        state.install_id = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
      } catch { blockedUntil = now() + DAY; schedule(DAY); return; }
    }
    // Persist the ID and reserve the failure interval BEFORE any transport.
    // A reload or another tab must not turn a failed request into a retry loop.
    state.next_at = now() + RETRY;
    state.retry_at = state.next_at;
    if (version) state.attempt_version = version;
    if (!persist()) { blockedUntil = now() + DAY; schedule(DAY); return; }

    const installId = state.install_id, attempt = ++revision;
    const aborter = new AbortController(); controller = aborter;
    const aborted = new Promise((_, reject) => {
      aborter.signal.addEventListener('abort', () => reject(new Error('cancelled')), {once:true});
    });
    requestTimer = setTimer(() => aborter.abort(), REQUEST_TIMEOUT);
    let accepted = false;
    try {
      const request = Promise.resolve().then(() => fetchImpl(USAGE_ENDPOINT, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({install_id:installId, product:'this_cup', ...(version ? {version} : {})}),
        credentials:'omit', referrerPolicy:'no-referrer', redirect:'error', cache:'no-store',
        signal:aborter.signal,
      })).then(async response => {
        if (!response.ok) throw new Error('not accepted');
        return (await response.json())?.accepted === true;
      });
      accepted = await Promise.race([request, aborted]);
    } catch { /* A statistics failure must never reach machine UI or control. */ }
    finally {
      if (attempt === revision) {
        if (requestTimer !== null) clearTimer(requestTimer);
        requestTimer = null; controller = null;
        // Re-read the shared preference so an opt-out in another tab wins.
        if (read() && state.enabled && state.install_id === installId && (!version || state.attempt_version === version)) {
          state.next_at = now() + (accepted ? WEEK : RETRY);
          state.retry_at = accepted ? 0 : state.next_at;
          if (!persist()) blockedUntil = state.next_at;
        }
        if (active && state.enabled) schedule(Math.max(readyAt, blockedUntil, dueAt()) - now());
      }
    }
  }
  function getInstallationId() {
    if (!read() || !state.enabled || !isUsageEnvironment(context())) return null;
    if (!state.install_id) {
      try {
        const bytes=new Uint8Array(16);cryptoImpl.getRandomValues(bytes);
        state.install_id=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
        if (!persist()) return null;
      } catch { return null; }
    }
    return state.install_id;
  }
  function start() {
    if (disposed || active) return;
    active = true; readyAt = now() + START_DELAY;
    read();
    if (isUsageEnvironment(context())) schedule(START_DELAY);
  }
  function stop() { active = false; cancelTimer(); cancelRequest(); }
  function refresh() {
    if (!active || disposed) return;
    read();
    if (!state.enabled) { cancelTimer(); cancelRequest(); return; }
    if (!controller && isUsageEnvironment(context())) schedule(Math.max(readyAt, blockedUntil, dueAt()) - now());
  }
  function setEnabled(enabled) {
    const readable=read();
    state.enabled = enabled === true;
    preferenceOverride = state.enabled;
    if (readable && persist()) preferenceOverride = null;
    if (!state.enabled) { cancelTimer(); cancelRequest(); }
    else refresh();
    return state.enabled;
  }
  const onPageShow = event => { if (event.persisted) start(); };
  const onStorage = event => { if (event.key === USAGE_STORAGE_KEY || event.key === null) refresh(); };
  read();
  events?.addEventListener('pagehide', stop);
  events?.addEventListener('pageshow', onPageShow);
  events?.addEventListener('storage', onStorage);
  return {
    get enabled() { return state.enabled; },
    get preferenceSaved() { return preferenceOverride === null; },
    start, stop, refresh, setEnabled, getInstallationId,
    dispose() {
      stop(); disposed = true;
      events?.removeEventListener('pagehide', stop);
      events?.removeEventListener('pageshow', onPageShow);
      events?.removeEventListener('storage', onStorage);
    },
  };
}
