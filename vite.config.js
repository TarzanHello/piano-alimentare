import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './', // percorsi relativi: funziona su GitHub Pages (sottocartella) e dentro Capacitor
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { outDir: 'dist' },
});
