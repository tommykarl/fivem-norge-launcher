const path = require('path');
const { spawn } = require('child_process');
const { app, BrowserWindow, ipcMain, shell, Notification, session: electronSession } = require('electron');

// Leser .env fra (1) prosjektmappa/app-pakken, (2) mappa der .exe ligger, (3) %APPDATA%\FiveM Norge Launcher
// Første verdi som finnes vinner, så en .env ved siden av .exe kan overstyre den innebygde.
const envPaths = [
  path.join(path.dirname(process.execPath), '.env'),
  path.join(process.env.APPDATA || '', 'FiveM Norge Launcher', '.env'),
  path.join(__dirname, '..', '.env'),
];
for (const p of envPaths) require('dotenv').config({ path: p });

const fivem = require('./fivem.cjs');
const discord = require('./discord.cjs');
const store = require('./store.cjs');
const icons = require('./icons.cjs');
const fivemCache = require('./fivemCache.cjs');
const features = require('./features.cjs');
const presence = require('./presence.cjs');
const communities = require('./communities.cjs');
const appctl = require('./appctl.cjs');
const { CFX_HEADERS } = require('./cfxHttp.cjs');
const status = require('./status.cjs');
const backend = require('./backend.cjs');
const { jsonFile } = require('./jsonfile.cjs');
const versionFile = jsonFile('version.json', { last: null, notes: {} });

process.on('uncaughtException', (e) => {
  console.error(e);
  try {
    backend.reportError(e, 'main');
  } catch {
    /* ignorer */
  }
});
process.on('unhandledRejection', (e) => {
  try {
    backend.reportError(e, 'main');
  } catch {
    /* ignorer */
  }
});

// Må registreres før appen er klar
icons.registerScheme();

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

let win;
let session = null;
let quitting = false;
let trayHintShown = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 620,
    frame: false,
    backgroundColor: '#07090E',
    icon: path.join(__dirname, 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    // Startet automatisk med Windows og systemstatusfelt er på: start skjult
    if (!(appctl.startedHidden() && appctl.hasTray())) win.show();
  });
  // Med systemstatusfelt på skjuler lukk-knappen vinduet i stedet for å avslutte,
  // så varsler og kø fortsetter å virke.
  win.on('close', (e) => {
    if (!quitting && appctl.hasTray()) {
      e.preventDefault();
      win.hide();
      if (!trayHintShown) {
        trayHintShown = true;
        notify('Launcheren kjører i bakgrunnen', 'Varsler og kø virker fortsatt. Høyreklikk ikonet ved klokka for å avslutte.');
      }
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

// Når vi bare kjører én instans, sørg for at et nytt forsøk åpner eksisterende vindu
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // Nødvendig for at Windows-varsler skal vises med riktig navn
    if (process.platform === 'win32') app.setAppUserModelId('no.fivemnorge.launcher');
    session = store.loadSession();
    icons.registerHandler(fivem.iconVersion);
    // FiveM sitt API vil ha Origin/Referer fra servers.fivem.net. Legg dem på alle kall
    // fra appen (blant annet <img> med logoer), så bildene lastes som på FiveM sin nettside.
    electronSession.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://frontend.cfx-services.net/*', 'https://servers-frontend.fivem.net/*', 'https://cfx-server-metadata.cfx-services.net/*'] },
      (details, cb) => {
        const h = { ...details.requestHeaders };
        for (const k of Object.keys(h)) if (/^(origin|referer)$/i.test(k)) delete h[k];
        cb({ requestHeaders: { ...h, Origin: CFX_HEADERS.Origin, Referer: CFX_HEADERS.Referer } });
      }
    );
    features.init({
      fivem,
      isFiveMRunning: fivemCache.isFiveMRunning,
      detectServer: fivemCache.detectServer,
      connect: connectTo,
      notify,
      presence,
      emit: (ch, payload) => {
        win?.webContents.send(ch, payload);
        if (ch === 'activity:changed') refreshTray();
      },
    });
    const st = features.getSettings();
    backend.init(process.env.BACKEND_URL, {
      emit: (ch) => win?.webContents.send(ch),
      telemetry: () => features.getSettings().telemetry,
      getDiscordToken: () => session?.token || null,
      getLauncherToken: () => session?.fnlToken || null,
      setLauncherToken: (t) => {
        if (!session) return;
        session.fnlToken = t || null;
        store.saveSession(session);
      },
      servers: () => fivem.cachedServers(),
      activity: () => features.getActivity(),
      // Utestengt: logg ut av Discord i launcheren og vis beskjed
      onBanned: (acc) => {
        session = null;
        communities.reset();
        store.saveSession(null);
        win?.webContents.send('backend:banned', acc.banReason || null);
      },
    });
    presence.configure(CLIENT_ID, st.rpc);
    try {
      appctl.setTray(st.tray, () => win);
      appctl.configureTrayMenu(trayItems, (s) => connectTo(s).catch((e) => notify('Kunne ikke koble til', e.message)));
      fivem.onList(() => {
        refreshTray();
        backend.sendSnapshot();
      });
      appctl.applyAutostart(st.autostart);
    } catch (e) {
      console.warn('[oppstart]', e.message);
    }
    createWindow();
    status.start((level, prev) => {
      win?.webContents.send('status:changed', level);
      if (!features.getSettings().notifications) return;
      const msg = {
        outage: ['FiveM har problemer', 'Serverlisten eller andre Cfx.re-tjenester er nede. Se Status i launcheren.'],
        degraded: ['FiveM har delvise problemer', 'Noen Cfx.re-tjenester er trege eller nede.'],
        maintenance: ['Planlagt vedlikehold hos FiveM', 'Se Status i launcheren for detaljer.'],
        ok: ['FiveM er oppe igjen', 'Alle tjenester fungerer.'],
      }[level];
      if (msg && !(level === 'ok' && prev === 'maintenance')) notify(msg[0], msg[1]);
    });
  });
}

