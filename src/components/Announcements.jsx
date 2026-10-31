import { useState } from 'react';
import { AlertTriangle, Info, ShieldAlert, X } from 'lucide-react';

const ICON = { info: Info, warning: AlertTriangle, critical: ShieldAlert };
const KEY = 'fnl-dismissed-announcements';

function readDismissed() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

// Kunngjøringer fra adminpanelet. Kritiske kan ikke lukkes; andre huskes som lukket.
export default function Announcements({ items, banned }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const visible = items.filter((a) => a.level === 'critical' || !dismissed.includes(a.id));

  const dismiss = (id) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignorer */
    }
  };

  if (!visible.length && !banned) return null;
  return (
    <div className="announcements" role="region" aria-label="Kunngjøringer">
      {banned && (
        <div className="ann critical">
          <ShieldAlert size={18} strokeWidth={2} />
          <div>
            <strong>Kontoen din er utestengt fra FiveM Norge Launcher</strong>
            <span>{banned.reason ? `Årsak: ${banned.reason}. ` : ''}Du kan fortsatt bruke serverlisten, men ikke logge inn med Discord.</span>
          </div>
        </div>
      )}
      {visible.map((a) => {
        const Icon = ICON[a.level] || Info;
        return (
          <div key={a.id} className={`ann ${a.level}`}>
            <Icon size={18} strokeWidth={2} />
            <div>
              <strong>{a.title}</strong>
              {a.body && <span>{a.body}</span>}
            </div>
            {a.level !== 'critical' && (
              <button className="icon-btn" onClick={() => dismiss(a.id)} aria-label={`Lukk «${a.title}»`}>
                <X size={15} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
