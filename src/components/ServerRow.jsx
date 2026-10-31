import { ArrowLeftRight, BadgeCheck, Clock, Play, Star } from 'lucide-react';
import ServerIcon from './ServerIcon.jsx';

export default function ServerRow({
  server: s, rank, favorite, queued, meta, myTags = [], comparing, selected, rowRef, onOpen, onFav, onPlay, onQueue, onCompare,
}) {
  const pct = s.max ? Math.round((s.clients / s.max) * 100) : 0;
  const full = !s.offline && s.max > 0 && s.clients >= s.max;

  return (
    <div ref={rowRef} className={`row${s.offline ? ' offline' : ''}${selected ? ' kbd-sel' : ''}`} aria-selected={selected || undefined}>
      <span className="rank">{String(rank).padStart(2, '0')}</span>

      <div className="row-main">
        <ServerIcon server={s} size={48} />
        <div className="row-text">
          <div className="row-title">
            <button className="row-name" onClick={onOpen} title={s.hostname || s.name}>{s.name}</button>
            {s.verified && <BadgeCheck size={16} strokeWidth={2} className="verified" aria-label="Verifisert" />}
            {s.featured && <span className="tag featured">Fremhevet</span>}
          </div>
          <div className="row-sub">
            <span className="row-desc">{meta || s.desc || s.hostname}</span>
            {myTags.slice(0, 3).map((t) => <span key={`m-${t}`} className="tag mine">{t}</span>)}
            {!meta && s.tags?.slice(0, myTags.length ? 1 : 3).map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
        </div>
      </div>

      <div className="row-players">
        {s.offline ? (
          <span className="muted-sm">Offline</span>
        ) : (
          <>
            <div className="row-count">
              <span className={full ? 'full' : ''}>
                {s.clients}<i> / {s.max}</i>
              </span>
              <span className="mono">{full ? 'FULL' : `${pct}%`}</span>
            </div>
            <div className="bar"><b className={full ? 'full' : ''} style={{ width: `${Math.max(pct, 2)}%` }} /></div>
          </>
        )}
      </div>

      <div className="row-actions">
        {onCompare && (
          <button
            className={`icon-btn lg cmp${comparing ? ' on' : ''}`}
            onClick={onCompare}
            aria-pressed={!!comparing}
            aria-label={comparing ? `Fjern ${s.name} fra sammenligning` : `Sammenlign ${s.name}`}
            title={comparing ? 'Fjern fra sammenligning' : 'Sammenlign'}
            disabled={s.offline}
          >
            <ArrowLeftRight size={17} strokeWidth={1.8} />
          </button>
        )}
        <button
          className={`icon-btn lg${favorite ? ' fav' : ''}`}
          onClick={onFav}
          aria-label={favorite ? `Fjern ${s.name} fra lagrede` : `Lagre ${s.name}`}
          title={favorite ? 'Fjern fra lagrede' : 'Lagre'}
        >
          <Star size={18} fill={favorite ? 'currentColor' : 'none'} strokeWidth={1.8} />
        </button>
        {full ? (
          <button className={`btn queue${queued ? ' on' : ''}`} onClick={onQueue} title="Kobler deg til automatisk når det blir ledig plass">
            <Clock size={15} strokeWidth={2} /> {queued ? 'I kø' : 'Vent'}
          </button>
        ) : (
          <button className="btn play" onClick={onPlay} disabled={s.offline}>
            <Play size={14} fill="currentColor" /> Spill
          </button>
        )}
      </div>
    </div>
  );
}
