// Nylig spilt, spilletid, spillerhistorikk, varsler/auto-join og innstillinger.
const { jsonFile } = require('./jsonfile.cjs');

const ID_RE = /^[a-z0-9]{4,10}$/i;
const HISTORY_EVERY = 10 * 60_000; // ett punkt per 10. minutt
const HISTORY_KEEP = 8 * 24 * 3600_000; // 8 dager
const WATCH_TICK = 30_000;

// Alle innstillinger med standardverdi og lov-verdier
const SETTINGS_SCHEMA = {
  startPage: ['home', 'servers', 'saved', 'recent'],
  autostart: 'bool',
  tray: 'bool', // lukk-knappen skjuler til systemstatusfeltet
  onLaunch: ['none', 'minimize', 'tray'], // hva launcheren gjør når FiveM startes
  refreshMin: [1, 2, 5, 10],
  hideEmpty: 'bool',
  compact: 'bool',
  rpc: 'bool',
  notifications: 'bool',
  autoUpdateCheck: 'bool',
  autoInstallUpdates: 'bool',
  telemetry: 'bool',
  friendAlerts: 'bool',
  theme: ['dark', 'light', 'system'],
  accent: ['red', 'blue', 'green', 'purple', 'orange'],
};
const SETTINGS_DEFAULT = {
  startPage: 'home',
  autostart: false,
  tray: true,
  onLaunch: 'minimize',
  refreshMin: 2,
  hideEmpty: false,
  compact: false,
  rpc: true,
  notifications: true,
  autoUpdateCheck: true,
  autoInstallUpdates: false,
  telemetry: true, // anonym statistikk og feilrapporter til egen backend
  friendAlerts: true, // Windows-varsel når en venn begynner å spille (bare venner som deler det)
  theme: 'dark',
  accent: 'red',
};
const settingsFile = jsonFile('settings.json', SETTINGS_DEFAULT);
const activityFile = jsonFile('activity.json', { recent: [], playtime: {}, totalMs: 0, active: null, daily: {} });
const historyFile = jsonFile('history.json', { snaps: [] });
const watchFile = jsonFile('watch.json', { watch: {} });
const notesFile = jsonFile('notes.json', { notes: {} });

let deps = null; // { fivem, isFiveMRunning, connect, notify, presence, emit }

// ---------- Innstillinger ----------
const getSettings = () => ({ ...settingsFile.get() });
function setSettings(patch) {
  const s = settingsFile.get();
  for (const [k, rule] of Object.entries(SETTINGS_SCHEMA)) {
    if (!patch || !(k in patch)) continue;
    const v = patch[k];
    if (rule === 'bool' ? typeof v === 'boolean' : rule.includes(v)) s[k] = v;
  }
  settingsFile.save(true);
  return { ...s };
}

function clearHistory() {
  historyFile.get().snaps = [];
  historyFile.save(true);
}

// ---------- Nylig spilt + spilletid ----------
function addRecent(server) {
  const a = activityFile.get();
  a.recent = [{ id: server.id, name: server.name, at: Date.now() }, ...a.recent.filter((r) => r.id !== server.id)].slice(0, 20);
  activityFile.save();
}
const getRecent = () => activityFile.get().recent;
const getPlaytime = () => activityFile.get().playtime;

// ---------- Spilletid ----------
// Tiden legges til fortløpende (hvert 15. sekund) og lagres på disk, så ingenting går tapt om
// launcheren lukkes, krasjer eller PC-en slås av. Økter som ikke startes via launcheren telles også:
// da prøver vi å finne serveren i FiveM sin logg, ellers telles tiden bare i «totalt i FiveM».
const TICK = 15_000;
const MAX_DELTA = 60_000; // hopp over tid der PC-en har sovet e.l.
const END_AFTER_MISSES = 3; // FiveM må være borte i ~45 s før økta avsluttes
let pending = null; // { id, name, requested } – satt når du trykker Spill
let misses = 0;
let ticks = 0;

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function credit(a, id, ms) {
  a.totalMs = (a.totalMs || 0) + ms;
  if (id) a.playtime[id] = (a.playtime[id] || 0) + ms;
  // Per dag, til ukeoversikten (beholdes i 70 dager)
  a.daily = a.daily || {};
  const k = dayKey(Date.now());
  const d = (a.daily[k] = a.daily[k] || { t: 0, s: {} });
  d.t += ms;
  const sid = id || '_ukjent';
  d.s[sid] = (d.s[sid] || 0) + ms;
  const keys = Object.keys(a.daily).sort();
  while (keys.length > 70) delete a.daily[keys.shift()];
}

