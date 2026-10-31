import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Uventede feil i grensesnittet sendes (anonymt) til egen backend hvis det er skrudd på
window.addEventListener('error', (e) => window.launcher?.backend?.reportError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => window.launcher?.backend?.reportError(e.reason));

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