app.on('before-quit', () => {
  quitting = true;
  presence.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const requireUser = () => {
  if (!session?.user) throw new Error('Du må logge inn med Discord for å lagre servere');
  return session.user;
};

// ---- Servere ----
ipcMain.handle('servers:list', (_e, force) => fivem.listServers(!!force));
ipcMain.handle('servers:get', (_e, id) => fivem.getServer(String(id)));
function notify(title, body, serverId) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, 'icon.ico'), silent: false });
  n.on('click', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (serverId) win.webContents.send('nav:server', serverId);
  });
  n.show();
  win?.webContents.send('toast', title);
}

// Innhold i hurtigmenyen ved klokka
function trayItems() {
  const live = new Map(fivem.cachedServers().map((x) => [x.id, x]));
  const fmt = (r) => {
    const l = live.get(r.id);
    return { id: r.id, name: r.name || r.id, live: l ? `${l.clients}/${l.max}` : '', offline: false };
  };
  const saved = session?.user ? store.getFavorites(session.user.id).map(fmt) : [];
  return { saved, recent: features.getRecent().map(fmt) };
}
const refreshTray = () => {
  try {
    appctl.refreshTrayMenu();
  } catch {
    /* ignorer */
  }
};

async function connectTo(server) {
  const id = String(server?.id || '');
  if (!/^[a-z0-9]{4,10}$/i.test(id)) throw new Error('Ugyldig server-ID');
  const name = String(server.name || id).slice(0, 120);
  features.addRecent({ id, name });
  features.startSession({ id, name });
  backend.reportConnect(id);
  win?.webContents.send('activity:changed');
  refreshTray();
  await launchFiveM(`cfx.re/join/${id}`);
  makeRoomForGame();
  return true;
}

function makeRoomForGame() {
  const onLaunch = features.getSettings().onLaunch;
  if (onLaunch === 'minimize') win?.minimize();
  else if (onLaunch === 'tray' && appctl.hasTray()) win?.hide();
  else if (onLaunch === 'tray') win?.minimize();
}

ipcMain.handle('servers:connect', (_e, server) => connectTo(typeof server === 'string' ? { id: server } : server));

