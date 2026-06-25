# Fitsy — Nutrizione intelligente

App di nutrizione familiare (ex *Piano Alimentare*). Progetto **Vite + React**
modulare, pronto a diventare app Android/iPhone con Capacitor.

## Avvio rapido (Windows / Linux / Mac)

```bash
npm install
npm run dev        # sviluppo con hot-reload → http://localhost:5173
npm run build      # build di produzione in dist/
npm run preview    # anteprima del build
```

Serve solo **Node.js 18+**. Niente più Babel nel browser: il codice è transpilato
in fase di build, quindi parte molto più veloce.

## Struttura

```
src/
  data/            ← I DUE DATABASE (sorgente unica di verità)
    ingredients.json  828 ingredienti (con valori nutrizionali + peso pezzo)
    recipes.json      104 ricette (con quantità uomo/donna/bimbo)
    index.js          ricostruisce INGREDIENTS / NUTRI / DB / ING_QTY / PESO_PEZZO
  db/
    storage.js     ← layer dati UTENTE (profili, piano, spesa, log). Vedi sotto.
  core/
    constants.js   25 costanti (giorni, colori, tabelle LARN, ecc.)
    engine.js      50 funzioni pure: calcolo macro, scaling porzioni,
                   generazione piano, lista spesa, fabbisogno calorico
    index.js       barrel: import unico `@/core`
  components/
    shared.jsx     SwipeContainer, MacroBadge, ProgressBar
    charts.jsx     grafici peso / calorie / misure
    modals.jsx     editor ricetta + editor consumato
  features/        ← una cartella per sezione (come richiesto)
    piano/         MealParts.jsx (card pasto, idratazione, totali)
    misure/        MisurePage.jsx
    spesa/         ShoppingPage.jsx
    ingredienti/   IngredientiPage.jsx
    famiglia/      FamigliaPage.jsx (profili + sync seed)
    gusti/         GustiPage.jsx
    opzioni/       OpzioniPage.jsx
  App.jsx          orchestratore + navigazione
  main.jsx         entry point
```

Import puliti via alias `@`: `import { calcTarget, DAYS } from '@/core'`.

## I due livelli di dati

1. **Dati curati (sola lettura)** → `src/data/*.json`. Sono i database che hai chiesto.
   Pronti da importare in SQLite/Supabase o da tenere come JSON.
2. **Dati utente (modificabili)** → passano tutti da `src/db/storage.js`.
   Oggi salva su `localStorage`. È **l'unico file da cambiare** per passare a
   un DB nativo: basta reimplementare `get/set/delete/list` con
   `@capacitor/preferences` o SQLite, senza toccare il resto dell'app.

## Diventare app Android

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npm run android      # build + sync + apre Android Studio
```

Da Android Studio generi l'APK/AAB per il Play Store. `capacitor.config.json` è già
pronto (appId `com.pianoalimentare.app`).

Per le **notifiche native** (ora gestite dal service worker, che su nativo non scatta):
sostituisci la chiamata in `engine.js → scheduleNotifications` con
`@capacitor/local-notifications`.

## iPhone senza Mac

Per buildare iOS serve macOS, ma **non devi comprare un Mac**:
- **Ionic Appflow** o **Codemagic / EAS Build**: build iOS in cloud partendo dallo
  stesso progetto. Aggiungi `npx cap add ios` e colleghi il repo al servizio CI.
- In alternativa, un Mac in cloud a noleggio (MacStadium, macincloud) per le sole build.

Il codice è già pronto per iOS: cambia solo *dove* viene compilato.

## Cosa NON è cambiato

Lo split è **meccanico**: i componenti e la logica sono stati spostati verbatim,
non riscritti. Stessi comportamenti, stessi dati. Build verificato (`npm run build` ✓)
e nessun riferimento mancante tra i moduli.
