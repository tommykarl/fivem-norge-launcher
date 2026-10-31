// Tømmer FiveM sin egen cache i %LOCALAPPDATA%\FiveM\FiveM.app\data
// Rører ALDRI game-storage eller cache\game (da må FiveM laste ned spillfiler på nytt).
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');

const DATA_DIR = () =>
  path.join(process.env.LOCALAPPDATA || '', 'FiveM', 'FiveM.app', 'data');
const APP_DIR = () => path.join(process.env.LOCALAPPDATA || '', 'FiveM', 'FiveM.app');

// Grupper brukeren kan velge. "paths" er relativt til FiveM.app
const GROUPS = {
  cache: {
    label: 'Cache (cache, server-cache, server-cache-priv)',
    paths: ['data/cache', 'data/server-cache', 'data/server-cache-priv'],
    keepInside: { 'data/cache': ['game'] },
  },
  nui: {
    label: 'NUI-lagring (innstillinger i server-menyer kan nullstilles)',
    paths: ['data/nui-storage'],
  },
  logs: {
    label: 'Logger og krasjrapporter',
    paths: ['logs', 'crashes'],
  },
};
const NEVER = ['game-storage', path.join('cache', 'game')];

function assertSafe(target) {
  const rel = path.relative(APP_DIR(), target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Ugyldig sti');
  if (NEVER.some((n) => rel.includes(n))) throw new Error('Nekter å slette spillfiler');
}

async function dirSize(p) {
  let total = 0;
  let entries;
  try {
    entries = await fsp.readdir(p, { withFileTypes: true });
  } catch {
    try {
      return (await fsp.stat(p)).size;
    } catch {
      return 0;
    }
  }
  for (const e of entries) {
    const full = path.join(p, e.name);
    if (e.isDirectory()) total += await dirSize(full);
    else {
      try {
        total += (await fsp.stat(full)).size;
      } catch {
        /* ignorer */
      }
    }
  }
  return total;
}

// Lister konkrete mapper/filer som skal slettes for en gruppe
async function targetsFor(key) {
  const g = GROUPS[key];
  const out = [];
  for (const rel of g.paths) {
    const full = path.join(APP_DIR(), rel);
    if (!fs.existsSync(full)) continue;
    const keep = g.keepInside?.[rel];
    if (keep) {
      for (const name of await fsp.readdir(full)) {
        if (!keep.includes(name)) out.push(path.join(full, name));
      }
    } else {
      out.push(full);
    }
  }
  return out;
}

function isFiveMRunning() {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    // null = klarte ikke å sjekke (da avsluttes ikke spilleøkter på feil grunnlag)
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(/^"FiveM[^"]*\.exe"/im.test(stdout));
    });
  });
}

async function info() {
  if (process.platform !== 'win32') return { found: false, reason: 'Kun støttet på Windows' };
  if (!fs.existsSync(DATA_DIR())) return { found: false, reason: 'Fant ikke FiveM-mappen i %LOCALAPPDATA%\\FiveM' };
  const groups = {};
  for (const key of Object.keys(GROUPS)) {
    let bytes = 0;
    for (const t of await targetsFor(key)) bytes += await dirSize(t);
    groups[key] = { label: GROUPS[key].label, bytes };
  }
  return { found: true, path: DATA_DIR(), running: await isFiveMRunning(), groups };
}

async function clear(keys) {
  if (process.platform !== 'win32') throw new Error('Kun støttet på Windows');
  if (!fs.existsSync(DATA_DIR())) throw new Error('Fant ikke FiveM-mappen');
  if ((await isFiveMRunning()) !== false) throw new Error('Lukk FiveM før du tømmer cachen (eller prøv igjen om litt)');

  let freed = 0;
  let failed = 0;
  for (const key of keys) {
    if (!GROUPS[key]) continue;
    for (const t of await targetsFor(key)) {
      assertSafe(t);
      const size = await dirSize(t);
      try {
        await fsp.rm(t, { recursive: true, force: true, maxRetries: 2 });
        freed += size;
      } catch {
        failed++;
      }
    }
  }
  return { freed, failed };
}

// Prøver å finne hvilken server FiveM er koblet til, ved å lese slutten av nyeste logg.
// Ser etter "cfx.re/join/<id>" skrevet etter at økta startet.
async function detectServer(since = 0) {
  if (process.platform !== 'win32') return null;
  const dir = path.join(APP_DIR(), 'logs');
  let files;
  try {
    files = (await fsp.readdir(dir)).filter((f) => /\.log$/i.test(f));
  } catch {
    return null;
  }
  const stats = await Promise.all(files.map(async (f) => ({ f, st: await fsp.stat(path.join(dir, f)).catch(() => null) })));
  const newest = stats.filter((x) => x.st && x.st.mtimeMs >= since - 60_000).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)[0];
  if (!newest) return null;
  const size = newest.st.size;
  const len = Math.min(size, 2 * 1024 * 1024);
  const fh = await fsp.open(path.join(dir, newest.f), 'r');
  try {
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, size - len);
    const text = buf.toString('utf8');
    const ids = [...text.matchAll(/cfx\.re\/join\/([a-z0-9]{4,10})/gi)].map((m) => m[1].toLowerCase());
    return ids.length ? { id: ids[ids.length - 1] } : null;
  } finally {
    await fh.close();
  }
}

module.exports = { info, clear, isFiveMRunning, detectServer };
