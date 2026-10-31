import { useEffect, useState } from 'react';
import { ArrowUpRight, BadgeCheck, ChevronLeft, Clock, Copy, Globe, Loader2, MessageSquare, Play, Star } from 'lucide-react';
import ServerIcon from '../components/ServerIcon.jsx';
import Mountains from '../components/Mountains.jsx';
import Sparkline from '../components/Sparkline.jsx';
import BestTimes from '../components/BestTimes.jsx';
import NotesCard from '../components/NotesCard.jsx';
import { api, errText, formatAgo, formatDuration } from '../api.js';

export default function ServerPage({
  server, favorite, watch, activity, onBack, backLabel, onFav, onPlay, onWatch, notify, note, allTags, onSaveNote,
}) {
  const [thr, setThr] = useState('');
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    setDetails(null);
    api.servers
      .get(server.id)
      .then((d) => alive && setDetails(d))
      .catch((e) => alive && setErr(errText(e)))
      .finally(() => alive && setLoading(false));
    api.history.server(server.id).then((h) => alive && setHistory(h)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [server.id]);

  const s = { ...server, ...(details || {}), name: server.name || details?.name };
  const full = !s.offline && s.max > 0 && s.clients >= s.max;
  const pct = s.max ? Math.round((s.clients / s.max) * 100) : 0;
  const w = watch[s.id] || {};
  const played = activity.playtime[s.id];
  const last = activity.recent.find((r) => r.id === s.id);

  const copy = async () => {
    await navigator.clipboard.writeText(`connect cfx.re/join/${s.id}`);
    notify('Connect-kommando kopiert');
  };

  return (
    <div className="server-page">
      <div className="banner">
        {s.banner ? <div className="banner-img" style={{ backgroundImage: `url("${encodeURI(s.banner)}")` }} /> : <Mountains />}
        <button className="back" onClick={onBack}>
          <ChevronLeft size={16} strokeWidth={2} /> {backLabel}
        </button>
      </div>

      <div className="sp-wrap">
        <div className="sp-head">
          <div className="sp-icon"><ServerIcon server={s} size={112} radius={28} /></div>
          <div className="sp-title">
            <h1>
              {s.name}
              {s.verified && <BadgeCheck size={26} strokeWidth={2} className="verified" aria-label="Verifisert av FiveM Norge" />}
            </h1>
            <div className="sp-meta">
              <span className="status">
                <span className={`dot${s.offline ? ' off' : full ? ' full' : ''}`} />
                {s.offline ? 'Offline' : full ? 'Full' : 'Online'}
              </span>
              <button className="copy" onClick={copy} title="Kopier connect-kommando">
                cfx.re/join/{s.id} <Copy size={14} strokeWidth={1.8} />
              </button>
            </div>
          </div>
          <div className="sp-actions">
            <button className={`btn ghost xl${favorite ? ' fav' : ''}`} onClick={onFav}>
              <Star size={18} fill={favorite ? 'currentColor' : 'none'} strokeWidth={1.8} />
              {favorite ? 'Lagret' : 'Lagre'}
            </button>
            {full ? (
              <button className={`btn queue xl${w.autoJoin ? ' on' : ''}`} onClick={() => onWatch({ autoJoin: !w.autoJoin })}>
                <Clock size={18} strokeWidth={2} /> {w.autoJoin ? 'I kø – avbryt' : 'Bli med når ledig'}
              </button>
            ) : (
              <button className="btn play xl" onClick={onPlay} disabled={s.offline}>
                <Play size={18} fill="currentColor" /> Koble til
              </button>
            )}
          </div>
        </div>

        <div className="sp-cols">
          <div className="sp-main">
            <section className="sp-about">
              <h2 className="eyebrow">Om serveren</h2>
              <p>{s.desc || s.hostname || 'Ingen beskrivelse.'}</p>
              {s.tags?.length > 0 && (
                <div className="tags">
                  {s.tags.map((t) => <span key={t} className="tag lg">{t}</span>)}
                </div>
              )}
            </section>

            <section className="facts" aria-label="Serverinfo">
              <div className="fact">
                <div className="eyebrow">Spillere</div>
                <div className="fact-val">{s.offline ? '–' : s.clients}<i> / {s.max || '–'}</i></div>
                <div className="bar"><b className={full ? 'full' : ''} style={{ width: `${Math.max(pct, 2)}%` }} /></div>
              </div>
              <div className="fact"><div className="eyebrow">Språk</div><div className="fact-val sm">{s.locale || '–'}</div></div>
              <div className="fact"><div className="eyebrow">Game build</div><div className="fact-val sm mono">{s.gamebuild || 'Standard'}</div></div>
              <div className="fact"><div className="eyebrow">OneSync</div><div className="fact-val sm">{s.onesync ? 'Ja' : 'Nei'}</div></div>
            </section>

            <section className="card">
              <h2>Spillere siste 24 timer</h2>
              {history.length >= 2 ? (
                <Sparkline points={history} max={s.max} />
              ) : (
                <div className="placeholder">Samler data – grafen fylles ut mens launcheren er åpen (ett punkt hvert 10. minutt).</div>
              )}
            </section>

            <section className="card">
              <h2>Beste tid å spille</h2>
              <BestTimes server={s} />
            </section>

            {loading && <div className="muted-sm row-gap"><Loader2 className="spin" size={16} /> Henter detaljer…</div>}
            {err && <div className="muted-sm">{err}</div>}
          </div>

          <aside className="sp-side">
            {(s.discord || s.website) && (
              <section className="card">
                <h2>Lenker</h2>
                {s.discord && (
                  <button className="link-row" onClick={() => api.openExternal(s.discord)}>
                    <MessageSquare size={18} strokeWidth={1.8} /> <span>Discord-server</span> <ArrowUpRight size={15} />
                  </button>
                )}
                {s.website && (
                  <button className="link-row" onClick={() => api.openExternal(s.website)}>
                    <Globe size={18} strokeWidth={1.8} /> <span>Nettside</span> <ArrowUpRight size={15} />
                  </button>
                )}
              </section>
            )}

            <section className="card">
              <h2>Varsle meg</h2>
              <label className="check">
                <input type="checkbox" checked={!!w.free} onChange={(e) => onWatch({ free: e.target.checked })} />
                <span>Når serveren har ledig plass</span>
              </label>
              <label className="check">
                <input type="checkbox" checked={!!w.online} onChange={(e) => onWatch({ online: e.target.checked })} />
                <span>Når serveren kommer online igjen</span>
              </label>
              <label className="check">
                <input type="checkbox" checked={!!w.autoJoin} onChange={(e) => onWatch({ autoJoin: e.target.checked })} />
                <span>Koble til automatisk når det blir ledig</span>
              </label>
              <form
                className="check threshold"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (thr) onWatch({ threshold: Number(thr) });
                }}
              >
                <input
                  type="checkbox"
                  aria-label="Varsle over antall spillere"
                  checked={!!w.threshold}
                  onChange={(e) => onWatch({ threshold: e.target.checked ? Number(thr) || Math.max(10, Math.round((s.max || 100) * 0.5)) : null })}
                />
                <span>Når det er over</span>
                <label className="sr-only" htmlFor="thr">Antall spillere</label>
                <input
                  id="thr"
                  className="num"
                  type="number"
                  min="1"
                  max={s.max || 4096}
                  value={thr || w.threshold || ''}
                  placeholder={String(Math.max(10, Math.round((s.max || 100) * 0.5)))}
                  onChange={(e) => setThr(e.target.value)}
                  onBlur={() => w.threshold && thr && onWatch({ threshold: Number(thr) })}
                />
                <span>spillere</span>
              </form>
              <p className="hint">Sjekkes hvert 30. sekund mens launcheren er åpen. Står du i kø på flere servere, kobles du til den første som får plass.</p>
            </section>

            <NotesCard server={s} note={note} allTags={allTags} onSave={onSaveNote} />

            <section className="card">
              <h2>Din tid her</h2>
              <div className="big-num">{played ? formatDuration(played) : '–'}</div>
              {activity.active?.id === s.id ? (
                <div className="now-playing"><span className="dot pulse" /> Du spiller her nå</div>
              ) : (
                <div className="muted-sm">{last ? `Sist spilt ${formatAgo(last.at)}` : 'Ikke registrert ennå'}</div>
              )}
              <p className="hint">Måles mens launcheren kjører, også i bakgrunnen ved klokka.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
