# FiveM Norge – backend og adminpanel

En liten Node-server som lagrer alt i **én JSON-fil** (`data/db.json`). Ingen database å installere, ingen andre avhengigheter enn Node.

Den gir:
- **Adminpanel** på `/admin` (innlogging med Discord): brukere, roller, utestengelse, servere (fremhev/verifiser/skjul), kunngjøringer, statistikk, feilrapporter og logg.
- **API for launcheren**: kunngjøringer og serverinnstillinger, anonym statistikk, feilrapporter og sjekk av utestengte brukere.

## Kom i gang
1. Installer [Node.js](https://nodejs.org) 18 eller nyere.
2. I Discord Developer Portal → din app → **OAuth2**:
   - Kopier **Client Secret**.
   - Legg til redirect: `http://localhost:8787/auth/callback` (eller din egen adresse + `/auth/callback`).
3. Finn Discord-ID-en din: Discord → Innstillinger → Avansert → slå på **Utviklermodus**, høyreklikk deg selv → **Kopier bruker-ID**.
4. Kopier `.env.example` til `.env` og fyll inn `DISCORD_CLIENT_SECRET` og `ADMIN_DISCORD_IDS`.
5. Start:
   ```bash
   cd server
   npm start
   ```
6. Åpne <http://localhost:8787/admin> og logg inn.

I launcherens `.env` (i prosjektmappa) setter du `BACKEND_URL=http://localhost:8787`.

## Roller
| Rolle | Kan |
|---|---|
| **Eier** (`ADMIN_DISCORD_IDS`) | Alt, inkludert å gi admin-rolle |
| **Admin** | Alt unntatt å endre eiere og andre administratorer |
| **Moderator** | Utestenge vanlige brukere, notater, kunngjøringer og feilrapporter |

Folk blir synlige i panelet når de har logget inn med Discord i launcheren. Gi dem rolle der.

## Data
- `data/db.json` – hele databasen. Lagres automatisk (atomisk, så filen aldri blir halvskrevet).
- `data/db.backup.json` – kopi som tas hver gang serveren starter.
- Ta backup ved å kopiere `data/`-mappa.

## Når andre skal bruke det
Kjører serveren bare på din PC, når bare launcheren på din PC den. Skal andre spillere få kunngjøringer og telles i statistikken, må serveren nås fra internett, for eksempel:
- på en VPS eller hjemmeserver med port 8787 åpen (helst bak HTTPS via Caddy/nginx), eller
- via en tunnel som [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (gratis, gir HTTPS).

Sett da `PUBLIC_URL` til den offentlige adressen (f.eks. `https://admin.dittdomene.no`), legg `PUBLIC_URL/auth/callback` inn i Discord, og sett `BACKEND_URL` til samme adresse når launcheren bygges (repository-variabel `BACKEND_URL` på GitHub).

## Personvern
Launcheren sender en tilfeldig ID per PC, versjonsnummer og plattform. Er brukeren logget inn, sendes også Discord-ID, navn og avatar. Feilrapporter inneholder feilmelding og stack trace. Brukeren kan skru av statistikk og feilrapporter under **Innstillinger → Personvern og tilkobling**.

## Lokal testing uten Discord
`DEV_MODE=1` i `.env` gir innlogging via `/auth/dev?id=<discord-id>&name=<navn>`. **Aldri bruk dette på en server andre når.**
