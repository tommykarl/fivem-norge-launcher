import { useCallback, useEffect, useState } from 'react';
import { Check, EyeOff, ExternalLink, Eye, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, errText, formatAgo } from '../api.js';

// Admin i launcheren: det viktigste fra adminpanelet på fivemnorge.xyz.
// Rettighetene sjekkes på serveren – denne siden viser bare det du har lov til.
const ROLE_LABEL = { owner: 'Eier', admin: 'Admin', moderator: 'Moderator', user: 'Bruker' };
const call = (method, path, body) => api.backend.api(method, `/api/admin${path}`, body);

// Liten bekreftelse med valgfri årsak (window.prompt finnes ikke i Electron)
function ReasonAction({ label, confirmLabel, placeholder, onConfirm, className = 'btn sm danger' }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <button className={className} onClick={() => setOpen(true)}>{label}</button>;
  return (
    <form className="form-row" onSubmit={(e) => { e.preventDefault(); onConfirm(reason); setOpen(false); setReason(''); }}>
      <input className="input" autoFocus style={{ minWidth: 200, minHeight: 32 }} value={reason} maxLength={300} placeholder={placeholder} onChange={(e) => setReason(e.target.value)} aria-label={placeholder} />
      <button className="btn sm danger">{confirmLabel}</button>
      <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Avbryt</button>
    </form>
  );
}

function RolePill({ u }) {
  if (u.banned) return <span className="pill-role banned">Utestengt</span>;
  const r = u.owner ? 'owner' : u.role;
  return <span className={`pill-role ${r}`}>{ROLE_LABEL[r] || r}</span>;
}

export default function AdminPage({ account, adminUrl, notify }) {
  const [tab, setTab] = useState('overview');
  const [ov, setOv] = useState(null);
  const role = account?.role;
  const canManage = role === 'owner' || role === 'admin';

  const loadOv = useCallback(() => call('GET', '/overview').then(setOv).catch((e) => notify(errText(e))), [notify]);
  useEffect(() => {
    loadOv();
  }, [loadOv]);

  const TABS = [
    ['overview', 'Oversikt'],
    ['users', 'Brukere'],
    ['announcements', 'Kunngjøringer'],
    ['claims', 'Servereiere', ov?.pendingClaims],
    ['reviews', 'Anmeldelser'],
    ['errors', 'Feil', ov?.openErrors],
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Admin</h1>
        <span className="muted-sm">Du er {ROLE_LABEL[role]?.toLowerCase() || role}</span>
        {adminUrl && (
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => api.openExternal(adminUrl)}>
            <ExternalLink size={14} /> Fullt adminpanel
          </button>
        )}
      </div>
      <div className="tabs" role="tablist" aria-label="Admin">
        {TABS.map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
            {n > 0 && <em>{n}</em>}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview ov={ov} reload={loadOv} />}
      {tab === 'users' && <Users notify={notify} role={role} canManage={canManage} />}
      {tab === 'announcements' && <Announcements notify={notify} />}
      {tab === 'claims' && <Claims notify={notify} canManage={canManage} onChange={loadOv} />}
      {tab === 'reviews' && <Reviews notify={notify} />}
      {tab === 'errors' && <Errors notify={notify} onChange={loadOv} />}
    </div>
  );
}

