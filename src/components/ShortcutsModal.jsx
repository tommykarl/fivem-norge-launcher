import { useEffect } from 'react';
import { X } from 'lucide-react';

export const SHORTCUTS = [
  ['Ctrl K', 'Søk etter servere'],
  ['Ctrl L', 'Koble til direkte (IP eller lenke)'],
  ['↑ / ↓', 'Velg server i listen'],
  ['Enter', 'Åpne valgt server'],
  ['Ctrl Enter', 'Koble til valgt server'],
  ['F5', 'Oppdater serverlisten'],
  ['Ctrl 1–5', 'Hjem, Servere, Lagrede, Nylig spilt, Status'],
  ['Ctrl ,', 'Innstillinger'],
  ['Esc', 'Tilbake / lukk'],
  ['?', 'Vis hurtigtaster'],
];

export function ShortcutList() {
  return (
    <dl className="shortcuts">
      {SHORTCUTS.map(([k, v]) => (
        <div key={k}>
          <dt>{k.split(' ').map((p, i) => <kbd key={i}>{p}</kbd>)}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ShortcutsModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => (e.key === 'Escape' || e.key === '?') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sc-title">
        <div className="modal-head">
          <h2 id="sc-title">Hurtigtaster</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Lukk"><X size={16} /></button>
        </div>
        <ShortcutList />
      </div>
    </div>
  );
}
