// FiveM Norge Launcher – backend med lokal JSON-database
//
// Kjør:  node server.js        (Node 18 eller nyere, ingen andre avhengigheter)
// Data:  data/db.json          (lagres automatisk; data/db.backup.json tas ved hver oppstart)
// Oppsett: kopier .env.example til .env – se README.md
//
// Offentlig API (launcheren og nettsiden):
//   GET  /api/public/config          kunngjøringer + serverinnstillinger
//   POST /api/launcher/ping          anonym oppstart { installId, version, platform }
//   POST /api/launcher/hello         innlogget bruker (Authorization: Bearer <Discord-token>)
//   POST /api/launcher/error         feilrapport { installId, version, message, stack }
// Adminpanel:
//   GET  /admin, /auth/login, /auth/callback, /auth/logout, /api/admin/*

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// ---------- Konfigurasjon (.env + miljøvariabler) ----------
function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadEnv(path.join(ROOT, '.env')), ...process.env };
const PORT = Number(env.PORT || 8787);
const HOST = env.HOST || '0.0.0.0';
const PUBLIC_URL = (env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const SECURE_COOKIE = env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : PUBLIC_URL.startsWith('https://');
const DEV = env.DEV_MODE === '1';
const DATA_DIR = path.resolve(ROOT, env.DATA_DIR || 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const OWNERS = new Set(String(env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
let SESSION_SECRET = env.SESSION_SECRET;

const DAY = 86400_000;
const SESSION_TTL = 7 * DAY;
const now = () => Date.now();
const UUID_RE = /^[0-9a-f-]{16,64}$/i;
const SNOWFLAKE_RE = /^\d{15,21}$/;
const SERVER_RE = /^[a-z0-9]{4,10}$/i;

// ---------- JSON-database ----------
const EMPTY = { version: 1, users: {}, installs: {}, servers: {}, announcements: [], errors: {}, audit: [], seq: { announcement: 0, error: 0 }, meta: {} };
let db;
function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    db = { ...structuredClone(EMPTY), ...JSON.parse(raw) };
    fs.writeFileSync(path.join(DATA_DIR, 'db.backup.json'), raw); // sikkerhetskopi ved oppstart
  } else {
    db = structuredClone(EMPTY);
  }
  // Hemmelighet for innlogging: fra .env, ellers generert én gang og lagret i databasen
  if (!SESSION_SECRET) {
    db.meta.sessionSecret = db.meta.sessionSecret || crypto.randomBytes(32).toString('hex');
    SESSION_SECRET = db.meta.sessionSecret;
  }
  saveNow();
}
let saveTimer = null;
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE); // atomisk: filen blir aldri halvskrevet
}
const save = () => {
  if (!saveTimer) saveTimer = setTimeout(saveNow, 500);
};
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (saveTimer) saveNow();
    process.exit(0);
  });
}

// ---------- Hjelpere ----------
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : v == null ? null : String(v).slice(0, max));
const bool = (v) => (v ? 1 : 0);
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string';
  res.writeHead(status, {
    'content-type': isJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}
const redirect = (res, location, cookies = []) => {
  res.writeHead(302, { location, ...(cookies.length ? { 'set-cookie': cookies } : {}) });
  res.end();
};
function readBody(req, max = 20_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        reject(new HttpError(413, 'For stor forespørsel'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new HttpError(400, 'Ugyldig JSON'));
      }
    });
    req.on('error', reject);
  });
}
function cookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
const cookieStr = (name, value, maxAge, p = '/') =>
  `${name}=${encodeURIComponent(value)}; Path=${p}; HttpOnly;${SECURE_COOKIE ? ' Secure;' : ''} SameSite=Lax; Max-Age=${maxAge}`;
const sha = (t) => crypto.createHash('sha256').update(t).digest('base64url');

// Enkel begrensning per IP for launcher-API-et (60 kall per minutt)
const buckets = new Map();
function rateLimit(req) {
  const ip = req.socket.remoteAddress || '?';
  const t = now();
  const b = buckets.get(ip) || { n: 0, reset: t + 60_000 };
  if (t > b.reset) {
    b.n = 0;
    b.reset = t + 60_000;
  }
  b.n++;
  buckets.set(ip, b);
  if (b.n > 60) throw new HttpError(429, 'For mange forespørsler');
}
setInterval(() => {
  const t = now();
  for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k);
}, 120_000).unref();

