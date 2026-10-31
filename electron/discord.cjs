// Discord-innlogging med OAuth2 "implicit grant" – ingen client secret trengs i appen.
// Innloggingssiden åpnes i et eget vindu, og vi fanger opp redirecten før den lastes.
const { BrowserWindow } = require('electron');
const crypto = require('crypto');

const REDIRECT_URI = 'http://localhost:53134/callback';

function avatarUrl(user) {
  if (user.avatar) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
  }
  const idx = Number((BigInt(user.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function authorize(clientId, parent) {
  return new Promise((resolve, reject) => {
    if (!clientId || clientId === 'din_client_id_her') {
      reject(new Error('DISCORD_CLIENT_ID mangler. Se README for oppsett.'));
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    const url =
      'https://discord.com/oauth2/authorize?' +
      new URLSearchParams({
        client_id: clientId,
        response_type: 'token',
        redirect_uri: REDIRECT_URI,
        scope: 'identify guilds',
        state,
      });

    const win = new BrowserWindow({
      width: 520,
      height: 800,
      parent,
      modal: !!parent,
      autoHideMenuBar: true,
      backgroundColor: '#1e1f22',
      title: 'Logg inn med Discord',
      webPreferences: { partition: 'persist:discord-auth', contextIsolation: true, nodeIntegration: false },
    });

    let finished = false;
    const finish = (err, value) => {
      if (finished) return;
      finished = true;
      if (!win.isDestroyed()) win.close();
      err ? reject(err) : resolve(value);
    };

    const handle = (event, target) => {
      if (!target.startsWith(REDIRECT_URI)) return;
      event.preventDefault();
      const u = new URL(target);
      const params = new URLSearchParams(u.hash.slice(1) || u.search.slice(1));
      if (params.get('error')) return finish(new Error(params.get('error_description') || 'Innlogging avvist'));
      if (params.get('state') !== state) return finish(new Error('Ugyldig state – prøv igjen'));
      const token = params.get('access_token');
      if (!token) return finish(new Error('Fikk ingen token fra Discord'));
      finish(null, {
        token,
        scope: params.get('scope') || 'identify',
        expiresAt: Date.now() + Number(params.get('expires_in') || 604800) * 1000,
      });
    };

    win.webContents.on('will-redirect', handle);
    win.webContents.on('will-navigate', handle);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => finish(new Error('Innlogging avbrutt')));
    win.loadURL(url);
  });
}

async function fetchUser(token) {
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Discord svarte med ${res.status}`);
  const u = await res.json();
  return {
    id: u.id,
    username: u.username,
    displayName: u.global_name || u.username,
    avatar: avatarUrl(u),
  };
}

async function login(clientId, parent) {
  const { token, expiresAt, scope } = await authorize(clientId, parent);
  const user = await fetchUser(token);
  return { token, expiresAt, scope, user };
}

module.exports = { login, fetchUser, REDIRECT_URI };
