import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import { api, errText } from '../api.js';

// Chat med venner. Samme samtaler som under Chat på Min side (fivemnorge.xyz/min-side#chat).
// Samtalelista hentes av bakgrunnsprosessen hvert 20. sekund; den åpne samtalen hentes hvert 3. sekund.
const when = (t) => {
  const d = new Date(t);
  const same = d.toDateString() === new Date().toDateString();
  return d.toLocaleString('nb-NO', same ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function ChatCard({ openWith, notify }) {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(openWith || null);
  const [conv, setConv] = useState(null); // { friend, messages, seenByFriend }
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const [armed, setArmed] = useState(false);
  const boxRef = useRef(null);
  const lastRef = useRef(0);
  const msgsRef = useRef([]);
  const atBottom = useRef(true);

  useEffect(() => {
    if (openWith) setSel(openWith);
  }, [openWith]);

  // Samtalelista
  const applyList = useCallback((d) => {
    if (!d || !Array.isArray(d.convs)) return;
    setList(d);
    setSel((cur) => cur || (d.convs.find((c) => c.unread) || d.convs[0])?.friend.id || null);
  }, []);
  useEffect(() => {
    api.chats.get(true).then(applyList).catch(() => {});
    return api.on('chats:changed', applyList);
  }, [applyList]);

  // Fortell bakgrunnsprosessen hvilken samtale som er åpen (da blir det ikke systemvarsel for den)
  useEffect(() => {
    api.chats.open(sel);
    return () => api.chats.open(null);
  }, [sel]);

  const merge = useCallback((d, reset = false) => {
    const known = new Set(reset ? [] : msgsRef.current.map((m) => m.id));
    const msgs = reset ? [] : msgsRef.current.slice();
    for (const m of d.messages) if (!known.has(m.id)) msgs.push(m);
    msgsRef.current = msgs;
    lastRef.current = msgs.length ? msgs[msgs.length - 1].at : 0;
    setConv({ friend: d.friend, messages: msgs, seenByFriend: d.seenByFriend });
  }, []);

  // Den åpne samtalen
  useEffect(() => {
    if (!sel) return undefined;
    let alive = true;
    msgsRef.current = [];
    lastRef.current = 0;
    setConv(null);
    setErr(null);
    setArmed(false);
    atBottom.current = true;
    const poll = async (reset) => {
      if (document.hidden && !reset) return;
      try {
        const d = await api.backend.api('GET', `/api/launcher/chats/${sel}?after=${reset ? 0 : lastRef.current}`);
        if (alive) merge(d, reset);
      } catch (e) {
        if (alive) setErr(errText(e));
      }
    };
    poll(true).then(() => api.chats.get(true).then(applyList).catch(() => {}));
    const t = setInterval(() => poll(false), 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [sel, merge, applyList]);

  // Hold oss nederst når nye meldinger kommer
  useEffect(() => {
    const b = boxRef.current;
    if (b && atBottom.current) b.scrollTop = b.scrollHeight;
  }, [conv]);

  const send = async (e) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || !sel || sending) return;
    setSending(true);
    try {
      const d = await api.backend.api('POST', `/api/launcher/chats/${sel}?after=${lastRef.current}`, { text: t });
      setText('');
      atBottom.current = true;
      merge(d);
      api.chats.get(true).then(applyList).catch(() => {});
    } catch (e2) {
      notify(errText(e2));
    } finally {
      setSending(false);
    }
  };
  const clear = async () => {
    if (!armed) return setArmed(true);
    try {
      const d = await api.backend.api('DELETE', `/api/launcher/chats/${sel}`);
      merge(d, true);
      setArmed(false);
      notify('Samtalen er tømt for deg');
      api.chats.get(true).then(applyList).catch(() => {});
    } catch (e) {
      notify(errText(e));
    }
  };

  const convs = list?.convs || [];
  const lastMine = conv ? [...conv.messages].reverse().find((m) => m.mine) : null;

  return (
    <section className="card chat-card" aria-label="Chat med venner">
      <div className="card-head">
        <h2><MessageCircle size={18} strokeWidth={1.8} /> Chat{list?.unread ? <em className="chat-n">{list.unread}</em> : null}</h2>
        <span className="muted-sm">Samme samtaler som på Min side</span>
      </div>
      {!list ? (
        <p className="muted-sm">Henter samtaler…</p>
      ) : convs.length === 0 ? (
        <p className="muted-sm">Du kan chatte med venner når dere har lagt hverandre til.</p>
      ) : (
        <div className="chat">
          <ul className="chat-convs" aria-label="Samtaler">
            {convs.map((c) => (
              <li key={c.friend.id}>
                <button className={c.friend.id === sel ? 'chat-conv on' : 'chat-conv'} aria-current={c.friend.id === sel ? 'true' : undefined} onClick={() => setSel(c.friend.id)}>
                  {c.friend.avatar ? <img src={c.friend.avatar} alt="" /> : <span className="chat-ph">{c.friend.name.charAt(0).toUpperCase()}</span>}
                  <span className="chat-cb">
                    <b>{c.friend.name}</b>
                    <small>{c.last ? `${c.last.mine ? 'Du: ' : ''}${c.last.text}` : 'Si hei 👋'}</small>
                  </span>
                  {c.unread > 0 && <em className="chat-n" aria-label={`${c.unread} uleste`}>{c.unread}</em>}
                </button>
              </li>
            ))}
          </ul>
          <div className="chat-main">
            {conv && (
              <div className="chat-head">
                {conv.friend.avatar ? <img src={conv.friend.avatar} alt="" /> : <span className="chat-ph">{conv.friend.name.charAt(0).toUpperCase()}</span>}
                <b>{conv.friend.name}</b>
                <button className="btn ghost sm" onClick={clear} onBlur={() => setArmed(false)} title="Fjerner samtalen bare for deg">
                  <Trash2 size={14} /> {armed ? 'Bekreft' : 'Tøm'}
                </button>
              </div>
            )}
            <div
              className="chat-msgs"
              ref={boxRef}
              role="log"
              aria-live="polite"
              aria-label="Meldinger"
              onScroll={(e) => {
                const b = e.currentTarget;
                atBottom.current = b.scrollHeight - b.scrollTop - b.clientHeight < 60;
              }}
            >
              {err && <p className="error-text">{err}</p>}
              {!conv && !err && <p className="muted-sm">Henter…</p>}
              {conv && conv.messages.length === 0 && <p className="muted-sm chat-empty">Ingen meldinger ennå. Skriv noe til {conv.friend.name}!</p>}
              {conv?.messages.map((m, i) => {
                const prev = conv.messages[i - 1];
                return (
                  <div key={m.id} className="chat-row">
                    {(!prev || m.at - prev.at > 10 * 60_000) && <div className="chat-time">{when(m.at)}</div>}
                    <div className={m.mine ? 'msg mine' : 'msg'} title={when(m.at)}>{m.text}</div>
                  </div>
                );
              })}
              {lastMine && conv.seenByFriend >= lastMine.at && <div className="chat-seen">Sett</div>}
            </div>
            <form className="chat-form" onSubmit={send}>
              <label className="sr-only" htmlFor="chat-in">Melding</label>
              <textarea
                id="chat-in"
                className="input"
                rows={1}
                maxLength={1000}
                value={text}
                placeholder={conv ? `Skriv til ${conv.friend.name} …` : 'Skriv en melding …'}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) send(e);
                }}
                disabled={!sel}
              />
              <button className="btn play" disabled={!text.trim() || sending || !sel} aria-label="Send">
                <Send size={16} /> Send
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
