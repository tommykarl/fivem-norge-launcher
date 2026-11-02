import { useEffect, useRef } from 'react';
import { Download, X } from 'lucide-react';

// Månedsoppsummering laget fra spilletiden launcheren har målt på denne PC-en
export function monthStats(activity, servers, monthKey) {
  const per = {};
  let total = 0;
  const days = new Set();
  for (const [day, v] of Object.entries(activity?.daily || {})) {
    if (!day.startsWith(monthKey)) continue;
    if (v.t > 0) days.add(day);
    total += v.t || 0;
    for (const [id, ms] of Object.entries(v.s || {})) if (id !== '_ukjent') per[id] = (per[id] || 0) + ms;
  }
  const byId = new Map((servers || []).map((s) => [s.id, s]));
  const recentName = new Map((activity?.recent || []).map((r) => [r.id, r.name]));
  const top = Object.entries(per)
    .sort((a, b) => b[1] - a[1])
    .map(([id, ms]) => ({ id, ms, name: byId.get(id)?.name || recentName.get(id) || id }));
  return { monthKey, total, days: days.size, servers: top.length, top: top.slice(0, 5) };
}
export const monthName = (k) => {
  try {
    return new Date(`${k}-15T12:00:00`).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
  } catch {
    return k;
  }
};
const hrs = (ms) => {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)} t ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`;
};

// Tegner et delbart bilde (1080×1080) med canvas
function drawShare(st, name) {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1080;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 1080, 1080);
  bg.addColorStop(0, '#0E1426');
  bg.addColorStop(1, '#07090E');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1080, 1080);
  const glow = g.createRadialGradient(900, 120, 0, 900, 120, 600);
  glow.addColorStop(0, 'rgba(217,43,67,.45)');
  glow.addColorStop(1, 'rgba(217,43,67,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 1080, 1080);
  const font = (w, s) => `${w} ${s}px Geist, system-ui, sans-serif`;
  g.fillStyle = '#FF8F9B';
  g.font = font(700, 34);
  g.fillText('FIVEM NORGE', 80, 120);
  g.fillStyle = '#EEF1F7';
  g.font = font(800, 84);
  g.fillText(monthName(st.monthKey).replace(/^./, (x) => x.toUpperCase()), 80, 230);
  g.fillStyle = '#A7B0C5';
  g.font = font(500, 40);
  g.fillText(name ? `${name} sin måned i FiveM` : 'Måneden i FiveM', 80, 295);
  const stat = (x, v, l) => {
    g.fillStyle = '#EEF1F7';
    g.font = font(800, 92);
    g.fillText(v, x, 470);
    g.fillStyle = '#A7B0C5';
    g.font = font(500, 34);
    g.fillText(l, x, 520);
  };
  stat(80, hrs(st.total).replace(' min', 'm'), 'spilt');
  stat(470, String(st.days), st.days === 1 ? 'dag' : 'dager');
  stat(760, String(st.servers), st.servers === 1 ? 'server' : 'servere');
  const max = Math.max(1, ...st.top.map((t) => t.ms));
  st.top.forEach((t, i) => {
    const y = 630 + i * 82;
    g.fillStyle = '#1A2030';
    g.fillRect(80, y + 32, 920, 14);
    g.fillStyle = i === 0 ? '#D92B43' : '#6B2A36';
    g.fillRect(80, y + 32, Math.max(20, (t.ms / max) * 920), 14);
    g.fillStyle = '#EEF1F7';
    g.font = font(700, 34);
    g.fillText(`${i + 1}. ${t.name}`.slice(0, 40), 80, y + 18);
    g.fillStyle = '#A7B0C5';
    g.font = font(500, 30);
    const tw = g.measureText(hrs(t.ms)).width;
    g.fillText(hrs(t.ms), 1000 - tw, y + 18);
  });
  g.fillStyle = '#7F8AA3';
  g.font = font(500, 28);
  g.fillText('fivemnorge.xyz', 80, 1030);
  return c.toDataURL('image/png');
}

export default function MonthModal({ stats, userName, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const save = () => {
    const a = document.createElement('a');
    a.href = drawShare(stats, userName);
    a.download = `fivem-norge-${stats.monthKey}.png`;
    a.click();
  };
  const max = Math.max(1, ...stats.top.map((t) => t.ms));
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal month-modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <div className="modal-head">
          <h2 id="m-title">Din {monthName(stats.monthKey)}</h2>
          <button ref={ref} type="button" className="icon-btn" onClick={onClose} aria-label="Lukk"><X size={16} /></button>
        </div>
        <div className="month-kpis">
          <div><b>{hrs(stats.total)}</b><span>spilt</span></div>
          <div><b>{stats.days}</b><span>{stats.days === 1 ? 'dag' : 'dager'}</span></div>
          <div><b>{stats.servers}</b><span>{stats.servers === 1 ? 'server' : 'servere'}</span></div>
        </div>
        {stats.top.length > 0 ? (
          <ol className="month-top">
            {stats.top.map((t, i) => (
              <li key={t.id}>
                <span className="mt-name">{i + 1}. {t.name}</span>
                <span className="mt-bar"><i style={{ width: `${Math.max(3, Math.round((t.ms / max) * 100))}%` }} /></span>
                <span className="mt-t">{hrs(t.ms)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="modal-text">Ingen spilletid registrert denne måneden ennå.</p>
        )}
        <p className="muted-sm">Målt av launcheren på denne PC-en.</p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Lukk</button>
          {stats.total > 0 && <button className="btn play" onClick={save}><Download size={16} /> Lagre som bilde</button>}
        </div>
      </div>
    </div>
  );
}
