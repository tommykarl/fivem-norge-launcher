import { useEffect, useState } from 'react';
import {
  AlertTriangle, Bell, Bug, Database, Download, FolderOpen, Info, Keyboard, Loader2, LogOut, Monitor, Palette, RefreshCw, RotateCcw, Server, Trash2,
} from 'lucide-react';
import { ShortcutList } from '../components/ShortcutsModal.jsx';
import DiscordIcon from '../components/DiscordIcon.jsx';
import { api, errText } from '../api.js';

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ title, desc, children }) {
  return (
    <div className="set-row">
      <div className="set-text">
        <div className="set-title">{title}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="set-section">
      <h2><Icon size={18} strokeWidth={1.8} /> {title}</h2>
      <div className="set-card">{children}</div>
    </section>
  );
}

export default function SettingsPage({
  settings, setSetting, user, authBusy, onLogin, onLogout, onOpenCache, update, onCheckUpdate, checking, notify,
  updateState, onDownloadUpdate, onInstallUpdate, onShowShortcuts,
}) {
  const [info, setInfo] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'uninstall' | 'reset'
  const [busy, setBusy] = useState(false);
  const [iconDiag, setIconDiag] = useState(null);
  const [diagBusy, setDiagBusy] = useState(false);

  useEffect(() => {
    api.app.info().then(setInfo).catch(() => {});
  }, []);

  if (!settings) {
    return <div className="page"><div className="muted-sm row-gap"><Loader2 className="spin" size={16} /> Laster innstillinger…</div></div>;
  }

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) notify(okMsg);
      setConfirm(null);
    } catch (e) {
      notify(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page settings">
      <div className="page-head">
        <h1>Innstillinger</h1>
      </div>

      <Section icon={Monitor} title="Generelt">
        <Row title="Startside" desc="Siden launcheren åpner på.">
          <Segmented
            label="Startside"
            value={settings.startPage}
            onChange={(v) => setSetting({ startPage: v })}
            options={[
              { value: 'home', label: 'Hjem' },
              { value: 'servers', label: 'Servere' },
              { value: 'saved', label: 'Lagrede' },
            ]}
          />
        </Row>
        <Row title="Start med Windows" desc="Starter skjult i bakgrunnen når du logger inn, så varsler og kø virker.">
          <Toggle label="Start med Windows" checked={settings.autostart} onChange={(v) => setSetting({ autostart: v })} />
        </Row>
        <Row title="Kjør i bakgrunnen når vinduet lukkes" desc="Lukk-knappen legger launcheren i systemstatusfeltet ved klokka i stedet for å avslutte.">
          <Toggle label="Kjør i bakgrunnen" checked={settings.tray} onChange={(v) => setSetting({ tray: v })} />
        </Row>
        <Row title="Når FiveM starter" desc="Hva launcheren gjør når du kobler til en server.">
          <Segmented
            label="Når FiveM starter"
            value={settings.onLaunch}
            onChange={(v) => setSetting({ onLaunch: v })}
            options={[
              { value: 'none', label: 'Ingenting' },
              { value: 'minimize', label: 'Minimer' },
              { value: 'tray', label: 'Skjul' },
            ]}
          />
        </Row>
      </Section>

      <Section icon={Palette} title="Utseende">
        <Row title="Tema" desc="«System» følger innstillingen i Windows.">
          <Segmented
            label="Tema"
            value={settings.theme}
            onChange={(v) => setSetting({ theme: v })}
            options={[
              { value: 'dark', label: 'Mørk' },
              { value: 'light', label: 'Lys' },
              { value: 'system', label: 'System' },
            ]}
          />
        </Row>
        <Row title="Aksentfarge" desc="Brukes på knapper og markeringer.">
          <div className="swatches" role="radiogroup" aria-label="Aksentfarge">
            {[
              ['red', 'Rød', '#d92b43'],
              ['blue', 'Blå', '#2f6fe4'],
              ['green', 'Grønn', '#0f8f5c'],
              ['purple', 'Lilla', '#7445d6'],
              ['orange', 'Oransje', '#c4520f'],
            ].map(([v, label, color]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={settings.accent === v}
                aria-label={label}
                title={label}
                className={`swatch${settings.accent === v ? ' on' : ''}`}
                style={{ background: color }}
                onClick={() => setSetting({ accent: v })}
              />
            ))}
          </div>
        </Row>
      </Section>

      <Section icon={Server} title="Serverliste">
        <Row title="Oppdater listen hvert" desc="Hvor ofte spillertall hentes på nytt.">
          <Segmented
            label="Oppdateringsintervall"
            value={settings.refreshMin}
            onChange={(v) => setSetting({ refreshMin: v })}
            options={[1, 2, 5, 10].map((m) => ({ value: m, label: `${m} min` }))}
          />
        </Row>
        <Row title="Skjul tomme servere" desc="Servere uten spillere vises ikke i listen.">
          <Toggle label="Skjul tomme servere" checked={settings.hideEmpty} onChange={(v) => setSetting({ hideEmpty: v })} />
        </Row>
        <Row title="Kompakt liste" desc="Mindre rader, så flere servere får plass.">
          <Toggle label="Kompakt liste" checked={settings.compact} onChange={(v) => setSetting({ compact: v })} />
        </Row>
      </Section>

      <Section icon={Bell} title="Discord og varsler">
        <Row title="Discord-konto" desc={user ? `Logget inn som ${user.displayName}. Lagrede servere følger kontoen.` : 'Logg inn for å lagre servere og se servere fra Discord-fellesskapene dine.'}>
          {user ? (
            <button className="btn" onClick={onLogout}><LogOut size={16} /> Logg ut</button>
          ) : (
            <button className="btn discord" onClick={onLogin} disabled={authBusy}><DiscordIcon /> Logg inn</button>
          )}
        </Row>
        <Row title="Vis status i Discord" desc="«Ser etter servere» eller «Spiller på …» i profilen din. Krever at Discord-appen kjører.">
          <Toggle label="Vis status i Discord" checked={settings.rpc} onChange={(v) => setSetting({ rpc: v })} />
        </Row>
        <Row title="Windows-varsler" desc="Når en server du følger får ledig plass, kommer online eller du blir koblet til fra kø.">
          <Toggle label="Windows-varsler" checked={settings.notifications} onChange={(v) => setSetting({ notifications: v })} />
        </Row>
      </Section>

      <Section icon={Database} title="Lagring og cache">
        <Row title="FiveM-cache" desc="Tøm FiveM sin cache ved krasj, evige lasteskjermer eller teksturfeil.">
          <button className="btn" onClick={onOpenCache}><Trash2 size={16} /> Tøm cache…</button>
        </Row>
        <Row title="Spillerhistorikk" desc="Grafene og «Voksende servere» bygger på denne.">
          <button className="btn" disabled={busy} onClick={() => run(() => api.data.clearHistory(), 'Spillerhistorikk slettet')}>
            <Trash2 size={16} /> Slett historikk
          </button>
        </Row>
        <Row title="Datamappe" desc={info?.dataDir || ''}>
          <button className="btn" onClick={() => api.app.openDataDir()}><FolderOpen size={16} /> Åpne mappe</button>
        </Row>
        <Row title="Nullstill launcheren" desc="Sletter innlogging, lagrede servere, historikk og alle innstillinger, og starter på nytt.">
          <button className="btn danger-ghost" onClick={() => setConfirm('reset')}><RotateCcw size={16} /> Nullstill…</button>
        </Row>
      </Section>

      <Section icon={Download} title="Oppdateringer">
        <Row
          title={`Versjon ${info?.version || '…'}`}
          desc={
            !update
              ? 'Sjekk om det finnes en nyere versjon.'
              : !update.configured
              ? 'Oppdateringssjekk er ikke satt opp (UPDATE_REPO mangler i .env).'
              : update.newer
              ? `Versjon ${update.latest} er tilgjengelig.`
              : update.note || 'Du har nyeste versjon.'
          }
        >
          {updateState?.phase === 'ready' ? (
            <button className="btn play" onClick={onInstallUpdate}><RotateCcw size={16} /> Start på nytt og oppdater</button>
          ) : updateState?.phase === 'downloading' ? (
            <button className="btn" disabled><Loader2 size={16} className="spin" /> Laster ned {updateState.pct || 0} %</button>
          ) : update?.newer && update.canInstall ? (
            <button className="btn play" onClick={onDownloadUpdate}><Download size={16} /> Installer {update.latest}</button>
          ) : update?.newer ? (
            <button className="btn play" onClick={() => api.openExternal(update.url)}><Download size={16} /> Last ned {update.latest}</button>
          ) : (
            <button className="btn" onClick={onCheckUpdate} disabled={checking}>
              <RefreshCw size={16} className={checking ? 'spin' : ''} /> Se etter oppdateringer
            </button>
          )}
        </Row>
        <Row title="Se etter oppdateringer ved oppstart">
          <Toggle label="Se etter oppdateringer ved oppstart" checked={settings.autoUpdateCheck} onChange={(v) => setSetting({ autoUpdateCheck: v })} />
        </Row>
        <Row title="Last ned oppdateringer automatisk" desc="Nye versjoner lastes ned i bakgrunnen. Du velger selv når launcheren starter på nytt.">
          <Toggle label="Last ned oppdateringer automatisk" checked={settings.autoInstallUpdates} onChange={(v) => setSetting({ autoInstallUpdates: v })} />
        </Row>
        {updateState?.phase === 'error' && <div className="set-row"><div className="notice warn"><AlertTriangle size={16} /> {updateState.error}</div></div>}
        {update?.newer && update.notes && <pre className="release-notes">{update.notes}</pre>}
      </Section>

      <Section icon={Keyboard} title="Hurtigtaster">
        <div className="set-row">
          <ShortcutList />
        </div>
        <Row title="Vis hurtigtaster hvor som helst" desc="Trykk ? (spørsmålstegn) når du ikke skriver i et felt.">
          <button className="btn" onClick={onShowShortcuts}><Keyboard size={16} /> Vis</button>
        </Row>
      </Section>

      <Section icon={Bug} title="Feilsøking">
        <Row title="Test serverlogoer" desc="Henter logoen til de tre største serverne på flere måter og viser hva FiveM svarer. Ta gjerne et skjermbilde hvis logoene ikke vises.">
          <button
            className="btn"
            disabled={diagBusy}
            onClick={async () => {
              setDiagBusy(true);
              try {
                setIconDiag(await api.app.debugIcons());
              } catch (e) {
                notify(errText(e));
              } finally {
                setDiagBusy(false);
              }
            }}
          >
            {diagBusy ? <Loader2 size={16} className="spin" /> : <Bug size={16} />} Test logoer
          </button>
        </Row>
        {iconDiag && (
          <div className="set-row diag">
            {iconDiag.length === 0 && <div className="muted-sm">Serverlisten er tom – får ikke testet.</div>}
            {iconDiag.map((d) => (
              <div key={d.id} className="diag-server">
                <div className="diag-title">
                  {d.iconVersion ? (
                    <img src={`https://frontend.cfx-services.net/api/servers/icon/${d.id}/${d.iconVersion}.png`} alt="" width="32" height="32" />
                  ) : null}
                  <strong>{d.name}</strong>
                  <span className="mono muted-sm">{d.id} · iconVersion {d.iconVersion}</span>
                </div>
                {d.iconVersion === 0 && <div className="muted-sm">Serveren oppgir ingen logo (iconVersion 0).</div>}
                {d.results.map((r, i) => (
                  <div key={i} className="diag-line mono">
                    <span className={r.status === 200 ? 'ok' : 'bad'}>{r.status ?? 'feil'}</span>
                    <span>{r.via}</span>
                    <span title={r.url}>{r.url.replace('https://', '').replace(/\/api\/servers\/icon.*/, '')}</span>
                    <span>{r.error || `${r.type || '–'} · ${r.bytes} B`}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={Info} title="Om og avinstallering">
        <Row
          title="FiveM Norge Launcher"
          desc={info ? `${info.portable ? 'Portabel versjon' : info.packaged ? `Installert i ${info.installDir}` : 'Utviklingsmodus'} · Electron ${info.electron}` : ''}
        >
          <button className="btn" onClick={() => api.app.quit()}>Avslutt launcheren</button>
        </Row>
        <Row title="Avinstaller" desc={info?.canUninstall ? 'Fjerner launcheren fra PC-en. Lagrede data i datamappen beholdes til du sletter dem.' : info?.portable ? 'Den portable versjonen er ikke installert – slett bare .exe-filen.' : 'Bare tilgjengelig i den installerte versjonen.'}>
          <button className="btn danger-ghost" onClick={() => setConfirm('uninstall')} disabled={!info?.canUninstall}>
            <Trash2 size={16} /> Avinstaller…
          </button>
        </Row>
      </Section>

      {confirm && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="modal-head">
              <h2 id="confirm-title">{confirm === 'uninstall' ? 'Avinstallere launcheren?' : 'Nullstille launcheren?'}</h2>
            </div>
            <div className="notice warn">
              <AlertTriangle size={16} />
              {confirm === 'uninstall'
                ? 'Launcheren lukkes og Windows-avinstalleringen starter.'
                : 'Du blir logget ut, og lagrede servere, historikk og innstillinger slettes. Dette kan ikke angres.'}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirm(null)}>Avbryt</button>
              <button
                className="btn danger"
                disabled={busy}
                onClick={() => run(confirm === 'uninstall' ? () => api.app.uninstall() : () => api.data.resetAll())}
              >
                {busy ? <Loader2 className="spin" size={16} /> : null}
                {confirm === 'uninstall' ? 'Avinstaller' : 'Nullstill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
