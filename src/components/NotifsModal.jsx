import { useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { api } from '../api.js';

const KIND = { friend: '👋', group: '👥', claim: '🛡️', news: '📰', event: '📅' };
const when = (t) => {
  try {
    return new Date(t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

// Varsler fra fivemnorge.xyz – samme liste som på Min side
export default function NotifsModal({ notifs, onClose, onOpenServer, onOpenFriends, siteUrl }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // Markeres som lest litt etter at lista er åpnet
    const t = setTimeout(() => notifs.unread && api.notifs.read({ all: true }).catch(() => {}), 2500);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const open = (n) => {
    api.notifs.read({ ids: [n.id] }).catch(() => {});
    const srv = /^\/server\/([a-z0-9]{4,10})$/.exec(n.url || '');
    if (srv) onOpenServer(srv[1]);
    else if (n.kind === 'friend' || n.kind === 'group') onOpenFriends();
    else if (n.url && siteUrl) api.openExternal(`${siteUrl}${n.url}`);
    onClose();
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal notifs-modal" role="dialog" aria-modal="true" aria-labelledby="n-title">
        <div className="modal-head">
          <h2 id="n-title"><Bell size={18} /> Varsler</h2>
          <button ref={ref} type="button" className="icon-btn" onClick={onClose} aria-label="Lukk"><X size={16} /></button>
        </div>
        {notifs.items.length === 0 ? (
          <p className="modal-text">Ingen varsler ennå. Venneforespørsler, gruppeinvitasjoner, nyheter fra servere du har lagret og påminnelser kommer hit.</p>
        ) : (
          <ul className="notif-list">
            {notifs.items.map((n) => (
              <li key={n.id} className={n.read ? '' : 'unread'}>
                <button onClick={() => open(n)}>
                  <span className="n-ic" aria-hidden="true">{KIND[n.kind] || '🔔'}</span>
                  <span className="n-b">
                    <b>{n.title}</b>
                    {n.body && <span>{n.body}</span>}
                    <small>{when(n.at)}</small>
                  </span>
                  {!n.read && <i className="n-dot" aria-label="Ulest" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          {notifs.items.length > 0 && <button className="btn ghost" onClick={() => api.notifs.read({ all: true, clear: true }).then(onClose)}>Tøm</button>}
          <button className="btn" onClick={onClose}>Lukk</button>
        </div>
      </div>
    </div>
  );
}
