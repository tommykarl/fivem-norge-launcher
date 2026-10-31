import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Slår sammen timer til lesbare intervaller: [6,7,8,14,15] -> "06–09, 14–16"
function ranges(hours) {
  if (!hours.length) return '';
  const set = new Set(hours);
  const out = [];
  for (let h = 0; h < 24; h++) {
    if (set.has(h) && !set.has((h + 23) % 24)) {
      let e = h;
      while (set.has((e + 1) % 24) && (e + 1) % 24 !== h) e = (e + 1) % 24;
      out.push(`${String(h).padStart(2, '0')}–${String((e + 1) % 24).padStart(2, '0')}`);
    }
  }
  return out.length ? out.join(', ') : 'hele døgnet';
}

export default function BestTimes({ server }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    api.history.bestTimes(server.id, server.max).then((d) => alive && setData(d)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [server.id, server.max]);

  if (!data) return null;
  if (!data.ready) {
    return (
      <div className="placeholder small">
        Samler data – vises når launcheren har fulgt serveren i ca. ett døgn ({data.hours} av 20 timer).
      </div>
    );
  }
  const top = Math.max(1, ...data.avg.filter((v) => v !== null));
  const nowH = new Date().getHours();
  const label = `Typisk antall spillere per time. Mest folk kl ${String(data.peak?.from).padStart(2, '0')}–${String(data.peak?.to).padStart(2, '0')}.`;

  return (
    <div className="best">
      <div className="best-facts">
        {data.peak && (
          <div>
            <div className="eyebrow">Mest folk</div>
            <strong>kl {String(data.peak.from).padStart(2, '0')}–{String(data.peak.to).padStart(2, '0')}</strong>
            <span className="muted-sm">snitt {data.peak.v} spillere</span>
          </div>
        )}
        {server.max > 0 && (
          <div>
            <div className="eyebrow">God plass som regel</div>
            <strong>{data.freeHours.length ? `kl ${ranges(data.freeHours)}` : 'Sjelden'}</strong>
            <span className="muted-sm">under 90 % fullt i snitt</span>
          </div>
        )}
      </div>
      <div className="hours" role="img" aria-label={label}>
        {data.avg.map((v, h) => (
          <div key={h} className={`hour${h === nowH ? ' now' : ''}`} title={v === null ? `kl ${h}: ingen data` : `kl ${h}: snitt ${v}`}>
            <i style={{ height: v === null ? 0 : `${Math.max(4, (v / top) * 100)}%` }} className={v === null ? 'none' : ''} />
            {h % 3 === 0 && <span>{String(h).padStart(2, '0')}</span>}
          </div>
        ))}
      </div>
      <div className="hint">Basert på {data.days} {data.days === 1 ? 'døgn' : 'døgn'} med data. Uthevet stolpe er nå.</div>
    </div>
  );
}
