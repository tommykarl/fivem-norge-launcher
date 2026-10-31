// Henter FiveM sin offentlige serverliste (protobuf-strøm) og filtrerer ut norske servere.
const protobuf = require('protobufjs');

const { CFX_HEADERS, CFX_API, CFX_API_OLD } = require('./cfxHttp.cjs');

const STREAM_URLS = [`${CFX_API}/streamRedir/`, `${CFX_API_OLD}/streamRedir/`, `${CFX_API}/stream/`];
const SINGLE_URLS = [(id) => `${CFX_API}/single/${id}`, (id) => `${CFX_API_OLD}/single/${id}`];
const HEADERS = CFX_HEADERS;

const root = protobuf.Root.fromJSON({
  nested: {
    master: {
      nested: {
        Player: {
          fields: {
            name: { type: 'string', id: 1 },
            identifiers: { rule: 'repeated', type: 'string', id: 2 },
            endpoint: { type: 'string', id: 3 },
            ping: { type: 'int32', id: 4 },
            id: { type: 'int32', id: 5 },
          },
        },
        ServerData: {
          fields: {
            svMaxclients: { type: 'int32', id: 1 },
            clients: { type: 'int32', id: 2 },
            protocol: { type: 'int32', id: 3 },
            hostname: { type: 'string', id: 4 },
            gametype: { type: 'string', id: 5 },
            mapname: { type: 'string', id: 6 },
            resources: { rule: 'repeated', type: 'string', id: 8 },
            server: { type: 'string', id: 9 },
            players: { rule: 'repeated', type: 'Player', id: 10 },
            iconVersion: { type: 'int32', id: 11 },
            vars: { keyType: 'string', type: 'string', id: 12 },
            enhancedHostSupport: { type: 'bool', id: 16 },
            upvotePower: { type: 'int32', id: 17 },
            connectEndPoints: { rule: 'repeated', type: 'string', id: 18 },
            burstPower: { type: 'int32', id: 19 },
          },
        },
        Server: {
          fields: {
            EndPoint: { type: 'string', id: 1 },
            Data: { type: 'ServerData', id: 2 },
          },
        },
      },
    },
  },
});
const ServerMsg = root.lookupType('master.Server');

// Fjerner FiveM-fargekoder (^1, ^2 ...) og overflødige mellomrom
const clean = (s = '') => String(s).replace(/\^[0-9]/g, '').replace(/\s+/g, ' ').trim();
const httpsOnly = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : null);

// Godtar både https://discord.gg/x, discord.gg/x og discord.com/invite/x
function discordLink(v) {
  const m = String(v || '').match(/(?:discord(?:app)?\.(?:gg|com\/invite))\/([a-z0-9-]{2,32})/i);
  return m ? `https://discord.gg/${m[1]}` : null;
}
function websiteLink(v) {
  const s = String(v || '').trim();
  if (!s || /discord/i.test(s)) return null;
  const u = /^https?:\/\//i.test(s) ? s.replace(/^http:/i, 'https:') : /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(s) ? `https://${s}` : null;
  return u;
}

const NO_NAME = /\b(norge|norsk|norway|norwegian|nordnorge)\b|\[no\]|\(no\)|🇳🇴/i;

function isNorwegian(d) {
  const vars = d.vars || {};
  const loc = String(vars.locale || '').toLowerCase().replace('_', '-');
  if (/^(nb|nn|no)(-|$)/.test(loc) || /-no$/.test(loc)) return true;
  return NO_NAME.test(clean(d.hostname)) || NO_NAME.test(clean(vars.sv_projectName));
}

