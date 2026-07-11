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

// ── Appendice: calcolaEquivalenza + pesoPezzoInfo (hub Strumenti) ────
const { calcolaEquivalenza } = await import('@/features/strumenti/StrumentiPage');
const { pesoPezzoInfo, PESO_PEZZO_RANGE, PESO_PEZZO_TARATO } = await import('@/core');
let fail2 = 0;
const ok2 = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail2++; };

ING_MAP.tst_banana = { id:"tst_banana", nome:"Banana test", nutri:{ kcal:89, p:1.1, c:22.8, z:12, g:0.3, f:2.6 } };
ING_MAP.tst_pesca  = { id:"tst_pesca",  nome:"Pesca test",  nutri:{ kcal:39, p:0.9, c:9.5,  z:8,  g:0.2, f:1.5 } };
PESO_PEZZO.tst_banana = 120;
PESO_PEZZO.tst_pesca  = 140;

const eq = calcolaEquivalenza(ING_MAP.tst_banana, 180, ING_MAP.tst_pesca, "kcal");
ok2(eq && Math.abs(eq.valore - 160.2) < 0.5, `1,5 banane = 160 kcal — ottenuto ${eq?.valore}`);
ok2(eq && Math.abs(eq.gramsB - 410.8) < 2, `equivalgono a ≈411g di pesche — ottenuto ${Math.round(eq?.gramsB)}`);
ok2(eq && Math.abs(eq.pezzi.n - 2.93) < 0.1 && !eq.pezzi.incerto, `≈2,9 pesche, calibro stabile — ottenuto ${eq?.pezzi?.n?.toFixed(2)}`);

const eqZero = calcolaEquivalenza(ING_MAP.tst_banana, 100, { id:"tst_acqua", nutri:{ kcal:0, p:0, c:0, z:0, g:0, f:0 } }, "p");
ok2(eqZero?.errore === "zero", "criterio assente nel cibo di destinazione → errore 'zero'");
ok2(calcolaEquivalenza(null, 100, ING_MAP.tst_pesca, "kcal") === null, "ingrediente mancante → null");
ok2(calcolaEquivalenza(ING_MAP.tst_banana, 0, ING_MAP.tst_pesca, "kcal") === null, "quantità zero → null");

// ── pesoPezzoInfo: priorità taratura > DB > range, e onestà sul calibro ──
// Caso datteri: range largo [7,25], nessuna taratura → incerto.
ING_MAP.tst_dattero = { id:"tst_dattero", nome:"Dattero test", nutri:{ kcal:282, p:2.5, c:75, z:63, g:0.4, f:8 } };
PESO_PEZZO_RANGE.tst_dattero = [7, 25];
let info = pesoPezzoInfo("tst_dattero");
ok2(info && info.fonte === "range" && info.g === 16 && info.incerto,
    `senza DB né taratura: mediana range (16g) e incerto=true — ottenuto ${info?.g}/${info?.fonte}/${info?.incerto}`);

// con range largo, l'equivalenza espone il range di pezzi (niente decimale fasullo)
const eqDatteri = calcolaEquivalenza(ING_MAP.tst_banana, 180, ING_MAP.tst_dattero, "kcal");
ok2(eqDatteri?.pezzi?.incerto && eqDatteri.pezzi.range &&
    Math.abs(eqDatteri.pezzi.range[0] - eqDatteri.gramsB/25) < 0.01 &&
    Math.abs(eqDatteri.pezzi.range[1] - eqDatteri.gramsB/7)  < 0.01,
    "calibro incerto → range di pezzi min–max esposto");

// la taratura vince su tutto e spegne l'incertezza
PESO_PEZZO_TARATO.tst_dattero = 12;
info = pesoPezzoInfo("tst_dattero");
ok2(info.fonte === "taratura" && info.g === 12 && !info.incerto,
    `taratura famiglia: 12g, incerto=false — ottenuto ${info.g}/${info.fonte}/${info.incerto}`);
const eqTarato = calcolaEquivalenza(ING_MAP.tst_banana, 180, ING_MAP.tst_dattero, "kcal");
ok2(eqTarato?.pezzi && !eqTarato.pezzi.incerto && Math.abs(eqTarato.pezzi.n - eqTarato.gramsB/12) < 0.01,
    "dopo taratura: pezzi precisi al decimale");
delete PESO_PEZZO_TARATO.tst_dattero;

// il DB (mediana) batte il range ma non la taratura
PESO_PEZZO.tst_dattero = 15;
info = pesoPezzoInfo("tst_dattero");
ok2(info.fonte === "db" && info.g === 15 && info.incerto, "mediana DB usata ma incertezza dichiarata (range largo)");
PESO_PEZZO_TARATO.tst_dattero = 12;
ok2(pesoPezzoInfo("tst_dattero").fonte === "taratura", "priorità: taratura > DB > range");
delete PESO_PEZZO_TARATO.tst_dattero; delete PESO_PEZZO.tst_dattero;

// quantitaInGrammi usa il peso effettivo (taratura inclusa)
const { quantitaInGrammi: qig } = await import('@/core');
PESO_PEZZO_TARATO.tst_dattero = 12;
ok2(qig("tst_dattero", 3, "pz") === 36, "quantitaInGrammi pz usa la taratura (3 pz × 12g = 36g)");
delete PESO_PEZZO_TARATO.tst_dattero;

console.log(fail2 === 0 ? "EQUIVALENZE: TUTTO OK" : `EQUIVALENZE: ${fail2} FALLIMENTI`);
if (fail2 > 0) process.exit(1);
