// Felles oppsett for kall mot Cfx.re (FiveM) sitt API.
// API-et forventer at forespørslene ser ut som de kommer fra FiveM sin egen serverliste
// (servers.fivem.net); uten Origin/Referer blir blant annet logoene avvist.
const CFX_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'nb-NO,nb;q=0.9,en;q=0.6',
  Origin: 'https://servers.fivem.net',
  Referer: 'https://servers.fivem.net/',
};

const CFX_API = 'https://frontend.cfx-services.net/api/servers';
const CFX_API_OLD = 'https://servers-frontend.fivem.net/api/servers';

module.exports = { CFX_HEADERS, CFX_API, CFX_API_OLD };
