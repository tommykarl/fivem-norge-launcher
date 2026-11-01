// Legger ferdigbygde exe-filer i exe/ og skriver exe/latest.json, som launcheren
// sjekker for oppdateringer. Gamle exe-filer i mappa fjernes, med mindre du legger til --behold.
//
// Bruk:  npm run exe -- "Hva er nytt i denne versjonen"
//        npm run exe -- --behold "Test"     (beholder eldre exe-filer)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const { version } = require(path.join(root, 'package.json'));
const names = {
  setup: `FiveM-Norge-Launcher-Setup-${version}.exe`,
  portable: `FiveM-Norge-Launcher-Portable-${version}.exe`,
};
const out = path.join(root, 'exe');
fs.mkdirSync(out, { recursive: true });

for (const f of Object.values(names)) {
  if (!fs.existsSync(path.join(root, 'release', f))) {
    console.error(`Fant ikke release/${f}. Bygg først: npx vite build && npx electron-builder --win --x64 --publish never`);
    process.exit(1);
  }
}
const args = process.argv.slice(2);
const keep = args.includes('--behold');
if (!keep) for (const f of fs.readdirSync(out)) if (/\.exe$/i.test(f) && !Object.values(names).includes(f)) fs.rmSync(path.join(out, f));

const sha256 = {};
for (const [kind, f] of Object.entries(names)) {
  fs.copyFileSync(path.join(root, 'release', f), path.join(out, f));
  sha256[kind] = crypto.createHash('sha256').update(fs.readFileSync(path.join(out, f))).digest('hex');
}
// Liten oppdatering: app.asar alene (gzip). Launcheren bruker den når Electron-versjonen er lik.
const zlib = require('node:zlib');
const asarSrc = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
let asar = null;
if (fs.existsSync(asarSrc)) {
  const raw = fs.readFileSync(asarSrc);
  const file = `app-${version}.asar.gz`;
  const gz = zlib.gzipSync(raw, { level: 9 });
  for (const f of fs.readdirSync(out)) if (/\.asar\.gz$/i.test(f)) fs.rmSync(path.join(out, f));
  fs.writeFileSync(path.join(out, file), gz);
  asar = { file, sha256: crypto.createHash('sha256').update(raw).digest('hex'), size: gz.length, electron: require(path.join(root, 'node_modules', 'electron', 'package.json')).version };
  console.log(`Liten oppdatering: ${file} (${(gz.length / 1048576).toFixed(1)} MB, Electron ${asar.electron})`);
} else console.warn('Fant ikke release/win-unpacked/resources/app.asar – bare full installer publiseres.');
const sizes = Object.fromEntries(Object.entries(names).map(([k, f]) => [k, fs.statSync(path.join(out, f)).size]));
const manifest = {
  version,
  setup: names.setup,
  portable: names.portable,
  sha256,
  sizes,
  ...(asar ? { asar } : {}),
  notes: args.filter((a) => a !== '--behold').join(' ').trim(),
  publishedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`exe/ oppdatert til ${version}. Commit og push for å gi brukerne oppdateringen.`);
