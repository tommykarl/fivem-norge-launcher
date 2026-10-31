// Finner FiveM-servere der brukeren allerede er medlem av Discord-serveren deres.
// Krever "guilds"-tilgang ved innlogging. Invitasjonslenker slås opp i Discords åpne invite-API.
const { jsonFile } = require('./jsonfile.cjs');

const invitesFile = jsonFile('discord-invites.json', { codes: {} });
const INVITE_TTL = 7 * 24 * 3600_000;
const FAIL_TTL = 24 * 3600_000;
const MAX_LOOKUPS_PER_RUN = 40;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const codeOf = (url) => (String(url || '').match(/discord\.gg\/([a-z0-9-]+)/i) || [])[1] || null;

async function lookupInvite(code) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}`);
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      await sleep(Math.min(10_000, (body.retry_after || 2) * 1000));
      continue;
    }
    if (!res.ok) return null;
    const j = await res.json();
    return j?.guild?.id || null;
  }
  return null;
}

async function fetchGuildIds(token) {
  const res = await fetch('https://discord.com/api/v10/users/@me/guilds?limit=200', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    const err = new Error('Mangler tilgang til Discord-serverne dine');
    err.code = 'NO_SCOPE';
    throw err;
  }
  if (!res.ok) throw new Error(`Discord svarte med ${res.status}`);
  return new Set((await res.json()).map((g) => g.id));
}

let memo = { at: 0, userId: null, result: null };

async function find(session, servers) {
  if (!session?.token) return { needsLogin: true, ids: [] };
  if (!String(session.scope || '').includes('guilds')) return { needsScope: true, ids: [] };
  if (memo.userId === session.user.id && Date.now() - memo.at < 30 * 60_000) return memo.result;

  let guilds;
  try {
    guilds = await fetchGuildIds(session.token);
  } catch (e) {
    if (e.code === 'NO_SCOPE') return { needsScope: true, ids: [] };
    throw e;
  }

  const store = invitesFile.get().codes;
  let lookups = 0;
  const ids = [];
  for (const s of servers) {
    const code = codeOf(s.discord);
    if (!code) continue;
    let entry = store[code];
    const stale = !entry || Date.now() - entry.at > (entry.guild ? INVITE_TTL : FAIL_TTL);
    if (stale && lookups < MAX_LOOKUPS_PER_RUN) {
      lookups++;
      try {
        entry = { guild: await lookupInvite(code), at: Date.now() };
        store[code] = entry;
      } catch {
        /* nettverksfeil – prøv neste gang */
      }
      await sleep(250);
    }
    if (entry?.guild && guilds.has(entry.guild)) ids.push(s.id);
  }
  invitesFile.save();
  const result = { ids };
  memo = { at: Date.now(), userId: session.user.id, result };
  return result;
}

module.exports = { find, reset: () => (memo = { at: 0, userId: null, result: null }) };
