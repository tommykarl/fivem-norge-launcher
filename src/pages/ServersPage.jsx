import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Link2, Loader2, Play, RefreshCw, Search, ServerCrash, Star, TrendingUp, X } from 'lucide-react';
import ServerRow from '../components/ServerRow.jsx';
import ServerIcon from '../components/ServerIcon.jsx';
import Mountains from '../components/Mountains.jsx';
import { formatAgo, formatDuration } from '../api.js';

const CHIPS = [
  { id: 'alle', label: 'Alle' },
  { id: 'ledig', label: 'Ledige plasser' },
  { id: 'fullt', label: 'Fullt' },
  { id: 'verifisert', label: 'Verifisert' },
  { id: 'wl', label: 'Whitelist' },
  { id: 'fav', label: 'Lagrede' },
];

const TITLES = {
  servers: 'Norske servere',
  saved: 'Lagrede servere',
  recent: 'Nylig spilt',
};

const offlineEntry = (id, name, desc) => ({
  id, name, hostname: '', desc, clients: 0, max: 0, tags: [], offline: true,
});

export default function ServersPage({
  view, servers, favorites, favIds, user, activity, watch, hideEmpty, loading, error, focusSignal,
  onRefresh, onOpen, onFav, onPlay, onQueue, onLogin, authBusy, onStatus,
  notes = {}, compareIds = [], onCompare, onConnectDirect,
}) {
  const [sel, setSel] = useState(-1);
  const rowRefs = useRef([]);
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState('alle');
  const [sort, setSort] = useState('spillere');
  const inputRef = useRef(null);

  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    setChip('alle');
  }, [view]);

  const byId = useMemo(() => new Map(servers.map((s) => [s.id, s])), [servers]);

  const base = useMemo(() => {
    if (view === 'saved') return favorites.map((f) => byId.get(f.id) || offlineEntry(f.id, f.name, 'Offline eller ikke i listen nå'));
    if (view === 'recent') return activity.recent.map((r) => byId.get(r.id) || offlineEntry(r.id, r.name, 'Offline eller ikke i listen nå'));
    return servers;
  }, [view, servers, favorites, activity.recent, byId]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let l = base;
    if (q) {
      l = l.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.hostname?.toLowerCase().includes(q) ||
          s.desc?.toLowerCase().includes(q) ||
          s.tags?.some((t) => t.toLowerCase().includes(q)) ||
          notes[s.id]?.tags?.some((t) => t.toLowerCase().includes(q)) ||
          notes[s.id]?.text?.toLowerCase().includes(q) ||
          s.id.toLowerCase() === q
      );
    }
    if (hideEmpty && view === 'servers') l = l.filter((s) => s.clients > 0);
    if (chip === 'ledig') l = l.filter((s) => !s.offline && (!s.max || s.clients < s.max));
    if (chip === 'fullt') l = l.filter((s) => !s.offline && s.max && s.clients >= s.max);
    if (chip === 'verifisert') l = l.filter((s) => s.verified);
    if (chip === 'wl') l = l.filter((s) => s.whitelist);
    if (chip === 'fav') l = l.filter((s) => favIds.has(s.id));
    if (view === 'recent') return l; // behold rekkefølgen "sist spilt først"
    const sorted = [...l];
    if (sort === 'spillere') sorted.sort((a, b) => b.clients - a.clients);
    if (sort === 'navn') sorted.sort((a, b) => a.name.localeCompare(b.name, 'no'));
    if (sort === 'populær') sorted.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
    if (sort === 'ledige') sorted.sort((a, b) => Math.max(0, (b.max || 0) - b.clients) - Math.max(0, (a.max || 0) - a.clients) || b.clients - a.clients);
    if (sort === 'verifisert') sorted.sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0) || b.clients - a.clients);
    if (sort === 'minst') sorted.sort((a, b) => a.clients - b.clients);
    return sorted;
  }, [base, query, chip, sort, favIds, view, hideEmpty]);

  // Tastatur: ↑/↓ velger rad, Enter åpner, Ctrl+Enter kobler til
  useEffect(() => setSel(-1), [query, chip, sort, view]);
  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector('.modal-backdrop')) return;
      const tag = (e.target.tagName || '').toLowerCase();
      const inSearch = e.target === inputRef.current;
      if ((tag === 'input' || tag === 'textarea' || tag === 'select') && !inSearch) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!list.length) return;
        e.preventDefault();
        setSel((cur) => {
          const next = e.key === 'ArrowDown' ? Math.min(list.length - 1, cur + 1) : Math.max(0, cur - 1);
          rowRefs.current[next]?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Enter' && sel >= 0 && list[sel]) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) onPlay(list[sel]);
        else onOpen(list[sel]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list, sel, onOpen, onPlay]);

  // Hero: en fremhevet server (valgt i adminpanelet) hvis det finnes, ellers den med flest spillere
  const hero =
    view === 'servers' && !query && chip === 'alle' && servers.length
      ? [...servers].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.clients - a.clients)[0]
      : null;
  const recentMeta = useMemo(() => new Map(activity.recent.map((r) => [r.id, r])), [activity.recent]);

  const needsLogin = view === 'saved' && !user;

  return (
    <div className="page">
      <div className="page-head">
        <h1>{TITLES[view]}</h1>
        <span className="muted-sm">{list.length} servere</span>
      </div>

      <div className="toolbar">
        <label className="search">
          <Search size={18} strokeWidth={1.8} aria-hidden="true" />
          <span className="sr-only">Søk etter servere</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk etter servere, tags eller ID"
          />
          {query ? (
            <button className="clear" onClick={() => setQuery('')} aria-label="Tøm søk"><X size={15} /></button>
          ) : (
            <kbd>Ctrl K</kbd>
          )}
        </label>
        {view !== 'recent' && (
          <label className="select">
            <span className="sr-only">Sorter</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="spillere">Flest spillere</option>
              <option value="ledige">Flest ledige plasser</option>
              <option value="verifisert">Verifiserte først</option>
              <option value="populær">Mest populær</option>
              <option value="minst">Minst folk</option>
              <option value="navn">Navn A–Å</option>
            </select>
          </label>
        )}
        {onConnectDirect && (
          <button className="btn boxed-btn" onClick={onConnectDirect} title="Koble til med IP eller cfx.re-lenke (Ctrl L)">
            <Link2 size={17} strokeWidth={1.8} /> Koble til direkte
          </button>
        )}
        <button className="icon-btn boxed" onClick={onRefresh} disabled={loading} aria-label="Oppdater serverlisten" title="Oppdater">
          <RefreshCw size={18} strokeWidth={1.8} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {hero && (
        <section className="hero" aria-label={hero.featured ? 'Fremhevet server' : 'Mest spilt nå'}>
          {hero.banner ? <div className="hero-img" style={{ backgroundImage: `url("${encodeURI(hero.banner)}")` }} /> : <Mountains />}
          <div className="hero-body">
            <div className="hero-left">
              <ServerIcon server={hero} size={84} radius={22} />
              <div className="hero-text">
                <div className="eyebrow accent">{hero.featured ? <><Star size={14} strokeWidth={2.2} /> Fremhevet</> : <><TrendingUp size={14} strokeWidth={2.2} /> Mest spilt nå</>}</div>
                <h2><button className="link-title" onClick={() => onOpen(hero)}>{hero.name}</button></h2>
                <p>
                  {hero.desc ? `${hero.desc} · ` : ''}
                  <b className="green">{hero.clients}</b> av {hero.max} spillere
                </p>
              </div>
            </div>
            <div className="hero-actions">
              <button className={`btn ghost lg${favIds.has(hero.id) ? ' fav' : ''}`} onClick={() => onFav(hero)}>
                <Star size={18} fill={favIds.has(hero.id) ? 'currentColor' : 'none'} strokeWidth={1.8} />
                {favIds.has(hero.id) ? 'Lagret' : 'Lagre'}
              </button>
              <button className="btn play lg" onClick={() => onPlay(hero)}>
                <Play size={16} fill="currentColor" /> Koble til
              </button>
            </div>
          </div>
        </section>
      )}

      {view === 'servers' && (
        <div className="chips" role="group" aria-label="Filter">
          {CHIPS.map((c) => (
            <button key={c.id} className={chip === c.id ? 'chip on' : 'chip'} aria-pressed={chip === c.id} onClick={() => setChip(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {needsLogin ? (
        <div className="empty">
          <Star size={32} strokeWidth={1.6} />
          <p>Logg inn med Discord for å lagre servere du liker.</p>
          <button className="btn discord" onClick={onLogin} disabled={authBusy}>Logg inn med Discord</button>
        </div>
      ) : (
        <section className="table" aria-label="Serverliste">
          <div className="table-head">
            <span>#</span><span>Server</span><span>Spillere</span><span className="right">Handling</span>
          </div>

          {loading && !servers.length && (
            <div className="empty"><Loader2 className="spin" size={26} /><p>Henter servere fra FiveM…</p></div>
          )}
          {error && !servers.length && (
            <div className="empty">
              <ServerCrash size={30} strokeWidth={1.6} />
              <p>{error}</p>
              <div className="row-gap">
                <button className="btn" onClick={onRefresh}>Prøv igjen</button>
                {onStatus && <button className="btn" onClick={onStatus}>Se FiveM-status</button>}
              </div>
            </div>
          )}
          {!loading && !error && list.length === 0 && (
            <div className="empty">
              {view === 'recent' && !query ? <Clock size={30} strokeWidth={1.6} /> : null}
              <p>
                {view === 'recent' && !query
                  ? 'Du har ikke spilt på noen servere via launcheren ennå.'
                  : view === 'saved' && !query
                  ? 'Du har ikke lagret noen servere ennå. Trykk på stjernen ved en server.'
                  : 'Ingen servere matcher søket.'}
              </p>
            </div>
          )}

          {list.map((s, i) => {
            const r = recentMeta.get(s.id);
            const meta =
              view === 'recent' && r
                ? `Sist spilt ${formatAgo(r.at)}${activity.playtime[s.id] ? ` · ${formatDuration(activity.playtime[s.id])} totalt` : ''}`
                : null;
            return (
              <ServerRow
                key={s.id}
                server={s}
                rank={i + 1}
                meta={meta}
                favorite={favIds.has(s.id)}
                queued={!!watch[s.id]?.autoJoin}
                myTags={notes[s.id]?.tags || []}
                comparing={compareIds.includes(s.id)}
                onCompare={onCompare ? () => onCompare(s) : undefined}
                selected={i === sel}
                rowRef={(el) => (rowRefs.current[i] = el)}
                onOpen={() => onOpen(s)}
                onFav={() => onFav(s)}
                onPlay={() => onPlay(s)}
                onQueue={() => onQueue(s)}
              />
            );
          })}
        </section>
      )}
    </div>
  );
}
