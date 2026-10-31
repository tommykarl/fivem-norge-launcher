import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

// Egne notater og merker på en server. Lagres automatisk.
export default function NotesCard({ server, note, allTags, onSave }) {
  const [text, setText] = useState(note?.text || '');
  const [tags, setTags] = useState(note?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [saved, setSaved] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    setText(note?.text || '');
    setTags(note?.tags || []);
  }, [server.id]);

  const save = (patch) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await onSave(patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 500);
  };

  const addTag = (t) => {
    const v = t.trim();
    if (!v || tags.includes(v) || tags.length >= 8) return;
    const next = [...tags, v];
    setTags(next);
    setTagInput('');
    onSave({ tags: next });
  };
  const removeTag = (t) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    onSave({ tags: next });
  };

  const suggestions = allTags.filter((t) => !tags.includes(t)).slice(0, 6);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Mine notater</h2>
        <span className="muted-sm" aria-live="polite">{saved ? 'Lagret' : ''}</span>
      </div>
      <label className="sr-only" htmlFor={`note-${server.id}`}>Notat</label>
      <textarea
        id={`note-${server.id}`}
        className="note"
        value={text}
        maxLength={2000}
        placeholder="F.eks. «søkt whitelist 31.10», karakternavn, regler å huske …"
        onChange={(e) => {
          setText(e.target.value);
          save({ text: e.target.value });
        }}
      />
      <div className="my-tags">
        {tags.map((t) => (
          <span key={t} className="my-tag">
            {t}
            <button onClick={() => removeTag(t)} aria-label={`Fjern merket ${t}`}><X size={12} /></button>
          </span>
        ))}
        {tags.length < 8 && (
          <form
            className="tag-add"
            onSubmit={(e) => {
              e.preventDefault();
              addTag(tagInput);
            }}
          >
            <label className="sr-only" htmlFor={`tag-${server.id}`}>Nytt merke</label>
            <input id={`tag-${server.id}`} value={tagInput} maxLength={24} onChange={(e) => setTagInput(e.target.value)} placeholder="Nytt merke" />
            <button type="submit" className="icon-btn" aria-label="Legg til merke" disabled={!tagInput.trim()}><Plus size={15} /></button>
          </form>
        )}
      </div>
      {suggestions.length > 0 && tags.length < 8 && (
        <div className="tag-suggest">
          <span className="muted-sm">Brukt før:</span>
          {suggestions.map((t) => (
            <button key={t} className="chip sm" onClick={() => addTag(t)}>{t}</button>
          ))}
        </div>
      )}
      <p className="hint">Merkene vises i serverlisten og kan søkes på.</p>
    </section>
  );
}
