import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { api, errText } from '../api.js';

// Logg inn uten Discord-vinduet: launcheren viser en kode som godkjennes på Min side på fivemnorge.xyz
export default function CodeLoginModal({ onClose, onDone, notify }) {
  const [code, setCode] = useState(null);
  const [err, setErr] = useState(null);
  const timer = useRef(null);
  const closeBtn = useRef(null);

  const start = async () => {
    setErr(null);
    setCode(null);
    try {
      const c = await api.auth.codeStart();
      setCode(c);
      const until = Date.now() + c.expiresIn * 1000;
      const tick = async () => {
        if (Date.now() > until) return setErr('Koden er utløpt. Lag en ny.');
        try {
          const r = await api.auth.codePoll(c.poll);
          if (r.pending) timer.current = setTimeout(tick, 2500);
          else {
            notify(`Logget inn som ${r.user.displayName}`);
            onDone(r.user);
          }
        } catch (e) {
          setErr(errText(e));
        }
      };
      timer.current = setTimeout(tick, 2500);
    } catch (e) {
      setErr(errText(e));
    }
  };

  useEffect(() => {
    start();
    closeBtn.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="code-title">
        <div className="modal-head">
          <h2 id="code-title">Logg inn med kode</h2>
          <button ref={closeBtn} type="button" className="icon-btn" onClick={onClose} aria-label="Lukk"><X size={16} /></button>
        </div>
        <p className="modal-text">Åpne Min side på fivemnorge.xyz, logg inn med Discord der, og godkjenn koden under. Launcheren logger inn av seg selv.</p>
        {code ? (
          <>
            <div className="code-big" aria-live="polite">{code.code}</div>
            <button className="btn play" onClick={() => api.openExternal(code.url)}>
              <ExternalLink size={16} /> Åpne Min side og godkjenn
            </button>
            <p className="muted-sm row-gap"><Loader2 className="spin" size={14} /> Venter på godkjenning … Koden gjelder i 10 minutter.</p>
          </>
        ) : !err ? (
          <p className="muted-sm row-gap"><Loader2 className="spin" size={14} /> Lager kode …</p>
        ) : null}
        {err && (
          <div className="notice warn">
            {err} <button className="text-btn" onClick={start}>Lag ny kode</button>
          </div>
        )}
      </div>
    </div>
  );
}
