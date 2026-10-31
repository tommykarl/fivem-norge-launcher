import { Minus, Square, X } from 'lucide-react';
import { api } from '../api.js';

export default function TitleBar() {
  const w = api.win;
  return (
    <header className="titlebar">
      <div className="brand">
        <svg width="18" height="13" viewBox="0 0 22 16" aria-hidden="true">
          <rect width="22" height="16" rx="3" fill="#D92B43" />
          <rect x="6" width="4" height="16" fill="#fff" />
          <rect y="6" width="22" height="4" fill="#fff" />
          <rect x="7" width="2" height="16" fill="#1C3E8C" />
          <rect y="7" width="22" height="2" fill="#1C3E8C" />
        </svg>
        <span>FiveM Norge</span>
      </div>
      <div className="win-controls">
        <button onClick={w.minimize} aria-label="Minimer"><Minus size={14} /></button>
        <button onClick={w.maximize} aria-label="Maksimer"><Square size={12} /></button>
        <button className="close" onClick={w.close} aria-label="Lukk"><X size={15} /></button>
      </div>
    </header>
  );
}
