import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Crown, ExternalLink, Star, X } from 'lucide-react';
import { api, errText, formatAgo } from '../api.js';

const StarsStatic = ({ value }) => (
  <span className="stars-static" aria-label={`${value} av 5 stjerner`}>
    {'★★★★★'.slice(0, Math.round(value))}
    <span style={{ opacity: 0.25 }}>{'★★★★★'.slice(0, 5 - Math.round(value))}</span>
  </span>
);

// Anmeldelser, beskrivelse fra eieren og «Er dette din server?» på serversiden
export default function ServerCommunity({ server, user, backendEnabled, notify }) {
  const [info, setInfo] = useState(null);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [owned, setOwned] = useState(null); // serveren hvis du er godkjent eier

  const load = useCallback(async () => {
    try {
      const d = await api.backend.api('GET', `/api/public/server/${server.id}`);
      setInfo(d);
      const mine = user && d.reviews.find((r) => r.userId === user.id);
      if (mine) {
        setStars(mine.stars);
        setText(mine.text || '');
      }
    } catch {
      setInfo({ reviews: [], rating: null, profile: null });
    }
  }, [server.id, user]);
  useEffect(() => {
    if (backendEnabled) load();
  }, [backendEnabled, load]);
  useEffect(() => {
    if (!backendEnabled || !user) return;
    api.backend.api('GET', '/api/launcher/my-servers').then((list) => setOwned(list.find((x) => x.server_id === server.id) || null)).catch(() => setOwned(null));
  }, [backendEnabled, user, server.id]);

  if (!backendEnabled) return null;
  const mine = user && info?.reviews.find((r) => r.userId === user.id);

  const save = async (e) => {
    e.preventDefault();
    if (!stars) return notify('Velg antall stjerner');
    setBusy(true);
    try {
      await api.backend.api('POST', '/api/launcher/review', { serverId: server.id, stars, text });
      notify(mine ? 'Anmeldelsen er oppdatert' : 'Takk for anmeldelsen!');
      load();
    } catch (e2) {
      notify(errText(e2));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await api.backend.api('DELETE', '/api/launcher/review', { serverId: server.id });
      setStars(0);
      setText('');
      load();
    } catch (e) {
      notify(errText(e));
    }
  };

  return (
    <>
      {info?.profile && (
        <section className="card">
          <div className="card-head">
            <h2 className="row-gap">Om serveren {info.verified && <BadgeCheck size={18} className="verified" aria-label="Verifisert" />}</h2>
          </div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{info.profile.description}</p>
          <div className="form-row">
            {info.profile.discord && <button className="btn ghost sm" onClick={() => api.openExternal(info.profile.discord)}><ExternalLink size={14} /> Discord</button>}
            {info.profile.website && <button className="btn ghost sm" onClick={() => api.openExternal(info.profile.website)}><ExternalLink size={14} /> Nettside</button>}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Anmeldelser</h2>
          {info?.rating && (
            <span className="row-gap muted-sm"><StarsStatic value={info.rating.avg} /> {String(info.rating.avg).replace('.', ',')} · {info.rating.count}</span>
          )}
        </div>

        {user ? (
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="stars" role="radiogroup" aria-label="Antall stjerner">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} role="radio" aria-checked={stars === n} aria-label={`${n} stjerne${n > 1 ? 'r' : ''}`} className={n <= stars ? 'on' : ''} onClick={() => setStars(n)}>
                  <Star size={20} fill={n <= stars ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="rev-text">Hva synes du om serveren?</label>
            <textarea id="rev-text" className="input" maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder="Hva synes du om serveren? (valgfritt)" />
            <div className="form-row">
              <button className="btn play" disabled={busy || !stars}>{mine ? 'Oppdater anmeldelse' : 'Publiser anmeldelse'}</button>
              {mine && <button type="button" className="btn ghost" onClick={remove}>Slett min</button>}
              <span className="hint">Vises med Discord-navnet ditt på fivemnorge.xyz</span>
            </div>
          </form>
        ) : (
          <p className="muted-sm">Logg inn med Discord for å skrive en anmeldelse.</p>
        )}

        <div className="review-list">
          {!info ? (
            <p className="muted-sm">Henter…</p>
          ) : info.reviews.length === 0 ? (
            <p className="muted-sm">Ingen anmeldelser ennå.</p>
          ) : (
            info.reviews.map((r) => (
              <div className="review" key={r.userId}>
                <img src={r.avatar} alt="" />
                <div>
                  <div className="who"><strong>{r.name}</strong><StarsStatic value={r.stars} /><span className="hint">{formatAgo(r.at)}</span></div>
                  {r.text && <p>{r.text}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {owned && <OwnerPanel server={server} owned={owned} notify={notify} onSaved={(o) => { setOwned(o); load(); }} />}

      {user && !info?.profile && !owned && (
        <section className="card">
          <h2>Er dette din server?</h2>
          <p className="muted-sm">Legg inn beskrivelse, Discord og nettside. Når staben har godkjent, vises det her og på fivemnorge.xyz, og serveren blir merket som verifisert.</p>
          <button className="btn ghost" onClick={() => setClaimOpen(true)}>Gjør krav på serveren</button>
        </section>
      )}
      {claimOpen && <ClaimModal server={server} onClose={() => setClaimOpen(false)} notify={notify} />}
    </>
  );
}

function ClaimModal({ server, onClose, notify }) {
  const [f, setF] = useState({ description: '', discord: '', website: '', contact: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.backend.api('POST', '/api/launcher/claim', { serverId: server.id, serverName: server.name, ...f });
      notify('Sendt! Staben ser på det så snart de kan.');
      onClose();
    } catch (e2) {
      setErr(errText(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="claim-title" onSubmit={submit}>
        <div className="modal-head">
          <h2 id="claim-title">Gjør krav på {server.name}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Lukk"><X size={16} /></button>
        </div>
        <p className="modal-text">Staben sjekker at du faktisk eier eller driver serveren før det godkjennes. Skriv gjerne hvordan de kan bekrefte det.</p>
        <label className="field">Beskrivelse
          <textarea className="input" required minLength={20} maxLength={800} value={f.description} onChange={set('description')} placeholder="Hva slags server er det, hva er spesielt, regler for whitelist …" />
        </label>
        <label className="field">Discord-invitasjon
          <input className="input" value={f.discord} onChange={set('discord')} placeholder="https://discord.gg/kode" />
        </label>
        <label className="field">Nettside
          <input className="input" value={f.website} onChange={set('website')} placeholder="https://" />
        </label>
        <label className="field">Hvordan kan staben bekrefte at du er eier?
          <input className="input" maxLength={200} value={f.contact} onChange={set('contact')} placeholder="F.eks. «Jeg er Owner i Discorden, brukernavn …»" />
        </label>
        {err && <p className="error-text" role="alert">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Avbryt</button>
          <button className="btn play" disabled={busy}>Send til godkjenning</button>
        </div>
      </form>
    </div>
  );
}

// For godkjente servereiere: rediger beskrivelse, lenker og connect, og se statistikk
function OwnerPanel({ server, owned, notify, onSaved }) {
  const [f, setF] = useState({
    description: owned.profile?.description || '',
    discord: owned.profile?.discord || '',
    website: owned.profile?.website || '',
    connect: owned.connect || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.backend.api('POST', '/api/launcher/server-profile', { serverId: server.id, ...f });
      notify('Serveren er oppdatert');
      onSaved({ ...owned, connect: r.connect, profile: r.profile });
      setF((cur) => ({ ...cur, connect: r.connect || '' }));
    } catch (e2) {
      setErr(errText(e2));
    } finally {
      setBusy(false);
    }
  };
  const st = owned.stats || { last7: 0, total: 0, hours: [] };
  const hours = st.hours?.length ? st.hours : Array(24).fill(0);
  const maxH = Math.max(1, ...hours);
  const week = owned.history?.week || [];
  const maxW = owned.history?.max || 1;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="row-gap"><Crown size={18} /> Du eier denne serveren</h2>
        {owned.rating && <span className="muted-sm">★ {String(owned.rating.avg).replace('.', ',')} ({owned.rating.count})</span>}
      </div>
      <div className="kpis">
        <div className="kpi"><small>Tilkoblinger via launcheren, 7 d</small><strong>{st.last7}</strong></div>
        <div className="kpi"><small>Totalt via launcheren</small><strong>{st.total}</strong></div>
        {owned.history?.peak != null && <div className="kpi"><small>Mest folk</small><strong>kl {String(owned.history.peak).padStart(2, '0')}</strong></div>}
      </div>
      {week.length > 2 && (
        <div>
          <div className="hint" style={{ marginBottom: 6 }}>Spillere siste 7 døgn</div>
          <div className="owner-chart" role="img" aria-label="Spillere time for time siste 7 døgn">
            {week.map(([h, c]) => <i key={h} style={{ height: `${Math.max(2, Math.round((c / maxW) * 100))}%` }} title={`${c} spillere`} />)}
          </div>
        </div>
      )}
      <div>
        <div className="hint" style={{ marginBottom: 6 }}>Når folk kobler til via launcheren (kl 00–23)</div>
        <div className="owner-chart hours" role="img" aria-label="Tilkoblinger per klokketime">
          {hours.map((h, i) => <i key={i} style={{ height: `${Math.max(2, Math.round((h / maxH) * 100))}%` }} title={`kl ${i}: ${h}`} />)}
        </div>
      </div>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label className="field">Beskrivelse
          <textarea className="input" required minLength={20} maxLength={800} value={f.description} onChange={set('description')} />
        </label>
        <div className="form-row">
          <label className="field" style={{ flex: '1 1 200px' }}>Discord-invitasjon<input className="input" value={f.discord} onChange={set('discord')} placeholder="https://discord.gg/kode" /></label>
          <label className="field" style={{ flex: '1 1 200px' }}>Nettside<input className="input" value={f.website} onChange={set('website')} placeholder="https://" /></label>
        </div>
        <label className="field">Egen connect-adresse (valgfritt)
          <input className="input" value={f.connect} onChange={set('connect')} placeholder={`cfx.re/join/${server.id}`} maxLength={140} />
        </label>
        {err && <p className="error-text" role="alert">{err}</p>}
        <div><button className="btn play" disabled={busy}>Lagre endringer</button></div>
      </form>
    </section>
  );
}
