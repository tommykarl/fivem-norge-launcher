import { api } from './api.js';

// Sanntidschat: én WebSocket mot fivemnorge.xyz mens du er innlogget.
// Nye meldinger, «skriver …» og «Sett» kommer med en gang. Uten forbindelse henter ChatCard som før.
const listeners = new Set();
let ws = null;
let wanted = false;
let tries = 0;
let timer = null;
let pingTimer = null;
export const chatSocket = { connected: false, openConv: null };

function emit(d) {
  for (const fn of listeners) {
    try {
      fn(d);
    } catch {
      /* en lytter som feiler skal ikke stoppe de andre */
    }
  }
}
export function onChatEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Kort «pling» når en melding kommer og du ikke ser på samtalen
let ctx = null;
export function chatSound() {
  try {
    if (localStorage.getItem('fnl-chat-sound') === 'off') return;
    ctx ||= new AudioContext();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.3);
  } catch {
    /* ingen lyd */
  }
}

async function connect() {
  clearTimeout(timer);
  if (!wanted || ws) return;
  const url = await api.chats.socketUrl?.().catch(() => null);
  if (!wanted) return;
  if (!url) return retry();
  try {
    ws = new WebSocket(url);
  } catch {
    ws = null;
    return retry();
  }
  ws.onopen = () => {
    tries = 0;
    chatSocket.connected = true;
    emit({ t: 'state', connected: true });
    clearInterval(pingTimer);
    pingTimer = setInterval(() => ws?.readyState === 1 && ws.send('{"t":"ping"}'), 45_000);
  };
  ws.onmessage = (e) => {
    let d;
    try {
      d = JSON.parse(e.data);
    } catch {
      return;
    }
    if (d.t === 'msg' && !d.m?.mine) {
      const looking = document.hasFocus() && chatSocket.openConv === d.conv;
      if (!looking) chatSound();
      // Oppdater ulest-tall og systemvarsel (bakgrunnsprosessen avgjør om det skal varsles)
      api.chats.get(true).catch(() => {});
    }
    emit(d);
  };
  ws.onclose = () => {
    ws = null;
    clearInterval(pingTimer);
    if (chatSocket.connected) emit({ t: 'state', connected: false });
    chatSocket.connected = false;
    retry();
  };
}
function retry() {
  if (!wanted) return;
  clearTimeout(timer);
  timer = setTimeout(connect, Math.min(60_000, 2000 * 2 ** tries++));
}
export function startChatSocket() {
  if (wanted) return;
  wanted = true;
  connect();
}
export function stopChatSocket() {
  wanted = false;
  clearTimeout(timer);
  clearInterval(pingTimer);
  try {
    ws?.close();
  } catch {
    /* allerede lukket */
  }
  ws = null;
  chatSocket.connected = false;
}
export function sendTyping(to) {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'typing', to }));
}
