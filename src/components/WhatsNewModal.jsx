import { useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';

// Vises én gang etter at launcheren er oppdatert
export default function WhatsNewModal({ info, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="wn-title">
        <div className="modal-head">
          <h2 id="wn-title" className="row-gap"><Sparkles size={20} /> Nytt i versjon {info.version}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Lukk"><X size={16} /></button>
        </div>
        <p className="whatsnew-notes">{info.notes || 'Launcheren er oppdatert. Feilrettinger og forbedringer.'}</p>
        <div className="modal-actions">
          <button className="btn play" onClick={onClose} autoFocus>Fint!</button>
        </div>
      </div>
    </div>
  );
}