// Denne uka (man–søn) + forrige uke til sammenligning
function weekly() {
  const a = activityFile.get();
  const daily = a.daily || {};
  const now = new Date(Date.now());
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const days = [];
  const byServer = {};
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const e = daily[dayKey(d.getTime())];
    days.push({ date: dayKey(d.getTime()), ms: e?.t || 0, future: d > now });
    total += e?.t || 0;
    for (const [id, ms] of Object.entries(e?.s || {})) byServer[id] = (byServer[id] || 0) + ms;
  }
  let lastWeek = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i);
    lastWeek += daily[dayKey(d.getTime())]?.t || 0;
  }
  const names = Object.fromEntries(a.recent.map((r) => [r.id, r.name]));
  const top = Object.entries(byServer)
    .filter(([id]) => id !== '_ukjent')
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([id, ms]) => ({ id, name: names[id] || id, ms }));
  return { days, total, lastWeek, top };
}

async function identify(a) {
  if (!deps.detectServer) return;
  try {
    const found = await deps.detectServer(a.active.startedAt);
    if (!found || found.id === a.active.id) return;
    const name = found.name || deps.fivem.cachedServers().find((s) => s.id === found.id)?.name || found.id;
    a.active.id = found.id;
    a.active.name = name;
    addRecent({ id: found.id, name });
    deps.presence?.playing(withIcon(a.active));
    deps.emit('activity:changed');
  } catch {
    /* best effort */
  }
}

// Serverlogoen vises i Discord-statusen når den er kjent
const withIcon = (x) => ({ ...x, icon: (x.id && (deps.fivem.cachedServers() || []).find((s) => s.id === x.id)?.iconUrl) || null });

async function trackTick() {
  const running = await deps.isFiveMRunning();
  if (running === null) return; // klarte ikke å sjekke – ikke avslutt økta på det grunnlaget
  const a = activityFile.get();
  const now = Date.now();
  ticks++;

  if (running) {
    misses = 0;
    if (!a.active) {
      const viaLauncher = pending && now - pending.requested < 10 * 60_000 ? pending : null;
      a.active = { id: viaLauncher?.id || null, name: viaLauncher?.name || null, startedAt: now, lastSeen: now };
      pending = null;
      if (a.active.id) deps.presence?.playing(withIcon(a.active));
      else await identify(a);
    } else {
      credit(a, a.active.id, Math.min(now - a.active.lastSeen, MAX_DELTA));
      a.active.lastSeen = now;
      // Ukjent server: se i loggen igjen av og til (FiveM skriver tilkoblingen litt etter oppstart)
      if (!a.active.id && ticks % 4 === 0) await identify(a);
    }
    activityFile.save();
    if (ticks % 4 === 0) deps.emit('activity:changed');
  } else {
    if (pending && now - pending.requested > 10 * 60_000) pending = null;
    if (a.active && ++misses >= END_AFTER_MISSES) {
      a.active = null;
      misses = 0;
      activityFile.save(true);
      deps.presence?.browsing();
      deps.emit('activity:changed');
    }
  }
}

function startSession(server) {
  const a = activityFile.get();
  if (a.active) {
    // FiveM kjører allerede: bytter server, tiden fra nå av går til den nye
    a.active.id = server.id;
    a.active.name = server.name;
    activityFile.save();
    deps.presence?.playing(withIcon(a.active));
  } else {
    pending = { id: server.id, name: server.name, requested: Date.now() };
  }
}

const getActivity = () => {
  const a = activityFile.get();
  return { recent: a.recent, playtime: a.playtime, totalMs: a.totalMs || 0, active: a.active || null };
};

// ---------- Spillerhistorikk ----------
function recordHistory(servers) {
  const h = historyFile.get();
  const now = Date.now();
  const last = h.snaps[h.snaps.length - 1];
  if (last && now - last.t < HISTORY_EVERY) return;
  const c = {};
  for (const s of servers) c[s.id] = s.clients;
  h.snaps.push({ t: now, c });
  h.snaps = h.snaps.filter((s) => now - s.t < HISTORY_KEEP);
  historyFile.save();
}