// Direkte tilkobling: cfx.re/join-lenke, server-ID eller IP/vertsnavn med port
const ADDR_RE = /^((\d{1,3}\.){3}\d{1,3}|([a-z0-9-]+\.)+[a-z]{2,})(:\d{2,5})?$/i;
async function connectAddress(input) {
  const raw = String(input || '').trim().replace(/^fivem:\/\/connect\//i, '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const join = raw.match(/^(?:www\.)?cfx\.re\/join\/([a-z0-9]{4,10})$/i) || raw.match(/^([a-z0-9]{4,10})$/i);
  if (join && !/^\d+$/.test(join[1])) {
    const id = join[1].toLowerCase();
    const known = fivem.cachedServers().find((s) => s.id === id);
    await connectTo({ id, name: known?.name || id });
    return { kind: 'cfx', id, name: known?.name || id };
  }
  if (!ADDR_RE.test(raw)) throw new Error('Skriv en cfx.re/join-lenke, server-ID eller IP-adresse (f.eks. 123.45.67.89:30120)');
  const addr = /:\d+$/.test(raw) ? raw : `${raw}:30120`;
  features.startSession({ id: null, name: addr });
  await launchFiveM(addr);
  makeRoomForGame();
  return { kind: 'ip', addr };
}
ipcMain.handle('servers:connectAddress', (_e, input) => connectAddress(input));

async function launchFiveM(target) {
  const url = `fivem://connect/${target}`;
  if (process.platform === 'win32') {
    // FiveM nekter å starte hvis foreldreprosessen ikke er Utforsker eller en nettleser
    // ("This application should be launched directly from the shell or a web browser").
    // Vi lar derfor explorer.exe åpne lenken, så FiveM får explorer som forelder.
    const child = spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => shell.openExternal(url));
    child.unref();
  } else {
    await shell.openExternal(url);
  }
}

// ---- Discord ----
ipcMain.handle('auth:session', async () => {
  if (!session) return null;
  try {
    // Oppdater brukerinfo (navn/avatar) og verifiser at token fortsatt er gyldig
    session.user = await discord.fetchUser(session.token);
    store.saveSession(session);
  } catch (e) {
    if (/401/.test(e.message)) {
      session = null;
      store.saveSession(null);
    }
  }
  return session?.user || null;
});

ipcMain.handle('auth:login', async () => {
  session = await discord.login(CLIENT_ID, win);
  store.saveSession(session);
  const acc = await backend.hello(true);
  if (acc?.banned) throw new Error(`Kontoen din er utestengt fra FiveM Norge Launcher${acc.banReason ? `: ${acc.banReason}` : ''}`);
  return session.user;
});

ipcMain.handle('auth:logout', () => {
  session = null;
  backend.clearAccount();
  communities.reset();
  store.saveSession(null);
  return true;
});

// ---- Favoritter (lagres per Discord-bruker) ----
ipcMain.handle('fav:list', () => (session?.user ? store.getFavorites(session.user.id) : []));
ipcMain.handle('fav:toggle', (_e, server) => {
  const r = store.toggleFavorite(requireUser().id, server);
  refreshTray();
  return r;
});

// ---- Nylig spilt, spilletid, historikk ----
ipcMain.handle('activity:get', () => features.getActivity());
ipcMain.handle('history:server', (_e, id) => features.serverHistory(String(id), 24));
ipcMain.handle('history:bestTimes', (_e, id, max) => features.bestTimes(String(id), Number(max) || 0));
ipcMain.handle('stats:weekly', () => features.weekly());

// ---- Notater og egne merker ----
ipcMain.handle('notes:get', () => features.getNotes());
ipcMain.handle('notes:set', (_e, id, name, patch) => features.setNote(String(id), String(name || ''), patch || {}));
ipcMain.handle('history:trending', () => features.trending(5));

// ---- Egen backend (kunngjøringer, serverinnstillinger, statistikk) ----
ipcMain.handle('backend:state', () => backend.state());
ipcMain.handle('backend:refresh', async () => {
  await backend.refresh();
  return backend.state();
});
ipcMain.handle('backend:api', (_e, method, path, body) => backend.api(method, path, body));
ipcMain.handle('backend:share', (_e, on) => backend.setShareStatus(on));
ipcMain.on('report:error', (_e, err) => backend.reportError({ message: String(err?.message || ''), stack: String(err?.stack || '') }, 'renderer'));

// ---- FiveM-status ----
ipcMain.handle('status:get', (_e, force) => status.get(!!force));

// ---- Varsler / auto-join ----
ipcMain.handle('watch:list', () => features.getWatch());
ipcMain.handle('watch:set', (_e, id, name, patch) => features.setWatch(String(id), String(name || ''), patch || {}));

