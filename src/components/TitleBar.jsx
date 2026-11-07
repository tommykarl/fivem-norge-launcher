import { Bell, Minus, Search, Square, X } from 'lucide-react';
import { api } from '../api.js';
import DiscordIcon from './DiscordIcon.jsx';

// Topplinja: tittel, søk, live-tall, varsler og konto. Hele linja kan dras for å flytte vinduet.
export default function TitleBar({ title, sub, totalPlayers = 0, serverCount = 0, user, roleInfo, unread = 0, onOpenNotifs, onSearch, onLogin, authBusy, showBell }) {
  const w = api.win;
  return (
    <header className="topbar">
      <div className="top-title">
        <h1>{title}</h1>
        {sub && <span className="top-sub">{sub}</span>}
      </div>
      <button className="top-search" onClick={onSearch}>
        <Search size={17} strokeWidth={1.8} />
        <span>Søk etter servere</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="top-right">
        <span className="live-pill" title={`${serverCount} norske servere`}>
          <i />
          {totalPlayers.toLocaleString('no')} spiller nå
        </span>
        {showBell && (
          <button className="ri bell-btn" onClick={onOpenNotifs} aria-label={unread ? `Varsler, ${unread} uleste` : 'Varsler'} data-tip-below="Varsler">
            <Bell size={19} strokeWidth={1.8} />
            {unread > 0 && <b className="ri-count">{unread > 9 ? '9+' : unread}</b>}
          </button>
        )}
        {user ? (
          <span className="avatar" title={roleInfo && roleInfo.id !== 'user' ? `${user.displayName} · ${roleInfo.name}` : user.displayName}>
            <img src={user.avatar} alt={user.displayName} draggable="false" />
          </span>
        ) : (
          <button className="btn login-pill" onClick={onLogin} disabled={authBusy}>
            <DiscordIcon /> {authBusy ? 'Venter…' : 'Logg inn'}
          </button>
        )}
        <div className="win-controls">
          <button onClick={w.minimize} aria-label="Minimer"><Minus size={14} /></button>
          <button onClick={w.maximize} aria-label="Maksimer"><Square size={12} /></button>
          <button className="close" onClick={w.close} aria-label="Lukk"><X size={15} /></button>
        </div>
      </div>
    </header>
  );
}
