import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, RefreshCw, Wrench, XCircle } from 'lucide-react';
import Mountains from '../components/Mountains.jsx';
import { api, formatAgo } from '../api.js';
import { CHECK, COMPONENT, INCIDENT, LEVELS } from '../status.js';

const ICON = { ok: CheckCircle2, warn: AlertTriangle, down: XCircle, maint: Wrench, unknown: Activity };

function Pill({ cls, children }) {
  return <span className={`pill ${cls}`}><i />{children}</span>;
}

export default function StatusPage({ status, onRefresh, refreshing }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000); // oppdater «sist sjekket»
    return () => clearInterval(t);
  }, []);

  const level = LEVELS[status?.level || 'unknown'];
  const Icon = ICON[level.cls];
  const off = status?.official;

  return (
    <div className="page status-page">
      <div className="page-head">
        <h1>FiveM-status</h1>
        <span className="muted-sm">{status ? `Sist sjekket ${formatAgo(status.at)}` : ''}</span>
      </div>

      <section className={`status-hero ${level.cls}`} aria-live="polite">
        <Mountains />
        <div className="status-hero-body">
          <div className="status-icon"><Icon size={30} strokeWidth={2} /></div>
          <div className="status-hero-text">
            <h2>{level.label}</h2>
            <p>{off?.ok && off.description ? `Offisiell status: ${off.description}` : 'Basert på Rockstar sin statusside og launcherens egne målinger.'}</p>
          </div>
          <button className="btn ghost lg" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} /> Sjekk nå
          </button>
        </div>
      </section>

      {off?.incidents?.length > 0 && (
        <section className="card">
          <h2>Pågående hendelser</h2>
          {off.incidents.map((i) => (
            <div key={i.id} className="incident">
              <div className="incident-head">
                <strong>{i.name}</strong>
                <Pill cls={i.impact === 'major' || i.impact === 'critical' ? 'down' : 'warn'}>{INCIDENT[i.status] || i.status}</Pill>
              </div>
              {i.latest && <p>{i.latest}</p>}
              <div className="incident-foot">
                <span className="muted-sm">Oppdatert {formatAgo(Date.parse(i.updatedAt))}</span>
                <button className="text-btn" onClick={() => api.openExternal(i.url)}>Les mer <ArrowUpRight size={13} /></button>
              </div>
            </div>
          ))}
        </section>
      )}

      {off?.maintenances?.length > 0 && (
        <section className="card">
          <h2><CalendarClock size={17} /> Planlagt vedlikehold</h2>
          {off.maintenances.map((m) => (
            <div key={m.id} className="mini-row">
              <div className="mini-text">
                <strong>{m.name}</strong>
                <div className="muted-sm">
                  {new Date(m.scheduledFor).toLocaleString('no', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {m.scheduledUntil ? ` – ${new Date(m.scheduledUntil).toLocaleTimeString('no', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </div>
              </div>
              <button className="text-btn" onClick={() => api.openExternal(m.url)}>Detaljer <ArrowUpRight size={13} /></button>
            </div>
          ))}
        </section>
      )}

      <div className="status-cols">
        <section className="card">
          <div className="card-head">
            <h2>Målt fra din PC</h2>
            <span className="muted-sm">Svartid</span>
          </div>
          <p className="muted-sm">Tjenestene launcheren bruker, sjekket direkte herfra hvert 3. minutt.</p>
          {!status && <div className="muted-sm">Sjekker…</div>}
          {status?.checks.map((c) => (
            <div key={c.id} className="status-row">
              <div className="mini-text">
                <strong>{c.name}</strong>
                <div className="muted-sm">{c.error || c.desc}</div>
              </div>
              <span className="mono muted-sm">{c.state === 'down' ? '–' : `${c.ms} ms`}</span>
              <Pill cls={CHECK[c.state].cls}>{CHECK[c.state].label}</Pill>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Offisiell status</h2>
            <button className="text-btn" onClick={() => api.openExternal(off?.pageUrl || 'https://support.rockstargames.com/servicestatus')}>Rockstar Support <ArrowUpRight size={13} /></button>
          </div>
          {!status && <div className="muted-sm">Sjekker…</div>}
          {status && !off?.ok && (
            <div className="placeholder small">Fikk ikke kontakt med Rockstar sin statusside ({off?.error}). Målingene fra PC-en din vises fortsatt.</div>
          )}
          {off?.ok && <p className="muted-sm">Cfx.re (FiveM) melder status via Rockstar Support.</p>}
          {off?.ok && !off.found && (
            <div className="placeholder small">Fant ingen FiveM-tjenester i Rockstar sin status akkurat nå. Viser relaterte tjenester.</div>
          )}
          {off?.ok &&
            off.groups.map((g) => (
              <div key={g.id} className="status-group">
                <div className="status-row head">
                  <strong>{g.name}</strong>
                  <Pill cls={(COMPONENT[g.status] || COMPONENT.operational).cls}>{(COMPONENT[g.status] || COMPONENT.operational).label}</Pill>
                </div>
                {g.components.map((c) => (
                  <div key={c.id} className="status-row sub">
                    <span>{c.name}</span>
                    <Pill cls={(COMPONENT[c.status] || COMPONENT.operational).cls}>{(COMPONENT[c.status] || COMPONENT.operational).label}</Pill>
                  </div>
                ))}
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}