// ---------- Innlogging i adminpanelet (signert cookie) ----------
function makeSession(user) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: now() + SESSION_TTL })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function readSession(req) {
  const raw = cookie(req, 'fnl_admin');
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  return s.exp > now() ? s : null;
}
// Rollen hentes alltid fra databasen, så endringer slår inn med en gang
function currentAdmin(req) {
  const s = readSession(req);
  if (!s) return null;
  if (OWNERS.has(s.id)) return { ...s, role: 'owner' };
  const u = db.users[s.id];
  if (!u || u.banned || !['admin', 'moderator'].includes(u.role)) return null;
  return { ...s, role: u.role };
}
const canManage = (a) => ['owner', 'admin'].includes(a?.role);

function audit(admin, action, target, details) {
  db.audit.unshift({ id: db.audit.length ? db.audit[0].id + 1 : 1, at: now(), admin_id: admin.id, admin_name: admin.name, action, target: target ?? null, details: details ? JSON.stringify(details).slice(0, 2000) : null });
  if (db.audit.length > 2000) db.audit.length = 2000;
  save();
}

// ---------- Discord ----------
async function discordUser(token) {
  // Kun lokal testing (DEV_MODE=1): token "dev:<id>:<navn>"
  if (DEV && token.startsWith('dev:')) {
    const [, id, name] = token.split(':');
    return { id, username: name, global_name: name, avatar: null };
  }
  const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new HttpError(401, 'Ugyldig Discord-innlogging');
  if (!res.ok) throw new HttpError(502, `Discord svarte med ${res.status}`);
  return res.json();
}
function avatarUrl(u) {
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`;
  try {
    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}
function upsertUser(u, extra = {}) {
  const t = now();
  const cur = db.users[u.id] || { id: u.id, role: 'user', banned: false, ban_reason: null, note: null, launches: 0, first_seen: t };
  db.users[u.id] = {
    ...cur,
    username: str(u.username, 64),
    display_name: str(u.global_name || u.username, 64),
    avatar: avatarUrl(u),
    last_seen: t,
    ...extra,
  };
  save();
  return db.users[u.id];
}

// ---------- Offentlig konfigurasjon ----------
const LEVEL_ORDER = { critical: 0, warning: 1, info: 2 };
function publicConfig() {
  const t = now();
  const announcements = db.announcements
    .filter((a) => a.active && (!a.starts_at || a.starts_at <= t) && (!a.ends_at || a.ends_at > t))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.created_at - a.created_at)
    .slice(0, 5)
    .map(({ id, title, body, level, starts_at, ends_at }) => ({ id, title, body, level, starts_at, ends_at }));
  const servers = {};
  for (const [id, s] of Object.entries(db.servers)) servers[id] = { featured: !!s.featured, hidden: !!s.hidden, verified: !!s.verified };
  return { announcements, servers, at: t };
}

// ---------- Launcher-API ----------
async function launcherPing(req) {
  const b = await readBody(req);
  if (!UUID_RE.test(b.installId || '')) throw new HttpError(400, 'Ugyldig installId');
  const t = now();
  const cur = db.installs[b.installId] || { id: b.installId, user_id: null, launches: 0, first_seen: t };
  db.installs[b.installId] = { ...cur, version: str(b.version, 20), platform: str(b.platform, 20), launches: cur.launches + 1, last_seen: t };
  save();
  return publicConfig();
}

async function launcherHello(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Mangler Discord-token');
  const b = await readBody(req);
  const u = await discordUser(token);
  if (!SNOWFLAKE_RE.test(String(u.id))) throw new HttpError(400, 'Ugyldig Discord-bruker');
  const installId = UUID_RE.test(b.installId || '') ? b.installId : null;
  const prev = db.users[u.id];
  const row = upsertUser(u, { version: str(b.version, 20), install_id: installId, launches: (prev?.launches || 0) + 1 });
  if (installId && db.installs[installId]) db.installs[installId].user_id = u.id;
  return { banned: !!row.banned, banReason: row.ban_reason, role: OWNERS.has(u.id) ? 'owner' : row.role };
}

async function launcherError(req) {
  const b = await readBody(req);
  if (!UUID_RE.test(b.installId || '')) throw new HttpError(400, 'Ugyldig installId');
  const message = str(b.message, 500) || 'Ukjent feil';
  const version = str(b.version, 20);
  const hash = sha(`${version}|${message}`);
  const t = now();
  const e = db.errors[hash];
  if (e) {
    e.count++;
    e.last_seen = t;
    e.resolved = 0;
    if (e.last_install !== b.installId) e.installs++;
    e.last_install = b.installId;
  } else {
    db.seq.error++;
    db.errors[hash] = { id: db.seq.error, hash, version, message, stack: str(b.stack, 4000), count: 1, installs: 1, last_install: b.installId, first_seen: t, last_seen: t, resolved: 0 };
    // Behold de 500 nyeste
    const all = Object.values(db.errors);
    if (all.length > 500) all.sort((a, z) => a.last_seen - z.last_seen).slice(0, all.length - 500).forEach((x) => delete db.errors[x.hash]);
  }
  save();
  return { ok: true };
}

// ---------- Admin-API ----------
async function adminApi(req, url, admin) {
  const p = url.pathname.replace(/^\/api\/admin/, '');
  const m = req.method;
  if (m !== 'GET') {
    // CSRF-vern: må komme fra panelet selv
    const origin = req.headers.origin;
    if (req.headers['x-requested-with'] !== 'fnl-admin' || (origin && origin !== url.origin && origin !== PUBLIC_URL)) throw new HttpError(403, 'Ugyldig forespørsel');
  }

  if (p === '/me' && m === 'GET') return admin;

  if (p === '/overview' && m === 'GET') {
    const t = now();
    const users = Object.values(db.users);
    const installs = Object.values(db.installs);
    const cnt = (arr, f) => arr.filter(f).length;
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const end = t - i * DAY;
      const start = end - DAY;
      days.push({
        end,
        newUsers: cnt(users, (u) => u.first_seen > start && u.first_seen <= end),
        newInstalls: cnt(installs, (x) => x.first_seen > start && x.first_seen <= end),
      });
    }
    const vmap = {};
    for (const x of installs) if (x.last_seen > t - 30 * DAY) vmap[x.version || '?'] = (vmap[x.version || '?'] || 0) + 1;
    return {
      users: {
        active24h: cnt(users, (u) => u.last_seen > t - DAY),
        active7d: cnt(users, (u) => u.last_seen > t - 7 * DAY),
        active30d: cnt(users, (u) => u.last_seen > t - 30 * DAY),
        total: users.length,
        new7d: cnt(users, (u) => u.first_seen > t - 7 * DAY),
        banned: cnt(users, (u) => u.banned),
      },
      installs: { active7d: cnt(installs, (x) => x.last_seen > t - 7 * DAY), active30d: cnt(installs, (x) => x.last_seen > t - 30 * DAY), total: installs.length },
      openErrors: cnt(Object.values(db.errors), (e) => !e.resolved),
      activeAnnouncements: cnt(db.announcements, (a) => a.active),
      days,
      versions: Object.entries(vmap).map(([version, n]) => ({ version, n })).sort((a, b) => b.n - a.n).slice(0, 8),
      log: db.audit.slice(0, 8),
    };
  }

  // --- Brukere ---
  if (p === '/users' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase().slice(0, 64);
    const filter = url.searchParams.get('filter') || 'all';
    const t = now();
    return Object.values(db.users)
      .filter((u) => !q || [u.username, u.display_name, u.id].some((v) => String(v || '').toLowerCase().includes(q)))
      .filter((u) => (filter === 'banned' ? u.banned : filter === 'staff' ? ['admin', 'moderator'].includes(u.role) : filter === 'active' ? u.last_seen > t - 7 * DAY : true))
      .sort((a, b) => b.last_seen - a.last_seen)
      .slice(0, 200)
      .map((u) => ({ ...u, banned: !!u.banned, owner: OWNERS.has(u.id) }));
  }
  const userMatch = p.match(/^\/users\/(\d{15,21})$/);
  if (userMatch && m === 'POST') {
    const id = userMatch[1];
    const b = await readBody(req);
    const target = db.users[id];
    if (!target) throw new HttpError(404, 'Fant ikke brukeren');
    if (OWNERS.has(id)) throw new HttpError(403, 'Eiere kan ikke endres fra panelet');
    if (id === admin.id && ('banned' in b || 'role' in b)) throw new HttpError(403, 'Du kan ikke endre din egen rolle eller utestenge deg selv');
    if (target.role !== 'user' && admin.role === 'moderator') throw new HttpError(403, 'Moderatorer kan ikke endre andre i staben');
    if (target.role === 'admin' && admin.role !== 'owner' && ('role' in b || 'banned' in b)) throw new HttpError(403, 'Bare eiere kan endre eller utestenge administratorer');
    const changes = {};
    if ('role' in b) {
      if (!canManage(admin)) throw new HttpError(403, 'Bare administratorer kan endre roller');
      if (!['user', 'moderator', 'admin'].includes(b.role)) throw new HttpError(400, 'Ugyldig rolle');
      if (b.role === 'admin' && admin.role !== 'owner') throw new HttpError(403, 'Bare eiere kan gi admin-rolle');
      changes.role = b.role;
    }
    if ('banned' in b) {
      changes.banned = !!b.banned;
      changes.ban_reason = b.banned ? str(b.banReason, 300) : null;
    }
    if ('note' in b) changes.note = str(b.note, 1000) || null;
    if (!Object.keys(changes).length) throw new HttpError(400, 'Ingen endringer');
    // Beskriv det som faktisk endret seg (panelet sender alle feltene samtidig)
    const parts = [];
    if ('banned' in changes && changes.banned !== !!target.banned) parts.push(changes.banned ? 'Utestengte bruker' : 'Opphevet utestengelse');
    if ('role' in changes && changes.role !== target.role) parts.push(`Endret rolle til ${changes.role}`);
    if ('note' in changes && changes.note !== target.note) parts.push('Oppdaterte notat');
    if (changes.banned && changes.ban_reason !== target.ban_reason && !parts.length) parts.push('Endret årsak for utestengelse');
    Object.assign(target, changes);
    save();
    if (!parts.length) return target;
    const action = parts.join(' · ');
    audit(admin, action, `${target.display_name || target.username} (${id})`, changes);
    return target;
  }

  // --- Servere ---
  if (p === '/servers' && m === 'GET') {
    return Object.values(db.servers).sort((a, b) => b.featured - a.featured || b.verified - a.verified || String(a.name).localeCompare(String(b.name), 'no'));
  }
  const srvMatch = p.match(/^\/servers\/([a-z0-9]{4,10})$/i);
  if (srvMatch && (m === 'POST' || m === 'DELETE')) {
    if (!canManage(admin)) throw new HttpError(403, 'Bare administratorer kan endre servere');
    const id = srvMatch[1].toLowerCase();
    if (m === 'DELETE') {
      const name = db.servers[id]?.name || id;
      delete db.servers[id];
      audit(admin, 'Fjernet serverinnstilling', `${name} (${id})`);
      return { ok: true };
    }
    const b = await readBody(req);
    db.servers[id] = {
      server_id: id,
      name: str(b.name, 120) || id,
      featured: bool(b.featured),
      hidden: bool(b.hidden),
      verified: bool(b.verified),
      note: str(b.note, 500),
      updated_at: now(),
      updated_by: admin.name,
    };
    audit(admin, 'Oppdaterte server', `${db.servers[id].name} (${id})`, { featured: !!b.featured, hidden: !!b.hidden, verified: !!b.verified });
    return db.servers[id];
  }

  // --- Kunngjøringer ---
  if (p === '/announcements' && m === 'GET') {
    return [...db.announcements].sort((a, b) => b.active - a.active || b.created_at - a.created_at);
  }
  if (p === '/announcements' && m === 'POST') {
    const b = await readBody(req);
    if (!str(b.title, 120)?.trim()) throw new HttpError(400, 'Tittel mangler');
    db.seq.announcement++;
    const a = {
      id: db.seq.announcement,
      title: str(b.title, 120),
      body: str(b.body, 1000),
      level: ['info', 'warning', 'critical'].includes(b.level) ? b.level : 'info',
      active: bool(b.active ?? true),
      starts_at: Number(b.startsAt) || null,
      ends_at: Number(b.endsAt) || null,
      created_at: now(),
      created_by: admin.name,
    };
    db.announcements.push(a);
    if (db.announcements.length > 300) db.announcements.splice(0, db.announcements.length - 300);
    audit(admin, 'Opprettet kunngjøring', a.title);
    return { id: a.id };
  }
  const annMatch = p.match(/^\/announcements\/(\d+)$/);
  if (annMatch && (m === 'POST' || m === 'DELETE')) {
    const id = Number(annMatch[1]);
    const a = db.announcements.find((x) => x.id === id);
    if (!a) throw new HttpError(404, 'Fant ikke kunngjøringen');
    if (m === 'DELETE') {
      db.announcements = db.announcements.filter((x) => x.id !== id);
      audit(admin, 'Slettet kunngjøring', a.title);
      return { ok: true };
    }
    const b = await readBody(req);
    if ('title' in b) a.title = str(b.title, 120) || a.title;
    if ('body' in b) a.body = str(b.body, 1000);
    if (['info', 'warning', 'critical'].includes(b.level)) a.level = b.level;
    if ('active' in b) a.active = bool(b.active);
    if ('startsAt' in b) a.starts_at = Number(b.startsAt) || null;
    if ('endsAt' in b) a.ends_at = Number(b.endsAt) || null;
    audit(admin, b.active === false ? 'Deaktiverte kunngjøring' : 'Oppdaterte kunngjøring', a.title);
    return { ok: true };
  }

  // --- Feilrapporter ---
  if (p === '/errors' && m === 'GET') {
    const all = url.searchParams.get('show') === 'all';
    return Object.values(db.errors).filter((e) => all || !e.resolved).sort((a, b) => b.last_seen - a.last_seen).slice(0, 200);
  }
  const errMatch = p.match(/^\/errors\/(\d+)$/);
  if (errMatch && m === 'POST') {
    const b = await readBody(req);
    const e = Object.values(db.errors).find((x) => x.id === Number(errMatch[1]));
    if (!e) throw new HttpError(404, 'Fant ikke feilen');
    e.resolved = bool(b.resolved);
    audit(admin, b.resolved ? 'Markerte feil som løst' : 'Gjenåpnet feil', `#${e.id}`);
    return { ok: true };
  }

  // --- Logg ---
  if (p === '/audit' && m === 'GET') return db.audit.slice(0, 300);

  throw new HttpError(404, 'Ukjent adresse');
}

