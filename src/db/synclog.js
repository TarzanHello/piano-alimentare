// ── Registro diagnostico di sincronizzazione ─────────────────
// Buffer in memoria + persistito (ultime N voci) di tutto ciò che
// fa il motore di sync (db/sync.js): stato cloud, push, pull,
// eventi realtime, errori. Usato dalla pagina "Log Sync" per
// ispezionare e copiare cosa è successo, utile per confrontare
// due dispositivi durante un test di sincronizzazione.
//
// Nota: usiamo window.CustomEvent (non il CustomEvent globale di
// Node) per restare compatibili con eventuali test in jsdom, dove
// la CustomEvent nativa di Node 22 non è riconosciuta da
// window.dispatchEvent.

const SK_SYNC_LOG = "pf-sync-log";
const MAX_ENTRIES = 300;

let buffer = [];
let loaded = false;
let loadPromise = null;
let saveTimer = null;

function emitChange() {
  try { window.dispatchEvent(new window.CustomEvent("pf-sync-log")); } catch {}
}

function persist() {
  if (!loaded) return; // non scrivere finché non ho recuperato il pregresso
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { window.storage.set(SK_SYNC_LOG, JSON.stringify(buffer)); } catch {}
  }, 400);
}

function load() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let old = [];
    try {
      const r = await window.storage.get(SK_SYNC_LOG);
      const parsed = JSON.parse(r.value);
      if (Array.isArray(parsed)) old = parsed;
    } catch {}
    // le voci eventualmente già arrivate prima del caricamento vanno DOPO il pregresso
    buffer = [...old, ...buffer].slice(-MAX_ENTRIES);
    loaded = true;
    persist();
    emitChange();
  })();
  return loadPromise;
}
load();

// Aggiunge una voce al registro.
//   level: "info" | "status" | "update" | "push" | "pull" | "realtime" | "warn" | "error"
//   msg:   breve descrizione leggibile
//   data:  oggetto opzionale con dettagli (verrà clonato in modo sicuro)
export function logSync(level, msg, data) {
  const entry = { t: Date.now(), level, msg };
  if (data !== undefined) {
    try { entry.data = JSON.parse(JSON.stringify(data)); }
    catch { entry.data = String(data); }
  }
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(-MAX_ENTRIES);
  persist();
  emitChange();
}

export async function getSyncLog() {
  await load();
  return buffer.slice();
}

export async function clearSyncLog() {
  await load();
  buffer = [];
  try { await window.storage.set(SK_SYNC_LOG, JSON.stringify(buffer)); } catch {}
  emitChange();
}

// cb viene richiamata (senza argomenti) ogni volta che il registro cambia.
// Ritorna una funzione per disiscriversi.
export function onSyncLogChange(cb) {
  const handler = () => cb();
  window.addEventListener("pf-sync-log", handler);
  return () => window.removeEventListener("pf-sync-log", handler);
}
