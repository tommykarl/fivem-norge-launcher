import { Minus, Square, X } from 'lucide-react';
import { api } from '../api.js';
import logo from '../assets/logo.png';

export default function TitleBar() {
  const w = api.win;
  return (
    <header className="titlebar">
      <div className="brand">
        <img src={logo} width="18" height="18" alt="" draggable="false" />
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