// ---------- Discord-innlogging for adminpanelet ----------
function authLogin(res) {
  const state = crypto.randomUUID();
  const q = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID || '',
    response_type: 'code',
    redirect_uri: `${PUBLIC_URL}/auth/callback`,
    scope: 'identify',
    state,
    prompt: 'none',
  });
  redirect(res, `https://discord.com/oauth2/authorize?${q}`, [cookieStr('fnl_state', state, 600, '/auth')]);
}

async function authCallback(req, res, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== cookie(req, 'fnl_state')) return send(res, 400, loginPage('Innloggingen ble avbrutt eller utløp. Prøv igjen.'));
  if (!env.DISCORD_CLIENT_SECRET) return send(res, 500, loginPage('DISCORD_CLIENT_SECRET mangler i server/.env.'));
  const tok = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${PUBLIC_URL}/auth/callback`,
    }),
  });
  if (!tok.ok) return send(res, 400, loginPage(`Discord godtok ikke innloggingen. Sjekk at ${PUBLIC_URL}/auth/callback er lagt inn under OAuth2 → Redirects.`));
  const { access_token } = await tok.json();
  finishLogin(res, await discordUser(access_token));
}

function finishLogin(res, u) {
  const isOwner = OWNERS.has(u.id);
  const existing = db.users[u.id];
  // Personer uten tilgang lagres ikke
  if (!isOwner && (!existing || existing.banned || !['admin', 'moderator'].includes(existing.role))) {
    return send(res, 403, loginPage(`Kontoen ${u.global_name || u.username} har ikke tilgang til adminpanelet.`));
  }
  const row = upsertUser(u);
  const session = makeSession({ id: u.id, name: row.display_name, avatar: row.avatar });
  redirect(res, '/admin', [cookieStr('fnl_admin', session, SESSION_TTL / 1000)]);
}

const escHtml = (s) => String(s).replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
function loginPage(message = '') {
  return `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin – FiveM Norge</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07090E;color:#EEF1F7;font-family:system-ui,sans-serif;padding:16px}
