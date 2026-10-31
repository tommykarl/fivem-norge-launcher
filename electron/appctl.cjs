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

// ---------- Oppdateringer (GitHub Releases) ----------
// Sett UPDATE_REPO=brukernavn/repo i .env for å skru på oppdateringssjekk.
function updateRepo() {
  const r = String(process.env.UPDATE_REPO || '').trim();
  return /^[\w.-]+\/[\w.-]+$/.test(r) ? r : null;
}

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
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FiveMNorgeLauncher' },
  });
  if (res.status === 404) return { configured: true, current, latest: null, newer: false, note: 'Ingen utgivelser funnet ennå' };
  if (!res.ok) throw new Error(`GitHub svarte med ${res.status}`);
  const rel = await res.json();
  const latest = String(rel.tag_name || '').replace(/^v/i, '');
  const wantPortable = isPortable();
  const asset = (rel.assets || []).find((a) =>
    /\.exe$/i.test(a.name) && (wantPortable ? /portable/i.test(a.name) : /setup/i.test(a.name))
  );
  return {
    configured: true,
    current,
    latest,
    newer: cmpVersion(latest, current) > 0,
    url: asset?.browser_download_url || rel.html_url,
    canInstall: !!asset && !wantPortable && app.isPackaged && process.platform === 'win32',
    notes: String(rel.body || '').slice(0, 1500),
    publishedAt: rel.published_at,
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
// Laster ned installeren fra GitHub-releasen og kjører den stille (/S) med --force-run,
// så launcheren starter igjen av seg selv etterpå.
let downloaded = null; // { version, file }
async function downloadUpdate(u, onProgress) {
  if (!u?.url || !/^https:\/\/(github\.com|objects\.githubusercontent\.com)\//i.test(u.url) || !/\.exe($|\?)/i.test(u.url)) {
    throw new Error('Fant ingen installer å laste ned i utgivelsen');
  }
  if (isPortable()) throw new Error('Den portable versjonen oppdateres ved å laste ned ny .exe');
  if (downloaded?.version === u.latest && fs.existsSync(downloaded.file)) return downloaded;
  const res = await fetch(u.url, { headers: { 'User-Agent': 'FiveMNorgeLauncher' }, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Nedlasting feilet (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const file = path.join(app.getPath('temp'), `FiveM-Norge-Launcher-Setup-${u.latest}.exe`);
  const out = fs.createWriteStream(file);
  let got = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      if (total && onProgress) onProgress(Math.round((got / total) * 100));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  if (total && got !== total) throw new Error('Nedlastingen ble avbrutt');
  downloaded = { version: u.latest, file };
  return downloaded;
}

function installUpdate() {
  if (!downloaded || !fs.existsSync(downloaded.file)) throw new Error('Ingen oppdatering er lastet ned');
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
