// Om appen, oppdateringer, avinstallering, oppstart med Windows, systemstatusfelt og nullstilling.
const { app, Tray, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PRODUCT = 'FiveM Norge Launcher';
const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_DIR;
const uninstallerPath = () => path.join(path.dirname(process.execPath), `Uninstall ${PRODUCT}.exe`);

function info() {
  const canUninstall = app.isPackaged && !isPortable() && process.platform === 'win32' && fs.existsSync(uninstallerPath());
  return {
    version: app.getVersion(),
    packaged: app.isPackaged,
    portable: isPortable(),
    installDir: app.isPackaged ? path.dirname(process.execPath) : null,
    dataDir: app.getPath('userData'),
    canUninstall,
    updateRepo: updateRepo(),
    electron: process.versions.electron,
  };
}

// ---------- Oppdateringer (exe-mappa på GitHub) ----------
// Launcheren leser exe/latest.json i repoet (UPDATE_REPO=brukernavn/repo i .env) og
// laster ned exe-filen som står der. Filen lages av «npm run exe».
function updateRepo() {
  const r = String(process.env.UPDATE_REPO || '').trim();
  return /^[\w.-]+\/[\w.-]+$/.test(r) ? r : null;
}
const UPDATE_BRANCH = () => (/^[\w./-]+$/.test(process.env.UPDATE_BRANCH || '') ? process.env.UPDATE_BRANCH : 'main');
const rawUrl = (repo, file) => `https://raw.githubusercontent.com/${repo}/${UPDATE_BRANCH()}/exe/${encodeURIComponent(file)}`;

function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/i, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

async function checkUpdate() {
  const repo = updateRepo();
  const current = app.getVersion();
  if (!repo) return { configured: false, current };
  const res = await fetch(`${rawUrl(repo, 'latest.json')}?t=${Date.now()}`, {
    headers: { 'User-Agent': 'FiveMNorgeLauncher', 'Cache-Control': 'no-cache' },
  });
  if (res.status === 404) {
    return { configured: true, current, latest: null, newer: false, note: 'Fant ikke exe/latest.json på GitHub. Er repoet offentlig?' };
  }
  if (!res.ok) throw new Error(`GitHub svarte med ${res.status}`);
  const m = await res.json();
  const latest = String(m.version || '').replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+/.test(latest)) throw new Error('exe/latest.json har ikke et gyldig versjonsnummer');
  const wantPortable = isPortable();
  const file = wantPortable ? m.portable : m.setup;
  const valid = typeof file === 'string' && /^[\w.-]+\.exe$/i.test(file);
  // Liten oppdatering: når Electron-versjonen er lik, holder det å bytte app.asar (ca. 2 MB i stedet for 80 MB)
  const a = m.asar;
  const patch =
    !wantPortable && app.isPackaged && process.platform === 'win32' && a && typeof a.file === 'string' && /^[\w.-]+\.asar\.gz$/i.test(a.file) && /^[0-9a-f]{64}$/i.test(a.sha256 || '') && a.electron === process.versions.electron && resourcesWritable()
      ? { url: rawUrl(repo, a.file), sha256: a.sha256.toLowerCase(), size: Number(a.size) || 0 }
      : null;
  return {
    patch,
    size: patch ? patch.size : Number(m.sizes?.[wantPortable ? 'portable' : 'setup']) || 0,
    configured: true,
    current,
    latest,
    newer: cmpVersion(latest, current) > 0,
    url: valid ? rawUrl(repo, file) : `https://github.com/${repo}/tree/${UPDATE_BRANCH()}/exe`,
    sha256: valid ? m.sha256?.[wantPortable ? 'portable' : 'setup'] || null : null,
    canInstall: valid && !wantPortable && app.isPackaged && process.platform === 'win32',
    notes: String(m.notes || '').slice(0, 1500),
    publishedAt: m.publishedAt || null,
  };
}

