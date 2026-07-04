// Test: logica del consenso privacy (modulo REALE informativa.jsx).
//
// Verifica serveConsenso() — l'unica funzione che decide se mostrare il
// gate — e nuovoConsenso() come punto di verità sul formato del record.
// Copre: primo accesso, consenso valido, revoca, bump di versione
// dell'informativa, record malformati o manipolati.
import { serveConsenso, nuovoConsenso, PRIVACY_VERSIONE } from '@/features/privacy/informativa';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };

// ── 1. Primo accesso: nessun record → gate ──────────────────────────
ok(serveConsenso(null) === true,        "nessun record → gate mostrato");
ok(serveConsenso(undefined) === true,   "record undefined → gate mostrato");
ok(serveConsenso("x") === true,         "record malformato (stringa) → gate mostrato");
ok(serveConsenso({}) === true,          "record vuoto → gate mostrato");

// ── 2. Consenso appena prestato: niente gate ─────────────────────────
{
  const rec = nuovoConsenso();
  ok(rec.versione === PRIVACY_VERSIONE, "nuovoConsenso porta la versione corrente");
  ok(rec.salute === true && rec.minori === true, "flag art. 9 e minori attivi");
  ok(typeof rec.ts === "string" && !isNaN(Date.parse(rec.ts)), "timestamp ISO valido (prova del consenso)");
  ok(serveConsenso(rec) === false, "consenso corrente → gate NON mostrato");
}

// ── 3. Revoca: il gate torna ─────────────────────────────────────────
{
  const rec = { ...nuovoConsenso(), revocatoTs: new Date().toISOString() };
  ok(serveConsenso(rec) === true, "consenso revocato → gate mostrato di nuovo");
}

// ── 4. Bump di versione dell'informativa → nuovo consenso ────────────
{
  const vecchio = { ...nuovoConsenso(), versione: "2026-01-01" };
  ok(serveConsenso(vecchio) === true,
     "record di versione precedente → gate (rinnovo dopo modifica sostanziale)");
  ok(serveConsenso(vecchio, "2026-01-01") === false,
     "stessa versione → nessun rinnovo richiesto");
  // Il confronto lessicografico su date ISO è corretto anche tra anni
  ok(serveConsenso({ ...nuovoConsenso(), versione: "2025-12-31" }, "2026-07-04") === true,
     "confronto versioni ISO attraverso il cambio anno");
}

// ── 5. Record manipolato: salute=false non passa mai ─────────────────
{
  const rec = { ...nuovoConsenso(), salute: false };
  ok(serveConsenso(rec) === true, "senza consenso art. 9 esplicito il gate resta");
  ok(serveConsenso({ versione: PRIVACY_VERSIONE, ts: "x" }) === true,
     "record senza flag salute → gate");
}

// ── 6. Versione mancante nel record → prudenzialmente gate ───────────
ok(serveConsenso({ salute: true, ts: new Date().toISOString() }) === true,
   "record senza versione → gate (non sappiamo cosa ha letto)");

if (fail) { console.log(`\nTEST CONSENSO: ${fail} FALLITI`); process.exit(1); }
console.log("\nTEST CONSENSO: TUTTO OK");
