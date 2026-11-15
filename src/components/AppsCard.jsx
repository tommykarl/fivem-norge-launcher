import { useEffect, useState } from 'react';
import { ClipboardList, ExternalLink } from 'lucide-react';
import ServerIcon from './ServerIcon.jsx';
import { api, formatAgo } from '../api.js';

// Søknadene dine på FiveM Norge (whitelist, jobber …) med status.
// Oppdateres når det kommer nye varsler, så endringer vises med en gang.
const STATUS = {
  pending: ['Sendt', 'unknown'],
  review: ['Under behandling', 'maint'],
  interview: ['Intervju', 'warn'],
  accepted: ['Godkjent', 'ok'],
  denied: ['Avslått', 'down'],
};
const OPEN = new Set(['pending', 'review', 'interview']);

export default function AppsCard({ siteUrl, onOpenServer }) {
  const [apps, setApps] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.backend.api('GET', '/api/launcher/apps').then((a) => alive && setApps(Array.isArray(a) ? a : [])).catch(() => alive && setApps([]));
    load();
    const off = api.on?.('notifs:changed', load);
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  if (!apps) return null;
  // Åpne søknader + de som er avgjort de siste 14 dagene
  const shown = apps.filter((a) => OPEN.has(a.status) || (a.decided_at && Date.now() - a.decided_at < 14 * 86_400_000)).slice(0, 5);
  if (!shown.length) return null;
  const open = (path) => siteUrl && api.openExternal(`${siteUrl}${path}`);

  return (
    <section className="card pc pc-sky apps-card">
      <div className="card-head">
        <h2>Søknadene dine</h2>
        <ClipboardList size={18} strokeWidth={1.8} className="muted-icon" />
      </div>
      <ul className="apps-list">
        {shown.map((a) => {
          const [label, tone] = STATUS[a.status] || [a.statusName || a.status, 'unknown'];
          const needsTime = a.status === 'interview' && !a.interview?.booked && a.interview?.slots?.length;
          return (
            <li key={a.id}>
              <ServerIcon server={{ id: a.sid, name: a.server, icon: a.icon }} size={36} radius={10} />
              <div className="apps-text">
                <button className="row-name sm" onClick={() => onOpenServer?.({ id: a.sid, name: a.server })}>{a.server}</button>
                <div className="muted-sm">
                  {a.form} · {a.decided_at ? `avgjort ${formatAgo(a.decided_at)}` : `sendt ${formatAgo(a.at)}`}
                  {a.status === 'interview' && a.interview?.booked ? ` · ${new Date(a.interview.booked.at).toLocaleString('no', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                </div>
              </div>
              {needsTime ? (
                <button className="btn sm" onClick={() => open('/min-side#soknader')}>Velg tid</button>
              ) : (
                <span className={`pill ${tone}`}>{label}</span>
              )}
            </li>
          );
        })}
      </ul>
      <button className="text-btn" onClick={() => open('/min-side#soknader')}>
        Se alle på Min side <ExternalLink size={13} />
      </button>
    </section>
  );
}
