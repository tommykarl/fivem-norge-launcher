import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import TitleBar from './components/TitleBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import CacheModal from './components/CacheModal.jsx';
import HomePage from './pages/HomePage.jsx';
import ServersPage from './pages/ServersPage.jsx';
import ServerPage from './pages/ServerPage.jsx';
import FriendsPage from './pages/FriendsPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import WhatsNewModal from './components/WhatsNewModal.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import StatusPage from './pages/StatusPage.jsx';
import ComparePage from './pages/ComparePage.jsx';
import ConnectModal from './components/ConnectModal.jsx';
import ShortcutsModal from './components/ShortcutsModal.jsx';
import Announcements from './components/Announcements.jsx';
import { api, errText } from './api.js';

const BACK_LABELS = { home: 'Hjem', servers: 'Alle servere', saved: 'Lagrede', recent: 'Nylig spilt', settings: 'Innstillinger', status: 'FiveM-status', compare: 'Sammenligning' };

export default function App() {
  const [user, setUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [servers, setServers] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [activity, setActivity] = useState({ recent: [], playtime: {}, totalMs: 0, active: null });
  const [watch, setWatch] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [route, setRoute] = useState({ name: 'home' });
  const [modal, setModal] = useState(null); // 'cache' | 'connect' | 'shortcuts'
  const [notes, setNotes] = useState({});
  const [backend, setBackend] = useState({ enabled: false, config: { announcements: [], servers: {} }, account: null });
  const [banned, setBanned] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [updateState, setUpdateState] = useState(null); // { phase: 'downloading'|'ready'|'error', pct, version, error }
  const [settings, setSettings] = useState(null);
  const [update, setUpdate] = useState(null);
  const [checking, setChecking] = useState(false);
  const routeTouched = useRef(false);
  const [status, setStatus] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [iconKey, setIconKey] = useState(0);
  const [whatsNew, setWhatsNew] = useState(null);
  const toastTimer = useRef(null);
  const mainRef = useRef(null);

  const notify = useCallback((msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const go = useCallback((r) => {
    routeTouched.current = true;
    setRoute((cur) => (r.name === 'server' || r.name === 'compare' ? { ...r, from: ['server', 'compare'].includes(cur.name) ? cur.from : cur.name } : r));
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const loadServers = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setServers(await api.servers.list(force));
    } catch (e) {
      setError(errText(e) || 'Ukjent feil');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(() => api.activity.get().then(setActivity).catch(() => {}), []);
  const loadWatch = useCallback(() => api.watch.list().then(setWatch).catch(() => {}), []);
  const loadNotes = useCallback(() => api.notes.get().then(setNotes).catch(() => {}), []);
  const loadBackend = useCallback(() => api.backend.state().then((b) => {
    setBackend(b);
    if (b.account?.banned) setBanned({ reason: b.account.banReason });
  }).catch(() => {}), []);
  const loadStatus = useCallback(async (force = false) => {
    setStatusBusy(true);
    try {
      setStatus(await api.status.get(force));
    } catch {
      /* vises som «sjekker» */
    } finally {
      setStatusBusy(false);
    }
  }, []);

  useEffect(() => {
    api.auth.session().then(async (u) => {
      setUser(u);
      if (u) setFavorites(await api.favorites.list());
    });
    loadServers();
    loadActivity();
    loadWatch();
    loadNotes();
    loadBackend();
    loadStatus();
    api.app.whatsNew?.().then((w) => w && setWhatsNew(w)).catch(() => {});
    const st = setInterval(() => loadStatus(), 3 * 60_000);
    api.settings.get().then((st) => {
      setSettings(st);
      if (!routeTouched.current) setRoute({ name: st.startPage || 'home' });
      if (st.autoUpdateCheck) {
        api.app
          .checkUpdate()
          .then((u) => {
            setUpdate(u);
            if (u?.newer && st.autoInstallUpdates && u.canInstall) downloadUpdateRef.current?.(u, true);
            else if (u?.newer) notify(`Versjon ${u.latest} er tilgjengelig – se Innstillinger`);
          })
          .catch(() => {});
      }
    });
    const offs = [
      api.on('toast', notify),
      api.on('watch:changed', loadWatch),
      api.on('activity:changed', loadActivity),
      api.on('status:changed', () => loadStatus()),
      api.on('backend:changed', loadBackend),
      api.on('backend:banned', (reason) => {
        setBanned({ reason });
        setUser(null);
        setFavorites([]);
      }),
      api.on('nav:server', (id) => go({ name: 'server', id })),
      api.on('update:progress', (pct) => setUpdateState((cur) => (cur?.phase === 'downloading' ? { ...cur, pct } : cur))),
    ];
    // Globale hurtigtaster (se ShortcutsModal for liste)
    const NAV_KEYS = { 1: 'home', 2: 'servers', 3: 'saved', 4: 'recent', 5: 'status' };
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const typing = ['input', 'textarea', 'select'].includes((e.target.tagName || '').toLowerCase());
      const modalOpen = !!document.querySelector('.modal-backdrop');
      if (ctrl && k === 'k') {
        e.preventDefault();
        setModal(null);
        setRoute((r) => (['servers', 'saved', 'recent'].includes(r.name) ? r : { name: 'servers' }));
        setFocusSignal((n) => n + 1);
      } else if (ctrl && k === 'l') {
        e.preventDefault();
        setModal('connect');
      } else if (ctrl && NAV_KEYS[e.key]) {
        e.preventDefault();
        setModal(null);
        go({ name: NAV_KEYS[e.key] });
      } else if (ctrl && e.key === ',') {
        e.preventDefault();
        go({ name: 'settings' });
      } else if (e.key === 'F5') {
        e.preventDefault();
        loadServers(true);
      } else if (e.key === '?' && !typing && !modalOpen) {
        e.preventDefault();
        setModal('shortcuts');
      } else if (e.key === 'Escape' && !modalOpen && !typing) {
        setRoute((r) => (r.name === 'server' || r.name === 'compare' ? { name: r.from || 'servers' } : r));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(st);
      offs.forEach((off) => off());
      window.removeEventListener('keydown', onKey);
    };
  }, [loadServers, loadActivity, loadWatch, loadNotes, loadBackend, loadStatus, notify, go]);

  // Oppdater serverlisten med intervallet fra innstillingene
  const refreshMin = settings?.refreshMin || 2;
  useEffect(() => {
    const t = setInterval(() => loadServers(true), refreshMin * 60_000);
    return () => clearInterval(t);
  }, [refreshMin, loadServers]);

  const setSetting = async (patch) => {
    setSettings((cur) => ({ ...cur, ...patch }));
    try {
      setSettings(await api.settings.set(patch));
    } catch (e) {
      notify(errText(e));
    }
  };

  const checkUpdate = async () => {
    setChecking(true);
    try {
      const u = await api.app.checkUpdate();
      setUpdate(u);
      if (!u.configured) notify('Oppdateringssjekk er ikke satt opp');
      else if (u.newer) notify(`Versjon ${u.latest} er tilgjengelig`);
      else notify('Du har nyeste versjon');
    } catch (e) {
      notify(errText(e));
    } finally {
      setChecking(false);
    }
  };

  // Automatisk oppdatering: last ned → «Start på nytt og oppdater»
  const downloadUpdate = useCallback(async (u, silent = false) => {
    setUpdateState({ phase: 'downloading', pct: 0, version: u.latest });
    try {
      const r = await api.app.downloadUpdate(u);
      setUpdateState({ phase: 'ready', version: r.version });
      notify(`Versjon ${r.version} er klar – start på nytt for å oppdatere`);
    } catch (e) {
      setUpdateState({ phase: 'error', error: errText(e) });
      if (!silent) notify(errText(e));
    }
  }, [notify]);
  const downloadUpdateRef = useRef(null);
  downloadUpdateRef.current = downloadUpdate;
  const installUpdate = () => api.app.installUpdate().catch((e) => notify(errText(e)));

  // Tema og aksentfarge settes på <html>, så CSS-variablene slår inn overalt
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const t = settings?.theme || 'dark';
      const sysLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
      root.dataset.theme = t === 'system' ? (sysLight ? 'light' : 'dark') : t;
      root.dataset.accent = settings?.accent || 'red';
    };
    apply();
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [settings?.theme, settings?.accent]);

  // Notater
  const saveNote = async (server, patch) => {
    try {
      setNotes(await api.notes.set(server, patch));
    } catch (e) {
      notify(errText(e));
    }
  };
  const allTags = useMemo(() => [...new Set(Object.values(notes).flatMap((n) => n.tags || []))], [notes]);

  // Sammenligning (maks 3)
  const toggleCompare = (s) => {
    setCompareIds((cur) => {
      if (cur.includes(s.id)) return cur.filter((x) => x !== s.id);
      if (cur.length >= 3) {
        notify('Du kan sammenligne maks 3 servere');
        return cur;
      }
      return [...cur, s.id];
    });
  };

  const favIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  // Serverinnstillinger fra adminpanelet: skjul, verifiser og fremhev
  const shownServers = useMemo(() => {
    const ov = backend.config?.servers || {};
    return servers
      .filter((s) => !ov[s.id]?.hidden)
      .map((s) => (ov[s.id] ? { ...s, verified: !!ov[s.id].verified, featured: !!ov[s.id].featured, connect: ov[s.id].connect || null } : s));
  }, [servers, backend.config]);
  const totalPlayers = useMemo(() => shownServers.reduce((n, s) => n + s.clients, 0), [shownServers]);

  const login = async () => {
    setAuthBusy(true);
    try {
      const u = await api.auth.login();
      setUser(u);
      setFavorites(await api.favorites.list());
      notify(`Logget inn som ${u.displayName}`);
    } catch (e) {
      notify(errText(e));
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
    setFavorites([]);
  };

  const toggleFavorite = async (server) => {
    if (!user) return notify('Logg inn med Discord for å lagre servere');
    try {
      const was = favIds.has(server.id);
      setFavorites(await api.favorites.toggle(server));
      notify(was ? `Fjernet ${server.name}` : `Lagret ${server.name}`);
    } catch (e) {
      notify(errText(e));
    }
  };

  const connect = async (server) => {
    try {
      await api.servers.connect(server);
      notify(`Starter FiveM og kobler til ${server.name}`);
      loadActivity();
    } catch (e) {
      notify(errText(e));
    }
  };

  const setWatchFor = async (server, patch) => {
    try {
      setWatch(await api.watch.set(server, patch));
      if (patch.autoJoin === true) notify(`Du står i kø – kobler til ${server.name} når det blir ledig`);
      else if (patch.autoJoin === false) notify('Fjernet fra kø');
    } catch (e) {
      notify(errText(e));
    }
  };

  const openServer = (s) => go({ name: 'server', id: s.id, title: s.name });

  // Server for serversiden: fra listen, ellers fra lagrede/nylig spilt (kan være offline)
  const routeServer = useMemo(() => {
    if (route.name !== 'server') return null;
    const live = shownServers.find((s) => s.id === route.id) || servers.find((s) => s.id === route.id);
    if (live) return live;
    const known = favorites.find((f) => f.id === route.id) || activity.recent.find((r) => r.id === route.id);
    return { id: route.id, name: known?.name || route.title || route.id, clients: 0, max: 0, tags: [], offline: true };
  }, [route, servers, shownServers, favorites, activity.recent]);

  // Rolle synkes fra adminpanelet på nettsiden (roleInfo.staff = rollen har minst én tilgang)
  const isStaff = !backend.account?.banned && (backend.account?.roleInfo ? !!backend.account.roleInfo.staff : ['owner', 'admin', 'moderator'].includes(backend.account?.role));
  const counts = { servers: shownServers.length, saved: favorites.length, recent: activity.recent.length };

  return (
    <div className={`app${settings?.compact ? ' compact' : ''}`}>
      <TitleBar />
      <div className="body">
        <Sidebar
          user={user}
          authBusy={authBusy}
          onLogin={login}
          onLogout={logout}
          route={route}
          go={go}
          counts={counts}
          totalPlayers={totalPlayers}
          updateAvailable={!!update?.newer}
          statusLevel={status?.level}
          isStaff={isStaff}
          roleInfo={backend.account?.banned ? null : backend.account?.roleInfo}
          showFriends={!!backend.enabled}
        />

        <main className="main" ref={mainRef} key={iconKey}>
          <Announcements items={backend.config?.announcements || []} banned={banned} />
          {route.name === 'home' && (
            <HomePage
              user={user}
              servers={shownServers}
              favorites={favorites}
              activity={activity}
              watch={watch}
              totalPlayers={totalPlayers}
              onOpen={openServer}
              onPlay={connect}
              go={go}
              onLogin={login}
              authBusy={authBusy}
            />
          )}

          {['servers', 'saved', 'recent'].includes(route.name) && (
            <ServersPage
              view={route.name}
              servers={shownServers}
              favorites={favorites}
              favIds={favIds}
              user={user}
              activity={activity}
              watch={watch}
              hideEmpty={!!settings?.hideEmpty}
              loading={loading}
              error={error}
              focusSignal={focusSignal}
              onRefresh={() => loadServers(true)}
              onOpen={openServer}
              onFav={toggleFavorite}
              onPlay={connect}
              onQueue={(s) => setWatchFor(s, { autoJoin: !watch[s.id]?.autoJoin })}
              onLogin={login}
              authBusy={authBusy}
              onStatus={() => go({ name: 'status' })}
              notes={notes}
              compareIds={compareIds}
              onCompare={toggleCompare}
              onConnectDirect={() => setModal('connect')}
            />
          )}

          {route.name === 'friends' && (
            <FriendsPage
              user={user}
              account={backend.account}
              onLogin={login}
              authBusy={authBusy}
              onPlay={connect}
              notify={notify}
              onShareChanged={loadBackend}
            />
          )}

          {route.name === 'admin' && !isStaff && (
            <div className="page"><div className="empty"><p>Du har ikke lenger tilgang til admin. Rollen din er endret i adminpanelet.</p></div></div>
          )}
          {route.name === 'admin' && isStaff && <AdminPage account={backend.account} adminUrl={backend.adminUrl} notify={notify} />}

          {route.name === 'status' && (
            <StatusPage status={status} onRefresh={() => loadStatus(true)} refreshing={statusBusy} />
          )}

          {route.name === 'compare' && (
            <ComparePage
              servers={shownServers}
              ids={compareIds}
              favIds={favIds}
              activity={activity}
              notes={notes}
              onRemove={(id) => setCompareIds((cur) => cur.filter((x) => x !== id))}
              onBack={() => go({ name: route.from || 'servers' })}
              onOpen={openServer}
              onPlay={connect}
              onFav={toggleFavorite}
            />
          )}

          {route.name === 'settings' && (
            <SettingsPage
              settings={settings}
              setSetting={setSetting}
              user={user}
              authBusy={authBusy}
              onLogin={login}
              onLogout={logout}
              onOpenCache={() => setModal('cache')}
              update={update}
              updateState={updateState}
              onDownloadUpdate={() => update && downloadUpdate(update)}
              onInstallUpdate={installUpdate}
              onShowShortcuts={() => setModal('shortcuts')}
              backend={backend}
              onRefreshBackend={async () => setBackend(await api.backend.refresh())}
              onCheckUpdate={checkUpdate}
              checking={checking}
              notify={notify}
            />
          )}

          {routeServer && (
            <ServerPage
              key={routeServer.id}
              server={routeServer}
              favorite={favIds.has(routeServer.id)}
              watch={watch}
              activity={activity}
              backLabel={BACK_LABELS[route.from] || 'Tilbake'}
              onBack={() => go({ name: route.from || 'servers' })}
              onFav={() => toggleFavorite(routeServer)}
              onPlay={() => connect(routeServer)}
              onWatch={(patch) => setWatchFor(routeServer, patch)}
              notify={notify}
              note={notes[routeServer.id]}
              allTags={allTags}
              onSaveNote={(patch) => saveNote(routeServer, patch)}
              user={user}
              backendEnabled={!!backend.enabled}
            />
          )}
        </main>
      </div>

      {compareIds.length > 0 && route.name !== 'compare' && (
        <div className="compare-bar" role="region" aria-label="Sammenligning">
          <span>
            <b>{compareIds.length}</b> av 3 valgt:{' '}
            {compareIds.map((id) => servers.find((s) => s.id === id)?.name || id).join(', ')}
          </span>
          <button className="btn" onClick={() => setCompareIds([])}>Tøm</button>
          <button className="btn play" disabled={compareIds.length < 2} onClick={() => go({ name: 'compare', from: route.name })}>
            Sammenlign
          </button>
        </div>
      )}

      {modal === 'connect' && <ConnectModal onClose={() => setModal(null)} notify={notify} onConnected={loadActivity} />}
      {modal === 'shortcuts' && <ShortcutsModal onClose={() => setModal(null)} />}
      {whatsNew && <WhatsNewModal info={whatsNew} onClose={() => setWhatsNew(null)} />}

      {modal === 'cache' && (
        <CacheModal
          onClose={() => setModal(null)}
          onDone={notify}
          onLauncherCleared={async () => {
            setIconKey((k) => k + 1);
            await loadServers(true);
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={16} strokeWidth={2.4} /> {toast}
        </div>
      )}
    </div>
  );
}