// ---- Discord-fellesskap ----
ipcMain.handle('discord:communities', async () => {
  const servers = await fivem.listServers(false).catch(() => fivem.cachedServers());
  return communities.find(session, servers);
});

// ---- Innstillinger ----
ipcMain.handle('settings:get', () => features.getSettings());
ipcMain.handle('settings:set', (_e, patch) => {
  const s = features.setSettings(patch);
  presence.configure(CLIENT_ID, s.rpc);
  appctl.setTray(s.tray, () => win);
  refreshTray();
  appctl.applyAutostart(s.autostart);
  return s;
});

// ---- Om appen / oppdateringer / data ----
ipcMain.handle('app:info', () => appctl.info());
ipcMain.handle('app:checkUpdate', async () => {
  const u = await appctl.checkUpdate();
  if (u?.latest && u.notes) {
    const f = versionFile.get();
    f.notes = { ...(f.notes || {}), [u.latest]: u.notes };
    versionFile.save();
  }
  return u;
});
// «Nytt i denne versjonen»: vises én gang etter at launcheren er oppdatert
ipcMain.handle('app:whatsNew', async () => {
  const f = versionFile.get();
  const current = app.getVersion();
  const prev = f.last;
  if (prev === current) return null;
  f.last = current;
  versionFile.save(true);
  if (!prev) return null; // første oppstart etter installasjon
  let notes = f.notes?.[current] || '';
  if (!notes) {
    try {
      const u = await appctl.checkUpdate();
      if (u?.latest === current) notes = u.notes || '';
    } catch {
      /* uten nett: vis uten tekst */
    }
  }
  return { version: current, previous: prev, notes };
});
ipcMain.handle('app:downloadUpdate', async (_e, u) => {
  const r = await appctl.downloadUpdate(u, (pct) => win?.webContents.send('update:progress', pct));
  return { version: r.version };
});
ipcMain.handle('app:installUpdate', () => {
  quitting = true;
  return appctl.installUpdate();
});
ipcMain.handle('app:uninstall', () => appctl.uninstall());
ipcMain.handle('app:openDataDir', () => appctl.openDataDir());
ipcMain.handle('data:clearHistory', () => {
  features.clearHistory();
  return true;
});
ipcMain.handle('data:resetAll', () => appctl.resetAll());

// ---- Cache ----
async function cacheInfo() {
  const http = await electronSession.defaultSession.getCacheSize();
  return { bytes: icons.size() + http };
}
ipcMain.handle('debug:icons', async () => {
  const list = (await fivem.listServers(false).catch(() => fivem.cachedServers())).slice(0, 3);
  const out = [];
  for (const s of list) {
    const raw = fivem.cachedRaw(s.id);
    const v = raw?.iconVersion || 0;
    const url = fivem.iconUrlOf(raw?.vars);
    let results = [];
    if (url) {
      try {
        const r = await electronSession.defaultSession.fetch(url);
        results = [{ url, status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength }];
      } catch (e) {
        results = [{ url, error: e.message }];
      }
    } else if (v) {
      results = await icons.diagnose(s.id, v);
    }
    out.push({ id: s.id, name: s.name, iconVersion: v, iconUrl: url, results });
  }
  return out;
});
ipcMain.handle('cache:info', cacheInfo);
ipcMain.handle('cache:clear', async () => {
  icons.clear();
  fivem.clearCache();
  await electronSession.defaultSession.clearCache();
  return cacheInfo();
});

// ---- FiveM sin egen cache ----
ipcMain.handle('fivemcache:info', () => fivemCache.info());
ipcMain.handle('fivemcache:clear', (_e, keys) => fivemCache.clear(Array.isArray(keys) ? keys : []));

// ---- Vindu ----
ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on('win:close', () => win?.close());
ipcMain.on('app:quit', () => {
  quitting = true;
  app.quit();
});

ipcMain.handle('open:external', (_e, url) => {
  if (typeof url !== 'string') return false;
  // https-lenker, og egen backend (kan være http://localhost når den kjøres lokalt)
  const own = backend.state().url;
  if (/^https:\/\//i.test(url) || (own && (url === own || url.startsWith(`${own}/`)))) return shell.openExternal(url);
  return false;
});