// ---------- Avinstaller ----------
function uninstall() {
  if (!info().canUninstall) {
    throw new Error(
      isPortable()
        ? 'Den portable versjonen installeres ikke – slett bare .exe-filen.'
        : 'Fant ikke avinstalleringsprogrammet. Bruk Innstillinger → Apper i Windows.'
    );
  }
  const child = spawn(uninstallerPath(), [], { detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => app.exit(0), 300);
  return true;
}

// ---------- Start med Windows ----------
function applyAutostart(on) {
  if (!app.isPackaged || process.platform !== 'win32') return;
  app.setLoginItemSettings({
    openAtLogin: !!on,
    path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    args: ['--hidden'],
  });
}
const startedHidden = () => process.argv.includes('--hidden');

// ---------- Systemstatusfelt ----------
let tray = null;
function setTray(on, getWin) {
  if (on && !tray) {
    try {
      tray = new Tray(path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'));
    } catch (e) {
      console.warn('[tray]', e.message);
      tray = null;
      return;
    }
    tray.setToolTip(PRODUCT);
    trayShow = () => {
      const w = getWin();
      if (!w) return;
      w.show();
      if (w.isMinimized()) w.restore();
      w.focus();
    };
    tray.on('click', trayShow);
    refreshTrayMenu();
  } else if (!on && tray) {
    tray.destroy();
    tray = null;
  }
}
const hasTray = () => !!tray;

// Hurtigmeny ved klokka: lagrede og nylig spilte servere, ett klikk kobler til.
let trayShow = () => {};
let trayItems = () => ({ saved: [], recent: [] });
let trayConnect = () => {};
function configureTrayMenu(getItems, connect) {
  trayItems = getItems;
  trayConnect = connect;
  refreshTrayMenu();
}
function refreshTrayMenu() {
  if (!tray) return;
  const { saved, recent } = trayItems();
  const item = (s) => ({
    label: `${s.name.slice(0, 40)}${s.live ? `   ${s.live}` : ''}`,
    enabled: !s.offline,
    click: () => trayConnect(s),
  });
  const savedIds = new Set(saved.map((s) => s.id));
  const recentOnly = recent.filter((s) => !savedIds.has(s.id)).slice(0, 5);
  const template = [{ label: 'Åpne FiveM Norge', click: trayShow }, { type: 'separator' }];
  if (saved.length) template.push({ label: 'Lagrede servere', enabled: false }, ...saved.slice(0, 8).map(item), { type: 'separator' });
  if (recentOnly.length) template.push({ label: 'Nylig spilt', enabled: false }, ...recentOnly.map(item), { type: 'separator' });
  template.push({ label: 'Avslutt', click: () => app.exit(0) });
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

// ---------- Automatisk oppdatering ----------
// Laster ned installeren fra exe-mappa, sjekker SHA-256 og kjører den stille (/S) med --force-run,
// så launcheren starter igjen av seg selv etterpå.
let downloaded = null; // { version, file }
// Kan vi skrive i programmappa (vanlig installasjon for én bruker)? Ellers brukes hele installeren.
function resourcesWritable() {
  try {
    const probe = path.join(process.resourcesPath, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, '1');
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}
const PATCH_FILE = () => path.join(process.resourcesPath, 'app-update.bin'); // ikke .asar: Electron behandler slike stier spesielt

async function downloadPatch(u, onProgress) {
  // Adressen kommer fra vinduet: godta bare filer fra exe-mappa i oppdateringsrepoet
  const repo = updateRepo();
  if (!repo || !u.patch.url.startsWith(rawUrl(repo, '')) || !/\/app-[\d.]+\.asar\.gz$/i.test(u.patch.url) || !/^[0-9a-f]{64}$/.test(u.patch.sha256 || '')) throw new Error('Ugyldig oppdatering');
  const res = await fetch(u.patch.url, { headers: { 'User-Agent': 'FiveMNorgeLauncher' }, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Nedlasting feilet (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || u.patch.size || 0;
  const zlib = require('node:zlib');
  const hash = require('node:crypto').createHash('sha256');
  const tmp = `${PATCH_FILE()}.part`;
  const out = fs.createWriteStream(tmp);
  const gunzip = zlib.createGunzip();
  const done = new Promise((resolve, reject) => {
    gunzip.on('data', (chunk) => hash.update(chunk));
    gunzip.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
  });
  gunzip.pipe(out);
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    got += value.length;
    if (!gunzip.write(Buffer.from(value))) await new Promise((r) => gunzip.once('drain', r));
    if (total && onProgress) onProgress(Math.min(100, Math.round((got / total) * 100)));
  }
  gunzip.end();
  await done;
  if (hash.digest('hex') !== u.patch.sha256) {
    fs.rmSync(tmp, { force: true });
    throw new Error('Oppdateringen stemmer ikke med exe/latest.json (SHA-256)');
  }
  fs.renameSync(tmp, PATCH_FILE());
  return { version: u.latest, kind: 'patch', file: PATCH_FILE() };
}

async function downloadUpdate(u, onProgress) {
  if (u?.patch && !isPortable()) {
    if (downloaded?.version === u.latest && fs.existsSync(downloaded.file)) return downloaded;
    try {
      downloaded = await downloadPatch(u, onProgress);
      return downloaded;
    } catch (e) {
      // Faller tilbake til hele installeren
      console.warn('[oppdatering] liten oppdatering feilet, bruker installeren:', e.message);
      fs.rmSync(`${PATCH_FILE()}.part`, { force: true });
    }
  }
  if (!u?.url || !/^https:\/\/raw\.githubusercontent\.com\//i.test(u.url) || !/\.exe($|\?)/i.test(u.url)) {
    throw new Error('Fant ingen installer å laste ned i exe-mappa');
  }
  if (isPortable()) throw new Error('Den portable versjonen oppdateres ved å laste ned ny .exe');
  if (downloaded?.version === u.latest && fs.existsSync(downloaded.file)) return downloaded;
  const res = await fetch(u.url, { headers: { 'User-Agent': 'FiveMNorgeLauncher' }, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Nedlasting feilet (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const file = path.join(app.getPath('temp'), `FiveM-Norge-Launcher-Setup-${u.latest}.exe`);
  const out = fs.createWriteStream(file);
  const hash = require('node:crypto').createHash('sha256');
  let got = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      hash.update(value);
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      if (total && onProgress) onProgress(Math.round((got / total) * 100));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  if (total && got !== total) throw new Error('Nedlastingen ble avbrutt');
  if (u.sha256 && hash.digest('hex') !== String(u.sha256).toLowerCase()) {
    fs.rmSync(file, { force: true });
    throw new Error('Nedlastet fil stemmer ikke med exe/latest.json (SHA-256). Prøv igjen senere.');
  }
  downloaded = { version: u.latest, file };
  return downloaded;
}

function installUpdate() {
  if (!downloaded || !fs.existsSync(downloaded.file)) throw new Error('Ingen oppdatering er lastet ned');
  if (downloaded.kind === 'patch') {
    // Et lite skript venter til launcheren er lukket, bytter app.asar og starter den igjen.
    // Går byttet galt, legges den gamle fila tilbake.
    const res = process.resourcesPath;
    const q = (p) => `"${p.replace(/"/g, '')}"`;
    const script = [
      '@echo off',
      'set n=0',
      // Prøver å flytte app.asar til launcheren har sluppet fila (maks ca. 60 sekunder)
      ':retry',
      'ping -n 2 127.0.0.1 >nul',
      `move /Y ${q(path.join(res, 'app.asar'))} ${q(path.join(res, 'app.asar.old'))} >nul 2>&1`,
      'if not errorlevel 1 goto swap',
      'set /a n+=1',
      'if %n% geq 60 goto start',
      'goto retry',
      ':swap',
      `move /Y ${q(downloaded.file)} ${q(path.join(res, 'app.asar'))} >nul 2>&1`,
      `if errorlevel 1 move /Y ${q(path.join(res, 'app.asar.old'))} ${q(path.join(res, 'app.asar'))} >nul 2>&1`,
      `del /F /Q ${q(path.join(res, 'app.asar.old'))} >nul 2>&1`,
      ':start',
      `start "" ${q(process.execPath)}`,
      '(goto) 2>nul & del "%~f0"',
    ].join('\r\n');
    const file = path.join(app.getPath('temp'), `fivem-norge-oppdatering-${Date.now()}.cmd`);
    fs.writeFileSync(file, script);
    const child = spawn('cmd.exe', ['/d', '/c', file], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    setTimeout(() => app.exit(0), 300);
    return true;
  }
  const child = spawn(downloaded.file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => app.exit(0), 300);
  return true;
}
const downloadedVersion = () => downloaded?.version || null;

// ---------- Data ----------
const DATA_FILES = ['settings.json', 'activity.json', 'history.json', 'watch.json', 'notes.json', 'launcher-data.json', 'discord-invites.json'];
function resetAll() {
  const dir = app.getPath('userData');
  for (const f of DATA_FILES) fs.rmSync(path.join(dir, f), { force: true });
  fs.rmSync(path.join(dir, 'icon-cache'), { recursive: true, force: true });
  applyAutostart(false);
  // app.exit hopper over 'before-quit', så ingen data i minnet skrives tilbake
  app.relaunch();
  app.exit(0);
}

const openDataDir = () => shell.openPath(app.getPath('userData'));

module.exports = {
  info, checkUpdate, uninstall, applyAutostart, startedHidden, setTray, hasTray, resetAll, openDataDir, cmpVersion,
  configureTrayMenu, refreshTrayMenu, downloadUpdate, installUpdate, downloadedVersion,
};
