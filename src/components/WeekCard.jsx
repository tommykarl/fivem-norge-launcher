import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api, formatDuration } from '../api.js';

const DAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

// Ukeoversikt: spilletid per dag denne uka, sammenlignet med forrige uke
export default function WeekCard({ refreshKey, onOpen }) {
  const [w, setW] = useState(null);
  useEffect(() => {
    api.history.weekly().then(setW).catch(() => {});
  }, [refreshKey]);
  if (!w) return null;

  const max = Math.max(1, ...w.days.map((d) => d.ms));
  const todayIdx = (new Date().getDay() + 6) % 7;
  const diff = w.lastWeek ? Math.round(((w.total - w.lastWeek) / w.lastWeek) * 100) : null;
  const label = `Spilletid denne uka: ${w.days.map((d, i) => `${DAYS[i]} ${formatDuration(d.ms)}`).join(', ')}`;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Denne uka</h2>
        <CalendarDays size={18} strokeWidth={1.8} className="muted-icon" />
      </div>
      <div className="week-top">
        <div className="big-num">{w.total ? formatDuration(w.total) : '–'}</div>
        {diff !== null && w.total > 0 && (
          <span className={`pill ${diff >= 0 ? 'ok' : 'unknown'}`}>{diff >= 0 ? '+' : ''}{diff} % mot forrige uke</span>
        )}
      </div>
      <div className="week-bars" role="img" aria-label={label}>
        {w.days.map((d, i) => (
          <div key={d.date} className={`wday${i === todayIdx ? ' today' : ''}${d.future ? ' future' : ''}`} title={`${DAYS[i]}: ${formatDuration(d.ms)}`}>
            <div className="wbar"><i style={{ height: d.ms ? `${Math.max(6, (d.ms / max) * 100)}%` : 0 }} /></div>
            <span>{DAYS[i]}</span>
          </div>
        ))}
      </div>
      {w.top.length > 0 ? (
        <div className="muted-sm">
          Mest på{' '}
          {w.top.map((t, i) => (
            <span key={t.id}>
              {i > 0 && (i === w.top.length - 1 ? ' og ' : ', ')}
              <button className="text-btn inline-link" onClick={() => onOpen({ id: t.id, name: t.name })}>{t.name}</button> ({formatDuration(t.ms)})
            </span>
          ))}
        </div>
      ) : (
        <div className="muted-sm">Spill litt, så fylles uka ut her.</div>
      )}
    </section>
  );
}
