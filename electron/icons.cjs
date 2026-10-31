// Henter serverlogoer i hovedprosessen og lagrer dem på disk.
// React-delen laster dem via egen protokoll: cfxicon://icon/<serverId>/<iconVersion>
const { app, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');

const dir = () => path.join(app.getPath('userData'), 'icon-cache');
const { CFX_HEADERS, CFX_API, CFX_API_OLD } = require('./cfxHttp.cjs');
const HEADERS = { ...CFX_HEADERS, Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' };
const FAIL_TTL = 10 * 60_000; // ikke prøv en logo som feilet på nytt før om 10 min
const failed = new Map();
let getIconVersion = async () => null;

function candidates(id, v) {
  return [`${CFX_API}/icon/${id}/${v}.png`, `${CFX_API_OLD}/icon/${id}/${v}.png`];
}

// Node-fetch sender Origin/Referer slik API-et vil ha det. Feiler den, prøver vi Electron sin
// net.fetch (Chromium-nettverket, samme som en nettleser) før vi gir opp adressen.
async function get(url) {
  let res = null;
  try {
    res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
    if (res.ok) return res;
  } catch {
    /* prøv net.fetch */
  }
  try {
    const r2 = await net.fetch(url, { headers: HEADERS, bypassCustomProtocolHandlers: true });
    if (r2.ok || !res) return r2;
  } catch {
    /* behold første svar */
  }
  if (res) return res;
  throw new Error('ingen kontakt');
}

async function download(id, v) {
  const tried = [];
  for (const url of candidates(id, v)) {
    try {
      const res = await get(url);
      const type = res.headers.get('content-type') || '';
      tried.push(res.status);
      if (!res.ok || !type.startsWith('image/')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 64) continue;
      return { buf, type };
    } catch (e) {
      tried.push(e.message);
    }
  }
  console.warn(`[icons] Fant ingen logo for ${id} (iconVersion=${v}, svar: ${tried.join(', ')})`);
  return null;
}

async function getIcon(id, vHint) {
  // Versjon fra URL-en (satt fra serverlisten), ellers slått opp
  const v = vHint || (await getIconVersion(id));
  if (!v) return null; // ingen egen logo
  fs.mkdirSync(dir(), { recursive: true });
  const file = path.join(dir(), `${id}_${v}.png`);
  if (fs.existsSync(file)) return { buf: fs.readFileSync(file), type: 'image/png' };

  const key = `${id}_${v}`;
  const f = failed.get(key);
  if (f && Date.now() - f < FAIL_TTL) return null;

  const icon = await download(id, v);
  if (!icon) {
    failed.set(key, Date.now());
    return null;
  }
  // Fjern eldre versjoner av samme logo
  for (const old of fs.readdirSync(dir())) if (old.startsWith(`${id}_`)) fs.rmSync(path.join(dir(), old), { force: true });
  fs.writeFileSync(file, icon.buf);
  return icon;
}

function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'cfxicon', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

function registerHandler(resolveVersion) {
  getIconVersion = resolveVersion;
  protocol.handle('cfxicon', async (req) => {
    // cfxicon://icon/<id>/<iconVersion>  (versjonen er valgfri)
    const [id, ver] = new URL(req.url).pathname.replace(/^\/+/, '').split('/');
    if (!/^[a-z0-9]{4,10}$/i.test(id || '')) return new Response(null, { status: 400 });
    const v = /^\d{1,9}$/.test(ver || '') ? Number(ver) : null;
    const icon = await getIcon(id, v);
    if (!icon) return new Response(null, { status: 404 });
    return new Response(icon.buf, { headers: { 'content-type': icon.type, 'cache-control': 'max-age=86400' } });
  });
}

function size() {
  try {
    return fs.readdirSync(dir()).reduce((n, f) => n + fs.statSync(path.join(dir(), f)).size, 0);
  } catch {
    return 0;
  }
}

function clear() {
  failed.clear();
  fs.rmSync(dir(), { recursive: true, force: true });
}

// Feilsøking: prøver alle måter å hente logoen på og rapporterer hva API-et svarer
async function diagnose(id, v) {
  const out = [];
  for (const url of candidates(id, v)) {
    for (const [via, fn] of [
      ['node', () => fetch(url, { headers: HEADERS, redirect: 'follow' })],
      ['chromium', () => net.fetch(url, { headers: HEADERS, bypassCustomProtocolHandlers: true })],
      ['uten headere', () => fetch(url)],
    ]) {
      const t0 = Date.now();
      try {
        const res = await fn();
        const buf = Buffer.from(await res.arrayBuffer());
        out.push({ url, via, status: res.status, type: res.headers.get('content-type') || '', bytes: buf.length, ms: Date.now() - t0 });
      } catch (e) {
        out.push({ url, via, status: null, error: e.message, ms: Date.now() - t0 });
      }
    }
  }
  return out;
}

module.exports = { registerScheme, registerHandler, size, clear, diagnose };
