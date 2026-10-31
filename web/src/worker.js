// FiveM Norge – nettside, adminpanel og API på Cloudflare (fivemnorge.xyz)
//
// /                         nettsiden (public/)
// /admin                    adminpanelet (Discord-innlogging)
// /api/public/config        kunngjøringer + serverinnstillinger
// /api/launcher/ping|hello|error   brukes av launcheren
//
// All data ligger som JSON i én Durable Object («Store»), som holder den i minnet
// og lagrer endringer fortløpende. Én instans = ingen kollisjoner mellom skrivinger.

import ADMIN_HTML from './admin.html';

const DAY = 86400_000;
const SESSION_TTL = 7 * DAY;
const now = () => Date.now();
const UUID_RE = /^[0-9a-f-]{16,64}$/i;
const SNOWFLAKE_RE = /^\d{15,21}$/;
const LEVEL_ORDER = { critical: 0, warning: 1, info: 2 };
const COLLECTIONS = ['users', 'installs', 'servers', 'errors']; // lagres én nøkkel per element
const SINGLES = ['announcements', 'audit', 'seq', 'meta']; // lagres som én nøkkel hver

// ---------- Inngang: statiske filer eller videre til databasen ----------
export default {
  async fetch(request, env) {
    const p = new URL(request.url).pathname;
    if (p.startsWith('/api/') || p.startsWith('/auth/') || p === '/admin' || p === '/admin/' || p === '/health') {
      return env.STORE.get(env.STORE.idFromName('main')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

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
const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (t) => b64url(enc.encode(t));
const fromB64url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const sha = async (t) => b64url(await crypto.subtle.digest('SHA-256', enc.encode(t)));
const randomHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

function send(status, body, headers = {}) {
  const isJson = typeof body !== 'string';
  return new Response(isJson ? JSON.stringify(body) : body, {
    status,
    headers: {
      'content-type': isJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}
function redirect(location, cookies = []) {
  const h = new Headers({ location });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
}
async function readBody(req, max = 20_000) {
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, 'For stor forespørsel');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'Ugyldig JSON');
  }
}
function cookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
const cookieStr = (secure, name, value, maxAge, p = '/') =>
  `${name}=${encodeURIComponent(value)}; Path=${p}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=${maxAge}`;

function avatarUrl(u) {
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`;
  try {
    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

const escHtml = (s) => String(s).replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
function loginPage(message = '') {
  return `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin – FiveM Norge</title><meta name="robots" content="noindex"><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07090E;color:#EEF1F7;font-family:system-ui,sans-serif;padding:16px;box-sizing:border-box}
.c{width:min(420px,100%);background:#0F131D;border:1px solid #1E2535;border-radius:20px;padding:32px;display:flex;flex-direction:column;gap:16px;box-sizing:border-box}
h1{margin:0;font-size:24px;letter-spacing:-.02em}p{margin:0;color:#A7B0C5;line-height:1.5}
a.d{display:inline-flex;justify-content:center;align-items:center;height:48px;border-radius:12px;background:#5865F2;color:#fff;font-weight:600;text-decoration:none}
a.b{color:#A7B0C5;font-size:14px;text-align:center}
.e{background:rgba(255,107,122,.12);border:1px solid rgba(255,107,122,.4);color:#FF8F9B;padding:10px 12px;border-radius:10px}
</style></head><body><main class="c"><h1>FiveM Norge – admin</h1><p>Logg inn med Discord-kontoen som har admin- eller moderatorrolle.</p>
${message ? `<p class="e" role="alert">${escHtml(message)}</p>` : ''}<a class="d" href="/auth/login">Logg inn med Discord</a><a class="b" href="/">Tilbake til nettsiden</a></main></body></html>`;
}
const ADMIN_CSP =
  "default-src 'self'; img-src 'self' https://cdn.discordapp.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'";

// ---------- Databasen ----------
export class Store {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.dirty = new Set();
    this.removed = new Set();
    this.buckets = new Map();
    this.owners = new Set(String(env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
    this.dev = env.DEV_MODE === '1';
    ctx.blockConcurrencyWhile(() => this.load());
  }

  async load() {
    const db = { version: 1, users: {}, installs: {}, servers: {}, errors: {}, announcements: [], audit: [], seq: { announcement: 0, error: 0 }, meta: {} };
    const singles = await this.ctx.storage.get(SINGLES);
    for (const k of SINGLES) if (singles.get(k) !== undefined) db[k] = singles.get(k);
    for (const c of COLLECTIONS) {
      const rows = await this.ctx.storage.list({ prefix: `${c}:` });
      for (const [key, val] of rows) db[c][key.slice(c.length + 1)] = val;
    }
    if (!db.meta.sessionSecret) {
      db.meta.sessionSecret = randomHex(32);
      await this.ctx.storage.put('meta', db.meta);
    }
    this.db = db;
    this.secret = this.env.SESSION_SECRET || db.meta.sessionSecret;
  }

  // Merk det som er endret; skrives samlet etter hver forespørsel
  mark(coll, id) {
    const key = id === undefined ? coll : `${coll}:${id}`;
    this.removed.delete(key);
    this.dirty.add(key);
  }
  unmark(coll, id) {
    const key = `${coll}:${id}`;
    this.dirty.delete(key);
    this.removed.add(key);
  }
  async flush() {
    const s = this.ctx.storage;
    if (this.removed.size) {
      const keys = [...this.removed];
      this.removed.clear();
      for (let i = 0; i < keys.length; i += 128) await s.delete(keys.slice(i, i + 128));
    }
    if (!this.dirty.size) return;
    const entries = {};
    for (const key of this.dirty) {
      const i = key.indexOf(':');
      entries[key] = i === -1 ? this.db[key] : this.db[key.slice(0, i)][key.slice(i + 1)];
    }
    this.dirty.clear();
    const list = Object.entries(entries).filter(([, v]) => v !== undefined);
    for (let i = 0; i < list.length; i += 128) await s.put(Object.fromEntries(list.slice(i, i + 128)));
  }

  rateLimit(req) {
    const ip = req.headers.get('cf-connecting-ip') || '?';
    const t = now();
    if (this.buckets.size > 5000) for (const [k, b] of this.buckets) if (t > b.reset) this.buckets.delete(k);
    const b = this.buckets.get(ip) || { n: 0, reset: t + 60_000 };
    if (t > b.reset) {
      b.n = 0;
      b.reset = t + 60_000;
    }
    b.n++;
    this.buckets.set(ip, b);
    if (b.n > 60) throw new HttpError(429, 'For mange forespørsler');
  }

  // ---------- Innlogging (signert cookie) ----------
  async hmacKey() {
    if (!this._key) this._key = await crypto.subtle.importKey('raw', enc.encode(this.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    return this._key;
  }
  async makeSession(user) {
    const payload = b64urlText(JSON.stringify({ ...user, exp: now() + SESSION_TTL }));
    const sig = b64url(await crypto.subtle.sign('HMAC', await this.hmacKey(), enc.encode(payload)));
    return `${payload}.${sig}`;
  }
  async readSession(req) {
    const raw = cookie(req, 'fnl_admin');
    if (!raw) return null;
    const [payload, sig] = raw.split('.');
    if (!payload || !sig) return null;
    try {
      const ok = await crypto.subtle.verify('HMAC', await this.hmacKey(), fromB64url(sig), enc.encode(payload));
      if (!ok) return null;
      const s = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
      return s.exp > now() ? s : null;
    } catch {
      return null;
    }
  }
  // Rollen hentes alltid fra databasen, så endringer slår inn med en gang
  async currentAdmin(req) {
    const s = await this.readSession(req);
    if (!s) return null;
    if (this.owners.has(s.id)) return { ...s, role: 'owner' };
    const u = this.db.users[s.id];
    if (!u || u.banned || !['admin', 'moderator'].includes(u.role)) return null;
    return { ...s, role: u.role };
  }

  audit(admin, action, target, details) {
    const a = this.db.audit;
    a.unshift({ id: a.length ? a[0].id + 1 : 1, at: now(), admin_id: admin.id, admin_name: admin.name, action, target: target ?? null, details: details ? JSON.stringify(details).slice(0, 2000) : null });
    if (a.length > 1000) a.length = 1000;
    this.mark('audit');
  }

  async discordUser(token) {
    if (this.dev && token.startsWith('dev:')) {
      const [, id, name] = token.split(':');
      return { id, username: name, global_name: name, avatar: null };
    }
    const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new HttpError(401, 'Ugyldig Discord-innlogging');
    if (!res.ok) throw new HttpError(502, `Discord svarte med ${res.status}`);
    return res.json();
  }
  upsertUser(u, extra = {}) {
    const t = now();
    const cur = this.db.users[u.id] || { id: u.id, role: 'user', banned: false, ban_reason: null, note: null, launches: 0, first_seen: t };
    this.db.users[u.id] = { ...cur, username: str(u.username, 64), display_name: str(u.global_name || u.username, 64), avatar: avatarUrl(u), last_seen: t, ...extra };
    this.mark('users', u.id);
    return this.db.users[u.id];
  }

  publicConfig() {
    const t = now();
    const announcements = this.db.announcements
      .filter((a) => a.active && (!a.starts_at || a.starts_at <= t) && (!a.ends_at || a.ends_at > t))
      .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.created_at - a.created_at)
      .slice(0, 5)
      .map(({ id, title, body, level, starts_at, ends_at }) => ({ id, title, body, level, starts_at, ends_at }));
    const servers = {};
    for (const [id, s] of Object.entries(this.db.servers)) servers[id] = { featured: !!s.featured, hidden: !!s.hidden, verified: !!s.verified };
    return { announcements, servers, at: t };
  }

  // ---------- Launcher-API ----------
  async launcherPing(req) {
    const b = await readBody(req);
    if (!UUID_RE.test(b.installId || '')) throw new HttpError(400, 'Ugyldig installId');
    const t = now();
    const cur = this.db.installs[b.installId] || { id: b.installId, user_id: null, launches: 0, first_seen: t };
    this.db.installs[b.installId] = { ...cur, version: str(b.version, 20), platform: str(b.platform, 20), launches: cur.launches + 1, last_seen: t };
    this.mark('installs', b.installId);
    return this.publicConfig();
  }
  async launcherHello(req) {
    const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Mangler Discord-token');
    const b = await readBody(req);
    const u = await this.discordUser(token);
    if (!SNOWFLAKE_RE.test(String(u.id))) throw new HttpError(400, 'Ugyldig Discord-bruker');
    const installId = UUID_RE.test(b.installId || '') ? b.installId : null;
    const prev = this.db.users[u.id];
    const row = this.upsertUser(u, { version: str(b.version, 20), install_id: installId, launches: (prev?.launches || 0) + 1 });
    if (installId && this.db.installs[installId]) {
      this.db.installs[installId].user_id = u.id;
      this.mark('installs', installId);
    }
    return { banned: !!row.banned, banReason: row.ban_reason, role: this.owners.has(u.id) ? 'owner' : row.role };
  }
  async launcherError(req) {
    const b = await readBody(req);
    if (!UUID_RE.test(b.installId || '')) throw new HttpError(400, 'Ugyldig installId');
    const message = str(b.message, 500) || 'Ukjent feil';
    const version = str(b.version, 20);
    const hash = await sha(`${version}|${message}`);
    const t = now();
    const errors = this.db.errors;
    const e = errors[hash];
    if (e) {
      e.count++;
      e.last_seen = t;
      e.resolved = 0;
      if (e.last_install !== b.installId) e.installs++;
      e.last_install = b.installId;
    } else {
      this.db.seq.error++;
      this.mark('seq');
      errors[hash] = { id: this.db.seq.error, hash, version, message, stack: str(b.stack, 4000), count: 1, installs: 1, last_install: b.installId, first_seen: t, last_seen: t, resolved: 0 };
      const all = Object.values(errors);
      if (all.length > 500) {
        for (const x of all.sort((a, z) => a.last_seen - z.last_seen).slice(0, all.length - 500)) {
          delete errors[x.hash];
          this.unmark('errors', x.hash);
        }
      }
    }
    this.mark('errors', hash);
    return { ok: true };
  }

  // ---------- Admin-API ----------
  async adminApi(req, url, admin) {
    const db = this.db;
    const p = url.pathname.replace(/^\/api\/admin/, '');
    const m = req.method;
    if (m !== 'GET') {
      const origin = req.headers.get('origin');
      if (req.headers.get('x-requested-with') !== 'fnl-admin' || (origin && origin !== url.origin)) throw new HttpError(403, 'Ugyldig forespørsel');
    }
    const canManage = ['owner', 'admin'].includes(admin.role);

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
        .map((u) => ({ ...u, banned: !!u.banned, owner: this.owners.has(u.id) }));
    }
    const userMatch = p.match(/^\/users\/(\d{15,21})$/);
    if (userMatch && m === 'POST') {
      const id = userMatch[1];
      const b = await readBody(req);
      const target = db.users[id];
      if (!target) throw new HttpError(404, 'Fant ikke brukeren');
      if (this.owners.has(id)) throw new HttpError(403, 'Eiere kan ikke endres fra panelet');
      if (id === admin.id && ('banned' in b || 'role' in b)) throw new HttpError(403, 'Du kan ikke endre din egen rolle eller utestenge deg selv');
      if (target.role !== 'user' && admin.role === 'moderator') throw new HttpError(403, 'Moderatorer kan ikke endre andre i staben');
      if (target.role === 'admin' && admin.role !== 'owner' && ('role' in b || 'banned' in b)) throw new HttpError(403, 'Bare eiere kan endre eller utestenge administratorer');
      const changes = {};
      if ('role' in b) {
        if (!canManage) throw new HttpError(403, 'Bare administratorer kan endre roller');
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
      const parts = [];
      if ('banned' in changes && changes.banned !== !!target.banned) parts.push(changes.banned ? 'Utestengte bruker' : 'Opphevet utestengelse');
      if ('role' in changes && changes.role !== target.role) parts.push(`Endret rolle til ${changes.role}`);
      if ('note' in changes && changes.note !== target.note) parts.push('Oppdaterte notat');
      if (changes.banned && changes.ban_reason !== target.ban_reason && !parts.length) parts.push('Endret årsak for utestengelse');
      Object.assign(target, changes);
      this.mark('users', id);
      if (parts.length) this.audit(admin, parts.join(' · '), `${target.display_name || target.username} (${id})`, changes);
      return target;
    }

    // --- Servere ---
    if (p === '/servers' && m === 'GET') {
      return Object.values(db.servers).sort((a, b) => b.featured - a.featured || b.verified - a.verified || String(a.name).localeCompare(String(b.name), 'no'));
    }
    const srvMatch = p.match(/^\/servers\/([a-z0-9]{4,10})$/i);
    if (srvMatch && (m === 'POST' || m === 'DELETE')) {
      if (!canManage) throw new HttpError(403, 'Bare administratorer kan endre servere');
      const id = srvMatch[1].toLowerCase();
      if (m === 'DELETE') {
        const name = db.servers[id]?.name || id;
        delete db.servers[id];
        this.unmark('servers', id);
        this.audit(admin, 'Fjernet serverinnstilling', `${name} (${id})`);
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
      this.mark('servers', id);
      this.audit(admin, 'Oppdaterte server', `${db.servers[id].name} (${id})`, { featured: !!b.featured, hidden: !!b.hidden, verified: !!b.verified });
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
      this.mark('seq');
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
      this.mark('announcements');
      this.audit(admin, 'Opprettet kunngjøring', a.title);
      return { id: a.id };
    }
    const annMatch = p.match(/^\/announcements\/(\d+)$/);
    if (annMatch && (m === 'POST' || m === 'DELETE')) {
      const id = Number(annMatch[1]);
      const a = db.announcements.find((x) => x.id === id);
      if (!a) throw new HttpError(404, 'Fant ikke kunngjøringen');
      this.mark('announcements');
      if (m === 'DELETE') {
        db.announcements = db.announcements.filter((x) => x.id !== id);
        this.audit(admin, 'Slettet kunngjøring', a.title);
        return { ok: true };
      }
      const b = await readBody(req);
      if ('title' in b) a.title = str(b.title, 120) || a.title;
      if ('body' in b) a.body = str(b.body, 1000);
      if (['info', 'warning', 'critical'].includes(b.level)) a.level = b.level;
      if ('active' in b) a.active = bool(b.active);
      if ('startsAt' in b) a.starts_at = Number(b.startsAt) || null;
      if ('endsAt' in b) a.ends_at = Number(b.endsAt) || null;
      this.audit(admin, b.active === false ? 'Deaktiverte kunngjøring' : 'Oppdaterte kunngjøring', a.title);
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
      this.mark('errors', e.hash);
      this.audit(admin, b.resolved ? 'Markerte feil som løst' : 'Gjenåpnet feil', `#${e.id}`);
      return { ok: true };
    }

    if (p === '/audit' && m === 'GET') return db.audit.slice(0, 300);
    throw new HttpError(404, 'Ukjent adresse');
  }

  // ---------- Discord-innlogging for adminpanelet ----------
  redirectUri(url) {
    return `${(this.env.PUBLIC_URL || url.origin).replace(/\/+$/, '')}/auth/callback`;
  }
  authLogin(url, secure) {
    const state = crypto.randomUUID();
    const q = new URLSearchParams({
      client_id: this.env.DISCORD_CLIENT_ID || '',
      response_type: 'code',
      redirect_uri: this.redirectUri(url),
      scope: 'identify',
      state,
      prompt: 'none',
    });
    return redirect(`https://discord.com/oauth2/authorize?${q}`, [cookieStr(secure, 'fnl_state', state, 600, '/auth')]);
  }
  async authCallback(req, url, secure) {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state || state !== cookie(req, 'fnl_state')) return send(400, loginPage('Innloggingen ble avbrutt eller utløp. Prøv igjen.'));
    if (!this.env.DISCORD_CLIENT_SECRET) return send(500, loginPage('DISCORD_CLIENT_SECRET mangler. Legg den inn med «npx wrangler secret put DISCORD_CLIENT_SECRET».'));
    const tok = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.env.DISCORD_CLIENT_ID,
        client_secret: this.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(url),
      }),
    });
    if (!tok.ok) return send(400, loginPage(`Discord godtok ikke innloggingen. Sjekk at ${this.redirectUri(url)} er lagt inn under OAuth2 → Redirects.`));
    const { access_token } = await tok.json();
    return this.finishLogin(await this.discordUser(access_token), secure);
  }
  async finishLogin(u, secure) {
    const existing = this.db.users[u.id];
    // Personer uten tilgang lagres ikke
    if (!this.owners.has(u.id) && (!existing || existing.banned || !['admin', 'moderator'].includes(existing.role))) {
      return send(403, loginPage(`Kontoen ${u.global_name || u.username} har ikke tilgang til adminpanelet.`));
    }
    const row = this.upsertUser(u);
    const session = await this.makeSession({ id: u.id, name: row.display_name, avatar: row.avatar });
    return redirect('/admin', [cookieStr(secure, 'fnl_admin', session, SESSION_TTL / 1000)]);
  }

  // ---------- Ruting ----------
  async fetch(req) {
    try {
      return await this.route(req);
    } finally {
      await this.flush();
    }
  }
  async route(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    const secure = url.protocol === 'https:';
    const isPublic = p.startsWith('/api/launcher') || p.startsWith('/api/public');
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (p === '/api/public/config' && req.method === 'GET') return send(200, this.publicConfig(), { ...CORS, 'cache-control': 'public, max-age=60' });
      if (p === '/api/launcher/ping' && req.method === 'POST') return this.rateLimit(req), send(200, await this.launcherPing(req), CORS);
      if (p === '/api/launcher/hello' && req.method === 'POST') return this.rateLimit(req), send(200, await this.launcherHello(req), CORS);
      if (p === '/api/launcher/error' && req.method === 'POST') return this.rateLimit(req), send(200, await this.launcherError(req), CORS);

      if (p === '/auth/login') return this.authLogin(url, secure);
      if (p === '/auth/callback') return await this.authCallback(req, url, secure);
      if (p === '/auth/logout') return redirect('/admin', [cookieStr(secure, 'fnl_admin', '', 0)]);
      if (p === '/auth/dev' && this.dev) {
        const id = url.searchParams.get('id');
        if (!SNOWFLAKE_RE.test(id || '')) return send(400, loginPage('Ugyldig id'));
        return await this.finishLogin({ id, username: url.searchParams.get('name') || 'dev', avatar: null }, secure);
      }

      if (p.startsWith('/api/admin/')) {
        const admin = await this.currentAdmin(req);
        if (!admin) return send(401, { error: 'Ikke innlogget' });
        return send(200, await this.adminApi(req, url, admin));
      }
      if (p === '/admin' || p === '/admin/') {
        const head = { 'x-frame-options': 'DENY', 'x-robots-tag': 'noindex' };
        if (!(await this.currentAdmin(req))) return send(200, loginPage(), head);
        return send(200, ADMIN_HTML, { ...head, 'content-security-policy': ADMIN_CSP });
      }
      if (p === '/health') return send(200, { ok: true, users: Object.keys(this.db.users).length });
      return send(404, { error: 'Ikke funnet' });
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message }, isPublic ? CORS : {});
      console.error(e);
      return send(500, { error: 'Serverfeil' }, isPublic ? CORS : {});
    }
  }
}
