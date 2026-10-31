export const api = window.launcher;

export const errText = (e) =>
  (e?.message || String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export function formatDuration(ms = 0) {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'Under 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} t ${m} min` : `${h} t`;
}

export function formatAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'akkurat nå';
  if (min < 60) return `for ${min} min siden`;
  const h = Math.round(min / 60);
  if (h < 24) return `for ${h} t siden`;
  const d = Math.round(h / 24);
  if (d === 1) return 'i går';
  if (d < 7) return `for ${d} dager siden`;
  return new Date(ts).toLocaleDateString('no', { day: 'numeric', month: 'short' });
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'God natt';
  if (h < 10) return 'God morgen';
  if (h < 18) return 'God dag';
  return 'God kveld';
}