function Overview({ ov, reload }) {
  if (!ov) return <p className="muted-sm">Henter…</p>;
  const k = [
    ['Aktive brukere (døgn)', ov.users.active24h],
    ['Installasjoner (7 d)', ov.installs.active7d],
    ['Nye brukere (7 d)', ov.users.new7d],
    ['Spillere nå (live)', ov.live?.players ?? '–'],
    ['Krav som venter', ov.pendingClaims ?? 0],
    ['Åpne feil', ov.openErrors],
  ];
  return (
    <>
      <div className="kpis">
        {k.map(([l, v]) => (
          <div className="kpi" key={l}><small>{l}</small><strong>{v}</strong></div>
        ))}
      </div>
      <section className="card">
        <div className="card-head"><h2>Siste handlinger</h2><button className="btn ghost sm" onClick={reload}><RefreshCw size={14} /> Oppdater</button></div>
        <div className="admin-list" style={{ border: 0 }}>
          {ov.log.length === 0 && <p className="muted-sm">Ingenting ennå.</p>}
          {ov.log.map((l) => (
            <div className="admin-item" key={l.id}>
              <div className="grow"><strong>{l.action}</strong><small>{l.admin_name} · {l.target} · {formatAgo(l.at)}</small></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Users({ notify, role, canManage }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [list, setList] = useState(null);
  const load = useCallback(() => {
    call('GET', `/users?q=${encodeURIComponent(q)}&filter=${filter}`).then(setList).catch((e) => notify(errText(e)));
  }, [q, filter, notify]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const update = async (u, patch, msg) => {
    try {
      await call('POST', `/users/${u.id}`, patch);
      notify(msg);
      load();
    } catch (e) {
      notify(errText(e));
    }
  };

  return (
    <>
      <div className="form-row">
        <label className="sr-only" htmlFor="adm-q">Søk</label>
        <input id="adm-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk på navn eller Discord-ID" />
        <div className="tabs">
          {[['all', 'Alle'], ['active', 'Aktive'], ['staff', 'Stab'], ['banned', 'Utestengt']].map(([id, l]) => (
            <button key={id} className={filter === id ? 'on' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="admin-list">
        {!list && <p className="muted-sm" style={{ padding: 16 }}>Henter…</p>}
        {list?.length === 0 && <p className="muted-sm" style={{ padding: 16 }}>Ingen brukere funnet.</p>}
        {list?.map((u) => (
          <div className="admin-item" key={u.id}>
            <img src={u.avatar} alt="" />
            <div className="grow">
              <strong>{u.display_name || u.username} <RolePill u={u} /></strong>
              <small>@{u.username} · {u.id} · sist sett {formatAgo(u.last_seen)}{u.version ? ` · v${u.version}` : ''}{u.ban_reason ? ` · Årsak: ${u.ban_reason}` : ''}</small>
            </div>
            {!u.owner && canManage && (
              <select className="input" style={{ width: 140, minHeight: 32 }} value={u.role} aria-label="Rolle" onChange={(e) => update(u, { role: e.target.value }, 'Rollen er endret')}>
                <option value="user">Bruker</option>
                <option value="moderator">Moderator</option>
                {role === 'owner' && <option value="admin">Admin</option>}
                {role !== 'owner' && u.role === 'admin' && <option value="admin">Admin</option>}
              </select>
            )}
            {!u.owner && (u.banned ? (
              <button className="btn sm ghost" onClick={() => update(u, { banned: false }, 'Utestengelsen er opphevet')}>Opphev</button>
            ) : (
              <ReasonAction label="Utesteng" confirmLabel="Utesteng" placeholder="Årsak (valgfritt)" onConfirm={(reason) => update(u, { banned: true, banReason: reason }, `${u.display_name || u.username} er utestengt`)} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function Announcements({ notify }) {
  const [list, setList] = useState(null);
  const [f, setF] = useState({ title: '', body: '', level: 'info' });
  const load = useCallback(() => call('GET', '/announcements').then(setList).catch((e) => notify(errText(e))), [notify]);
  useEffect(() => {
    load();
  }, [load]);
  const create = async (e) => {
    e.preventDefault();
    try {
      await call('POST', '/announcements', { ...f, active: true });
      setF({ title: '', body: '', level: 'info' });
      notify('Kunngjøringen er publisert');
      load();
    } catch (e2) {
      notify(errText(e2));
    }
  };
  const act = async (a, method, body, msg) => {
    try {
      await call(method, `/announcements/${a.id}`, body);
      notify(msg);
      load();
    } catch (e) {
      notify(errText(e));
    }
  };
  return (
    <>
      <form className="card" onSubmit={create}>
        <h2>Ny kunngjøring</h2>
        <label className="field">Tittel<input className="input" required maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="field">Tekst<textarea className="input" maxLength={1000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
        <div className="form-row">
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>Nivå
            <select className="input" style={{ width: 160 }} value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
              <option value="info">Info</option>
              <option value="warning">Advarsel</option>
              <option value="critical">Kritisk (kan ikke lukkes)</option>
            </select>
          </label>
          <button className="btn play" disabled={!f.title.trim()}><Plus size={16} /> Publiser</button>
        </div>
      </form>
      <div className="admin-list">
        {list?.length === 0 && <p className="muted-sm" style={{ padding: 16 }}>Ingen kunngjøringer.</p>}
        {list?.map((a) => (
          <div className="admin-item" key={a.id}>
            <div className="grow">
              <strong>{a.title} <span className={`pill-role ${a.level === 'critical' ? 'banned' : a.level === 'warning' ? 'moderator' : ''}`}>{a.active ? 'Vises' : 'Av'}</span></strong>
              {a.body && <p>{a.body}</p>}
              <small>{a.created_by} · {formatAgo(a.created_at)}</small>
            </div>
            <button className="btn sm ghost" onClick={() => act(a, 'POST', { active: !a.active }, a.active ? 'Skrudd av' : 'Vises igjen')}>{a.active ? 'Skru av' : 'Vis'}</button>
            <button className="icon-btn" aria-label="Slett" title="Slett" onClick={() => act(a, 'DELETE', undefined, 'Slettet')}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

function Claims({ notify, canManage, onChange }) {
  const [all, setAll] = useState(false);
  const [list, setList] = useState(null);
  const load = useCallback(() => call('GET', `/claims${all ? '?show=all' : ''}`).then(setList).catch((e) => notify(errText(e))), [all, notify]);
  useEffect(() => {
    load();
  }, [load]);
  const decide = async (c, approve, reason = '') => {
    try {
      await call('POST', `/claims/${c.id}`, approve ? { approve: true } : { approve: false, reason });
      notify(approve ? 'Godkjent – serveren er verifisert' : 'Avvist');
      load();
      onChange();
    } catch (e) {
      notify(errText(e));
    }
  };
  return (
    <>
      <div className="form-row">
        <div className="tabs">
          <button className={!all ? 'on' : ''} onClick={() => setAll(false)}>Venter</button>
          <button className={all ? 'on' : ''} onClick={() => setAll(true)}>Alle</button>
        </div>
        {!canManage && <span className="hint">Bare administratorer kan godkjenne.</span>}
      </div>
      <div className="admin-list">
        {list?.length === 0 && <p className="muted-sm" style={{ padding: 16 }}>Ingen krav {all ? '' : 'som venter'}.</p>}
        {list?.map((c) => (
          <div className="admin-item" key={c.id}>
            <div className="grow">
              <strong>{c.server_name} <span className="hint">({c.server_id})</span> {c.status !== 'pending' && <span className={`pill-role ${c.status === 'approved' ? 'admin' : 'banned'}`}>{c.status === 'approved' ? 'Godkjent' : 'Avvist'}</span>}</strong>
              <small>Fra {c.user_name} · {formatAgo(c.created_at)}</small>
              <p>{c.description}</p>
              {c.contact && <p><b>Bekreftelse:</b> {c.contact}</p>}
              {(c.discord || c.website) && <p>{[c.discord, c.website].filter(Boolean).join(' · ')}</p>}
            </div>
            {c.status === 'pending' && canManage && (
              <>
                <button className="btn sm play" onClick={() => decide(c, true)}><Check size={14} /> Godkjenn</button>
                <ReasonAction label="Avvis" className="btn sm ghost" confirmLabel="Avvis" placeholder="Hvorfor? (vises for søkeren)" onConfirm={(reason) => decide(c, false, reason)} />
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function Reviews({ notify }) {
  const [list, setList] = useState(null);
  const load = useCallback(() => call('GET', '/reviews').then(setList).catch((e) => notify(errText(e))), [notify]);
  useEffect(() => {
    load();
  }, [load]);
  const act = async (r, method, body, msg) => {
    try {
      await call(method, `/reviews/${r.key}`, body);
      notify(msg);
      load();
    } catch (e) {
      notify(errText(e));
    }
  };
  return (
    <div className="admin-list">
      {list?.length === 0 && <p className="muted-sm" style={{ padding: 16 }}>Ingen anmeldelser ennå.</p>}
      {list?.map((r) => (
        <div className="admin-item" key={r.key} style={r.hidden ? { opacity: 0.6 } : undefined}>
          <div className="grow">
            <strong>{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)} {r.server_name}</strong>
            <small>{r.user_name} · {formatAgo(r.updated_at)}{r.hidden ? ' · skjult' : ''}</small>
            {r.text && <p>{r.text}</p>}
          </div>
          <button className="icon-btn" aria-label={r.hidden ? 'Vis' : 'Skjul'} title={r.hidden ? 'Vis' : 'Skjul'} onClick={() => act(r, 'POST', { hidden: !r.hidden }, r.hidden ? 'Vises igjen' : 'Skjult')}>
            {r.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button className="icon-btn" aria-label="Slett" title="Slett" onClick={() => act(r, 'DELETE', undefined, 'Slettet')}><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  );
}

function Errors({ notify, onChange }) {
  const [list, setList] = useState(null);
  const load = useCallback(() => call('GET', '/errors').then(setList).catch((e) => notify(errText(e))), [notify]);
  useEffect(() => {
    load();
  }, [load]);
  const resolve = async (e) => {
    try {
      await call('POST', `/errors/${e.id}`, { resolved: true });
      load();
      onChange();
    } catch (err) {
      notify(errText(err));
    }
  };
  return (
    <div className="admin-list">
      {list?.length === 0 && <p className="muted-sm" style={{ padding: 16 }}>Ingen åpne feil. 🎉</p>}
      {list?.map((e) => (
        <div className="admin-item" key={e.id}>
          <div className="grow">
            <strong>{e.kind === 'user' && <span className="pill-role admin" style={{ marginRight: 6 }}>Fra bruker</span>}{e.message}</strong>
            {e.kind === 'user' ? (
              <>
                <small>{e.user_name || 'Ikke innlogget'}{e.contact ? ` · ${e.contact}` : ''} · v{e.version || '?'} · {formatAgo(e.first_seen)}</small>
                <p style={{ whiteSpace: 'pre-wrap' }}>{e.stack}</p>
                {e.system && <small>{Object.entries(e.system).map(([k, v]) => `${k}: ${v}`).join(' · ')}</small>}
              </>
            ) : (
              <small>v{e.version || '?'} · {e.count} ganger på {e.installs} PC-er · sist {formatAgo(e.last_seen)}</small>
            )}
          </div>
          <button className="btn sm ghost" onClick={() => resolve(e)}><Check size={14} /> Løst</button>
        </div>
      ))}
    </div>
  );
}
