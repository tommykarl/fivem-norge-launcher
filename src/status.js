// Felles tekster og farger for FiveM-status
export const LEVELS = {
  ok: { label: 'Alle FiveM-tjenester fungerer', short: 'Alt fungerer', cls: 'ok' },
  maintenance: { label: 'Planlagt vedlikehold hos FiveM', short: 'Vedlikehold', cls: 'maint' },
  degraded: { label: 'Noen FiveM-tjenester har problemer', short: 'Delvise problemer', cls: 'warn' },
  outage: { label: 'FiveM har store problemer', short: 'Nede', cls: 'down' },
  unknown: { label: 'Sjekker FiveM-status…', short: 'Sjekker…', cls: 'unknown' },
};

export const COMPONENT = {
  operational: { label: 'Fungerer', cls: 'ok' },
  degraded_performance: { label: 'Treg', cls: 'warn' },
  partial_outage: { label: 'Delvis nede', cls: 'warn' },
  major_outage: { label: 'Nede', cls: 'down' },
  under_maintenance: { label: 'Vedlikehold', cls: 'maint' },
};

export const CHECK = {
  ok: { label: 'Fungerer', cls: 'ok' },
  slow: { label: 'Treg', cls: 'warn' },
  down: { label: 'Nede', cls: 'down' },
};

export const INCIDENT = {
  investigating: 'Undersøkes',
  identified: 'Årsak funnet',
  monitoring: 'Overvåkes',
  resolved: 'Løst',
  postmortem: 'Etterarbeid',
};
