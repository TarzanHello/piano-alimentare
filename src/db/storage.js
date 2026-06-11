// ── Layer dati utente (profili, piano, spesa, log) ───────────────
// Astrazione storage async: oggi usa localStorage; in nativo basta
// rimpiazzare questo file con @capacitor/preferences o SQLite,
// senza toccare il resto dell'app. Espone window.storage.

// ─── localStorage storage shim (sostituisce window.storage della Claude artifact API) ───
// Gestisce: localStorage non disponibile (Safari modalità privata),
// quota piena, e dati corrotti. Mai blocca l'app.
(function () {
  // Verifica che localStorage sia effettivamente usabile
  let lsOk = false;
  try {
    const t = "__pa_test__";
    localStorage.setItem(t, "1");
    localStorage.removeItem(t);
    lsOk = true;
  } catch (e) {
    lsOk = false;
  }

  // Fallback in memoria se localStorage non è disponibile
  const memStore = {};
  let quotaWarned = false;

  window.storage = {
    get: async (key) => {
      const v = lsOk ? localStorage.getItem("pa__" + key) : (memStore[key] ?? null);
      if (v === null || v === undefined) throw new Error("Key not found: " + key);
      return { key, value: v };
    },
    set: async (key, value) => {
      if (lsOk) {
        try {
          localStorage.setItem("pa__" + key, value);
        } catch (e) {
          // Quota superata o storage bloccato: salva in memoria e avvisa una volta
          memStore[key] = value;
          if (!quotaWarned) {
            quotaWarned = true;
            console.warn("Storage pieno o non disponibile: i dati di questa sessione non verranno salvati.");
          }
        }
      } else {
        memStore[key] = value;
      }
      return { key, value };
    },
    delete: async (key) => {
      if (lsOk) localStorage.removeItem("pa__" + key);
      delete memStore[key];
      return { key, deleted: true };
    },
    list: async (prefix = "") => {
      let keys = [];
      if (lsOk) {
        keys = Object.keys(localStorage)
          .filter(k => k.startsWith("pa__" + prefix))
          .map(k => k.slice(4));
      }
      Object.keys(memStore)
        .filter(k => k.startsWith(prefix) && !keys.includes(k))
        .forEach(k => keys.push(k));
      return { keys };
    },
    // espone lo stato per eventuali avvisi UI
    _available: lsOk,
  };
})();

export const storage = window.storage;
