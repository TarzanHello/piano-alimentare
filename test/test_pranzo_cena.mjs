// Test: pranzo ↔ cena intercambiabili (modulo REALE del motore).
//
// La SCELTA (swap / Ricettario) per pranzo o cena pesca da entrambe le
// categorie; colazione e spuntini restano confinati alla propria.
// Trucco per una verifica deterministica: le ricette "già in settimana"
// scendono in coda all'ordinamento → marcando TUTTI i pranzi come già
// usati, le proposte per un pranzo devono arrivare dalle cene (e
// viceversa), il che prova l'inclusione cross-categoria.
import { DB, categorieCompatibili, findAlternatives } from '@/core';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };

// ── 1. Mappa delle categorie compatibili ─────────────────────────────
ok(JSON.stringify(categorieCompatibili("pranzo")) === '["pranzo","cena"]',
   "pranzo → pesca da pranzo+cena");
ok(JSON.stringify(categorieCompatibili("cena")) === '["pranzo","cena"]',
   "cena → pesca da pranzo+cena");
ok(JSON.stringify(categorieCompatibili("colazione")) === '["colazione"]',
   "colazione → resta confinata");
ok(JSON.stringify(categorieCompatibili("spuntino_m")) === '["spuntino"]',
   "spuntino_m → resta confinato");
ok(JSON.stringify(categorieCompatibili("spuntino_p")) === '["spuntino"]',
   "spuntino_p → resta confinato");

// ── 2. Swap di un PRANZO con tutti i pranzi già usati → propone cene ──
{
  const corrente = DB.pranzo[0];
  const tuttiIPranzi = new Set(DB.pranzo.map(r => r.id));
  const proposte = findAlternatives("pranzo", corrente, 0, 999, [], tuttiIPranzi, "uomo", []);
  ok(proposte.length > 0, `pranzo: proposte trovate (${proposte.length})`);
  ok(proposte.every(r => r.id.startsWith("cen_")),
     `tutte le proposte sono cene: ${proposte.map(r=>r.id).join(", ")}`);
}

// ── 3. Simmetrico: swap di una CENA → propone pranzi ─────────────────
{
  const corrente = DB.cena[0];
  const tutteLeCene = new Set(DB.cena.map(r => r.id));
  const proposte = findAlternatives("cena", corrente, 0, 999, [], tutteLeCene, "uomo", []);
  ok(proposte.length > 0, `cena: proposte trovate (${proposte.length})`);
  ok(proposte.every(r => r.id.startsWith("pra_")),
     `tutte le proposte sono pranzi: ${proposte.map(r=>r.id).join(", ")}`);
}

// ── 4. Ricetta utente di categoria CENA proposta per un PRANZO ───────
{
  // Le ricette utente hanno priorità massima: se il filtro cross-categoria
  // funziona, una ricetta utente "cena" appare in testa allo swap di un pranzo.
  const ricettaCena = {
    id: "test-cross", titolo: "Cena test cross", categoria: "cena",
    esclusa: false, prep: 5,
    quantita: { db_pasta_di_semola_cruda: { g: 100, unit: "g" } },
  };
  const corrente = DB.pranzo[0];
  const proposte = findAlternatives("pranzo", corrente, 0, 999, [], new Set(), "uomo", [ricettaCena]);
  ok(proposte.some(r => String(r.id).includes("test-cross")),
     "la ricetta utente di categoria cena compare tra le alternative del pranzo");
}

// ── 5. Regressione: la colazione NON propone mai pranzi o cene ───────
{
  const corrente = DB.colazione[0];
  const tutteLeColazioni = new Set(DB.colazione.map(r => r.id));
  const proposte = findAlternatives("colazione", corrente, 0, 999, [], tutteLeColazioni, "uomo", []);
  ok(proposte.every(r => r.id.startsWith("col_")),
     "colazione: solo colazioni anche con tutta la categoria già usata");
}

if (fail) { console.log(`\nTEST PRANZO-CENA: ${fail} FALLITI`); process.exit(1); }
console.log("\nTEST PRANZO-CENA: TUTTO OK");
