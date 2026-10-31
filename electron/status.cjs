// FiveM/Cfx.re-status: offisiell status fra Rockstar sin statusside + egne målinger av tjenestene launcheren bruker.
const UA = { 'User-Agent': 'FiveMNorgeLauncher' };

// Tjenester launcheren selv er avhengig av
const CHECKS = [
  { id: 'list', name: 'Serverliste', desc: 'Listen over alle servere', url: 'https://frontend.cfx-services.net/api/servers/stream/', alt: 'https://servers-frontend.fivem.net/api/servers/streamRedir/' },
  { id: 'single', name: 'Serverdetaljer', desc: 'Info om enkeltservere', url: 'https://frontend.cfx-services.net/api/servers/single/m44rddq', alt: 'https://servers-frontend.fivem.net/api/servers/single/m44rddq', okStatus: [200, 404] },
  { id: 'web', name: 'FiveM.net', desc: 'Nettside og nedlasting', url: 'https://fivem.net' },
  { id: 'forum', name: 'Cfx.re-forum', desc: 'forum.cfx.re', url: 'https://forum.cfx.re' },
  { id: 'rockstar', name: 'Rockstar-tjenester', desc: 'Statussiden til Rockstar Support', url: 'https://support.rockstargames.com/servicestatus' },
  { id: 'discord', name: 'Discord', desc: 'Innlogging og status', url: 'https://discord.com/api/v10/gateway' },
];

async function probe(url, okStatus) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const t0 = Date.now();
  try {
    // GET med Range-header holder nedlastingen liten (serverlisten er flere MB)
    const res = await fetch(url, { headers: { ...UA, Range: 'bytes=0-1023' }, signal: ctrl.signal, redirect: 'follow' });
    const ms = Date.now() - t0;
    try {
      await res.body?.cancel();
    } catch {
      /* ignorer */
    }
    const ok = okStatus ? okStatus.includes(res.status) || res.ok : res.ok || res.status === 206;
    return { ok, ms, code: res.status };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, code: null, error: e.name === 'AbortError' ? 'Tidsavbrudd' : 'Ingen kontakt' };
  } finally {
    clearTimeout(timer);
  }
}

async function runChecks() {
  return Promise.all(
    CHECKS.map(async (c) => {
      let r = await probe(c.url, c.okStatus);
      if (!r.ok && c.alt) r = await probe(c.alt, c.okStatus);
      const state = !r.ok ? 'down' : r.ms > 2500 ? 'slow' : 'ok';
      return { id: c.id, name: c.name, desc: c.desc, state, ms: r.ms, error: r.error || (r.ok ? null : `HTTP ${r.code}`) };
    })
  );
}

// Rockstar sin statusside (support.rockstargames.com/servicestatus) har tatt over for status.cfx.re.
// Siden bygges med JavaScript og har ikke lenger en åpen JSON-kilde, så vi åpner den i et skjult
// vindu (som en vanlig nettleser), leser teksten og plukker ut Cfx-delen.
const ROCKSTAR_PAGE = process.env.STATUS_PAGE_URL || 'https://support.rockstargames.com/servicestatus'; // overstyres kun i tester
const PAGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const STATUS_RE = /operational|limited|degraded|partial|outage|down\b|offline|unavailable|maintenance|interrupt|issue|problem|investigat/i;

function mapStatus(text) {
  const t = String(text || '').toLowerCase();
  if (/maintenance/.test(t)) return 'under_maintenance';
  if (/all services operational|^operational$|\bup\b/.test(t)) return 'operational';
  if (/major|down\b|offline|unavailable|outage(?! *partial)/.test(t) && !/partial|some|limited/.test(t)) return 'major_outage';
  if (/limited|partial|some|degraded|interrupt|issue|problem|investigat/.test(t)) return 'partial_outage';
  if (/operational/.test(t)) return 'operational';
  return 'degraded_performance';
}

// Tolker sidens tekst: «Gruppe» etterfulgt av par med «Tjeneste» / «Status».
// Eksempel: Cfx \n Authentication \n All services operational \n FiveM \n All services operational …
function parseStatusText(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const isStatus = (l) => STATUS_RE.test(l) && l.length < 60;
  const groups = [];
  let headline = null;
  let updated = null;
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^as of /i.test(l)) {
      updated = l.replace(/^as of /i, '');
      continue;
    }
    if (!groups.length && !cur && isStatus(l) && !headline) {
      headline = l;
      continue;
    }
    const next = lines[i + 1];
    if (!isStatus(l) && next && isStatus(next) && cur) {
      cur.items.push({ name: l, statusText: next, status: mapStatus(next) });
      i++;
      continue;
    }
    if (!isStatus(l) && next && !isStatus(next) && l.length <= 40) {
      // Ny gruppe (overskrift følges av et tjenestenavn, ikke en status)
      cur = { name: l, items: [], messages: [] };
      groups.push(cur);
      continue;
    }
    if (cur && l.length > 50 && !isStatus(l)) cur.messages.push(l);
  }
  return { headline, updated, groups: groups.filter((g) => g.items.length) };
}

