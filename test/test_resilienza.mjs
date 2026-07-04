// Test: resilienza ricette (fix 2) + canale realtime zombie (fix 4).
//
// Parte A — importa il modulo REALE ricetteCloud e verifica:
//   • risolviRisultatoRicette: successo → cloud+salvataggio; fallimento →
//     ultima lista nota se esiste, altrimenti vuoto (comportamento storico)
//   • ricetteCachePersistita: round-trip e robustezza a dati corrotti
// Riproduce i due casi del log reale: "Nessuna sessione" transitoria al
// boot e "TypeError: Failed to fetch" offline — prima entrambi degradavano
// a lista vuota e il piano veniva rigenerato senza le ricette utente.
//
// Parte B — replica 1:1 la guardia anti-zombie di subscribeRealtime
// (PENDING più vecchio di 15s non conta più come canale attivo).

globalThis.localStorage = {
  _m: {},
  getItem(k)    { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};
globalThis.window = globalThis;

const { risolviRisultatoRicette, ricetteCachePersistita } = await import('@/db/ricetteCloud');

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };

// ── A1. Successo: si usa il cloud e si aggiorna la cache ─────────────
{
  const r = risolviRisultatoRicette({ ok: true, ricette: [{ id: "a" }, { id: "b" }] });
  ok(r.fonte === "cloud" && r.ricette.length === 2 && r.salva === true,
     "successo → fonte cloud, lista completa, cache da aggiornare");
}

// ── A2. Fallimento CON ultima lista nota → si usa la cache ───────────
{
  const cache = [{ id: "a", titolo: "Curry di riso e pollo" }];
  const r = risolviRisultatoRicette({ ok: false, cache });
  ok(r.fonte === "cache" && r.ricette.length === 1 && r.salva === false,
     "offline/sessione assente con cache → ultima lista nota, niente sovrascrittura");
  ok(r.ricette[0].titolo === "Curry di riso e pollo", "il contenuto della cache è integro");
}

// ── A3. Fallimento SENZA cache → lista vuota (comportamento storico) ──
{
  const r1 = risolviRisultatoRicette({ ok: false, cache: null });
  const r2 = risolviRisultatoRicette({ ok: false, cache: [] });
  ok(r1.fonte === "vuoto" && r1.ricette.length === 0, "nessuna cache → lista vuota (come prima del fix)");
  ok(r2.fonte === "vuoto" && r2.ricette.length === 0, "cache vuota → lista vuota");
}

// ── A4. Cache persistita: round-trip e robustezza ────────────────────
{
  ok(ricetteCachePersistita() === null, "cache assente → null (nessun fallback fantasma)");
  localStorage.setItem("pa__ricette-cache", JSON.stringify([{ id: "x", esclusa: true }]));
  const c = ricetteCachePersistita();
  ok(Array.isArray(c) && c.length === 1 && c[0].esclusa === true,
     "round-trip: la lista persistita si rilegge con i flag intatti");
  localStorage.setItem("pa__ricette-cache", "{corrotto");
  ok(ricetteCachePersistita() === null, "JSON corrotto → null, nessuna eccezione");
  localStorage.setItem("pa__ricette-cache", JSON.stringify({ non: "array" }));
  ok(ricetteCachePersistita() === null, "forma inattesa (non-array) → null");
  localStorage.removeItem("pa__ricette-cache");
}

// ── A5. Timeline del log reale: boot con sessione transitoria ────────
{
  // Ieri: caricamento riuscito → cache scritta
  localStorage.setItem("pa__ricette-cache", JSON.stringify(
    Array.from({ length: 11 }, (_, i) => ({ id: "r" + i }))
  ));
  // Oggi al boot: sessione non pronta ("Nessuna sessione: utente non collegato")
  const alBoot = risolviRisultatoRicette({ ok: false, cache: ricetteCachePersistita() });
  ok(alBoot.ricette.length === 11,
     "boot con sessione transitoria → il pool del piano ha ancora le 11 ricette (prima: 0)");
  // Poi offline duro ("Failed to fetch")
  const offline = risolviRisultatoRicette({ ok: false, cache: ricetteCachePersistita() });
  ok(offline.ricette.length === 11, "offline (Failed to fetch) → idem, niente piano monco");
  localStorage.removeItem("pa__ricette-cache");
}

// ── B. Guardia anti-zombie del canale realtime (replica 1:1) ─────────
{
  const RT_PENDING_STALE_MS = 15000;
  // Stessa espressione usata in subscribeRealtime
  const canaleAttivo = (ch, ora) => {
    const pendingFresco = ch.__stato === "PENDING" &&
      (ora - (ch.__pendingDa || 0)) < RT_PENDING_STALE_MS;
    return ch.__stato === "SUBSCRIBED" || pendingFresco;
  };
  const t0 = 1_000_000;
  ok(canaleAttivo({ __stato: "SUBSCRIBED" }, t0) === true, "SUBSCRIBED → attivo (si salta la risottoscrizione)");
  ok(canaleAttivo({ __stato: "PENDING", __pendingDa: t0 - 3000 }, t0) === true,
     "PENDING da 3s → ancora attivo (subscribe in corso)");
  ok(canaleAttivo({ __stato: "PENDING", __pendingDa: t0 - 16000 }, t0) === false,
     "PENDING da 16s → ZOMBIE: si ricrea il canale (prima restava morto fino al reload)");
  ok(canaleAttivo({ __stato: "PENDING" }, t0) === false,
     "PENDING senza marca temporale → prudenzialmente zombie");
  ok(canaleAttivo({ __stato: "CHANNEL_ERROR" }, t0) === false, "CHANNEL_ERROR → si ricrea");
  ok(canaleAttivo({ __stato: "CLOSED" }, t0) === false, "CLOSED → si ricrea");
}

if (fail) { console.log(`\nTEST RESILIENZA: ${fail} FALLITI`); process.exit(1); }
console.log("\nTEST RESILIENZA: TUTTO OK");
