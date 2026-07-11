// Test: nutriPer100DaQuantita — trasformazione ricetta → ingrediente.
//
// Caso d'uso: salsa teriyaki fatta in casa (soia + zucchero + aceto + amido)
// salvata come ingrediente custom riusabile. Verifica l'aggregazione dei
// nutrienti per 100g, la gestione delle unità (g/ml/cucchiaio/pz) e i
// casi limite (quantita vuota, ingredienti senza nutrizione).
import { ING_MAP, PESO_PEZZO, nutriPer100DaQuantita } from '@/core';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };
const vicino = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

// ── Fixture: componenti sintetici della teriyaki ─────────────────────
ING_MAP.tst_soia    = { id:"tst_soia",    nome:"Salsa di soia test", cat:"🧂 Dispensa",
  nutri:{ kcal:60,  p:8,  c:6,  z:1,  g:0.1, f:0 } };
ING_MAP.tst_zucch   = { id:"tst_zucch",   nome:"Zucchero test",      cat:"🧂 Dispensa",
  nutri:{ kcal:392, p:0,  c:100,z:100,g:0,   f:0 } };
ING_MAP.tst_aceto   = { id:"tst_aceto",   nome:"Aceto test",         cat:"🧂 Dispensa",
  nutri:{ kcal:20,  p:0,  c:0.9,z:0.9,g:0,   f:0 } };
ING_MAP.tst_amido   = { id:"tst_amido",   nome:"Amido test",         cat:"🧂 Dispensa",
  nutri:{ kcal:350, p:0.3,c:87, z:0,  g:0.1, f:0.9 } };

// Batch: 100ml soia · 30g zucchero · 2 cucchiai aceto (20g) · 10g amido = 160g
const quantita = {
  tst_soia:  { uomo:100, unit:"ml" },
  tst_zucch: { uomo:30,  unit:"g"  },
  tst_aceto: { uomo:2,   unit:"cucchiaio" },
  tst_amido: { uomo:10,  unit:"g"  },
};

const res = nutriPer100DaQuantita(quantita);
ok(!!res, "il calcolo restituisce un risultato");
ok(res.pesoTotale === 160, `peso totale batch 160g (unità convertite) — ottenuto ${res.pesoTotale}`);
// kcal attese: 60 + 117.6 + 4 + 35 = 216.6 → per 100g ≈ 135
ok(vicino(res.per100.kcal, 135, 2), `kcal/100g ≈ 135 — ottenuto ${res.per100.kcal}`);
ok(vicino(res.per100.p, 5.0), `proteine/100g ≈ 5.0 — ottenuto ${res.per100.p}`);
ok(vicino(res.per100.c, 27.9, 1), `carboidrati/100g ≈ 27.9 — ottenuto ${res.per100.c}`);
ok(vicino(res.per100.g, 0.1, 0.15), `grassi/100g ≈ 0.1 — ottenuto ${res.per100.g}`);

// ── Ricette utente: campo g invece di uomo ───────────────────────────
const resUtente = nutriPer100DaQuantita({ tst_zucch: { g:50, unit:"g" } });
ok(resUtente.pesoTotale === 50 && resUtente.per100.kcal === 392,
   "ricette utente (campo g) gestite correttamente");

// ── Unità pz con PESO_PEZZO ──────────────────────────────────────────
PESO_PEZZO.tst_uovo_pz = 60;
ING_MAP.tst_uovo_pz = { id:"tst_uovo_pz", nome:"Uovo test", cat:"🍳 Uova",
  nutri:{ kcal:130, p:12.5, c:0, z:0, g:8.7, f:0 } };
const resPz = nutriPer100DaQuantita({ tst_uovo_pz: { uomo:2, unit:"pz" } });
ok(resPz.pesoTotale === 120 && resPz.per100.kcal === 130,
   "unità pz convertita via PESO_PEZZO");

// ── Casi limite ──────────────────────────────────────────────────────
ok(nutriPer100DaQuantita(null) === null, "quantita null → null");
ok(nutriPer100DaQuantita({}) === null, "quantita vuota → null");
ok(nutriPer100DaQuantita({ _scaled: true, tst_zucch: { uomo:0, unit:"g" } }) === null,
   "solo _scaled e quantità zero → null");
const senzaNutri = nutriPer100DaQuantita({ tst_ignoto_xyz: { uomo:100, unit:"g" } });
ok(senzaNutri && senzaNutri.pesoTotale === 100 && senzaNutri.per100.kcal === 0,
   "ingrediente senza nutrizione: pesa nel totale, contribuisce 0 kcal");

console.log(fail === 0 ? "RICETTA→INGREDIENTE: TUTTO OK" : `RICETTA→INGREDIENTE: ${fail} FALLIMENTI`);
if (fail > 0) process.exit(1);
