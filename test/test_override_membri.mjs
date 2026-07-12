// Test: override per-membro (v2) — lo swap di un membro NON deve più
// sporcare il piano degli altri (bug storico dello storage condiviso).
import { ING_MAP, ING_QTY, MEAL_KEYS, applyOverridesWeek, buildShoppingPerPersona,
         contaOverrides, filtraOverrides, migraOverridesASettimana, normalizeOverrides,
         overridesForPersona, scriviOverride, tuttiOverrideMeals } from '@/core';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };

const pastoA = { id: "r_a", nome: "Pasto base",   ingredients: ["tst_ing1"] };
const pastoB = { id: "r_b", nome: "Swap di Aure", ingredients: ["tst_ing2"] };
const week = Array.from({ length: 7 }, () => Object.fromEntries(MEAL_KEYS.map(mk => [mk, pastoA])));

// ── Normalizzazione legacy ───────────────────────────────────────────
const legacy = { "10:0-pranzo": pastoB };
const norm = normalizeOverrides(legacy);
ok(norm._v === 2 && norm.condivisi["10:0-pranzo"] === pastoB && Object.keys(norm.perPersona).length === 0,
   "mappa flat legacy → condivisi (comportamento invariato)");
ok(applyOverridesWeek(week, legacy, 10, "federica")[0].pranzo === pastoB,
   "override legacy condiviso visibile a tutti i membri");

// ── Isolamento: swap di Aureliano invisibile a Federica ──────────────
let ovr = scriviOverride({}, "aureliano", "10:0-pranzo", pastoB);
ok(applyOverridesWeek(week, ovr, 10, "aureliano")[0].pranzo === pastoB, "Aureliano vede il proprio swap");
ok(applyOverridesWeek(week, ovr, 10, "federica")[0].pranzo === pastoA, "Federica NON vede lo swap di Aureliano");
ok(applyOverridesWeek(week, ovr, 10)[0].pranzo === pastoA, "vista senza persona = solo condivisi");

// il proprio override vince sul condiviso legacy
ovr = scriviOverride(legacy, "aureliano", "10:0-pranzo", { ...pastoB, id: "r_c" });
ok(overridesForPersona(ovr, "aureliano")["10:0-pranzo"].id === "r_c" &&
   overridesForPersona(ovr, "federica")["10:0-pranzo"].id === "r_b",
   "il layer personale vince sul condiviso; gli altri restano sul condiviso");

// reset: rimuove il proprio E il legacy condiviso (ciò che l'utente vede)
ovr = scriviOverride(ovr, "aureliano", "10:0-pranzo", null);
ok(!overridesForPersona(ovr, "aureliano")["10:0-pranzo"] && contaOverrides(ovr) === 0,
   "reset pulisce layer personale e voce legacy");

// ── Utility container ────────────────────────────────────────────────
ovr = scriviOverride(scriviOverride({}, "aureliano", "9:1-cena", pastoB), "federica", "10:2-cena", pastoA);
ok(tuttiOverrideMeals(ovr).length === 2, "tuttiOverrideMeals attraversa tutti i layer");
const filtrato = filtraOverrides(ovr, k => parseInt(k, 10) >= 10);
ok(contaOverrides(filtrato) === 1 && overridesForPersona(filtrato, "federica")["10:2-cena"],
   "filtraOverrides filtra per chiave su tutti i layer");
const mig = migraOverridesASettimana({ "0-pranzo": pastoA, _v: undefined }, 7);
ok(normalizeOverrides(mig).condivisi["7:0-pranzo"] === pastoA, "migrazione a settimana su formato legacy");

// ── Spesa per-persona: piatti diversi nello stesso slot ──────────────
ING_MAP.tst_ing1 = { id:"tst_ing1", nome:"Ing base", cat:"🥦 Verdure", deperibile:7, nutri:{kcal:20,p:1,c:3,g:0} };
ING_MAP.tst_ing2 = { id:"tst_ing2", nome:"Ing swap", cat:"🥦 Verdure", deperibile:7, nutri:{kcal:20,p:1,c:3,g:0} };
ING_QTY.r_a = { tst_ing1: { uomo: 100, donna: 80, bimbo: 50, unit: "g" } };
ING_QTY.r_b = { tst_ing2: { uomo: 120, donna: 90, bimbo: 60, unit: "g" } };
const personas = [{ id: "aureliano", sesso: "M", eta: 40 }, { id: "federica", sesso: "F", eta: 38 }];
const giornoA = Object.fromEntries(MEAL_KEYS.map(mk => [mk, null]));
const giorni = [{ dateKey: "2026-07-11", byPersona: {
  aureliano: { ...giornoA, pranzo: pastoB },   // lui ha swappato
  federica:  { ...giornoA, pranzo: pastoA },   // lei no
} }];
const spesa = buildShoppingPerPersona(giorni, personas, null);
const flat = Object.values(spesa).flat();
const i1 = flat.find(i => i.id === "tst_ing1"), i2 = flat.find(i => i.id === "tst_ing2");
ok(i1?.rawTotal === 80 && i2?.rawTotal === 120,
   `spesa somma il piatto di CIASCUNO col suo slot (80g donna + 120g uomo) — ottenuto ${i1?.rawTotal}/${i2?.rawTotal}`);

// consumo-aware: Federica ha già consumato → il suo piatto esce
const spesa2 = buildShoppingPerPersona(giorni, personas,
  { mealsLog: { federica: { "2026-07-11": { pranzo: { consumed: true } } } } });
const flat2 = Object.values(spesa2).flat();
ok(!flat2.find(i => i.id === "tst_ing1") && flat2.find(i => i.id === "tst_ing2")?.rawTotal === 120,
   "consumo-aware per persona: esce solo il piatto di chi ha già risolto");

console.log(fail === 0 ? "OVERRIDE PER-MEMBRO: TUTTO OK" : `OVERRIDE PER-MEMBRO: ${fail} FALLIMENTI`);
if (fail > 0) process.exit(1);
