// Test: scegliTagliaBase — criterio di raggiungibilità (fix "tagliaBase bimbo").
//
// Riproduce il bug osservato nel log del 02/07: per un adulto con target
// ~2000 kcal l'algoritmo sceglieva la taglia "bimbo" perché le sue kcal di
// partenza erano le più vicine al target, ma i limiti elastici (relativi
// alla base) rendevano irraggiungibili kcal e macro → giornata a −12% kcal
// e −33% carboidrati. Il nuovo criterio scarta le taglie il cui inviluppo
// raggiungibile non copre il target.
import {
  ING_MAP, ING_QTY,
  scegliTagliaBase, scalaPastiGiorno,
} from '@/core';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };

// ── Fixture: ingredienti sintetici con categorie reali del DB ────────
// (elasticità: Carni 0.55–2.8 · Cereali 0.5–2.5 · default 0.9–1.15)
ING_MAP.tst_snack = { id:"tst_snack", nome:"Snack test", cat:"🍪 Dolci",
  nutri:{ kcal:500, p:2,  c:20, z:0, g:45, f:0 } };
ING_MAP.tst_avena = { id:"tst_avena", nome:"Avena test", cat:"🌾 Cereali",
  nutri:{ kcal:370, p:13, c:60, z:0, g:7,  f:0 } };
ING_MAP.tst_pollo = { id:"tst_pollo", nome:"Pollo test", cat:"🍖 Carni",
  nutri:{ kcal:110, p:23, c:0,  z:0, g:1.5,f:0 } };
ING_MAP.tst_olio  = { id:"tst_olio",  nome:"Olio test",  cat:"🫒 Oli e grassi",
  nutri:{ kcal:900, p:0,  c:0,  z:0, g:100,f:0 } };
ING_MAP.tst_crack = { id:"tst_crack", nome:"Cracker test", cat:"🧂 Dispensa",   // elasticità stretta 0.85–1.2
  nutri:{ kcal:500, p:2,  c:20, z:0, g:45, f:0 } };

const pulisci = () => { for (const k of Object.keys(ING_QTY)) if (k.startsWith("tst_ric")) delete ING_QTY[k]; };

// ── Caso 1 (il bug del log): base "bimbo" vicinissima per kcal, ma
//    macro irraggiungibili → deve vincere una taglia che copre il target ──
{
  // bimbo: 400 g di snack = 2000 kcal esatte (vecchio criterio: diff 0 → vince)
  //        ma pMax ≈ 9 g e cMax ≈ 92 g contro un target di 160 p / 200 c.
  // uomo:  avena+pollo+olio, base ~1565 kcal ma inviluppo che copre tutto.
  ING_QTY.tst_ric_mix = {
    tst_snack: { uomo: 1,   donna: 1,   bimbo: 400, unit: "g" },
    tst_avena: { uomo: 250, donna: 120, bimbo: 1,   unit: "g" },
    tst_pollo: { uomo: 500, donna: 200, bimbo: 1,   unit: "g" },
    tst_olio:  { uomo: 10,  donna: 6,   bimbo: 1,   unit: "g" },
  };
  const target = { kcal: 2000, p: 160, c: 200, g: 65 };
  const ricette = [{ id: "tst_ric_mix" }];
  const slot = scegliTagliaBase(ricette, target);
  ok(slot !== "bimbo", `adulto 2000 kcal / 160 p: NON sceglie "bimbo" (scelto: ${slot})`);
  ok(slot === "uomo", `sceglie la taglia che copre kcal E macro (scelto: ${slot})`);

  // E lo scaling end-to-end deve centrare il target molto meglio della base bimbo
  const resAuto  = scalaPastiGiorno(ricette, target);              // scelta nuova
  const resBimbo = scalaPastiGiorno(ricette, target, "bimbo");     // scelta del vecchio bug
  const errK = r => Math.abs(r.totali.kcal - target.kcal) / target.kcal;
  const errP = r => Math.abs(r.totali.p    - target.p)    / target.p;
  ok(errK(resAuto) < 0.05, `kcal entro il 5% del target con la nuova scelta (err ${(errK(resAuto)*100).toFixed(1)}%)`);
  ok(errP(resAuto) < 0.10, `proteine entro il 10% del target (err ${(errP(resAuto)*100).toFixed(1)}%)`);
  ok(errP(resBimbo) > 0.5, `controprova: da "bimbo" le proteine restano lontane (err ${(errP(resBimbo)*100).toFixed(0)}%)`);
  pulisci();
}

// ── Caso 2: kcal-only — copre il target batte "più vicino ma fuori" ──
{
  // bimbo: 330 g cracker (Dispensa, max ×1.2) = 1650 kcal base, max 1980 < 2000 → fuori
  // uomo:  800 g pollo = 880 kcal base (max 2464 → copre)
  ING_QTY.tst_ric_kcal = {
    tst_crack: { uomo: 1,   donna: 1, bimbo: 330, unit: "g" },
    tst_pollo: { uomo: 800, donna: 1, bimbo: 1,   unit: "g" },
  };
  const target = { kcal: 2000, p: 0, c: 0, g: 0 };
  const slot = scegliTagliaBase([{ id: "tst_ric_kcal" }], target);
  ok(slot === "uomo", `taglia che COPRE il target batte quella più vicina ma fuori inviluppo (scelto: ${slot})`);
  pulisci();
}

// ── Caso 3 (regressione): se tutte coprono, vince la base più vicina ──
{
  // Solo pollo (elasticità 0.55–2.8): tutte le taglie coprono 2000 kcal.
  ING_QTY.tst_ric_reg = {
    tst_pollo: { uomo: 1800, donna: 1200, bimbo: 600, unit: "g" },
  };
  const target = { kcal: 2000, p: 0, c: 0, g: 0 };
  // basi: uomo 1980 · donna 1320 · bimbo 660 → tutte coprono, uomo più vicina
  const slot = scegliTagliaBase([{ id: "tst_ric_reg" }], target);
  ok(slot === "uomo", `comportamento storico preservato quando tutte coprono (scelto: ${slot})`);
  pulisci();
}

// ── Caso 4: nessuna copre → minima distanza dall'inviluppo ──────────
{
  // Solo cracker (Dispensa, max ×1.2): nessuna taglia arriva a 3000.
  ING_QTY.tst_ric_none = {
    tst_crack: { uomo: 480, donna: 380, bimbo: 250, unit: "g" },
  };
  const target = { kcal: 3000, p: 0, c: 0, g: 0 };
  // max: uomo 2880 · donna 2280 · bimbo 1500 → uomo è il meno lontano
  const slot = scegliTagliaBase([{ id: "tst_ric_none" }], target);
  ok(slot === "uomo", `nessuna taglia copre → vince la meno lontana dall'inviluppo (scelto: ${slot})`);
  pulisci();
}

// pulizia fixture ingredienti
delete ING_MAP.tst_snack; delete ING_MAP.tst_avena;
delete ING_MAP.tst_pollo; delete ING_MAP.tst_olio; delete ING_MAP.tst_crack;

if (fail) { console.log(`\nTEST TAGLIA BASE: ${fail} FALLITI`); process.exit(1); }
console.log("\nTEST TAGLIA BASE: TUTTO OK");
