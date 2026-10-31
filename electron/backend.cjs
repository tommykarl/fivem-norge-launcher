// Kobling til egen backend (server/server.js): kunngjøringer, serverinnstillinger,
// anonym statistikk, feilrapporter og sjekk av utestengte brukere.
// Skrus på med BACKEND_URL i .env. Uten den gjør modulen ingenting.
const { app } = require('electron');
const crypto = require('crypto');
const { jsonFile } = require('./jsonfile.cjs');

const installFile = jsonFile('install.json', { id: null });
const CONFIG_EVERY = 5 * 60_000;

let base = null;
let deps = null; // { emit, telemetry: () => bool, getSessionToken: () => string|null, onBanned }
let config = { announcements: [], servers: {} };
let account = null; // { banned, banReason, role }
let lastError = null;
let connected = false;

function installId() {
  const f = installFile.get();
  if (!f.id) {
    f.id = crypto.randomUUID();
    installFile.save(true);
  }
  return f.id;
}

async function call(path, { method = 'GET', body, token } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    connected = true;
    lastError = null;
    return data;
  } catch (e) {
    connected = false;
    lastError = e.name === 'AbortError' ? 'Tidsavbrudd' : e.message;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function setConfig(c) {
  if (!c || typeof c !== 'object') return;
  config = { announcements: Array.isArray(c.announcements) ? c.announcements : [], servers: c.servers || {} };
  deps.emit('backend:changed');
}

async function refreshConfig(first = false) {
  if (!base) return;
  try {
    // Ved oppstart: anonym «ping» (gir også konfigurasjonen). Ellers bare hent konfigurasjonen.
    const c =
      first && deps.telemetry()
        ? await call('/api/launcher/ping', { method: 'POST', body: { installId: installId(), version: app.getVersion(), platform: process.platform } })
        : await call('/api/public/config');
    setConfig(c);
  } catch {
    deps.emit('backend:changed');
  }
}

// Kalles ved oppstart og etter innlogging med Discord
async function hello() {
  if (!base) return null;
  const token = deps.getSessionToken();
  if (!token) {
    account = null;
    deps.emit('backend:changed');
    return null;
  }
  try {
    account = await call('/api/launcher/hello', {
      method: 'POST',
      token,
      body: { installId: deps.telemetry() ? installId() : null, version: app.getVersion() },
    });
    if (account.banned) deps.onBanned(account);
  } catch {
    /* backend nede – prøv igjen senere */
  }
  deps.emit('backend:changed');
  return account;
}

// Feilrapporter: maks 10 i timen, samme feil sendes bare én gang per økt
const sent = new Set();
let sentThisHour = 0;
setInterval(() => (sentThisHour = 0), 3600_000).unref?.();
function reportError(err, source = 'main') {
  if (!base || !deps?.telemetry()) return;
  const message = `[${source}] ${String(err?.message || err).slice(0, 400)}`;
  if (sent.has(message) || sentThisHour >= 10) return;
  sent.add(message);
  sentThisHour++;
  call('/api/launcher/error', {
    method: 'POST',
    body: { installId: installId(), version: app.getVersion(), message, stack: String(err?.stack || '').slice(0, 4000) },
  }).catch(() => {});
}

function init(url, d) {
  deps = d;
  base = /^https?:\/\/[^\s]+$/i.test(String(url || '').trim()) ? String(url).trim().replace(/\/+$/, '') : null;
  if (!base) return;
  refreshConfig(true);
  setInterval(() => refreshConfig(false), CONFIG_EVERY);
  setTimeout(hello, 3_000);
}

const state = () => ({
  enabled: !!base,
  url: base,
  connected,
  error: lastError,
  config,
  account,
  adminUrl: base ? `${base}/admin` : null,
});

module.exports = { init, hello, reportError, state, refresh: () => refreshConfig(false), clearAccount: () => (account = null) };
