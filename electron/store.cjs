// Enkel JSON-lagring i brukerens app-mappe. Discord-token krypteres med safeStorage når det er tilgjengelig.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const file = () => path.join(app.getPath('userData'), 'launcher-data.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    return { session: null, favorites: {} };
  }
}

function write(data) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(data, null, 2));
}

function saveSession(session) {
  const data = read();
  if (!session) {
    data.session = null;
  } else {
    const json = JSON.stringify(session);
    data.session = safeStorage.isEncryptionAvailable()
      ? { enc: true, value: safeStorage.encryptString(json).toString('base64') }
      : { enc: false, value: json };
  }
  write(data);
}

function loadSession() {
  const s = read().session;
  if (!s) return null;
  try {
    const json = s.enc ? safeStorage.decryptString(Buffer.from(s.value, 'base64')) : s.value;
    const session = JSON.parse(json);
    if (session.expiresAt && Date.now() > session.expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

function getFavorites(userId) {
  return read().favorites[userId] || [];
}

function toggleFavorite(userId, server) {
  const data = read();
  const list = data.favorites[userId] || [];
  const exists = list.some((f) => f.id === server.id);
  data.favorites[userId] = exists
    ? list.filter((f) => f.id !== server.id)
    : [...list, { id: server.id, name: server.name, addedAt: Date.now() }];
  write(data);
  return data.favorites[userId];
}

// Lagrede servere fra fivemnorge.xyz (følger Discord-kontoen mellom PC-er)
function setFavorites(userId, list) {
  const data = read();
  data.favorites[userId] = list.map((f) => ({ id: f.id, name: f.name || f.id, addedAt: f.addedAt || f.at || Date.now() }));
  data.favSynced = { ...(data.favSynced || {}), [userId]: true };
  write(data);
  return data.favorites[userId];
}
const favoritesSynced = (userId) => !!read().favSynced?.[userId];

module.exports = { saveSession, loadSession, getFavorites, toggleFavorite, setFavorites, favoritesSynced };
