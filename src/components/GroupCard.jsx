import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { api, errText } from '../api.js';

// Gruppekø: stå i kø sammen med venner, alle kobles inn samtidig når det er plass
export default function GroupCard({ servers, notify }) {
  const [g, setG] = useState(null);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => api.group.get().then(setG).catch(() => {});
  useEffect(() => {
    load();
    return api.on('group:changed', setG);
  }, []);
  const match = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? servers.filter((s) => s.name.toLowerCase().includes(n)).slice(0, 6) : [];
  }, [q, servers]);
  const [chosen, setChosen] = useState(null);

  const act = async (fn, msg) => {
    setBusy(true);
    try {
      setG(await fn());
      if (msg) notify(msg);
    } catch (e) {
      notify(errText(e));
    } finally {
      setBusy(false);
    }
  };
  if (!g) return null;
  const x = g.group;
  const free = x?.live ? x.live.max - x.live.clients : null;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Gruppekø</h2>
        <Users size={18} strokeWidth={1.8} className="muted-icon" />
      </div>
      <p className="muted-sm">Stå i kø sammen. Når det er plass til hele gjengen, kobler launcheren til alle samtidig. Hold launcheren åpen.</p>
      {g.invites.map((i) => (
        <div key={i.id} className="group-inv">
          <span><b>Invitasjon:</b> {i.server_name} · {i.members.map((m) => m.name).join(', ')}</span>
          <button className="btn play sm" disabled={busy} onClick={() => act(() => api.backend.api('POST', `/api/launcher/group/${i.id}/join`, {}), 'Du er med i gruppen')}>Bli med</button>
        </div>
      ))}
      {x ? (
        <div className="group-box">
          <div className="group-top">
            <div>
              <b>{x.server_name}</b>
              <div className="muted-sm">
                {x.live ? `${x.live.clients}/${x.live.max} spillere · ` : ''}
                {x.status === 'go' ? 'Kobler til nå' : free != null && free < x.members.length ? `Venter på ${x.members.length - free} ledige plasser til` : `Venter på plass til ${x.members.length}`}
              </div>
            </div>
            <div className="group-act">
              <button className="btn sm" disabled={busy} onClick={() => act(() => api.backend.api('POST', `/api/launcher/group/${x.id}/go`, {}), 'Kobler til alle nå')}>Koble til alle nå</button>
              <button className="btn ghost sm" disabled={busy} onClick={() => act(() => api.backend.api('POST', `/api/launcher/group/${x.id}/leave`, {}), 'Du forlot gruppen')}>Forlat</button>
            </div>
          </div>
          <ul className="chips">
            {x.members.map((m) => (
              <li key={m.id}><img src={m.avatar} alt="" />{m.name}<i className={m.online ? 'on' : ''} title={m.online ? 'Launcheren er åpen' : 'Launcheren er ikke åpen'} /></li>
            ))}
            {x.invited.map((m) => <li key={m.id} className="inv"><img src={m.avatar} alt="" />{m.name} <small>invitert</small></li>)}
          </ul>
        </div>
      ) : g.friends.length ? (
        <div className="group-new">
          <label className="search sm">
            <span className="sr-only">Server</span>
            <input value={chosen ? chosen.name : q} onChange={(e) => { setChosen(null); setQ(e.target.value); }} placeholder="Velg server …" />
          </label>
          {!chosen && match.length > 0 && (
            <ul className="pick-list">
              {match.map((s) => <li key={s.id}><button onClick={() => { setChosen(s); setQ(''); }}>{s.name} <small>{s.clients}/{s.max}</small></button></li>)}
            </ul>
          )}
          <div className="chips pick">
            {g.friends.map((f) => {
              const on = pick.includes(f.id);
              return (
                <button key={f.id} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => setPick(on ? pick.filter((p) => p !== f.id) : [...pick, f.id])}>
                  <img src={f.avatar} alt="" />{f.name}
                </button>
              );
            })}
          </div>
          <button className="btn play sm" disabled={busy || !chosen || !pick.length} onClick={() => act(() => api.backend.api('POST', '/api/launcher/group', { serverId: chosen.id, serverName: chosen.name, invite: pick }), 'Gruppen er laget – vennene dine har fått beskjed')}>
            Lag gruppe og inviter
          </button>
        </div>
      ) : (
        <p className="muted-sm">Legg til minst én venn først (dere må ha lagt hverandre til).</p>
      )}
    </section>
  );
}
