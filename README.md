# FiveM Norge Launcher

En desktop-launcher (Electron + React) for norske FiveM-servere.

**Last ned:** fra [exe-mappa](exe/) eller [fivemnorge.xyz](https://fivemnorge.xyz)

**Funksjoner**
- Hjem: «Fortsett der du slapp», ukeoversikt over spilletid, lagrede servere, servere fra dine Discord-fellesskap, varsler/kø og voksende servere
- Serverliste med søk (også i egne notater og merker), filtre, sortering, «Mest spilt nå» og sammenligning av opptil 3 servere
- Koble til direkte med IP eller cfx.re-lenke
- Serverside med info, lenker, spillergraf siste 24 t, «beste tid å spille», egne notater og merker, og spilletiden din
- Varsler i Windows: ledig plass, online igjen eller over et valgt antall spillere – og kø på flere servere samtidig
- Hurtigmeny ved klokka for å koble til lagrede og nylig spilte servere
- Spilletid måles fortløpende mens FiveM kjører
- Discord-innlogging, lagrede servere per bruker og Discord-status («Spiller på …»)
- FiveM-status fra Rockstar Support og egne målinger
- Mørk/lys modus, fem aksentfarger og hurtigtaster (trykk ?)
- Automatiske oppdateringer fra `exe/`-mappa på GitHub (`exe/latest.json`)
- Nettside og adminpanel på [fivemnorge.xyz](https://fivemnorge.xyz) (Cloudflare Worker, data som JSON): brukere, roller, utestengelse, servere, kunngjøringer, statistikk og feilrapporter – koden ligger i [tommykarl/FiveM-Norge](https://github.com/tommykarl/FiveM-Norge)

## Krav
- [Node.js](https://nodejs.org) 18 eller nyere
- FiveM installert (for at "Spill" skal fungere)

## Oppsett av Discord-innlogging
1. Gå til <https://discord.com/developers/applications> og lag en ny applikasjon.
2. Under **OAuth2** → **Redirects**, legg til nøyaktig: `http://localhost:53134/callback`
3. Kopier **Client ID** (ikke Client Secret – den trengs ikke).
4. Kopier `.env.example` til `.env` og lim inn:
   ```
   DISCORD_CLIENT_ID=123456789012345678
   ```

Innloggingen bruker OAuth2 implicit grant med `identify` og `guilds`, så appen ser brukernavn, avatar og hvilke Discord-servere du er med i (brukes til «Fra dine Discord-servere»). Tokenet lagres kryptert med Electrons `safeStorage` (Windows: DPAPI).

## Ny versjon
Launcheren sjekker `exe/latest.json` på GitHub og laster ned exe-filen som står der.
1. Øk `version` i `package.json`, for eksempel `1.4.3` → `1.4.4`.
2. Bygg: `npx vite build && npx electron-builder --win --x64 --publish never`
3. Legg den i exe-mappa: `npm run exe -- "Hva er nytt"` (erstatter de gamle exe-filene og skriver `latest.json`).
4. Commit og push.

Steg 2–4 kan også gjøres av GitHub: **Actions → Bygg exe → Run workflow**.

Repoet må være **offentlig**, ellers får ikke launcheren lest exe-mappa.

## Discord-status med bilde
Last opp et bilde med navnet `logo` under **Rich Presence → Art Assets** i Discord-appen din for å få logo i statusen.

## Kjøre
```bash
npm install
npm run dev      # utviklingsmodus med hot reload
npm start        # bygger og starter appen
npm run dist     # lager Windows-installer i release/
```

## Struktur
```
electron/
  main.cjs      – vindu, IPC-handlere
  preload.cjs   – trygt API eksponert til React (window.launcher)
  fivem.cjs     – henter og dekoder FiveM-serverlisten (protobuf), filtrerer norske servere
  discord.cjs   – Discord OAuth2-innlogging
  store.cjs     – lagrer innlogging og favoritter i app-mappen
src/
  App.jsx       – hovedlogikk: søk, filtre, favoritter
  components/   – TitleBar, Sidebar, Toolbar, ServerCard, ServerDetails …
```

## Merk
- Favoritter lagres lokalt på PC-en (i `%APPDATA%/FiveM Norge Launcher/launcher-data.json`), knyttet til Discord-ID-en din. Vil du synke mellom PC-er, må du legge til en egen backend/database.
- Serverlisten kommer fra FiveM sitt uoffisielle frontend-API. Hvis Cfx.re endrer formatet, er det `electron/fivem.cjs` som må oppdateres.
- Juster `NO_NAME`-regexen i `fivem.cjs` hvis du vil fange opp flere (eller færre) servere.
