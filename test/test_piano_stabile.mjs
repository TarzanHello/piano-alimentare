// Test: stabilità del piano rispetto alle variazioni del DB ricette.
//
// Field test 12/07: aggiungere 30 ricette ha rimescolato TUTTI i piani a
// parità di seed (selezione rng-su-indice → funzione della dimensione del
// pool). Il weighted rendezvous garantisce:
//   1. determinismo: stesso seed + stesso DB → stesso piano
//   2. rimozione di una ricetta mai scelta → piano IDENTICO
//   3. aggiunta di una ricetta → cambiano solo gli slot della sua
//      categoria (le altre categorie usano hash e pool indipendenti)
//   4. vincolo spuntini (no ripetizioni ravvicinate) preservato
import { DB, MEAL_KEYS, generateWeekPlan } from '@/core';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };

const SEEDS = [1, 42, 999, 123456789, 1783848005545];
const firma = plan => plan.map(d => MEAL_KEYS.map(mk => d[mk]?.id).join(",")).join("|");
const firmaCat = (plan, mk) => plan.map(d => d[mk]?.id).join(",");

// ── 1) Determinismo ──────────────────────────────────────────────────
ok(SEEDS.every(s => firma(generateWeekPlan(s, [], 7)) === firma(generateWeekPlan(s, [], 7))),
   "stesso seed + stesso DB → stesso piano (tutti i seed)");

const base = Object.fromEntries(SEEDS.map(s => [s, generateWeekPlan(s, [], 7)]));

// ── 2) Rimozione di una ricetta mai scelta → nessun cambiamento ─────
const sceltiOvunque = new Set(SEEDS.flatMap(s => base[s].flatMap(d => MEAL_KEYS.map(mk => d[mk]?.id))));
const vittima = DB.cena.findIndex(r => !sceltiOvunque.has(r.id));
ok(vittima >= 0, "esiste una cena mai scelta nei seed di test (precondizione)");
const rimossa = DB.cena.splice(vittima, 1)[0];
try {
  ok(SEEDS.every(s => firma(generateWeekPlan(s, [], 7)) === firma(base[s])),
     `rimozione di una ricetta mai scelta (${rimossa.id}) → piani IDENTICI`);
} finally { DB.cena.splice(vittima, 0, rimossa); }

// ── 3) Aggiunta: cambia solo la categoria toccata ────────────────────
const fake = { id: "tst_stab_col", nome: "Colazione test stabilità", ingredients: [],
               uomo:{kcal:400,p:20,c:45,g:12}, donna:{kcal:320,p:16,c:36,g:10}, bimbo:{kcal:200,p:10,c:22,g:6},
               porzioni:{uomo:"test",donna:"test",bimbo:"test"} };
DB.colazione.push(fake);
try {
  let slotCambiati = 0, altreCatIntatte = true;
  for (const s of SEEDS) {
    const dopo = generateWeekPlan(s, [], 7);
    for (const mk of ["pranzo","cena","spuntino_m","spuntino_p"])
      if (firmaCat(dopo, mk) !== firmaCat(base[s], mk)) altreCatIntatte = false;
    for (let d = 0; d < 7; d++)
      if (dopo[d].colazione?.id !== base[s][d].colazione?.id) slotCambiati++;
  }
  ok(altreCatIntatte, "aggiunta di una colazione: pranzi/cene/spuntini INTATTI su tutti i seed");
  ok(slotCambiati <= 2 * SEEDS.length,
     `aggiunta di una colazione: disturbo limitato (${slotCambiati} slot cambiati su ${7 * SEEDS.length} totali)`);
} finally { DB.colazione.pop(); }

// dopo il ripristino, tutto torna al piano base (sanity del cleanup)
ok(SEEDS.every(s => firma(generateWeekPlan(s, [], 7)) === firma(base[s])),
   "ripristinato il DB, i piani tornano identici alla base");

// ── 4) Vincolo spuntini preservato ───────────────────────────────────
const okSpuntini = SEEDS.every(s => {
  const seq = base[s].flatMap(d => [d.spuntino_m?.id, d.spuntino_p?.id]);
  return seq.every((id, i) => i < 2 || (id !== seq[i-1] && id !== seq[i-2]));
});
ok(okSpuntini, "spuntini: nessuna ripetizione nelle ultime 2 posizioni");

console.log(fail === 0 ? "STABILITÀ PIANO: TUTTO OK" : `STABILITÀ PIANO: ${fail} FALLIMENTI`);
if (fail > 0) process.exit(1);