function serverHistory(id, hours = 24) {
  const since = Date.now() - hours * 3600_000;
  return historyFile
    .get()
    .snaps.filter((s) => s.t >= since && s.c[id] !== undefined)
    .map((s) => ({ t: s.t, c: s.c[id] }));
}

// Snitt siste 24 t mot snitt dagene før. Krever minst 2 døgn med data.
function trending(limit = 5) {
  const snaps = historyFile.get().snaps;
  const now = Date.now();
  if (!snaps.length || now - snaps[0].t < 2 * 24 * 3600_000) {
    const hours = snaps.length ? Math.floor((now - snaps[0].t) / 3600_000) : 0;
    return { ready: false, hours };
  }
  const recent = {};
  const before = {};
  const add = (bucket, c) => {
    for (const [id, n] of Object.entries(c)) {
      bucket[id] = bucket[id] || { sum: 0, n: 0 };
      bucket[id].sum += n;
      bucket[id].n += 1;
    }
  };
  for (const s of snaps) add(now - s.t < 24 * 3600_000 ? recent : before, s.c);
  const avg = (b) => (b ? b.sum / b.n : 0);
  const list = Object.keys(recent)
    .map((id) => ({ id, now: Math.round(avg(recent[id])), before: Math.round(avg(before[id])) }))
    .filter((x) => x.now >= 3)
    .map((x) => ({ ...x, delta: x.now - x.before }))
    .filter((x) => x.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);
  return { ready: true, list };
}

// Typisk antall spillere per time på døgnet, ut fra historikken (8 dager)
function bestTimes(id, max = 0) {
  const snaps = historyFile.get().snaps.filter((s) => s.c[id] !== undefined);
  if (snaps.length < 2 || snaps[snaps.length - 1].t - snaps[0].t < 20 * 3600_000) {
    const hours = snaps.length ? Math.floor((snaps[snaps.length - 1].t - snaps[0].t) / 3600_000) : 0;
    return { ready: false, hours };
  }
  const sum = Array(24).fill(0);
  const n = Array(24).fill(0);
  for (const s of snaps) {
    const h = new Date(s.t).getHours();
    sum[h] += s.c[id];
    n[h] += 1;
  }
  const avg = sum.map((v, h) => (n[h] ? Math.round(v / n[h]) : null));
  const known = avg.map((v, h) => ({ h, v })).filter((x) => x.v !== null);
  // Beste 3-timersvindu = flest spillere i snitt
  let peak = null;
  for (let h = 0; h < 24; h++) {
    const w = [0, 1, 2].map((k) => avg[(h + k) % 24]);
    if (w.some((v) => v === null)) continue;
    const v = w.reduce((x, y) => x + y, 0) / 3;
    if (!peak || v > peak.v) peak = { from: h, to: (h + 3) % 24, v: Math.round(v) };
  }
  // Timer der serveren i snitt har god plass (under 90 % full)
  const freeHours = max ? known.filter((x) => x.v < max * 0.9).map((x) => x.h) : [];
  const days = Math.round((snaps[snaps.length - 1].t - snaps[0].t) / 86400_000) || 1;
  return { ready: true, avg, peak, freeHours, days };
}

// ---------- Notater og egne merker ----------
const getNotes = () => notesFile.get().notes;
function setNote(id, name, patch) {
  if (!ID_RE.test(id)) throw new Error('Ugyldig server-ID');
  const all = notesFile.get().notes;
  const cur = all[id] || { text: '', tags: [], name };
  if (typeof patch?.text === 'string') cur.text = patch.text.slice(0, 2000);
  if (Array.isArray(patch?.tags)) {
    cur.tags = [...new Set(patch.tags.map((t) => String(t).trim().slice(0, 24)).filter(Boolean))].slice(0, 8);
  }
  cur.name = name || cur.name;
  if (!cur.text && !cur.tags.length) delete all[id];
  else all[id] = cur;
  notesFile.save();
  return { ...all };
}

// ---------- Varsler og auto-join ----------
const getWatch = () => watchFile.get().watch;
function setWatch(id, name, patch) {
  if (!ID_RE.test(id)) throw new Error('Ugyldig server-ID');
  const w = watchFile.get().watch;
  const cur = w[id] || { name, free: false, online: false, autoJoin: false, threshold: null, wasFull: null, wasOnline: null, wasAbove: null };
  for (const k of ['free', 'online', 'autoJoin']) if (typeof patch?.[k] === 'boolean') cur[k] = patch[k];
  if (patch && 'threshold' in patch) {
    const t = Number(patch.threshold);
    cur.threshold = Number.isFinite(t) && t >= 1 && t <= 4096 ? Math.round(t) : null;
    cur.wasAbove = null;
  }
  cur.name = name || cur.name;
  if (!cur.free && !cur.online && !cur.autoJoin && !cur.threshold) delete w[id];
  else w[id] = cur;
  watchFile.save(true);
  deps?.emit('watch:changed');
  return { ...w };
}

