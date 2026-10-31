import { useEffect, useState } from 'react';
import { ChevronLeft, Play, Star, X } from 'lucide-react';
import ServerIcon from '../components/ServerIcon.jsx';
import { api, formatDuration } from '../api.js';

const pad = (h) => String(h).padStart(2, '0');

export default function ComparePage({ servers, ids, favIds, activity, notes, onRemove, onBack, onOpen, onPlay, onFav }) {
  const list = ids.map((id) => servers.find((s) => s.id === id)).filter(Boolean);
  const [best, setBest] = useState({});

  useEffect(() => {
    let alive = true;
    Promise.all(list.map((s) => api.history.bestTimes(s.id, s.max).then((b) => [s.id, b]).catch(() => [s.id, null]))).then(
      (pairs) => alive && setBest(Object.fromEntries(pairs))
    );
    return () => {
      alive = false;
    };
  }, [ids.join(',')]);

  const rows = [
    ['Spillere nå', (s) => `${s.clients} / ${s.max}`, (s) => s.clients],
    ['Fyllingsgrad', (s) => (s.max ? `${Math.round((s.clients / s.max) * 100)} %` : '–'), (s) => (s.max ? s.clients / s.max : 0)],
    ['Maks plasser', (s) => s.max || '–', (s) => s.max],
    ['Mest folk', (s) => (best[s.id]?.ready && best[s.id].peak ? `kl ${pad(best[s.id].peak.from)}–${pad(best[s.id].peak.to)}` : 'Samler data')],
    ['Språk', (s) => s.locale || '–'],
    ['Game build', (s) => s.gamebuild || 'Standard'],
    ['OneSync', (s) => (s.onesync ? 'Ja' : 'Nei')],
    ['Ressurser', (s) => s.resourcesCount || '–', (s) => s.resourcesCount || 0],
    ['Whitelist', (s) => (s.whitelist ? 'Ja' : 'Nei')],
    ['Din spilletid', (s) => (activity.playtime[s.id] ? formatDuration(activity.playtime[s.id]) : '–'), (s) => activity.playtime[s.id] || 0],
    ['Mine merker', (s) => (notes[s.id]?.tags?.length ? notes[s.id].tags.join(', ') : '–')],
    ['Tags', (s) => (s.tags?.length ? s.tags.slice(0, 6).join(', ') : '–')],
  ];

  return (
    <div className="page">
      <button className="back inline" onClick={onBack}><ChevronLeft size={16} strokeWidth={2} /> Tilbake</button>
      <div className="page-head">
        <h1>Sammenlign servere</h1>
        <span className="muted-sm">{list.length} av 3</span>
      </div>

      {list.length < 2 ? (
        <div className="empty">
          <p>Velg minst to servere med sammenlign-knappen i serverlisten.</p>
        </div>
      ) : (
        <div className="compare-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Egenskap</span></th>
                {list.map((s) => (
                  <th key={s.id} scope="col">
                    <div className="cmp-head">
                      <button className="icon-btn cmp-x" onClick={() => onRemove(s.id)} aria-label={`Fjern ${s.name} fra sammenligning`}><X size={15} /></button>
                      <ServerIcon server={s} size={56} radius={16} />
                      <button className="row-name" onClick={() => onOpen(s)}>{s.name}</button>
                      <div className="cmp-actions">
                        <button className={`icon-btn lg${favIds.has(s.id) ? ' fav' : ''}`} onClick={() => onFav(s)} aria-label={favIds.has(s.id) ? `Fjern ${s.name} fra lagrede` : `Lagre ${s.name}`}>
                          <Star size={18} fill={favIds.has(s.id) ? 'currentColor' : 'none'} strokeWidth={1.8} />
                        </button>
                        <button className="btn play" onClick={() => onPlay(s)}><Play size={14} fill="currentColor" /> Spill</button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, fmt, score]) => {
                // Uthev beste verdi der det gir mening
                const scores = score ? list.map(score) : null;
                const bestScore = scores ? Math.max(...scores) : null;
                return (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {list.map((s, i) => (
                      <td key={s.id} className={scores && bestScore > 0 && scores[i] === bestScore && scores.filter((x) => x === bestScore).length === 1 ? 'top' : ''}>
                        {fmt(s)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
