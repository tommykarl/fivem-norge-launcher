// Henter serverlogoer i hovedprosessen og lagrer dem på disk.
// React-delen laster dem via egen protokoll: cfxicon://icon/<serverId>
const { app, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');

const dir = () => path.join(app.getPath('userData'), 'icon-cache');
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
};
const FAIL_TTL = 10 * 60_000; // ikke prøv en logo som feilet på nytt før om 10 min
const failed = new Map();
let getIconVersion = async () => null;

function candidates(id, v) {
  const list = [];
  if (v !== null && v !== undefined) {
    list.push(
      `https://frontend.cfx-services.net/api/servers/icon/${id}/${v}.png`,
      `https://servers-frontend.fivem.net/api/servers/icon/${id}/${v}.png`,
      `https://servers-live.fivem.net/servers/icon/${id}/${v}.png`
    );
  }
  list.push(`https://servers-live.fivem.net/servers/icon/${id}/0.png`);
  return list;
}

async function download(id) {
  const v = await getIconVersion(id);
  for (const url of candidates(id, v)) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 64) continue;
      return { buf, type, v };
    } catch {
      /* prøv neste adresse */
    }
  }
  console.warn(`[icons] Fant ingen logo for ${id} (iconVersion=${v})`);
  return null;
}

async function getIcon(id) {
  fs.mkdirSync(dir(), { recursive: true });
  const v = await getIconVersion(id);
  const file = path.join(dir(), `${id}_${v ?? 'x'}.png`);
  if (fs.existsSync(file)) return { buf: fs.readFileSync(file), type: 'image/png' };

  const f = failed.get(id);
  if (f && Date.now() - f < FAIL_TTL) return null;

  const icon = await download(id);
  if (!icon) {
    failed.set(id, Date.now());
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
    const id = new URL(req.url).pathname.replace(/^\/+/, '');
    if (!/^[a-z0-9]{4,10}$/i.test(id)) return new Response(null, { status: 400 });
    const icon = await getIcon(id);
    if (!icon) return new Response(null, { status: 404 });
    return new Response(icon.buf, { headers: { 'content-type': icon.type, 'cache-control': 'max-age=3600' } });
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

module.exports = { registerScheme, registerHandler, size, clear };
