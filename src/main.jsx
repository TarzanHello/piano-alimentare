import React from 'react';
import { createRoot } from 'react-dom/client';
import './db/storage.js';   // imposta window.storage PRIMA dell'app
import './index.css';
import { App } from '@/App';

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    // ── Produzione: registra il service worker (offline) ──
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(e => console.log('SW:', e));
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return; refreshing = true; window.location.reload();
      });
    });
  } else {
    // ── Sviluppo: rimuovi SW e cache vecchie (altrimenti rompono l'HMR) ──
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
    if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
  }
}
