import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Inietta un ID di build univoco nel service worker a ogni `vite build`.
// Così dist/sw.js cambia byte ad ogni deploy: il browser rileva un SW nuovo
// e l'app mostra il banner "Nuova versione" — senza dover bumpare la versione
// della cache a mano.
function swVersionPlugin() {
  return {
    name: 'sw-build-version',
    writeBundle() {
      const swPath = path.resolve(__dirname, 'dist/sw.js');
      try {
        if (!fs.existsSync(swPath)) return;
        const id = `${new Date().toISOString().slice(0,16).replace(/[-:T]/g,'')}-${Date.now().toString(36)}`;
        const src = fs.readFileSync(swPath, 'utf8').replace(/__BUILD_ID__/g, id);
        fs.writeFileSync(swPath, src);
        // eslint-disable-next-line no-console
        console.log(`[sw-build-version] cache: piano-alimentare-${id}`);
      } catch (e) {
        console.warn('[sw-build-version] impossibile versionare sw.js:', e.message);
      }
    },
  };
}

export default defineConfig({
  base: './', // percorsi relativi: funziona su GitHub Pages (sottocartella) e dentro Capacitor
  plugins: [react(), swVersionPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { outDir: 'dist' },
});
