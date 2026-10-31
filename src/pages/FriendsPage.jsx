import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw, UserMinus, UserPlus } from 'lucide-react';
import { api, errText } from '../api.js';
import DiscordIcon from '../components/DiscordIcon.jsx';

// Venner er gjensidige: begge må legge hverandre til. Hvor man spiller vises bare
// når vennen selv har skrudd på «Vis venner hvor jeg spiller».
export default function FriendsPage({ user, account, onLogin, authBusy, onPlay, notify, onShareChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await api.backend.api('GET', '/api/launcher/friends'));
      setErr(null);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [user, load]);

  if (!user) {
    return (
      <div className="page">
        <div className="page-head"><h1>Venner</h1></div>
        <div className="empty">
          <p>Logg inn med Discord for å legge til venner og se hvilken server de spiller på.</p>
          <button className="btn discord lg" onClick={onLogin} disabled={authBusy}><DiscordIcon /> Logg inn med Discord</button>
        </div>
      </div>
    );
  }

  const add = async (e, who = name) => {
    e?.preventDefault();
    if (!String(who).trim()) return;
    setBusy(true);
    try {
      setData(await api.backend.api('POST', '/api/launcher/friends', { user: String(who).trim() }));
      setName('');
      setErr(null);
      notify('Lagt til – dere blir venner når begge har lagt hverandre til');
    } catch (e2) {
      setErr(errText(e2));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (f) => {
    try {
      setData(await api.backend.api('DELETE', `/api/launcher/friends/${f.id}`));
    } catch (e) {
      notify(errText(e));
    }
  };
  const share = !!(data?.shareStatus ?? account?.shareStatus);
  const toggleShare = async () => {
    try {
      await api.backend.setShare(!share);
      setData((d) => (d ? { ...d, shareStatus: !share } : d));
      onShareChanged?.();
      notify(!share ? 'Vennene dine ser nå hvilken server du spiller på' : 'Vennene dine ser ikke lenger hvor du spiller');
    } catch (e) {
      notify(errText(e));
    }
  };

  const playing = (data?.friends || []).filter((f) => f.playing);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Venner</h1>
        <span className="muted-sm">{playing.length ? `${playing.length} spiller nå` : ''}</span>
        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={load} disabled={busy}>
          <RefreshCw size={14} className={busy ? 'spin' : ''} /> Oppdater
        </button>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Vis venner hvor jeg spiller</h2>
          <button type="button" className={share ? 'switch on' : 'switch'} role="switch" aria-checked={share} aria-label="Vis venner hvor jeg spiller" onClick={toggleShare}><span /></button>
        </div>
        <p className="muted-sm">Bare venner (dere har lagt hverandre til) ser det, og bare mens du spiller. Av som standard.</p>
      </section>

      <section className="card">
        <h2>Legg til venn</h2>
        <form className="form-row" onSubmit={add}>
          <label className="sr-only" htmlFor="friend-name">Discord-brukernavn eller ID</label>
          <input id="friend-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Discord-brukernavn eller ID" maxLength={40} />
          <button className="btn play" disabled={busy || !name.trim()}><UserPlus size={16} /> Legg til</button>
        </form>
        <p className="hint">Vennen må ha logget inn i FiveM Norge Launcher med Discord. Del brukernavnet ditt: <b>{account?.user?.username || user.username || user.displayName}</b></p>
        {err && <p className="error-text" role="alert">{err}</p>}
      </section>

      {data?.incoming?.length > 0 && (
        <section className="card">
          <h2>Vil bli venn med deg</h2>
          <div>
            {data.incoming.map((f) => (
              <div className="friend" key={f.id}>
                <img src={f.avatar} alt="" />
                <div className="ft"><strong>{f.name}</strong><small>@{f.username}</small></div>
                <button className="btn sm play" onClick={() => add(null, f.id)}><UserPlus size={14} /> Legg til</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>Vennene dine</h2>
        {!data ? (
          <p className="muted-sm">{err ? 'Fikk ikke hentet vennelista.' : 'Henter…'}</p>
        ) : data.friends.length === 0 ? (
          <p className="muted-sm">Ingen venner ennå. Legg til noen over – de må legge deg til også.</p>
        ) : (
          <div>
            {data.friends.map((f) => (
              <div className="friend" key={f.id}>
                <img src={f.avatar} alt="" />
                <div className="ft">
                  <strong>{f.name}</strong>
                  {f.playing ? <small className="playing">Spiller {f.playing.name}</small> : <small>@{f.username}</small>}
                </div>
                {f.playing && (
                  <button className="btn sm play" onClick={() => onPlay({ id: f.playing.serverId, name: f.playing.name })}>
                    <Play size={14} /> Bli med
                  </button>
                )}
                <button className="icon-btn" onClick={() => remove(f)} aria-label={`Fjern ${f.name}`} title="Fjern"><UserMinus size={16} /></button>
              </div>
            ))}
          </div>
        )}
        {data?.outgoing?.length > 0 && (
          <p className="hint">Venter på: {data.outgoing.map((f) => f.name).join(', ')}</p>
        )}
      </section>
    </div>
  );
}
