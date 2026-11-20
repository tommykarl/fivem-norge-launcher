import { Maximize2, Play, X } from 'lucide-react';
import { api } from '../api.js';
import ServerIcon from './ServerIcon.jsx';

// Minimodus: et lite vindu som ligger øverst, med lagrede og nylig spilte servere og «Koble til».
export default function MiniView({ servers, favorites, recent, totalPlayers = 0, onConnect, onExit }) {
  const byId = new Map(servers.map((s) => [s.id, s]));
  const favIds = new Set(favorites.map((f) => f.id));
  const rows = [...favorites.map((f) => ({ ...f, fav: true })), ...recent.filter((r) => !favIds.has(r.id)).slice(0, 4)].slice(0, 10);
  return (
    <div className="mini">
      <header className="mini-top">
        <b>FiveM Norge</b>
        <span className="mini-live"><i />{totalPlayers.toLocaleString('no')} spiller</span>
        <span className="mini-sp" />
        <button onClick={onExit} aria-label="Vanlig vindu" title="Vanlig vindu (Ctrl+M)"><Maximize2 size={14} /></button>
        <button onClick={() => api.win.close()} aria-label="Lukk"><X size={14} /></button>
      </header>
      <div className="mini-list">
        {rows.length === 0 && <p className="muted-sm" style={{ padding: 14 }}>Lagre servere med stjernen, så dukker de opp her.</p>}
        {rows.map((r) => {
          const s = byId.get(r.id);
          const on = !!s;
          return (
            <div className="mini-row" key={r.id}>
              <ServerIcon server={s || r} size={30} radius={8} />
              <div className="mini-b">
                <span className="mini-n">{(s?.name || r.name || r.id).replace(/\^[0-9]/g, '')}</span>
                <span className="mini-s">{on ? `${s.clients} / ${s.max}` : 'Offline'}{r.fav ? ' · lagret' : ' · nylig'}</span>
              </div>
              <button className="mini-go" disabled={!on} onClick={() => onConnect(s)} aria-label={`Koble til ${s?.name || r.name}`} title="Koble til"><Play size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
