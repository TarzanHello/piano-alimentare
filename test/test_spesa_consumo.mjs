// Test: spesa consumo-aware PER PERSONA (buildShoppingForDayObjects).
//
// Verifica:
//  • senza `consumo` → comportamento storico (somma slot fissi uomo+donna+bimbo)
//  • con `consumo` e nessun pasto risolto → quantità = Σ porzioni dei membri REALI
//  • un membro consuma un pasto → la sua porzione esce dal conteggio di quel pasto
//  • un membro salta un pasto → idem (saltato = risolto)
//  • pasto risolto da TUTTI → l'intero pasto (anche gli ingredienti q.b.) esce
//  • le esclusioni valgono solo per la data giusta (dateKeys allineate)
import {
  MEAL_KEYS, ING_QTY,
  buildShoppingForDayObjects, slotForPersona,
} from '@/core';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };

// ── Fixture: due ricette finte con quantità note ─────────────────────
// Registro quantità direttamente in ING_QTY con id di ricetta di test.
const RIC_A = "test_ric_pasta";
const RIC_B = "test_ric_frutta";
// L'olio NON ha entry in ING_QTY[RIC_A]: cade nel ramo q.b. del motore.
ING_QTY[RIC_A] = {
  db_pasta_di_semola_cruda: { uomo: 100, donna: 80, bimbo: 50, unit: "g" },
};
ING_QTY[RIC_B] = {
  db_mele_fresche_golden: { uomo: 150, donna: 150, bimbo: 100, unit: "g" },
};

const mealA = { id: RIC_A, ingredients: ["db_pasta_di_semola_cruda", "db_olio_di_oliva_extra_vergine"] }; // olio → q.b.
const mealB = { id: RIC_B, ingredients: ["db_mele_fresche_golden"] };

// Giorno con pranzo=A e cena=B (le altre chiavi vuote)
const dayObj = (a = mealA, b = mealB) => {
  const d = {};
  MEAL_KEYS.forEach(mk => { d[mk] = null; });
  d.pranzo = a; d.cena = b;
  return d;
};

// Famiglia reale: 1 uomo, 1 donna (nessun bimbo)
const P_U = { id: "p_uomo",  sesso: "M", eta: 40 };
const P_D = { id: "p_donna", sesso: "F", eta: 38 };
const personas = [P_U, P_D];
ok(slotForPersona(P_U) === "uomo" && slotForPersona(P_D) === "donna", "slotForPersona mappa correttamente i membri");

const totPasta = grouped => {
  for (const items of Object.values(grouped)) {
    const hit = items.find(i => i.id === "db_pasta_di_semola_cruda");
    if (hit) return hit.rawTotal;
  }
  return null; // ingrediente assente dalla lista
};
const totMela = grouped => {
  for (const items of Object.values(grouped)) {
    const hit = items.find(i => i.id === "db_mele_fresche_golden");
    if (hit) return hit.rawTotal;
  }
  return null;
};
const haQb = grouped => Object.values(grouped).some(items => items.some(i => i.id === "db_olio_di_oliva_extra_vergine"));

// ── 1. Legacy: senza consumo → somma dei tre slot fissi ─────────────
{
  const g = buildShoppingForDayObjects([dayObj()]);
  ok(totPasta(g) === 230, `legacy: pasta = uomo+donna+bimbo = 230g (trovato ${totPasta(g)})`);
  ok(totMela(g) === 400, `legacy: mela = 150+150+100 = 400g (trovato ${totMela(g)})`);
}

// ── 2. Consumo-aware, nessun pasto risolto → porzioni dei membri reali ──
{
  const g = buildShoppingForDayObjects([dayObj()], { personas, mealsLog: {}, dateKeys: ["2026-07-01"] });
  ok(totPasta(g) === 180, `aware, tutti in attesa: pasta = uomo+donna = 180g (trovato ${totPasta(g)})`);
  ok(totMela(g) === 300, `aware, tutti in attesa: mela = 150+150 = 300g (trovato ${totMela(g)})`);
}

// ── 3. L'uomo ha CONSUMATO il pranzo → esce solo la sua porzione dal pranzo ──
{
  const mealsLog = { p_uomo: { "2026-07-01": { pranzo: { consumed: true } } } };
  const g = buildShoppingForDayObjects([dayObj()], { personas, mealsLog, dateKeys: ["2026-07-01"] });
  ok(totPasta(g) === 80, `uomo ha mangiato il pranzo: pasta = solo donna = 80g (trovato ${totPasta(g)})`);
  ok(totMela(g) === 300, `la cena resta intatta: mela = 300g (trovato ${totMela(g)})`);
}

// ── 4. La donna ha SALTATO il pranzo (saltato = risolto) ─────────────
{
  const mealsLog = {
    p_uomo:  { "2026-07-01": { pranzo: { consumed: true } } },
    p_donna: { "2026-07-01": { pranzo: { saltato: true } } },
  };
  const g = buildShoppingForDayObjects([dayObj()], { personas, mealsLog, dateKeys: ["2026-07-01"] });
  ok(totPasta(g) === null, "pranzo risolto da TUTTI: la pasta sparisce dalla lista");
  ok(!haQb(g), "pranzo risolto da TUTTI: anche l'ingrediente q.b. del pranzo sparisce");
  ok(totMela(g) === 300, `la cena non risolta resta: mela = 300g (trovato ${totMela(g)})`);
}

// ── 5. Le esclusioni valgono solo per la data giusta ─────────────────
{
  // Stesso pranzo su due giorni: consumato SOLO il 01/07 → il 02/07 resta pieno
  const mealsLog = {
    p_uomo:  { "2026-07-01": { pranzo: { consumed: true } } },
    p_donna: { "2026-07-01": { pranzo: { consumed: true } } },
  };
  const g = buildShoppingForDayObjects(
    [dayObj(), dayObj()],
    { personas, mealsLog, dateKeys: ["2026-07-01", "2026-07-02"] }
  );
  ok(totPasta(g) === 180, `giorno 2 non toccato: pasta = 180g del solo 02/07 (trovato ${totPasta(g)})`);
  ok(totMela(g) === 600, `mele di entrambi i giorni: 300+300 = 600g (trovato ${totMela(g)})`);
}

// ── 6. q.b. resta finché almeno un membro è in attesa ────────────────
{
  const mealsLog = { p_uomo: { "2026-07-01": { pranzo: { consumed: true } } } };
  const g = buildShoppingForDayObjects([dayObj()], { personas, mealsLog, dateKeys: ["2026-07-01"] });
  ok(haQb(g), "q.b. presente finché la donna non ha risolto il pranzo");
}

// pulizia fixture
delete ING_QTY[RIC_A];
delete ING_QTY[RIC_B];

if (fail) { console.log(`\nTEST SPESA CONSUMO-AWARE: ${fail} FALLITI`); process.exit(1); }
console.log("\nTEST SPESA CONSUMO-AWARE: TUTTO OK");
