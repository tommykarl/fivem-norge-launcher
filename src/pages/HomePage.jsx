import { useEffect, useState } from 'react';
import { Bell, Clock, Loader2, Play, TrendingUp, Users } from 'lucide-react';
import ServerIcon from '../components/ServerIcon.jsx';
import Mountains from '../components/Mountains.jsx';
import WeekCard from '../components/WeekCard.jsx';
import { api, formatAgo, formatDuration, greeting } from '../api.js';

function MiniRow({ server, sub, onOpen, right }) {
  return (
    <div className="mini-row">
      <ServerIcon server={server} size={40} radius={12} />
      <div className="mini-text">
        <button className="row-name sm" onClick={onOpen}>{server.name}</button>
        <div className="muted-sm">{sub}</div>
      </div>
      {right}
    </div>
  );
}

export default function HomePage({
  user, servers, favorites, activity, watch, totalPlayers, onOpen, onPlay, go, onLogin, authBusy,
}) {
  const byId = new Map(servers.map((s) => [s.id, s]));
  const [communities, setCommunities] = useState({ loading: true });
  const [trend, setTrend] = useState(null);

  useEffect(() => {
    let alive = true;
    api.history.trending().then((t) => alive && setTrend(t)).catch(() => {});
    if (!user) {
      setCommunities({ needsLogin: true });
    } else {
      setCommunities({ loading: true });
      api.discord
        .communities()
        .then((r) => alive && setCommunities(r))
        .catch((e) => alive && setCommunities({ error: e.message }));
    }
    return () => {
      alive = false;
    };
  }, [user, servers.length > 0]);

  const lastRecent = activity.recent[0];
  const continueServer = lastRecent ? byId.get(lastRecent.id) || { id: lastRecent.id, name: lastRecent.name, offline: true, clients: 0, max: 0 } : null;
  const top = servers.length ? [...servers].sort((a, b) => b.clients - a.clients)[0] : null;
  const feature = continueServer || top;

  const watched = Object.entries(watch).map(([id, w]) => ({ id, ...w, server: byId.get(id) || { id, name: w.name } }));
  const live = (s) => (s?.offline || !byId.get(s.id) ? 'Offline' : `${byId.get(s.id).clients} / ${byId.get(s.id).max}`);

  return (
    <div className="page">
      <div className="home-head">
        <div>
          <div className="muted-md">{greeting()},</div>
          <h1 className="home-title">{user ? user.displayName : 'velkommen'}</h1>
        </div>
        <div className="muted-md live-inline">
          <span className="dot" />
          <span><b>{totalPlayers.toLocaleString('no')}</b> spillere på <b>{servers.length}</b> norske servere</span>
        </div>
      </div>

      {feature && (
        <section className="hero compact" aria-label={continueServer ? 'Fortsett der du slapp' : 'Mest spilt nå'}>
          <Mountains />
          <div className="hero-body">
            <div className="hero-left">
              <ServerIcon server={feature} size={72} radius={20} />
              <div className="hero-text">
                <div className="eyebrow accent">{continueServer ? 'Fortsett der du slapp' : 'Mest spilt nå'}</div>
                <h2><button className="link-title" onClick={() => onOpen(feature)}>{feature.name}</button></h2>
                <p>
                  {continueServer ? `Sist spilt ${formatAgo(lastRecent.at)} · ` : ''}
                  {feature.offline ? 'Offline nå' : <><b className="green">{feature.clients}</b> / {feature.max} online nå</>}
                </p>
              </div>
            </div>
            <button className="btn play xl" onClick={() => onPlay(feature)} disabled={feature.offline}>
              <Play size={18} fill="currentColor" /> {continueServer ? 'Spill igjen' : 'Koble til'}
            </button>
          </div>
        </section>
      )}

      <div className="home-grid">
        <WeekCard refreshKey={Math.floor((activity.totalMs || 0) / 60_000)} onOpen={onOpen} />
        <section className="card">
          <div className="card-head">
            <h2>Lagrede servere</h2>
            <button className="text-btn" onClick={() => go({ name: 'saved' })}>Se alle</button>
          </div>
          {!user && <p className="muted-sm">Logg inn med Discord for å lagre servere.</p>}
          {user && favorites.length === 0 && <p className="muted-sm">Trykk på stjernen ved en server for å lagre den her.</p>}
          {favorites.slice(0, 4).map((f) => {
            const s = byId.get(f.id) || { id: f.id, name: f.name, offline: true };
            return (
              <MiniRow key={f.id} server={s} sub={live(s)} onOpen={() => onOpen(s)}
                right={<span className={`dot${s.offline ? ' off' : ''}`} aria-label={s.offline ? 'Offline' : 'Online'} />} />
            );
          })}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Fra dine Discord-servere</h2>
            <Users size={18} strokeWidth={1.8} className="muted-icon" />
          </div>
          <p className="muted-sm">FiveM-servere der du allerede er med i Discorden deres.</p>
          {communities.loading && <div className="muted-sm row-gap"><Loader2 className="spin" size={15} /> Sjekker Discord…</div>}
          {communities.needsLogin && (
            <button className="btn discord" onClick={onLogin} disabled={authBusy}>Logg inn med Discord</button>
          )}
          {communities.needsScope && (
            <>
              <p className="muted-sm">Logg inn på nytt og godta tilgang til «servere» for å se denne listen.</p>
              <button className="btn discord" onClick={onLogin} disabled={authBusy}>Logg inn på nytt</button>
            </>
          )}
          {communities.error && <p className="muted-sm">{communities.error}</p>}
          {communities.ids?.length === 0 && <p className="muted-sm">Fant ingen treff ennå.</p>}
          {communities.ids?.slice(0, 4).map((id) => {
            const s = byId.get(id);
            return s ? <MiniRow key={id} server={s} sub={`${s.clients} / ${s.max} · Du er medlem på Discord`} onOpen={() => onOpen(s)} /> : null;
          })}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Varsler og kø{watched.filter((w) => w.autoJoin).length > 1 ? ` · ${watched.filter((w) => w.autoJoin).length} i kø` : ''}</h2>
            <Bell size={18} strokeWidth={1.8} className="muted-icon" />
          </div>
          {watched.length === 0 ? (
            <div className="placeholder small">
              <Clock size={18} strokeWidth={1.8} />
              Åpne en server og velg «Varsle meg» eller «Bli med når ledig».
            </div>
          ) : (
            watched.slice(0, 4).map((w) => (
              <MiniRow
                key={w.id}
                server={w.server}
                sub={[w.autoJoin && 'I kø', w.free && 'Ledig plass', w.online && 'Online'].filter(Boolean).join(' · ')}
                onOpen={() => onOpen(w.server)}
                right={<span className="muted-sm mono">{live(w.server)}</span>}
              />
            ))
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Voksende servere</h2>
            <TrendingUp size={18} strokeWidth={1.8} className="muted-icon" />
          </div>
          {!trend && <div className="muted-sm row-gap"><Loader2 className="spin" size={15} /> Laster…</div>}
          {trend && !trend.ready && (
            <div className="placeholder small">
              Samler spillerhistorikk – listen vises etter 2 døgn ({trend.hours} av 48 timer).
            </div>
          )}
          {trend?.ready && trend.list.length === 0 && <p className="muted-sm">Ingen servere vokser akkurat nå.</p>}
          {trend?.ready &&
            trend.list.map((t) => {
              const s = byId.get(t.id);
              return s ? (
                <MiniRow key={t.id} server={s} sub={`Snitt ${t.now} spillere siste døgn`} onOpen={() => onOpen(s)}
                  right={<span className="trend-up">+{t.delta}</span>} />
              ) : null;
            })}
        </section>

        {(activity.totalMs > 0 || activity.active) && (
          <section className="card">
            <div className="card-head">
              <h2>Spilletid</h2>
              <span className="muted-sm">Totalt i FiveM: <b className="text-strong">{formatDuration(activity.totalMs)}</b></span>
            </div>
            {activity.active && (
              <div className="now-playing">
                <span className="dot pulse" />
                <span>
                  Spiller nå{activity.active.name ? <> på <b>{activity.active.name}</b></> : ''} · {formatDuration(Date.now() - activity.active.startedAt)}
                </span>
              </div>
            )}
            {Object.entries(activity.playtime)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([id, ms]) => {
                const r = activity.recent.find((x) => x.id === id);
                const s = byId.get(id) || { id, name: r?.name || id, offline: true };
                return <MiniRow key={id} server={s} sub={formatDuration(ms)} onOpen={() => onOpen(s)} />;
              })}
          </section>
        )}
      </div>
    </div>
  );
}
