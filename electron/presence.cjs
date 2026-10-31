// Discord-status ("Rich Presence"): viser at du blar i launcheren, eller hvilken server du spiller på.
// Kobler til Discord-klienten lokalt; finnes den ikke, prøver vi igjen hvert minutt.
const { Client } = require('@xhayper/discord-rpc');

let client = null;
let enabled = false;
let clientId = null;
let ready = false;
let retry = null;
let current = { kind: 'browsing' };
const startedAt = Date.now();

function activity() {
  if (current.kind === 'playing') {
    return {
      details: `Spiller på ${current.name}`.slice(0, 128),
      state: 'via FiveM Norge Launcher',
      startTimestamp: current.startedAt || Date.now(),
      largeImageKey: 'logo',
      largeImageText: 'FiveM Norge Launcher',
      buttons: [{ label: 'Bli med', url: `https://cfx.re/join/${current.id}` }],
      instance: false,
    };
  }
  return {
    details: 'Ser etter norske FiveM-servere',
    state: 'FiveM Norge Launcher',
    startTimestamp: startedAt,
    largeImageKey: 'logo',
    largeImageText: 'FiveM Norge Launcher',
    instance: false,
  };
}

async function push() {
  if (!enabled || !ready || !client?.user) return;
  try {
    await client.user.setActivity(activity());
  } catch (e) {
    console.warn('[presence]', e.message);
  }
}

async function connect() {
  clearTimeout(retry);
  if (!enabled || !clientId || client) return;
  client = new Client({ clientId, transport: { type: 'ipc' } });
  client.on('ready', () => {
    ready = true;
    push();
  });
  client.on('disconnected', () => {
    ready = false;
    client = null;
    if (enabled) retry = setTimeout(connect, 60_000);
  });
  try {
    await client.login();
  } catch {
    // Discord kjører ikke – prøv igjen senere
    ready = false;
    client = null;
    if (enabled) retry = setTimeout(connect, 60_000);
  }
}

async function disconnect() {
  clearTimeout(retry);
  const c = client;
  client = null;
  ready = false;
  if (c) {
    try {
      await c.user?.clearActivity();
      await c.destroy();
    } catch {
      /* ignorer */
    }
  }
}

module.exports = {
  configure(id, on) {
    clientId = id && id !== 'din_client_id_her' ? id : null;
    enabled = !!on && !!clientId;
    if (enabled) connect();
    else disconnect();
  },
  playing(s) {
    current = { kind: 'playing', id: s.id, name: s.name, startedAt: s.startedAt };
    push();
  },
  browsing() {
    current = { kind: 'browsing' };
    push();
  },
  stop: disconnect,
};