.c{width:min(420px,100%);background:#0F131D;border:1px solid #1E2535;border-radius:20px;padding:32px;display:flex;flex-direction:column;gap:16px}
h1{margin:0;font-size:24px;letter-spacing:-.02em}p{margin:0;color:#A7B0C5;line-height:1.5}
a{display:inline-flex;justify-content:center;align-items:center;height:48px;border-radius:12px;background:#5865F2;color:#fff;font-weight:600;text-decoration:none}
.e{background:rgba(255,107,122,.12);border:1px solid rgba(255,107,122,.4);color:#FF8F9B;padding:10px 12px;border-radius:10px}
</style></head><body><main class="c"><h1>FiveM Norge – admin</h1><p>Logg inn med Discord-kontoen som har admin- eller moderatorrolle.</p>
${message ? `<p class="e" role="alert">${escHtml(message)}</p>` : ''}<a href="/auth/login">Logg inn med Discord</a></main></body></html>`;
}

const ADMIN_CSP =
  "default-src 'self'; img-src 'self' https://cdn.discordapp.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'";
let adminHtmlCache = null;
const adminHtml = () => (DEV || !adminHtmlCache ? (adminHtmlCache = fs.readFileSync(path.join(ROOT, 'src', 'admin.html'), 'utf8')) : adminHtmlCache);

// ---------- Ruting ----------
async function handle(req, res) {
  const url = new URL(req.url, PUBLIC_URL);
  const p = url.pathname;
  const isLauncher = p.startsWith('/api/launcher') || p.startsWith('/api/public');
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (p === '/api/public/config' && req.method === 'GET') return send(res, 200, publicConfig(), { ...CORS, 'cache-control': 'public, max-age=60' });
    if (p === '/api/launcher/ping' && req.method === 'POST') return rateLimit(req), send(res, 200, await launcherPing(req), CORS);
    if (p === '/api/launcher/hello' && req.method === 'POST') return rateLimit(req), send(res, 200, await launcherHello(req), CORS);
    if (p === '/api/launcher/error' && req.method === 'POST') return rateLimit(req), send(res, 200, await launcherError(req), CORS);

    if (p === '/auth/login') return authLogin(res);
    if (p === '/auth/callback') return await authCallback(req, res, url);
    if (p === '/auth/logout') return redirect(res, '/admin', [cookieStr('fnl_admin', '', 0)]);
    if (p === '/auth/dev' && DEV) {
      // Kun lokalt med DEV_MODE=1: logg inn som en Discord-ID uten Discord
      const id = url.searchParams.get('id');
      if (!SNOWFLAKE_RE.test(id || '')) return send(res, 400, loginPage('Ugyldig id'));
      return finishLogin(res, { id, username: url.searchParams.get('name') || 'dev', avatar: null });
    }

    if (p.startsWith('/api/admin/')) {
      const admin = currentAdmin(req);
      if (!admin) return send(res, 401, { error: 'Ikke innlogget' });
      return send(res, 200, await adminApi(req, url, admin));
    }
    if (p === '/admin' || p === '/admin/') {
      if (!currentAdmin(req)) return send(res, 200, loginPage());
      return send(res, 200, adminHtml(), { 'content-security-policy': ADMIN_CSP, 'x-frame-options': 'DENY' });
    }
    if (p === '/health') return send(res, 200, { ok: true, users: Object.keys(db.users).length });
    if (p === '/') return redirect(res, '/admin');
    return send(res, 404, { error: 'Ikke funnet' });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message }, isLauncher ? CORS : {});
    console.error(e);
    return send(res, 500, { error: 'Serverfeil' });
  }
}

// ---------- Oppstart ----------
loadDb();
if (DEV && !env.ADMIN_DISCORD_IDS) console.warn('[advarsel] ADMIN_DISCORD_IDS er tom – ingen kan logge inn i adminpanelet.');
if (!env.DISCORD_CLIENT_SECRET && !DEV) console.warn('[advarsel] DISCORD_CLIENT_SECRET mangler – innlogging i adminpanelet virker ikke før den er satt i .env.');
http.createServer(handle).listen(PORT, HOST, () => {
  console.log(`FiveM Norge-backend kjører på ${PUBLIC_URL}  (lytter på ${HOST}:${PORT})`);
  console.log(`Adminpanel: ${PUBLIC_URL}/admin   Database: ${DB_FILE}${DEV ? '   [DEV_MODE]' : ''}`);
});