async function statusOf(id) {
  const single = await deps.fivem.fetchSingle(id).catch(() => null);
  if (single) {
    const max = single.sv_maxclients ?? single.svMaxclients ?? Number(single.vars?.sv_maxClients) ?? 0;
    return { online: true, clients: single.clients || 0, max: max || 0 };
  }
  // Reserve: bruk serverlisten (oppdateres maks hvert minutt)
  const list = await deps.fivem.listServers(false).catch(() => deps.fivem.cachedServers());
  const s = list.find((x) => x.id === id);
  return s ? { online: true, clients: s.clients, max: s.max } : { online: false, clients: 0, max: 0 };
}

let ticking = false;
async function watchTick() {
  if (ticking) return;
  ticking = true;
  try {
    const w = watchFile.get().watch;
    const notifyOn = settingsFile.get().notifications;
    let joinedThisTick = false;
    for (const [id, cfg] of Object.entries(w)) {
      if (!w[id]) continue; // fjernet fra kø tidligere i denne runden
      const st = await statusOf(id);
      const full = st.max > 0 && st.clients >= st.max;
      const free = st.online && !full;

      if (cfg.online && cfg.wasOnline === false && st.online && notifyOn) {
        deps.notify(`${cfg.name} er online igjen`, `${st.clients}/${st.max} spillere`, id);
      }
      const joining = cfg.autoJoin && free && !joinedThisTick;
      if (cfg.free && cfg.wasFull === true && free && notifyOn && !joining) {
        deps.notify(`Ledig plass på ${cfg.name}`, `${st.clients}/${st.max} spillere – trykk for å åpne`, id);
      }
      // Terskel: varsle når spillertallet går over valgt antall
      if (cfg.threshold && st.online) {
        const above = st.clients >= cfg.threshold;
        if (above && cfg.wasAbove === false && notifyOn) {
          deps.notify(`${cfg.name} har nå ${st.clients} spillere`, `Over grensen din på ${cfg.threshold}`, id);
        }
        cfg.wasAbove = above;
      }
      if (joining) {
        // Kø-gruppe: første server med plass vinner, de andre fjernes fra køen
        const others = Object.entries(w).filter(([oid, o]) => oid !== id && o.autoJoin);
        for (const [oid, o] of others) {
          o.autoJoin = false;
          if (!o.free && !o.online && !o.threshold) delete w[oid];
        }
        cfg.autoJoin = false;
        if (!cfg.free && !cfg.online && !cfg.threshold) delete w[id];
        deps.notify(
          `Kobler til ${cfg.name}`,
          others.length ? `Det ble ledig plass – fjernet fra kø på ${others.length} andre` : 'Det ble ledig plass – starter FiveM',
          id
        );
        await deps.connect({ id, name: cfg.name });
        if (w[id]) {
          w[id].wasOnline = st.online;
          w[id].wasFull = full;
        }
        joinedThisTick = true; // bare én tilkobling per runde
        continue;
      }
      if (w[id]) {
        w[id].wasOnline = st.online;
        w[id].wasFull = st.online ? full : w[id].wasFull;
      }
    }
    watchFile.save();
    deps.emit('watch:changed');
  } catch (e) {
    console.warn('[watch]', e.message);
  } finally {
    ticking = false;
  }
}

function init(d) {
  deps = d;
  d.fivem.onList(recordHistory);
  setInterval(trackTick, TICK);
  setTimeout(trackTick, 2_000);
  setInterval(watchTick, WATCH_TICK);
  setTimeout(watchTick, 5_000);
}

module.exports = {
  init,
  getSettings,
  setSettings,
  addRecent,
  getRecent,
  getPlaytime,
  getActivity,
  weekly,
  bestTimes,
  getNotes,
  setNote,
  _trackTick: trackTick, // brukes i tester
  startSession,
  serverHistory,
  clearHistory,
  trending,
  getWatch,
  setWatch,
  _watchTick: watchTick, // brukes i tester
  _recordHistory: recordHistory,
};
