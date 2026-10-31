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
const LAUNCHER_TTL = 30 * DAY;
const SERVER_ID_RE = /^[a-z0-9]{4,10}$/i;
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const osloHour = (t) => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Oslo' }).format(t));
const now = () => Date.now();
const UUID_RE = /^[0-9a-f-]{16,64}$/i;
const SNOWFLAKE_RE = /^\d{15,21}$/;
const LEVEL_ORDER = { critical: 0, warning: 1, info: 2 };
const COLLECTIONS = ['users', 'installs', 'servers', 'errors', 'reviews', 'claims', 'stats']; // lagres én nøkkel per element
const SINGLES = ['announcements', 'audit', 'seq', 'meta', 'live']; // lagres som én nøkkel hver

// ---------- Inngang: statiske filer eller videre til databasen ----------
export default {
  async fetch(request, env) {
    const p = new URL(request.url).pathname;
    if (p.startsWith('/api/') || p.startsWith('/auth/') || p.startsWith('/server/') || p === '/admin' || p === '/admin/' || p === '/health') {
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
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
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

// Felles ramme for sider som lages av serveren (serversider)
function pageShell(title, body, description = 'Norske FiveM-servere, ett klikk unna.') {
  return `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title><meta name="description" content="${escHtml(description)}"><meta property="og:title" content="${escHtml(title)}"><meta property="og:description" content="${escHtml(description)}"><meta property="og:image" content="https://fivemnorge.xyz/logo-512.png">
<meta name="theme-color" content="#07090E"><meta name="color-scheme" content="dark"><link rel="icon" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#07090E;--card:#0F131D;--line:#1A2030;--text:#EEF1F7;--muted:#A7B0C5;--red:#D92B43;--pink:#FF8F9B}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:'Geist',system-ui,sans-serif;line-height:1.5}
a{color:var(--muted)}a:hover{color:#fff}
header{border-bottom:1px solid #141926}.wrap{max-width:1000px;margin:0 auto;padding:0 16px}
header .wrap{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);font-weight:700;text-decoration:none}
.brand img{width:30px;height:30px}
main.wrap{padding-top:40px;padding-bottom:80px}
.head{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.ic{width:88px;height:88px;border-radius:22px;object-fit:cover;background:#151A27}.ph{display:grid;place-items:center;font-size:36px;font-weight:800;color:var(--muted)}
h1{margin:0;font-size:clamp(28px,4vw,40px);letter-spacing:-.035em;line-height:1.1}
h2{margin:40px 0 12px;font-size:22px;letter-spacing:-.02em}
.ver{display:inline-block;vertical-align:middle;font-size:13px;font-weight:600;color:#3DDC97;border:1px solid rgba(61,220,151,.4);background:rgba(61,220,151,.1);border-radius:999px;padding:2px 10px;letter-spacing:0}
.meta{color:var(--muted);margin-top:6px}code{font-family:ui-monospace,monospace;font-size:.9em}
.st{color:#FFC24B;letter-spacing:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:28px}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px;display:flex;flex-direction:column;gap:12px}
.lbl{font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#7F8AA3}
.big{font-size:40px;font-weight:800;letter-spacing:-.03em}.big span{font-size:20px;color:var(--muted);font-weight:600}
.bar{height:8px;border-radius:8px;background:#1A2030;overflow:hidden}.bar i{display:block;height:100%;background:#3DDC97}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:12px;border:1px solid #2A3348;color:var(--text);font-weight:600;text-decoration:none}
.btn.primary{background:var(--red);border-color:transparent;color:#fff}.btn:hover{border-color:#4A5674}
.links{display:flex;gap:8px;flex-wrap:wrap}.tags{display:flex;gap:6px;flex-wrap:wrap}.tags span{font-size:12px;color:var(--muted);border:1px solid #2A3348;border-radius:999px;padding:2px 10px}
.muted{color:var(--muted)}.small{font-size:13px}
.rev{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#0B0E16}
.rev li{padding:16px 20px;border-bottom:1px solid #131826}.rev li:last-child{border-bottom:0}.rev p{margin:6px 0 0;color:#D4DAE6}
.rh{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.rh time{margin-left:auto;color:#7F8AA3;font-size:13px}
.empty{text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;padding:60px 0}
footer{border-top:1px solid #141926;padding:24px 0;color:#8D97AD;font-size:14px}
</style></head><body>
<header><div class="wrap"><a class="brand" href="/"><img src="/logo-64.png" alt="">FiveM Norge</a><a href="/#servere">Alle servere</a></div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap">Uoffisiell launcher. Ikke tilknyttet Cfx.re, Rockstar Games eller Take-Two Interactive.</div></footer>
</body></html>`;
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
    const db = { version: 1, users: {}, installs: {}, servers: {}, errors: {}, reviews: {}, claims: {}, stats: {}, announcements: [], audit: [], seq: { announcement: 0, error: 0, claim: 0 }, meta: {}, live: { at: 0, servers: [] } };
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
    db.seq.claim = db.seq.claim || 0;
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
  async sign(obj) {
    const payload = b64urlText(JSON.stringify(obj));
    const sig = b64url(await crypto.subtle.sign('HMAC', await this.hmacKey(), enc.encode(payload)));
    return `${payload}.${sig}`;
  }
  async verify(raw) {
    if (!raw) return null;
    const [payload, sig] = String(raw).split('.');
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
  makeSession(user) {
    return this.sign({ ...user, exp: now() + SESSION_TTL });
  }
  async readSession(req) {
    const s = await this.verify(cookie(req, 'fnl_admin'));
    return s && s.k !== 'l' ? s : null;
  }
  // Egen nøkkel for launcheren (i stedet for Discord-tokenet), gyldig i 30 dager
  makeLauncherToken(uid) {
    return this.sign({ k: 'l', uid, exp: now() + LAUNCHER_TTL });
  }
  async launcherUser(req, required = true) {
    const raw = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const t = raw ? await this.verify(raw) : null;
    const u = t && t.k === 'l' ? this.db.users[t.uid] : null;
    if (!u) {
      if (required) throw new HttpError(401, 'Logg inn med Discord på nytt');
      return null;
    }
    if (u.banned) throw new HttpError(403, 'Kontoen er utestengt');
    return u;
  }
  // Rollen hentes alltid fra databasen, så endringer slår inn med en gang
  async currentAdmin(req) {
    let s = await this.readSession(req);
    if (!s && req.headers.get('authorization')) {
      const t = await this.verify(String(req.headers.get('authorization')).replace(/^Bearer\s+/i, ''));
      const u = t && t.k === 'l' ? this.db.users[t.uid] : null;
      if (u) s = { id: u.id, name: u.display_name || u.username, avatar: u.avatar, viaLauncher: true };
    }
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
      this.notify(`🐞 Ny feil i launcher ${version || '?'}: \`${message.slice(0, 300)}\``);
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


  // ---------- Discord-varsler (webhook) ----------
  notify(text) {
    const url = this.env.DISCORD_WEBHOOK_URL;
    if (!url || !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) return;
    const p = fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'FiveM Norge', content: String(text).slice(0, 1900), allowed_mentions: { parse: [] } }),
    }).catch(() => {});
    this.ctx.waitUntil?.(p);
  }

  // ---------- Launcher: innlogging og konto ----------
  accountInfo(u) {
    return {
      token: undefined,
      banned: !!u.banned,
      banReason: u.ban_reason,
      role: this.owners.has(u.id) ? 'owner' : u.role,
      user: { id: u.id, name: u.display_name || u.username, username: u.username, avatar: u.avatar },
      shareStatus: !!u.share_status,
    };
  }
  async launcherLogin(req) {
    const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Mangler Discord-token');
    const b = await readBody(req);
    const du = await this.discordUser(token);
    if (!SNOWFLAKE_RE.test(String(du.id))) throw new HttpError(400, 'Ugyldig Discord-bruker');
    const installId = UUID_RE.test(b.installId || '') ? b.installId : null;
    const prev = this.db.users[du.id];
    const u = this.upsertUser(du, { version: str(b.version, 20), install_id: installId, launches: (prev?.launches || 0) + 1 });
    if (installId && this.db.installs[installId]) {
      this.db.installs[installId].user_id = du.id;
      this.mark('installs', installId);
    }
    const info = this.accountInfo(u);
    if (!u.banned) info.token = await this.makeLauncherToken(u.id);
    return info;
  }
  async launcherMe(req) {
    const raw = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const t = raw ? await this.verify(raw) : null;
    const u = t && t.k === 'l' ? this.db.users[t.uid] : null;
    if (!u) throw new HttpError(401, 'Logg inn med Discord på nytt');
    const b = await readBody(req);
    if (!u.banned) {
      u.last_seen = now();
      u.version = str(b.version, 20) || u.version;
      u.launches = (u.launches || 0) + 1;
      this.mark('users', u.id);
    }
    const info = this.accountInfo(u);
    // Forny nøkkelen når den er over 7 dager gammel
    if (!u.banned && t.exp - now() < LAUNCHER_TTL - 7 * DAY) info.token = await this.makeLauncherToken(u.id);
    return info;
  }

  // ---------- Live-liste (sendes inn av innloggede launchere) ----------
  async launcherSnapshot(req) {
    const u = await this.launcherUser(req);
    const b = await readBody(req, 200_000);
    if (now() - (this.db.live.at || 0) < 4 * 60_000) return { ok: true, skipped: true };
    const list = Array.isArray(b.servers) ? b.servers : [];
    const servers = [];
    const seen = new Set();
    for (const x of list.slice(0, 300)) {
      const id = String(x?.id || '').toLowerCase();
      if (!SERVER_ID_RE.test(id) || seen.has(id)) continue;
      const max = Math.min(2048, Math.max(0, Number(x.max) || 0));
      const clients = Math.min(max || 2048, Math.max(0, Number(x.clients) || 0));
      seen.add(id);
      servers.push({
        id,
        name: str(String(x.name || id).replace(/\^[0-9]/g, '').replace(/\s+/g, ' ').trim(), 100) || id,
        clients,
        max,
        iconVersion: Number.isInteger(x.iconVersion) && x.iconVersion > 0 ? x.iconVersion : 0,
        tags: Array.isArray(x.tags) ? x.tags.slice(0, 6).map((t) => str(String(t), 24)).filter(Boolean) : [],
      });
    }
    if (servers.length < 3) throw new HttpError(400, 'For få servere');
    servers.sort((a, z) => z.clients - a.clients);
    this.db.live = { at: now(), by: u.id, total: servers.reduce((n, x) => n + x.clients, 0), servers: servers.slice(0, 150) };
    this.mark('live');
    return { ok: true };
  }
  liveServer(id) {
    return this.db.live.servers.find((x) => x.id === id) || null;
  }
  publicLive() {
    const hidden = (id) => this.db.servers[id]?.hidden;
    const servers = this.db.live.servers
      .filter((x) => !hidden(x.id))
      .slice(0, 50)
      .map((x) => ({ ...x, verified: !!this.db.servers[x.id]?.verified, featured: !!this.db.servers[x.id]?.featured, rating: this.rating(x.id) }));
    return { at: this.db.live.at, total: this.db.live.total || 0, count: this.db.live.servers.length, servers };
  }

  // ---------- Statistikk per server (tilkoblinger via launcheren) ----------
  async launcherConnect(req) {
    const b = await readBody(req);
    const id = String(b.serverId || '').toLowerCase();
    if (!SERVER_ID_RE.test(id)) throw new HttpError(400, 'Ugyldig server');
    const t = now();
    const st = this.db.stats[id] || { total: 0, days: {}, hours: Array(24).fill(0) };
    st.total++;
    const d = dayKey(t);
    st.days[d] = (st.days[d] || 0) + 1;
    st.hours[osloHour(t)]++;
    const keep = Object.keys(st.days).sort().slice(-60);
    st.days = Object.fromEntries(keep.map((k) => [k, st.days[k]]));
    this.db.stats[id] = st;
    this.mark('stats', id);
    return { ok: true };
  }
  statsSummary(id) {
    const st = this.db.stats[id];
    if (!st) return { total: 0, last7: 0, hours: Array(24).fill(0) };
    const since = dayKey(now() - 6 * DAY);
    const last7 = Object.entries(st.days).filter(([d]) => d >= since).reduce((n, [, v]) => n + v, 0);
    return { total: st.total, last7, hours: st.hours };
  }

  // ---------- Anmeldelser ----------
  rating(id) {
    const list = Object.values(this.db.reviews).filter((r) => r.server_id === id && !r.hidden);
    if (!list.length) return null;
    return { avg: Math.round((list.reduce((n, r) => n + r.stars, 0) / list.length) * 10) / 10, count: list.length };
  }
  publicReviews(id, limit = 30) {
    return Object.values(this.db.reviews)
      .filter((r) => r.server_id === id && !r.hidden)
      .sort((a, z) => z.updated_at - a.updated_at)
      .slice(0, limit)
      .map((r) => {
        const u = this.db.users[r.user_id];
        return { userId: r.user_id, name: u?.display_name || u?.username || 'Ukjent', avatar: u?.avatar || null, stars: r.stars, text: r.text, at: r.updated_at };
      });
  }
  async launcherReview(req) {
    const u = await this.launcherUser(req);
    const b = await readBody(req);
    const id = String(b.serverId || '').toLowerCase();
    if (!SERVER_ID_RE.test(id)) throw new HttpError(400, 'Ugyldig server');
    const key = `${id}~${u.id}`;
    if (req.method === 'DELETE' || b.remove) {
      delete this.db.reviews[key];
      this.unmark('reviews', key);
      return { ok: true };
    }
    const stars = Math.round(Number(b.stars));
    if (!(stars >= 1 && stars <= 5)) throw new HttpError(400, 'Velg 1–5 stjerner');
    const prev = this.db.reviews[key];
    if (prev && now() - prev.updated_at < 30_000) throw new HttpError(429, 'Vent litt før du endrer anmeldelsen igjen');
    this.db.reviews[key] = { key, server_id: id, user_id: u.id, stars, text: str(String(b.text || '').trim(), 600) || null, created_at: prev?.created_at || now(), updated_at: now(), hidden: prev?.hidden || 0 };
    this.mark('reviews', key);
    return { ok: true, rating: this.rating(id) };
  }

  // ---------- Venner (gjensidige) og «spiller nå» ----------
  async launcherPresence(req) {
    const u = await this.launcherUser(req);
    const b = await readBody(req);
    if ('share' in b) u.share_status = !!b.share;
    const id = String(b.serverId || '').toLowerCase();
    u.presence = SERVER_ID_RE.test(id) ? { server_id: id, name: str(b.serverName, 100) || this.liveServer(id)?.name || id, at: now() } : null;
    this.mark('users', u.id);
    return { ok: true };
  }
  findUser(q) {
    q = String(q || '').trim().replace(/^@/, '').toLowerCase();
    if (!q) return null;
    if (SNOWFLAKE_RE.test(q)) return this.db.users[q] || null;
    return Object.values(this.db.users).find((x) => String(x.username || '').toLowerCase() === q) || null;
  }
  async launcherFriends(req, url) {
    const u = await this.launcherUser(req);
    u.friends = Array.isArray(u.friends) ? u.friends : [];
    const m = req.method;
    const del = url.pathname.match(/^\/api\/launcher\/friends\/(\d{15,21})$/);
    if (m === 'DELETE' && del) {
      u.friends = u.friends.filter((f) => f !== del[1]);
      this.mark('users', u.id);
    } else if (m === 'POST') {
      const b = await readBody(req);
      const t = this.findUser(b.user);
      if (!t) throw new HttpError(404, 'Fant ingen som har logget inn i launcheren med det brukernavnet');
      if (t.id === u.id) throw new HttpError(400, 'Det er deg selv');
      if (u.friends.length >= 200) throw new HttpError(400, 'Du har nådd maks antall venner');
      if (!u.friends.includes(t.id)) u.friends.push(t.id);
      this.mark('users', u.id);
    }
    const fresh = (x) => x.share_status && x.presence && now() - x.presence.at < 10 * 60_000;
    const card = (x) => ({ id: x.id, name: x.display_name || x.username, username: x.username, avatar: x.avatar });
    const friends = [];
    const outgoing = [];
    for (const fid of u.friends) {
      const f = this.db.users[fid];
      if (!f) continue;
      if ((f.friends || []).includes(u.id)) friends.push({ ...card(f), playing: fresh(f) ? { serverId: f.presence.server_id, name: f.presence.name } : null });
      else outgoing.push(card(f));
    }
    const incoming = Object.values(this.db.users)
      .filter((x) => (x.friends || []).includes(u.id) && !u.friends.includes(x.id) && !x.banned)
      .slice(0, 50)
      .map(card);
    friends.sort((a, z) => !!z.playing - !!a.playing || String(a.name).localeCompare(String(z.name), 'no'));
    return { friends, incoming, outgoing, shareStatus: !!u.share_status };
  }

  // ---------- Servereiere: krav på egen server ----------
  async launcherClaim(req) {
    const u = await this.launcherUser(req);
    const b = await readBody(req);
    const id = String(b.serverId || '').toLowerCase();
    if (!SERVER_ID_RE.test(id)) throw new HttpError(400, 'Ugyldig server');
    const discord = str(String(b.discord || '').trim(), 120);
    const website = str(String(b.website || '').trim(), 200);
    if (discord && !/^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/i.test(discord)) throw new HttpError(400, 'Discord-lenken må se ut som https://discord.gg/kode');
    if (website && !/^https:\/\/[^\s<>"]+$/i.test(website)) throw new HttpError(400, 'Nettsiden må starte med https://');
    const description = str(String(b.description || '').trim(), 800);
    if (!description || description.length < 20) throw new HttpError(400, 'Skriv en beskrivelse på minst 20 tegn');
    const pending = Object.values(this.db.claims).filter((c) => c.user_id === u.id && c.status === 'pending');
    if (pending.length >= 3) throw new HttpError(429, 'Du har allerede tre krav som venter på svar');
    this.db.seq.claim++;
    this.mark('seq');
    const c = {
      id: this.db.seq.claim,
      server_id: id,
      server_name: str(b.serverName, 100) || this.liveServer(id)?.name || id,
      user_id: u.id,
      user_name: u.display_name || u.username,
      description,
      discord: discord || null,
      website: website || null,
      contact: str(String(b.contact || '').trim(), 200) || null,
      status: 'pending',
      created_at: now(),
    };
    this.db.claims[c.id] = c;
    this.mark('claims', c.id);
    this.notify(`📝 **${c.user_name}** sier de eier **${c.server_name}** (${id}). Godkjenn eller avvis i adminpanelet.`);
    return { ok: true, id: c.id };
  }
  async launcherMyClaims(req) {
    const u = await this.launcherUser(req);
    return Object.values(this.db.claims)
      .filter((c) => c.user_id === u.id)
      .sort((a, z) => z.created_at - a.created_at)
      .slice(0, 20)
      .map(({ id, server_id, server_name, status, created_at, reason }) => ({ id, server_id, server_name, status, created_at, reason }));
  }

  // ---------- Offentlig serverinfo ----------
  publicServer(id) {
    const s = this.db.servers[id];
    if (s?.hidden) return null;
    const live = this.liveServer(id);
    if (!live && !s) return { id, live: null, profile: null, verified: false, featured: false, rating: this.rating(id), reviews: this.publicReviews(id) };
    return {
      id,
      name: live?.name || s?.name || id,
      live: live ? { clients: live.clients, max: live.max, iconVersion: live.iconVersion, tags: live.tags, at: this.db.live.at } : null,
      verified: !!s?.verified,
      featured: !!s?.featured,
      profile: s?.profile ? { description: s.profile.description, discord: s.profile.discord, website: s.profile.website } : null,
      rating: this.rating(id),
      reviews: this.publicReviews(id),
    };
  }

  serverPage(id) {
    const d = this.publicServer(id);
    if (!d || (!d.live && !d.profile && !d.reviews.length)) return send(404, pageShell('Fant ikke serveren', `<section class="empty"><h1>Fant ikke serveren</h1><p>Den er ikke i listen over norske servere akkurat nå.</p><a class="btn" href="/#servere">Se alle servere</a></section>`));
    const icon = d.live?.iconVersion ? `https://frontend.cfx-services.net/api/servers/icon/${id}/${d.live.iconVersion}.png` : null;
    const pct = d.live?.max ? Math.round((d.live.clients / d.live.max) * 100) : 0;
    const stars = (n) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
    const reviews = d.reviews.length
      ? d.reviews.map((r) => `<li><div class="rh"><strong>${escHtml(r.name)}</strong><span class="st" aria-label="${r.stars} av 5 stjerner">${stars(r.stars)}</span><time>${new Date(r.at).toLocaleDateString('nb-NO')}</time></div>${r.text ? `<p>${escHtml(r.text)}</p>` : ''}</li>`).join('')
      : '<li class="muted">Ingen anmeldelser ennå. Gi den første fra launcheren.</li>';
    const body = `
<section class="srv">
  <div class="head">
    ${icon ? `<img class="ic" src="${icon}" alt="" width="88" height="88">` : `<div class="ic ph">${escHtml((d.name || id).charAt(0).toUpperCase())}</div>`}
    <div class="ttl">
      <h1>${escHtml(d.name)}${d.verified ? ' <span class="ver" title="Verifisert av FiveM Norge">✔ Verifisert</span>' : ''}</h1>
      <div class="meta">${d.rating ? `<span class="st">${stars(d.rating.avg)}</span> ${d.rating.avg.toString().replace('.', ',')} (${d.rating.count})` : 'Ingen anmeldelser ennå'} · <code>${id}</code></div>
    </div>
  </div>
  <div class="grid">
    <div class="card">
      <div class="lbl">Spillere nå</div>
      ${d.live ? `<div class="big">${d.live.clients} <span>/ ${d.live.max}</span></div><div class="bar"><i style="width:${Math.max(3, pct)}%"></i></div><div class="muted small">Oppdatert ${new Date(d.live.at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' })}</div>` : '<div class="muted">Ikke online akkurat nå</div>'}
      <a class="btn primary" href="fivem://connect/cfx.re/join/${id}">Koble til</a>
      <a class="btn" href="/#last-ned">Få launcheren – kø når det er fullt</a>
    </div>
    <div class="card">
      <div class="lbl">Om serveren</div>
      ${d.profile ? `<p>${escHtml(d.profile.description)}</p><div class="links">${d.profile.discord ? `<a class="btn" href="${escHtml(d.profile.discord)}" rel="noopener nofollow">Discord</a>` : ''}${d.profile.website ? `<a class="btn" href="${escHtml(d.profile.website)}" rel="noopener nofollow">Nettside</a>` : ''}</div>` : '<p class="muted">Eieren har ikke lagt inn noen beskrivelse ennå. Eier du serveren? Gjør krav på den fra serversiden i launcheren.</p>'}
      ${d.live?.tags?.length ? `<div class="tags">${d.live.tags.map((t) => `<span>${escHtml(t)}</span>`).join('')}</div>` : ''}
    </div>
  </div>
  <h2>Anmeldelser</h2>
  <ul class="rev">${reviews}</ul>
</section>`;
    return send(200, pageShell(`${d.name} – FiveM Norge`, body, `${d.name}: ${d.live ? `${d.live.clients}/${d.live.max} spillere nå. ` : ''}Norsk FiveM-server.`), { 'cache-control': 'public, max-age=60' });
  }

  // ---------- Admin: eksport/import ----------
  exportDb() {
    const { meta, ...rest } = this.db;
    return { exportedAt: now(), ...rest, meta: { ...meta, sessionSecret: undefined } };
  }
  importDb(data) {
    if (!data || typeof data !== 'object' || typeof data.users !== 'object') throw new HttpError(400, 'Filen ser ikke ut som en eksport fra adminpanelet');
    for (const c of COLLECTIONS) {
      for (const id of Object.keys(this.db[c])) this.unmark(c, id);
      this.db[c] = data[c] && typeof data[c] === 'object' ? data[c] : {};
      for (const id of Object.keys(this.db[c])) this.mark(c, id);
    }
    for (const k of ['announcements', 'audit']) {
      this.db[k] = Array.isArray(data[k]) ? data[k] : [];
      this.mark(k);
    }
    this.db.seq = { announcement: 0, error: 0, claim: 0, ...(data.seq || {}) };
    this.db.live = data.live && Array.isArray(data.live.servers) ? data.live : { at: 0, servers: [] };
    this.mark('seq');
    this.mark('live');
  }

  // ---------- Admin-API ----------
  async adminApi(req, url, admin) {
    const db = this.db;
    const p = url.pathname.replace(/^\/api\/admin/, '');
    const m = req.method;
    if (m !== 'GET' && !admin.viaLauncher) {
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
        pendingClaims: cnt(Object.values(db.claims), (c) => c.status === 'pending'),
        reviews: Object.keys(db.reviews).length,
        live: { at: db.live.at, servers: db.live.servers.length, players: db.live.total || 0 },
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
      if (parts.includes('Utestengte bruker')) this.notify(`🔨 **${admin.name}** utestengte **${target.display_name || target.username}**${changes.ban_reason ? ` – ${changes.ban_reason}` : ''}`);
      return target;
    }

    // --- Servere ---
    if (p === '/servers' && m === 'GET') {
      const list = Object.values(db.servers).map((x) => ({ ...x, stats: this.statsSummary(x.server_id), rating: this.rating(x.server_id) }));
      // Ta også med de mest brukte serverne som ikke har egne innstillinger ennå
      const top = Object.keys(db.stats)
        .filter((id) => !db.servers[id])
        .map((id) => ({ server_id: id, name: this.liveServer(id)?.name || id, featured: 0, hidden: 0, verified: 0, unmanaged: true, stats: this.statsSummary(id), rating: this.rating(id) }))
        .sort((a, z) => z.stats.last7 - a.stats.last7)
        .slice(0, 30);
      return [...list.sort((a, b) => b.featured - a.featured || b.verified - a.verified || String(a.name).localeCompare(String(b.name), 'no')), ...top];
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
        profile: db.servers[id]?.profile || null,
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
      if (a.active) this.notify(`📣 Ny kunngjøring i launcheren: **${a.title}**${a.body ? `\n${a.body}` : ''}`);
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


    // --- Anmeldelser ---
    if (p === '/reviews' && m === 'GET') {
      return Object.values(db.reviews)
        .sort((a, z) => z.updated_at - a.updated_at)
        .slice(0, 300)
        .map((r) => ({ ...r, user_name: db.users[r.user_id]?.display_name || db.users[r.user_id]?.username || r.user_id, server_name: this.liveServer(r.server_id)?.name || db.servers[r.server_id]?.name || r.server_id }));
    }
    const revMatch = p.match(/^\/reviews\/([a-z0-9]{4,10}~\d{15,21})$/i);
    if (revMatch && (m === 'POST' || m === 'DELETE')) {
      const r = db.reviews[revMatch[1]];
      if (!r) throw new HttpError(404, 'Fant ikke anmeldelsen');
      const who = db.users[r.user_id]?.display_name || r.user_id;
      if (m === 'DELETE') {
        delete db.reviews[r.key];
        this.unmark('reviews', r.key);
        this.audit(admin, 'Slettet anmeldelse', `${who} om ${r.server_id}`);
        return { ok: true };
      }
      const b = await readBody(req);
      r.hidden = bool(b.hidden);
      this.mark('reviews', r.key);
      this.audit(admin, r.hidden ? 'Skjulte anmeldelse' : 'Viste anmeldelse', `${who} om ${r.server_id}`);
      return r;
    }

    // --- Krav fra servereiere ---
    if (p === '/claims' && m === 'GET') {
      const all = url.searchParams.get('show') === 'all';
      return Object.values(db.claims).filter((c) => all || c.status === 'pending').sort((a, z) => z.created_at - a.created_at).slice(0, 200);
    }
    const claimMatch = p.match(/^\/claims\/(\d+)$/);
    if (claimMatch && m === 'POST') {
      if (!canManage) throw new HttpError(403, 'Bare administratorer kan godkjenne servere');
      const c = db.claims[claimMatch[1]];
      if (!c) throw new HttpError(404, 'Fant ikke kravet');
      const b = await readBody(req);
      if (b.approve) {
        const cur = db.servers[c.server_id] || { server_id: c.server_id, name: c.server_name, featured: 0, hidden: 0, verified: 0, note: null };
        db.servers[c.server_id] = {
          ...cur,
          verified: bool(b.verify ?? true),
          profile: { description: c.description, discord: c.discord, website: c.website, owner_id: c.user_id, owner_name: c.user_name },
          updated_at: now(),
          updated_by: admin.name,
        };
        this.mark('servers', c.server_id);
        c.status = 'approved';
      } else {
        c.status = 'rejected';
        c.reason = str(b.reason, 300) || null;
      }
      c.handled_by = admin.name;
      c.handled_at = now();
      this.mark('claims', c.id);
      this.audit(admin, c.status === 'approved' ? 'Godkjente servereier' : 'Avviste krav på server', `${c.user_name} → ${c.server_name} (${c.server_id})`);
      return c;
    }

    // --- Sikkerhetskopi (bare eiere) ---
    if (p === '/export' && m === 'GET') {
      if (admin.role !== 'owner') throw new HttpError(403, 'Bare eiere kan eksportere data');
      return this.exportDb();
    }
    if (p === '/import' && m === 'POST') {
      if (admin.role !== 'owner') throw new HttpError(403, 'Bare eiere kan importere data');
      const data = await readBody(req, 50_000_000);
      this.importDb(data);
      this.audit(admin, 'Importerte sikkerhetskopi', `${Object.keys(this.db.users).length} brukere`);
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
      if (p === '/api/launcher/login' && req.method === 'POST') return this.rateLimit(req), send(200, await this.launcherLogin(req), CORS);
      if (p === '/api/launcher/me' && req.method === 'POST') return this.rateLimit(req), send(200, await this.launcherMe(req), CORS);
      if (p === '/api/launcher/snapshot' && req.method === 'POST') return this.rateLimit(req), send(200, await this.launcherSnapshot(req), CORS);
      if (p === '/api/launcher/connect' && req.method === 'POST') return this.rateLimit(req), send(200, await this.launcherConnect(req), CORS);
      if (p === '/api/launcher/review' && (req.method === 'POST' || req.method === 'DELETE')) return this.rateLimit(req), send(200, await this.launcherReview(req), CORS);
      if (p === '/api/launcher/presence' && req.method === 'POST') return this.rateLimit(req), send(200, await this.launcherPresence(req), CORS);
      if (p === '/api/launcher/claim' && req.method === 'POST') return this.rateLimit(req), send(200, await this.launcherClaim(req), CORS);
      if (p === '/api/launcher/claims' && req.method === 'GET') return send(200, await this.launcherMyClaims(req), CORS);
      if (p.startsWith('/api/launcher/friends')) return this.rateLimit(req), send(200, await this.launcherFriends(req, url), CORS);
      if (p === '/api/public/live' && req.method === 'GET') return send(200, this.publicLive(), { ...CORS, 'cache-control': 'public, max-age=60' });
      const pubSrv = p.match(/^\/api\/public\/server\/([a-z0-9]{4,10})$/i);
      if (pubSrv && req.method === 'GET') {
        const d = this.publicServer(pubSrv[1].toLowerCase());
        return d ? send(200, d, { ...CORS, 'cache-control': 'public, max-age=30' }) : send(404, { error: 'Ikke funnet' }, CORS);
      }
      const pageSrv = p.match(/^\/server\/([a-z0-9]{4,10})\/?$/i);
      if (pageSrv && req.method === 'GET') return this.serverPage(pageSrv[1].toLowerCase());

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
