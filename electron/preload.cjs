const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  servers: {
    list: (force = false) => ipcRenderer.invoke('servers:list', force),
    get: (id) => ipcRenderer.invoke('servers:get', id),
    connect: (server) => ipcRenderer.invoke('servers:connect', { id: server.id, name: server.name }),
    connectAddress: (input) => ipcRenderer.invoke('servers:connectAddress', input),
  },
  auth: {
    session: () => ipcRenderer.invoke('auth:session'),
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  favorites: {
    list: () => ipcRenderer.invoke('fav:list'),
    toggle: (server) => ipcRenderer.invoke('fav:toggle', { id: server.id, name: server.name }),
  },
  activity: {
    get: () => ipcRenderer.invoke('activity:get'),
  },
  history: {
    server: (id) => ipcRenderer.invoke('history:server', id),
    trending: () => ipcRenderer.invoke('history:trending'),
    bestTimes: (id, max) => ipcRenderer.invoke('history:bestTimes', id, max),
    weekly: () => ipcRenderer.invoke('stats:weekly'),
  },
  watch: {
    list: () => ipcRenderer.invoke('watch:list'),
    set: (server, patch) => ipcRenderer.invoke('watch:set', server.id, server.name, patch),
  },
  notes: {
    get: () => ipcRenderer.invoke('notes:get'),
    set: (server, patch) => ipcRenderer.invoke('notes:set', server.id, server.name, patch),
  },
  backend: {
    state: () => ipcRenderer.invoke('backend:state'),
    refresh: () => ipcRenderer.invoke('backend:refresh'),
    api: (method, path, body) => ipcRenderer.invoke('backend:api', method, path, body),
    setShare: (on) => ipcRenderer.invoke('backend:share', on),
    reportBug: (report) => ipcRenderer.invoke('backend:reportBug', report),
    reportError: (err) => ipcRenderer.send('report:error', { message: String(err?.message || err), stack: String(err?.stack || '') }),
  },
  status: {
    get: (force = false) => ipcRenderer.invoke('status:get', force),
  },
  discord: {
    communities: () => ipcRenderer.invoke('discord:communities'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
  // Hendelser fra hovedprosessen. Returnerer en funksjon som fjerner lytteren.
  on: (channel, fn) => {
    const allowed = ['toast', 'nav:server', 'watch:changed', 'activity:changed', 'status:changed', 'update:progress', 'backend:changed', 'backend:banned'];
    if (!allowed.includes(channel)) return () => {};
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  fivemCache: {
    info: () => ipcRenderer.invoke('fivemcache:info'),
    clear: (keys) => ipcRenderer.invoke('fivemcache:clear', keys),
  },
  cache: {
    info: () => ipcRenderer.invoke('cache:info'),
    clear: () => ipcRenderer.invoke('cache:clear'),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
    whatsNew: () => ipcRenderer.invoke('app:whatsNew'),
    downloadUpdate: (u) => ipcRenderer.invoke('app:downloadUpdate', u),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
    uninstall: () => ipcRenderer.invoke('app:uninstall'),
    openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
    debugIcons: () => ipcRenderer.invoke('debug:icons'),
    quit: () => ipcRenderer.send('app:quit'),
  },
  data: {
    clearHistory: () => ipcRenderer.invoke('data:clearHistory'),
    resetAll: () => ipcRenderer.invoke('data:resetAll'),
  },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
  },
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
});
