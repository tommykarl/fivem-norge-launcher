import { Home, KeyRound, LogIn, LogOut, Server, Settings, ShieldCheck, Users, Wrench } from 'lucide-react';
import DiscordIcon from './DiscordIcon.jsx';
import { LEVELS } from '../status.js';
import logo from '../assets/logo.png';

// Ikonmenyen til venstre – samme stil som adminpanelet og nettsiden
export default function Sidebar({ user, authBusy, onLogin, onLogout, route, go, counts, updateAvailable, statusLevel, isStaff, showFriends, onCodeLogin, onCache, chatUnread = 0 }) {
  const lvl = LEVELS[statusLevel || 'unknown'];
  const active = route.name === 'server' || route.name === 'compare' ? (['saved', 'recent'].includes(route.from) ? 'servers' : route.from || 'servers') : ['saved', 'recent'].includes(route.name) ? 'servers' : route.name;
  const nav = [
    { id: 'home', label: 'Hjem', icon: Home },
    { id: 'servers', label: `Servere (${counts.servers})`, icon: Server },
    ...(showFriends ? [{ id: 'friends', label: chatUnread ? `Venner – ${chatUnread} nye meldinger` : 'Venner', icon: Users, badge: chatUnread }] : []),
    ...(isStaff ? [{ id: 'admin', label: 'Admin', icon: ShieldCheck }] : []),
  ];
  const item = (id, label, Icon, extra) => (
    <button
      key={id}
      className={active === id ? 'ri on' : 'ri'}
      aria-current={active === id ? 'page' : undefined}
      aria-label={label}
      data-tip={label}
      onClick={() => go({ name: id })}
    >
      <Icon size={20} strokeWidth={1.8} />
      {extra}
    </button>
  );
  return (
    <aside className="rail">
      <button className="rail-logo" onClick={() => go({ name: 'home' })} aria-label="Hjem" data-tip="FiveM Norge">
        <img src={logo} width="26" height="26" alt="" draggable="false" />
      </button>
      <div className="rail-dots" aria-hidden="true"><i /><i /><i /></div>
      <nav aria-label="Hovedmeny" className="rail-nav">
        {nav.map(({ id, label, icon, badge }) => item(id, label, icon, badge ? <b className="ri-count">{badge > 9 ? '9+' : badge}</b> : null))}
        <button
          className={`ri status-ri ${lvl.cls}${active === 'status' ? ' on' : ''}`}
          aria-current={active === 'status' ? 'page' : undefined}
          aria-label={`FiveM-status: ${lvl.short}`}
          data-tip={`FiveM: ${lvl.short}`}
          onClick={() => go({ name: 'status' })}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </button>
      </nav>
      <div className="rail-foot">
        <button className="ri" onClick={onCache} aria-label="Tøm FiveM-cache" data-tip="Tøm FiveM-cache">
          <Wrench size={19} strokeWidth={1.8} />
        </button>
        {item('settings', updateAvailable ? 'Innstillinger – ny versjon' : 'Innstillinger', Settings, updateAvailable ? <b className="ri-dot" /> : null)}
        {user ? (
          <button className="ri" onClick={onLogout} aria-label="Logg ut" data-tip="Logg ut">
            <LogOut size={19} strokeWidth={1.8} />
          </button>
        ) : (
          <>
            {showFriends && (
              <button className="ri" onClick={onCodeLogin} aria-label="Logg inn med kode fra nettsiden" data-tip="Logg inn med kode">
                <KeyRound size={19} strokeWidth={1.8} />
              </button>
            )}
            <button className="ri discord-ri" onClick={onLogin} disabled={authBusy} aria-label="Logg inn med Discord" data-tip={authBusy ? 'Venter på Discord…' : 'Logg inn med Discord'}>
              {authBusy ? <LogIn size={19} /> : <DiscordIcon />}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
