import { Bell, Clock, Home, KeyRound, LogOut, Server, Settings, ShieldCheck, Star, Users } from 'lucide-react';
import DiscordIcon from './DiscordIcon.jsx';
import { LEVELS } from '../status.js';

const NAV = [
  { id: 'home', label: 'Hjem', icon: Home },
  { id: 'servers', label: 'Servere', icon: Server, countKey: 'servers' },
  { id: 'saved', label: 'Lagrede', icon: Star, countKey: 'saved' },
  { id: 'recent', label: 'Nylig spilt', icon: Clock, countKey: 'recent' },
];

export default function Sidebar({ user, authBusy, onLogin, onLogout, route, go, counts, totalPlayers, updateAvailable, statusLevel, isStaff, showFriends, roleInfo, unread, onOpenNotifs, onCodeLogin }) {
  const lvl = LEVELS[statusLevel || 'unknown'];
  const active = route.name === 'server' ? route.from || 'servers' : route.name;
  const nav = [
    ...NAV,
    ...(showFriends ? [{ id: 'friends', label: 'Venner', icon: Users }] : []),
    ...(isStaff ? [{ id: 'admin', label: 'Admin', icon: ShieldCheck }] : []),
  ];
  return (
    <aside className="sidebar">
      <nav aria-label="Hovedmeny" className="side-nav">
        <div className="eyebrow side-label">Utforsk</div>
        {nav.map(({ id, label, icon: Icon, countKey }) => (
          <button
            key={id}
            className={active === id ? 'nav active' : 'nav'}
            aria-current={active === id ? 'page' : undefined}
            onClick={() => go({ name: id })}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
            {countKey && <em>{counts[countKey]}</em>}
          </button>
        ))}
      </nav>

      <section className="live-card" aria-label="Live-status">
        <div className="eyebrow live-label"><span className="dot" /> Live i Norge</div>
        <div className="live-grid">
          <div>
            <strong>{totalPlayers.toLocaleString('no')}</strong>
            <small>spillere</small>
          </div>
          <div>
            <strong>{counts.servers}</strong>
            <small>servere</small>
          </div>
        </div>
      </section>

      <button
        className={`status-chip ${lvl.cls}${active === 'status' ? ' active' : ''}`}
        onClick={() => go({ name: 'status' })}
        aria-current={active === 'status' ? 'page' : undefined}
      >
        <i />
        <span>
          <small>FiveM-status</small>
          {lvl.short}
        </span>
      </button>

      <div className="side-bottom">
        <button
          className={active === 'settings' ? 'nav active' : 'nav'}
          aria-current={active === 'settings' ? 'page' : undefined}
          onClick={() => go({ name: 'settings' })}
        >
          <Settings size={18} strokeWidth={1.8} />
          <span>Innstillinger</span>
          {updateAvailable && <i className="badge-dot" aria-label="Oppdatering tilgjengelig" />}
        </button>
        {user ? (
          <div className="user">
            <img src={user.avatar} alt="" />
            <div className="who">
              <strong>{user.displayName}</strong>
              {roleInfo && roleInfo.id !== 'user' ? (
                <small className="role-tag" style={roleInfo.color ? { color: roleInfo.color } : undefined}>{roleInfo.name}</small>
              ) : (
                <small>Discord tilkoblet</small>
              )}
            </div>
            <button className="icon-btn bell-btn" onClick={onOpenNotifs} aria-label={unread ? `Varsler, ${unread} uleste` : 'Varsler'} title="Varsler">
              <Bell size={16} />
              {unread > 0 && <em className="bell-count">{unread > 9 ? '9+' : unread}</em>}
            </button>
            <button className="icon-btn" onClick={onLogout} aria-label="Logg ut" title="Logg ut">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <>
            <button className="btn discord full" onClick={onLogin} disabled={authBusy}>
              <DiscordIcon />
              {authBusy ? 'Venter på Discord…' : 'Logg inn med Discord'}
            </button>
            {showFriends && (
              <button className="text-btn code-login" onClick={onCodeLogin}>
                <KeyRound size={14} /> Logg inn med kode fra nettsiden
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
