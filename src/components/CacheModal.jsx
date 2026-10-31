import { useEffect, useState } from 'react';
import { AlertTriangle, FolderOpen, Loader2, Trash2, X } from 'lucide-react';
import { formatBytes } from '../format.js';

const api = window.launcher;
const errText = (e) => (e?.message || String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export default function CacheModal({ onClose, onDone, onLauncherCleared }) {
  const [info, setInfo] = useState(null);
  const [launcherBytes, setLauncherBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState({ cache: true, nui: false, logs: false, launcher: false });

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      if (!api.fivemCache || !api.cache) {
        throw new Error('Launcheren må startes helt på nytt (Ctrl+C i terminalen og npm run dev) for å ta i bruk oppdateringen.');
      }
      const [fi, li] = await Promise.all([api.fivemCache.info(), api.cache.info()]);
      setInfo(fi);
      setLauncherBytes(li.bytes);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fivemKeys = Object.keys(info?.groups || {}).filter((k) => picked[k]);
  const total =
    fivemKeys.reduce((n, k) => n + (info.groups[k]?.bytes || 0), 0) + (picked.launcher ? launcherBytes : 0);

  const clear = async () => {
    setBusy(true);
    setErr(null);
    try {
      let freed = 0;
      let failed = 0;
      if (fivemKeys.length && info?.found) {
        const r = await api.fivemCache.clear(fivemKeys);
        freed += r.freed;
        failed += r.failed;
      }
      if (picked.launcher) {
        const before = launcherBytes;
        const after = await api.cache.clear();
        freed += Math.max(0, before - after.bytes);
        await onLauncherCleared();
      }
      onDone(
        failed
          ? `Tømte ${formatBytes(freed)} – ${failed} mappe(r) var i bruk og ble hoppet over`
          : `Cache tømt – ${formatBytes(freed)} frigjort`
      );
      onClose();
    } catch (e) {
      setErr(errText(e));
      load();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (k) => setPicked((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cache-title">
        <div className="modal-head">
          <h2 id="cache-title">Tøm FiveM-cache</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Lukk"><X size={16} /></button>
        </div>

        <p className="modal-text">
          Hjelper ofte mot krasj, evige lasteskjermer og feil med teksturer. Spillfilene (<code>game-storage</code>) slettes
          ikke, så du slipper å laste ned alt på nytt.
        </p>

        {loading && <div className="muted"><Loader2 className="spin" size={16} /> Sjekker FiveM-mappen…</div>}

        {!loading && info && !info.found && (
          <div className="notice warn"><AlertTriangle size={16} /> {info.reason}</div>
        )}

        {!loading && info?.running && (
          <div className="notice warn"><AlertTriangle size={16} /> FiveM kjører. Lukk spillet før du tømmer cachen.</div>
        )}

        {!loading && info?.found && (
          <>
            <div className="path"><FolderOpen size={14} /> <span>{info.path}</span></div>
            <div className="options">
              {Object.entries(info.groups).map(([k, g]) => (
                <label key={k} className="option">
                  <input type="checkbox" checked={!!picked[k]} onChange={() => toggle(k)} />
                  <span>{g.label}</span>
                  <em>{formatBytes(g.bytes)}</em>
                </label>
              ))}
            </div>
          </>
        )}

        {!loading && (
          <label className="option">
            <input type="checkbox" checked={picked.launcher} onChange={() => toggle('launcher')} />
            <span>Launcherens egen logo-cache</span>
            <em>{formatBytes(launcherBytes)}</em>
          </label>
        )}

        {err && <div className="notice warn"><AlertTriangle size={16} /> {err}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Avbryt</button>
          <button
            className="btn danger"
            onClick={clear}
            disabled={busy || loading || info?.running || total === 0}
          >
            {busy ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
            {busy ? 'Tømmer…' : `Tøm ${formatBytes(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
