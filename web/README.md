# FiveM Norge – fivemnorge.xyz

Nettside, adminpanel og API for launcheren i én Cloudflare Worker.

| Adresse | Hva |
|---|---|
| `https://fivemnorge.xyz/` | Nettsiden (`public/index.html`) |
| `https://fivemnorge.xyz/admin` | Adminpanelet (innlogging med Discord) |
| `https://fivemnorge.xyz/server/<id>` | Egen side per server: spillere nå, beskrivelse, anmeldelser og «Koble til» |
| `https://fivemnorge.xyz/api/...` | API-et launcheren bruker |

Data (brukere, servere, kunngjøringer, anmeldelser, venner, krav fra servereiere, statistikk, feilrapporter og logg) lagres som JSON i en Durable Object hos Cloudflare. Det er gratis på Workers Free-planen.

## Første gang
Du trenger [Node.js](https://nodejs.org) (LTS), og domenet **fivemnorge.xyz** må være lagt til i Cloudflare-kontoen din.

1. Åpne en terminal i denne mappa og kjør:
   ```
   npm install
   npx wrangler login
   ```
2. Åpne `wrangler.toml` og skriv Discord-ID-en din i `ADMIN_DISCORD_IDS`. Du finner den i Discord under Innstillinger → Avansert → **Utviklermodus**; høyreklikk deg selv → **Kopier bruker-ID**.
3. Publiser:
   ```
   npm run deploy
   ```
4. Legg inn Discord-hemmeligheten. Den finner du i Discord Developer Portal → appen din → OAuth2 → **Client Secret**:
   ```
   npm run secret
   ```
5. Gå til Discord Developer Portal → OAuth2 → **Redirects** og legg til `https://fivemnorge.xyz/auth/callback`.
6. Åpne https://fivemnorge.xyz/admin og logg inn.

Hvis publiseringen klager på at det allerede finnes en DNS-oppføring for fivemnorge.xyz, slett den gamle A- eller CNAME-oppføringen under **DNS** i Cloudflare, eller fjern domenet fra et gammelt Pages-prosjekt, og kjør `npm run deploy` igjen.

## Varsler i Discord (valgfritt)
Lag en webhook i Discord (Kanalinnstillinger → Integrasjoner → Webhooks → Ny webhook → Kopier URL) og kjør:
```
npm run webhook
```
Da postes nye kunngjøringer, utestengelser, nye feil og krav fra servereiere i kanalen.

## Feilmeldinger fra brukere
Brukere kan melde fra om feil i launcheren under **Innstillinger → Meld fra om feil**. De havner under **Feilrapporter** i adminpanelet (og «Feil» i admin-fanen i launcheren), merket «Fra bruker». Maks 5 rapporter i timen per PC.

## Sikkerhetskopi
Adminpanelet → **Sikkerhetskopi** laster ned alt som én JSON-fil, og kan gjenopprette fra en slik fil (bare eiere).

## Live-listen
Innloggede launchere sender spillertallene til de norske serverne de allerede har hentet (maks hvert 5. minutt). Nettsiden viser de mest spilte på forsiden og på `/server/<id>`.

## Endringer senere
Endre filene og kjør `npm run deploy`. Nettsiden er `public/index.html`, adminpanelet er `src/admin.html` og serverkoden er `src/worker.js`.

## Teste lokalt
Lag en fil `.dev.vars` med
```
DEV_MODE=1
ADMIN_DISCORD_IDS=111111111111111111
```
og kjør `npm run dev`. Logg inn uten Discord via `http://localhost:8787/auth/dev?id=111111111111111111&name=Test`. `DEV_MODE` brukes **bare** lokalt.

## Roller
| Rolle | Kan |
|---|---|
| **Eier** (`ADMIN_DISCORD_IDS`) | Alt, inkludert å gi admin-rolle |
| **Admin** | Alt unntatt å endre eiere og andre administratorer |
| **Moderator** | Utestenge vanlige brukere, notater, kunngjøringer og feilrapporter |

## Personvern
Launcheren sender en tilfeldig ID per PC, versjon og plattform. Er brukeren logget inn, sendes også Discord-ID, navn og avatar. Feilrapporter inneholder feilmelding og stack trace. Alt kan skrus av i launcheren under **Innstillinger → Personvern og tilkobling**.
