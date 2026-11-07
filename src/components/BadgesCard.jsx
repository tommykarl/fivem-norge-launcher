import { useEffect, useState } from 'react';
import { Award, ExternalLink } from 'lucide-react';
import { api } from '../api.js';
import NameTags from './NameTags.jsx';

// Merkene dine fra fivemnorge.xyz (timer, servere, først på serveren, månedens topp 10 …)
export default function BadgesCard({ account, profileUrl }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    api.backend.api('GET', '/api/launcher/badges').then((x) => alive && setD(x)).catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, []);
  const r = account?.roleInfo;
  return (
    <section className="card badges-card pc pc-lilac">
      <div className="card-head">
        <h2><Award size={18} strokeWidth={1.8} /> Merkene dine <NameTags verified={account?.verified} staff={r?.staff} size={17} /></h2>
        {profileUrl && (
          <button className="text-btn" onClick={() => api.openExternal(profileUrl)}>Se profilen <ExternalLink size={13} /></button>
        )}
      </div>
      {err && <p className="muted-sm">{err}</p>}
      {!d && !err && <p className="muted-sm">Henter …</p>}
      {d && (
        <>
          <div className="badge-facts">
            <div><b>{d.facts.hours}</b><span>timer</span></div>
            <div><b>{d.facts.servers}</b><span>servere</span></div>
            <div><b>{d.facts.rank ? `#${d.facts.rank}` : '–'}</b><span>topplista</span></div>
          </div>
          {!d.public && <p className="muted-sm">Slå på offentlig profil under Innstillinger for å samle timer og vise merkene.</p>}
          {d.earned.length > 0 && (
            <ul className="badge-list">
              {d.earned.map((b) => (
                <li key={b.id} style={{ background: b.bg, color: b.fg }} title={b.desc}>
                  <span aria-hidden="true">{b.icon}</span> {b.name}
                  {b.count > 1 ? ` ×${b.count}` : ''}
                </li>
              ))}
            </ul>
          )}
          {d.next.slice(0, 3).map((b) => (
            <div className="badge-next" key={b.id}>
              <span aria-hidden="true">{b.icon}</span>
              <div>
                <b>{b.name}</b>
                <div className="bar"><i style={{ width: `${Math.min(100, Math.round((b.have / b.need) * 100))}%` }} /></div>
              </div>
              <small>{b.have} / {b.need}</small>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
