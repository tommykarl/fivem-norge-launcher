import { useEffect, useRef, useState } from 'react';
import { Link2, Loader2, X } from 'lucide-react';
import { api, errText } from '../api.js';

// Koble til med cfx.re/join-lenke, server-ID eller IP-adresse
export default function ConnectModal({ onClose, notify, onConnected }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.servers.connectAddress(value);
      notify(r.kind === 'ip' ? `Starter FiveM og kobler til ${r.addr}` : `Starter FiveM og kobler til ${r.name}`);
      onConnected?.();
      onClose();
    } catch (e2) {
      setErr(errText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="connect-title" onSubmit={submit}>
        <div className="modal-head">
          <h2 id="connect-title">Koble til direkte</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Lukk"><X size={16} /></button>
        </div>
        <p className="modal-text">For servere som ikke står i listen. Lim inn en cfx.re-lenke, server-ID eller IP-adresse.</p>
        <label className="search">
          <Link2 size={18} strokeWidth={1.8} aria-hidden="true" />
          <span className="sr-only">Adresse</span>
          <input
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="cfx.re/join/abc123 eller 123.45.67.89:30120"
            spellCheck={false}
          />
        </label>
        {err && <div className="notice warn">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Avbryt</button>
          <button type="submit" className="btn play" disabled={busy || !value.trim()}>
            {busy ? <Loader2 className="spin" size={16} /> : null} Koble til
          </button>
        </div>
      </form>
    </div>
  );
}
