// FiveM/Cfx.re-status: offisiell status fra Rockstar sin statusside + egne målinger av tjenestene launcheren bruker.
const OFFICIAL = 'https://support.rockstargames.com/services/status.json';
const UA = { 'User-Agent': 'FiveMNorgeLauncher' };

// Tjenester launcheren selv er avhengig av
const CHECKS = [
  { id: 'list', name: 'Serverliste', desc: 'Listen over alle servere', url: 'https://frontend.cfx-services.net/api/servers/stream/', alt: 'https://servers-frontend.fivem.net/api/servers/streamRedir/' },
  { id: 'single', name: 'Serverdetaljer', desc: 'Info om enkeltservere', url: 'https://frontend.cfx-services.net/api/servers/single/m44rddq', alt: 'https://servers-frontend.fivem.net/api/servers/single/m44rddq', okStatus: [200, 404] },
  { id: 'web', name: 'FiveM.net', desc: 'Nettside og nedlasting', url: 'https://fivem.net' },
  { id: 'forum', name: 'Cfx.re-forum', desc: 'forum.cfx.re', url: 'https://forum.cfx.re' },
  { id: 'rockstar', name: 'Rockstar-tjenester', desc: 'Statussiden til Rockstar Support', url: 'https://support.rockstargames.com/services/status.json' },
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
// Status-koder: 1 = Up, 2 = Down, 3 = Limited. Meldinger er HTML.
const ROCKSTAR_PAGE = 'https://support.rockstargames.com/servicestatus';
const CFX_RE = /cfx|fivem|redm|community servers|marketplace|authentication/i;
const RELATED_RE = /rockstar games launcher/i; // FiveM trenger launcheren for å starte GTA V

function mapRockstar(code, tag) {
  const t = String(tag || '').toLowerCase();
  if (code === 1 || t === 'up') return 'operational';
  if (code === 2 || t === 'down') return 'major_outage';
  if (code === 3 || t === 'limited') return 'partial_outage';
  if (/maint/.test(t)) return 'under_maintenance';
  return 'degraded_performance';
}
const stripHtml = (h) => String(h || '').replace(/<\/?(p|br|div|li|ul|ol|h\d)[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function official() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${OFFICIAL}?tz=Europe/Oslo`, { headers: { ...UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const entries = Array.isArray(j.statuses) ? j.statuses : Array.isArray(j.services) ? j.services : [];
    if (!entries.length) throw new Error('Ukjent format');

    const platformsOf = (e) => (e.services_platforms || []).map((p) => ({
      id: String(p.id ?? p.name),
      name: p.name,
      status: mapRockstar(p.service_status?.id, p.service_status?.status),
    }));
    const isCfx = (e) => CFX_RE.test(e.name || '') || (e.services_platforms || []).some((p) => /fivem|redm|community servers/i.test(p.name || ''));
    const pick = entries.filter((e) => isCfx(e) || RELATED_RE.test(e.name || ''));

    const groups = pick.map((e) => {
      const components = platformsOf(e);
      const own = mapRockstar(e.status, e.status_tag);
      return {
        id: String(e.id ?? e.name),
        name: RELATED_RE.test(e.name) ? `${e.name} (trengs for GTA V)` : e.name,
        status: worst([own, ...components.map((c) => c.status)]),
        components: components.length === 1 && components[0].name === e.name ? [] : components,
        related: !isCfx(e),
      };
    });
    // Cfx-tjenester først
    groups.sort((a, b) => Number(a.related) - Number(b.related));

    // «Blader» = enkelttjenester (plattformene, eller gruppen selv hvis den ikke har noen)
    const leaves = groups.flatMap((g) =>
      g.components.length ? g.components.map((c) => ({ ...c, related: g.related })) : [{ name: g.name.replace(/ \(.*\)$/, ''), status: g.status, related: g.related }]
    );
    // Bare disse gjør at FiveM regnes som «nede»; Marketplace/RedM/launcher gir «delvise problemer»
    const CORE_RE = /fivem|community servers|authentication|cfx/i;
    const core = leaves.filter((l) => !l.related && CORE_RE.test(l.name));
    const bad = leaves.filter((l) => l.status !== 'operational');
    const indicator =
      worst(core.map((l) => l.status)) === 'major_outage' ? 'major'
      : bad.some((l) => l.status !== 'under_maintenance') ? 'minor'
      : bad.length ? 'maintenance'
      : 'none';
    const problems = [...new Set(bad.map((l) => l.name))];

    return {
      ok: true,
      source: 'rockstar',
      pageUrl: ROCKSTAR_PAGE,
      found: groups.some((g) => !g.related),
      indicator,
      description: problems.length ? `Problemer med ${problems.join(', ')}` : 'Alle tjenester fungerer',
      groups,
      incidents: pick
        .filter((e) => stripHtml(e.message))
        .map((e) => ({
          id: String(e.id ?? e.name),
          name: e.name,
          status: mapRockstar(e.status, e.status_tag) === 'operational' ? 'monitoring' : 'investigating',
          impact: mapRockstar(e.status, e.status_tag) === 'major_outage' ? 'major' : 'minor',
          updatedAt: e.recent_update || e.updated || j.updated,
          url: ROCKSTAR_PAGE,
          latest: stripHtml(e.message).slice(0, 400),
        })),
      maintenances: [],
      updated: j.updated,
    };
  } catch (e) {
    return { ok: false, pageUrl: ROCKSTAR_PAGE, error: e.name === 'AbortError' ? 'Tidsavbrudd' : e.message };
  } finally {
    clearTimeout(timer);
  }
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

module.exports = { get, start, overall, worst };
