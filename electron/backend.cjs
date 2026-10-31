// Kobling til fivemnorge.xyz (web/src/worker.js): kunngjøringer, serverinnstillinger,
// statistikk, feilrapporter, konto, live-liste, anmeldelser, venner og serverkrav.
// Skrus på med BACKEND_URL i .env. Uten den gjør modulen ingenting.
//
// Innlogging: Discord-tokenet sendes bare én gang (POST /api/launcher/login). Backenden svarer
// med en egen nøkkel som brukes videre, så Discord-tokenet ikke trenger å sendes igjen.
const { app } = require('electron');
const crypto = require('crypto');
const { jsonFile } = require('./jsonfile.cjs');

const installFile = jsonFile('install.json', { id: null });
const CONFIG_EVERY = 5 * 60_000;
const SNAPSHOT_EVERY = 5 * 60_000;
const PRESENCE_EVERY = 2 * 60_000;

let base = null;
// { emit, telemetry, getDiscordToken, getLauncherToken, setLauncherToken, onBanned, servers, activity }
let deps = null;
let config = { announcements: [], servers: {} };
let account = null; // { banned, banReason, role, user, shareStatus }
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

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    connected = true;
    lastError = null;
    if (!res.ok) throw new ApiError(res.status, data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (!(e instanceof ApiError)) {
      connected = false;
      lastError = e.name === 'AbortError' ? 'Tidsavbrudd' : e.message;
    }
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
    const c =
      first && deps.telemetry()
        ? await call('/api/launcher/ping', { method: 'POST', body: { installId: installId(), version: app.getVersion(), platform: process.platform } })
        : await call('/api/public/config');
    setConfig(c);
  } catch {
    deps.emit('backend:changed');
  }
}

function applyAccount(acc) {
  if (acc?.token) deps.setLauncherToken(acc.token);
  account = acc ? { banned: !!acc.banned, banReason: acc.banReason || null, role: acc.role, user: acc.user || null, shareStatus: !!acc.shareStatus } : null;
  if (account?.banned) {
    deps.setLauncherToken(null);
    deps.onBanned(account);
  }
}