let statusWin = null;
async function readStatusPage() {
  const { BrowserWindow } = require('electron');
  if (statusWin && !statusWin.isDestroyed()) statusWin.destroy();
  statusWin = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: { partition: 'persist:rockstar-status', contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const win = statusWin;
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await Promise.race([
      win.loadURL(ROCKSTAR_PAGE, { userAgent: PAGE_UA }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Tidsavbrudd')), 25_000)),
    ]);
    // Vent til innholdet er tegnet (siden henter data etter at den er lastet)
    const t0 = Date.now();
    while (Date.now() - t0 < 20_000) {
      const text = await win.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true);
      if (/\bCfx\b/.test(text) && STATUS_RE.test(text)) return text;
      await new Promise((r) => setTimeout(r, 700));
    }
    throw new Error('Fant ikke Cfx-statusen på siden');
  } finally {
    if (!win.isDestroyed()) win.destroy();
    if (statusWin === win) statusWin = null;
  }
}

async function official() {
  try {
    const text = await readStatusPage();
    const parsed = parseStatusText(text);
    return fromParsed(parsed);
  } catch (e) {
    return { ok: false, pageUrl: ROCKSTAR_PAGE, error: e.message };
  }
}

// Gjør om tolket tekst til samme format som status-siden i launcheren bruker
function fromParsed(parsed) {
  const cfx = parsed.groups.find((g) => /^cfx(\.re)?$/i.test(g.name));
  const online = parsed.groups.find((g) => /online services/i.test(g.name));
  const groups = [];
  if (cfx) {
    groups.push({
      id: 'cfx',
      name: 'Cfx.re (FiveM)',
      status: worst(cfx.items.map((x) => x.status)),
      components: cfx.items.map((x, i) => ({ id: `cfx-${i}`, name: x.name, status: x.status })),
      related: false,
    });
  }
  if (online) {
    const rel = online.items.filter((x) => /authentication|rockstar games launcher/i.test(x.name));
    if (rel.length) {
      groups.push({
        id: 'rockstar',
        name: 'Rockstar (trengs for GTA V)',
        status: worst(rel.map((x) => x.status)),
        components: rel.map((x, i) => ({ id: `rs-${i}`, name: x.name === 'Authentication' ? 'Rockstar-innlogging' : x.name, status: x.status })),
        related: true,
      });
    }
  }
  if (!groups.length) throw new Error('Fant ikke Cfx-statusen på siden');

  const leaves = groups.flatMap((g) => g.components.map((c) => ({ ...c, related: g.related })));
  const CORE_RE = /fivem|community servers|authentication/i;
  const core = leaves.filter((l) => !l.related && CORE_RE.test(l.name));
  const bad = leaves.filter((l) => l.status !== 'operational');
  const indicator =
    worst(core.map((l) => l.status)) === 'major_outage' ? 'major'
    : bad.some((l) => l.status !== 'under_maintenance') ? 'minor'
    : bad.length ? 'maintenance'
    : 'none';
  const problems = [...new Set(bad.map((l) => l.name))];
  const messages = [cfx, online].filter(Boolean).flatMap((g) => g.messages.map((m) => ({ g, m })));

  return {
    ok: true,
    source: 'rockstar-page',
    pageUrl: ROCKSTAR_PAGE,
    found: !!cfx,
    indicator,
    description: problems.length ? `Problemer med ${problems.join(', ')}` : 'Alle tjenester fungerer',
    groups,
    incidents: messages.slice(0, 3).map(({ g, m }, i) => ({
      id: `msg-${i}`,
      name: g.name,
      status: bad.length ? 'investigating' : 'monitoring',
      impact: indicator === 'major' ? 'major' : 'minor',
      updatedAt: null,
      url: ROCKSTAR_PAGE,
      latest: m.slice(0, 400),
    })),
    maintenances: [],
    updated: parsed.updated,
  };
}

const RANK = { operational: 0, under_maintenance: 1, degraded_performance: 2, partial_outage: 3, major_outage: 4 };
function worst(list) {
  return list.reduce((a, b) => ((RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a), 'operational');
}

// Samlet nivå: ok | maintenance | degraded | outage
function overall(off, checks) {
  const listDown = checks.find((c) => c.id === 'list')?.state === 'down';
  const anyDown = checks.some((c) => c.state === 'down');
  const anySlow = checks.some((c) => c.state === 'slow');
  if (off.ok) {
    if (off.indicator === 'major' || off.indicator === 'critical' || listDown) return 'outage';
    if (off.indicator === 'minor' || anyDown) return 'degraded';
    if (off.indicator === 'maintenance') return 'maintenance';
    return anySlow ? 'degraded' : 'ok';
  }
  if (listDown) return 'outage';
  if (anyDown || anySlow) return 'degraded';
  return 'ok';
}

let last = null;
let running = null;
let onChange = null;

async function refresh() {
  if (running) return running;
  running = (async () => {
    const [off, checks] = await Promise.all([official(), runChecks()]);
    const level = overall(off, checks);
    const prev = last?.level;
    last = { at: Date.now(), level, official: off, checks };
    if (prev && prev !== level && onChange) onChange(level, prev, last);
    return last;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

async function get(force = false) {
  if (!force && last && Date.now() - last.at < 60_000) return last;
  return refresh();
}

function start(changeHandler) {
  onChange = changeHandler;
  setTimeout(refresh, 3000);
  setInterval(refresh, 3 * 60_000);
}

module.exports = { get, start, overall, worst, parseStatusText, fromParsed };
