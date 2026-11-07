const { net } = require('electron');

// Felles henting for launcheren.
// Henter med Node først, og med Chromium-nettverket (net.fetch) hvis Node ikke får kontakt.
// Node bruker ikke Windows sine sertifikater og proxy, så antivirus som skanner HTTPS eller en
// bedriftsproxy kan stoppe Node, mens Chromium (som en vanlig nettleser) kommer gjennom.
async function netFetch(url, opts = {}) {
  try {
    return await fetch(url, opts);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    try {
      return await net.fetch(url, { ...opts, bypassCustomProtocolHandlers: true });
    } catch (e2) {
      if (e2?.name === 'AbortError') throw e2;
      const why = e?.cause?.code || e?.cause?.message || e2?.message || e?.message || 'ukjent feil';
      throw new Error(`Fikk ikke kontakt med ${new URL(url).host} (${why})`);
    }
  }
}


module.exports = { netFetch };