// Kalles ved oppstart og etter innlogging med Discord. fresh = nettopp logget inn med Discord.
async function hello(fresh = false) {
  if (!base) return null;
  try {
    const own = fresh ? null : deps.getLauncherToken();
    if (own) {
      try {
        applyAccount(await call('/api/launcher/me', { method: 'POST', token: own, body: { version: app.getVersion() } }));
        deps.emit('backend:changed');
        return account;
      } catch (e) {
        if (e.status !== 401) throw e;
        deps.setLauncherToken(null); // utløpt – logg inn på nytt med Discord-tokenet under
      }
    }
    const discordToken = deps.getDiscordToken();
    if (!discordToken) {
      account = null;
    } else {
      applyAccount(
        await call('/api/launcher/login', {
          method: 'POST',
          token: discordToken,
          body: { installId: deps.telemetry() ? installId() : null, version: app.getVersion() },
        })
      );
    }
  } catch (e) {
    if (e.status === 403) applyAccount({ banned: true, banReason: null });
    /* ellers: backend nede – prøv igjen senere */
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

// Tilkoblinger via launcheren (anonymt, for statistikk per server)
function reportConnect(serverId) {
  if (!base || !deps?.telemetry() || !/^[a-z0-9]{4,10}$/i.test(serverId || '')) return;
  call('/api/launcher/connect', { method: 'POST', body: { serverId } }).catch(() => {});
}

// Live-liste for nettsiden: de norske serverne launcheren allerede har hentet
let lastSnapshot = 0;
function sendSnapshot() {
  const token = deps.getLauncherToken();
  if (!base || !token || !deps.telemetry() || account?.banned) return;
  if (Date.now() - lastSnapshot < SNAPSHOT_EVERY) return;
  const servers = deps
    .servers()
    .filter((s) => s.clients > 0)
    .sort((a, z) => z.clients - a.clients)
    .slice(0, 200)
    .map((s) => ({ id: s.id, name: s.name, clients: s.clients, max: s.max, iconVersion: s.iconVersion || 0, tags: (s.tags || []).slice(0, 6) }));
  if (servers.length < 3) return;
  lastSnapshot = Date.now();
  call('/api/launcher/snapshot', { method: 'POST', token, body: { servers } }).catch(() => {});
}

// «Spiller nå» for venner – bare når brukeren har skrudd det på
let lastPresence = undefined;
async function sendPresence(force = false) {
  const token = deps.getLauncherToken();
  if (!base || !token || !account || account.banned || !account.shareStatus) return;
  const active = deps.activity()?.active;
  const cur = active?.id || null;
  if (!force && cur === lastPresence) return;
  lastPresence = cur;
  await call('/api/launcher/presence', { method: 'POST', token, body: { serverId: cur, serverName: active?.name || null } }).catch(() => {});
}
async function setShareStatus(on) {
  const token = deps.getLauncherToken();
  if (!token) throw new Error('Logg inn med Discord først');
  const active = deps.activity()?.active;
  await call('/api/launcher/presence', { method: 'POST', token, body: { share: !!on, serverId: on ? active?.id || null : null, serverName: active?.name || null } });
  if (account) account.shareStatus = !!on;
  lastPresence = on ? active?.id || null : undefined;
  deps.emit('backend:changed');
  return account;
}

// Kall fra grensesnittet. Bare adresser på denne lista er lov.
const ALLOWED = [
  ['GET', /^\/api\/public\/(live|server\/[a-z0-9]{4,10})$/i, false],
  ['POST', /^\/api\/launcher\/review$/, true],
  ['DELETE', /^\/api\/launcher\/review$/, true],
  ['GET', /^\/api\/launcher\/friends$/, true],
  ['POST', /^\/api\/launcher\/friends$/, true],
  ['DELETE', /^\/api\/launcher\/friends\/\d{15,21}$/, true],
  ['POST', /^\/api\/launcher\/claim$/, true],
  ['GET', /^\/api\/launcher\/claims$/, true],
  ['GET', /^\/api\/admin\/[a-z0-9/?=&_.~-]*$/i, true],
  ['POST', /^\/api\/admin\/[a-z0-9/_.~-]+$/i, true],
  ['DELETE', /^\/api\/admin\/[a-z0-9/_.~-]+$/i, true],
];
async function api(method, path, body) {
  if (!base) throw new Error('Ikke koblet til fivemnorge.xyz');
  method = String(method || 'GET').toUpperCase();
  path = String(path || '');
  const rule = ALLOWED.find(([m, re]) => m === method && re.test(path.split('?')[0]) && !path.includes('..'));
  if (!rule) throw new Error('Ugyldig forespørsel');
  const token = rule[2] ? deps.getLauncherToken() : null;
  if (rule[2] && !token) throw new Error('Logg inn med Discord først');
  try {
    return await call(path, { method, body: method === 'GET' ? undefined : body || {}, token });
  } catch (e) {
    if (e.status === 401 && rule[2] && !path.startsWith('/api/admin')) {
      // Nøkkelen er utløpt: prøv å fornye én gang
      await hello(true);
      const t2 = deps.getLauncherToken();
      if (t2) return call(path, { method, body: method === 'GET' ? undefined : body || {}, token: t2 });
    }
    throw e;
  }
}

function init(url, d) {
  deps = d;
  base = /^https?:\/\/[^\s]+$/i.test(String(url || '').trim()) ? String(url).trim().replace(/\/+$/, '') : null;
  if (!base) return;
  refreshConfig(true);
  setInterval(() => refreshConfig(false), CONFIG_EVERY);
  setInterval(() => sendPresence(false), PRESENCE_EVERY);
  setTimeout(() => hello(false).then(() => sendPresence(true)), 3_000);
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

module.exports = {
  init,
  hello,
  reportError,
  reportConnect,
  sendSnapshot,
  setShareStatus,
  api,
  state,
  refresh: () => refreshConfig(false),
  clearAccount: () => {
    account = null;
    lastPresence = undefined;
    deps?.setLauncherToken(null);
  },
};