function mapServer(id, d) {
  const vars = d.vars || {};
  return {
    id,
    name: clean(vars.sv_projectName || d.hostname) || id,
    hostname: clean(d.hostname),
    desc: clean(vars.sv_projectDesc || ''),
    clients: d.clients || 0,
    max: d.svMaxclients || Number(vars.sv_maxClients) || 0,
    locale: vars.locale || '',
    tags: String(vars.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10),
    iconVersion: d.iconVersion || 0,
    // iconVersion 0 = serveren har ingen egen logo (da vises bokstavikonet uten å spørre API-et)
    icons: d.iconVersion ? [`cfxicon://icon/${id}/${d.iconVersion}`] : [], // hentes og caches av electron/icons.cjs
    banner: httpsOnly(vars.banner_detail) || httpsOnly(vars.banner_connecting),
    upvotes: d.upvotePower || 0,
    gamebuild: vars.sv_enforceGameBuild || null,
    onesync: vars.onesync_enabled === 'true' || vars.onesync === 'on',
    resourcesCount: (d.resources || []).length,
    discord: discordLink(vars.Discord || vars.discord || vars.sv_discord || vars.sv_projectDesc),
    website: websiteLink(vars.Website || vars.website || vars.sv_website),
    whitelist: /whitelist/i.test(`${vars.tags || ''} ${d.hostname || ''} ${vars.sv_projectName || ''}`),
  };
}

function decodeStream(buf) {
  const out = [];
  let off = 0;
  while (off + 4 <= buf.length) {
    const len = buf.readUInt32LE(off);
    off += 4;
    if (len <= 0 || off + len > buf.length) break;
    try {
      const msg = ServerMsg.decode(buf.subarray(off, off + len));
      if (msg.EndPoint && msg.Data) out.push({ id: msg.EndPoint, data: msg.Data });
    } catch {
      /* hopp over ødelagte meldinger */
    }
    off += len;
  }
  return out;
}

let cache = { at: 0, servers: [], raw: new Map() };
const listeners = [];
const onList = (fn) => listeners.push(fn);
const cachedServers = () => cache.servers;
const CACHE_MS = 60_000;

async function fetchStream() {
  let lastErr;
  for (const url of STREAM_URLS) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Klarte ikke å hente serverlisten (${lastErr?.message || 'ukjent feil'})`);
}

async function listServers(force = false) {
  if (!force && Date.now() - cache.at < CACHE_MS && cache.servers.length) return cache.servers;
  const buf = await fetchStream();
  const norske = decodeStream(buf).filter((s) => isNorwegian(s.data));
  const servers = norske.map((s) => mapServer(s.id, s.data)).sort((a, b) => b.clients - a.clients);
  cache = { at: Date.now(), servers, raw: new Map(norske.map((s) => [s.id, s.data])) };
  for (const fn of listeners) {
    try {
      fn(servers);
    } catch (e) {
      console.warn('[fivem] lytter feilet:', e.message);
    }
  }
  return servers;
}

// Henter detaljer for én server. Prøver flere Cfx-adresser; hvis alle feiler,
// brukes dataene vi allerede har fra serverlisten (uten spillerliste).
async function fetchSingle(id) {
  for (const url of SINGLE_URLS) {
    try {
      const res = await fetch(url(id), { headers: HEADERS });
      if (!res.ok) continue;
      const json = await res.json();
      if (json?.Data) return json.Data;
    } catch {
      /* prøv neste */
    }
  }
  return null;
}

function detailsFrom(id, d) {
  const vars = d.vars || {};
  return {
    ...mapServer(id, d),
    owner: d.ownerName || null,
  };
}

// Finn logo-versjon: fra serverlisten, ellers fra enkelt-server-API-et
const iconVersions = new Map();
async function iconVersion(id) {
  const fromList = cache.raw.get(id)?.iconVersion;
  if (fromList) return fromList;
  if (iconVersions.has(id)) return iconVersions.get(id);
  const single = await fetchSingle(id);
  const v = single?.iconVersion ?? null;
  iconVersions.set(id, v);
  return v;
}

function clearCache() {
  cache = { at: 0, servers: [], raw: new Map() };
  iconVersions.clear();
}

async function getServer(id) {
  if (!/^[a-z0-9]{4,10}$/i.test(id)) throw new Error('Ugyldig server-ID');
  const single = await fetchSingle(id);
  if (!single) {
    const raw = cache.raw.get(id);
    if (!raw) throw new Error('Fant ikke detaljer for denne serveren akkurat nå');
    return detailsFrom(id, raw);
  }
  const d = single;
  if (d.iconVersion != null) iconVersions.set(id, d.iconVersion);
  return detailsFrom(id, { ...d, svMaxclients: d.sv_maxclients ?? d.svMaxclients });
}

module.exports = { listServers, getServer, fetchSingle, onList, cachedServers, iconVersion, clearCache, decodeStream, isNorwegian, mapServer, ServerMsg };
