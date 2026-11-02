const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { app, BrowserWindow, ipcMain, shell, Notification, dialog, session: electronSession } = require('electron');

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
  // Roller kan ha blitt endret i adminpanelet mens vinduet var i bakgrunnen
  win.on('focus', () => backend.syncAccount(false));
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

// ---------- fivemnorge://-lenker fra nettsiden («Spill nå», gruppekø) ----------
const PROTOCOL = 'fivemnorge';
try {
  if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient(PROTOCOL, process.env.PORTABLE_EXECUTABLE_FILE || process.execPath);
} catch (e) {
  console.warn('[lenker]', e.message);
}
let pendingLink = null;
let appReady = false;
const linkFrom = (argv) => (argv || []).find((a) => typeof a === 'string' && a.toLowerCase().startsWith(`${PROTOCOL}://`)) || null;
async function handleLink(raw) {
  if (!raw) return;
  if (!appReady) {
    pendingLink = raw;
    return;
  }
  const m = String(raw).replace(/^fivemnorge:\/\//i, '').replace(/\/+$/, '').match(/^(connect|queue|server|group)\/([a-z0-9]{4,12})$/i);
  if (!m) return;
  const kind = m[1].toLowerCase();
  const id = m[2].toLowerCase();
  win?.show();
  win?.focus();
  try {
    if (kind === 'group') {
      if (!/^[a-f0-9]{10}$/.test(id)) return;
      await backend.api('POST', `/api/launcher/group/${id}/join`, {}).catch(() => null);
      await backend.pollGroup();
      win?.webContents.send('nav:page', 'friends');
      return;
    }
    if (!/^[a-z0-9]{4,10}$/.test(id)) return;
    const list = await fivem.listServers(false).catch(() => fivem.cachedServers());
    const s = list.find((x) => x.id === id);
    const name = s?.name || id;
    if (kind === 'server') {
      win?.webContents.send('nav:server', id);
      return;
    }
    // Full server (eller «queue»): still i kø, ellers koble til med en gang
    if (kind === 'queue' || (s && s.max && s.clients >= s.max)) {
      features.setWatch(id, name, { autoJoin: true });
      win?.webContents.send('nav:server', id);
      notify(`Du står i kø på ${name}`, 'Launcheren kobler deg til når det blir ledig plass.', id);
    } else {
      win?.webContents.send('nav:server', id);
      await connectTo({ id, name });
      win?.webContents.send('toast', `Starter FiveM og kobler til ${name}`);
    }
  } catch (e) {
    notify('Kunne ikke åpne lenken', e.message);
  }
}

// Når vi bare kjører én instans, sørg for at et nytt forsøk åpner eksisterende vindu
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  pendingLink = linkFrom(process.argv);
  app.on('second-instance', (_e, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    handleLink(linkFrom(argv));
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
      report: (ev) => backend.reportQueue(ev),
      emit: (ch, payload) => {
        win?.webContents.send(ch, payload);
        if (ch === 'activity:changed') refreshTray();
      },
    });
    const st = features.getSettings();
    backend.init(process.env.BACKEND_URL, {
      emit: (ch, payload) => win?.webContents.send(ch, payload),
      telemetry: () => features.getSettings().telemetry,
      getDiscordToken: () => session?.token || null,
      getLauncherToken: () => session?.fnlToken || null,
      setLauncherToken: (t) => {
        if (!session) return;
        session.fnlToken = t || null;
        store.saveSession(session);
      },
      onRoleChanged: (now, before) => {
        if (now.staff && !before.staff) notify('Du har fått en ny rolle', `Du er nå ${now.name} i FiveM Norge. Admin-fanen ligger i menyen.`);
        else if (!now.staff && before.staff) notify('Rollen din er endret', `Du er nå ${now.name} i FiveM Norge.`);
        else win?.webContents.send('toast', `Rollen din er nå ${now.name}`);
      },
      servers: () => fivem.cachedServers(),
      store,
      friendAlerts: () => features.getSettings().friendAlerts !== false && features.getSettings().notifications,
      notifyFriend: (name, playing) => {
        const n = new Notification({ title: `${name} spiller nå`, body: `${playing.name} – klikk for å se serveren`, icon: path.join(__dirname, 'icon.ico'), silent: false });
        n.on('click', () => {
          win?.show();
          win?.focus();
          win?.webContents.send('nav:server', playing.serverId);
        });
        n.show();
      },
      activity: () => features.getActivity(),
      connect: connectTo,
      notify,
      // Varsel fra nettsiden (venneforespørsel, nyhet, gruppe …) som systemvarsel
      notifyItem: (n) => {
        if (!features.getSettings().notifications || !Notification.isSupported()) return;
        const x = new Notification({ title: n.title, body: n.body || '', icon: path.join(__dirname, 'icon.ico') });
        x.on('click', () => {
          win?.show();
          win?.focus();
          backend.readNotifs({ ids: [n.id] }).catch(() => {});
          const srv = /^\/server\/([a-z0-9]{4,10})$/.exec(n.url || '');
          if (srv) win?.webContents.send('nav:server', srv[1]);
          else if (n.kind === 'friend' || n.kind === 'group') win?.webContents.send('nav:page', 'friends');
          else if (n.url && backend.state().url) shell.openExternal(`${backend.state().url}${n.url}`);
        });
        x.show();
      },
      // «Jeg kommer»: påminnelse en time før og når det starter – klikk for å koble til
      eventReminder: (e, kind) => {
        if (!Notification.isSupported()) return;
        let when = '';
        try {
          when = new Date(e.starts_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
        } catch {}
        const x = new Notification({
          title: kind === 'start' ? `${e.title} starter nå` : `${e.title} starter kl ${when}`,
          body: e.server_id ? `${e.server_name || 'Serveren'} – klikk for å koble til` : 'Du har sagt at du kommer',
          icon: path.join(__dirname, 'icon.ico'),
        });
        x.on('click', () => {
          win?.show();
          win?.focus();
          if (e.server_id) connectTo({ id: e.server_id, name: e.server_name || e.server_id }).catch((er) => notify('Kunne ikke koble til', er.message));
        });
        x.show();
        win?.webContents.send('toast', kind === 'start' ? `${e.title} starter nå` : `${e.title} starter kl ${when}`);
      },
      // Logget ut fra Min side (eller nøkkelen er ugyldig)
      onSignedOut: (msg) => {
        session = null;
        communities.reset();
        store.saveSession(null);
        win?.webContents.send('auth:signedOut', msg || 'Du er logget ut');
      },
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
    appReady = true;
    if (pendingLink) win.webContents.once('did-finish-load', () => setTimeout(() => handleLink(pendingLink), 1200));
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

// Egen connect-adresse satt i adminpanelet (f.eks. play.server.no). Hentes fra backenden,
// aldri fra grensesnittet, og må være en ren FiveM-adresse før den brukes.
const CONNECT_RE = /^(?:cfx\.re\/join\/[a-z0-9]{4,10}|(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?::\d{2,5})?)$/i;
function customConnect(id) {
  const c = String(backend.state().config?.servers?.[id]?.connect || '').trim();
  return c && c.length <= 120 && CONNECT_RE.test(c) ? c : null;
}

async function connectTo(server) {
  const id = String(server?.id || '');
  if (!/^[a-z0-9]{4,10}$/i.test(id)) throw new Error('Ugyldig server-ID');
  const name = String(server.name || id).slice(0, 120);
  features.addRecent({ id, name });
  features.startSession({ id, name });
  backend.reportConnect(id);
  win?.webContents.send('activity:changed');
  refreshTray();
  await launchFiveM(customConnect(id) || `cfx.re/join/${id}`);
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
  // Logget inn med kode: ingen Discord-nøkkel å sjekke
  if (!session.token) return session.user || null;
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
  if (acc && !acc.banned) await backend.syncFavorites();
  if (acc?.banned) throw new Error(`Kontoen din er utestengt fra FiveM Norge Launcher${acc.banReason ? `: ${acc.banReason}` : ''}`);
  return session.user;
});

// Logg inn med kode fra Min side på fivemnorge.xyz
ipcMain.handle('auth:codeStart', () => backend.codeStart());
ipcMain.handle('auth:codePoll', async (_e, poll) => {
  // Midlertidig økt, så nøkkelen fra nettsiden har et sted å lagres
  const before = session;
  if (!session) session = { token: null, viaCode: true, user: null, fnlToken: null };
  let r;
  try {
    r = await backend.codePoll(String(poll || ''));
  } catch (e) {
    if (!before) session = null;
    throw e;
  }
  if (r.pending) {
    if (!before) session = null;
    return { pending: true };
  }
  const u = r.user || {};
  session = { ...session, token: before?.token || null, viaCode: !before?.token, user: { id: u.id, username: u.username, displayName: u.name || u.username, avatar: u.avatar } };
  store.saveSession(session);
  if (!r.account?.banned) await backend.syncFavorites();
  return { user: session.user };
});
ipcMain.handle('notifs:get', () => backend.getNotifs());
ipcMain.handle('notifs:read', (_e, body) => backend.readNotifs(body || {}));
ipcMain.handle('group:get', () => backend.pollGroup().then(() => backend.getGroup()));

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
  backend.pushFavorites(r);
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
ipcMain.handle('backend:profile', (_e, on) => backend.setPublicProfile(on));
// Personvern: last ned alt fivemnorge.xyz har om deg, eller slett kontoen
ipcMain.handle('backend:exportData', async () => {
  // Lesbar HTML-side (med rådata nederst). Faller tilbake til JSON hvis nettsiden er eldre.
  let html = null;
  let data = null;
  try {
    html = await backend.exportMyDataHtml();
  } catch {
    data = await backend.exportMyData();
  }
  const ext = html ? 'html' : 'json';
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Lagre dataene dine',
    defaultPath: path.join(app.getPath('downloads'), `fivemnorge-mine-data-${new Date().toISOString().slice(0, 10)}.${ext}`),
    filters: html ? [{ name: 'Nettside', extensions: ['html'] }] : [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, html || JSON.stringify(data, null, 2));
  if (html) shell.openPath(filePath);
  else shell.showItemInFolder(filePath);
  return filePath;
});
ipcMain.handle('backend:deleteAccount', async () => {
  await backend.deleteMyAccount();
  if (session?.user) store.setFavorites(session.user.id, []);
  session = null;
  backend.clearAccount();
  communities.reset();
  store.saveSession(null);
  return true;
});
ipcMain.handle('backend:reportBug', (_e, r) => {
  const os = require('os');
  const system = r?.includeSystem
    ? {
        launcher: app.getVersion(),
        windows: `${os.version?.() || os.type()} ${os.release()}`,
        arkitektur: process.arch,
        electron: process.versions.electron,
        minne: `${Math.round(os.totalmem() / 1024 ** 3)} GB`,
        portabel: process.env.PORTABLE_EXECUTABLE_DIR ? 'ja' : 'nei',
        fivem_kjører: String(features.getActivity().active ? 'ja' : 'nei'),
      }
    : null;
  return backend.reportBug({ title: String(r?.title || ''), description: String(r?.description || ''), contact: String(r?.contact || ''), system });
});
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
