// TEST 4 — Motore della pagina Dieta: ripartizione macro (la "torta").
// Verifica: normalizzazione split, conversione %→grammi a calorie costanti,
// redistribuzione proporzionale, e avviso minimo proteico.

import { normalizzaMacroSplit, ridistribuisciMacro, calcTargetAdattivo } from '@/core';

const results = [];
const ok = (name, cond) => { results.push({ name, pass: !!cond }); };
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

// ─── A. normalizzaMacroSplit ───
{
  ok("split assente → null", normalizzaMacroSplit(null) === null);
  ok("split negativo → null", normalizzaMacroSplit({ p: -1, c: 50, g: 51 }) === null);
  const s = normalizzaMacroSplit({ p: 30, c: 45, g: 25 });
  ok("split valido somma 100", s.p + s.c + s.g === 100);
  // Normalizza valori che non sommano 100
  const s2 = normalizzaMacroSplit({ p: 60, c: 90, g: 50 }); // tot 200 → /2
  ok("split 60/90/50 normalizzato somma 100", s2.p + s2.c + s2.g === 100);
  ok("split 60/90/50 → ~30 proteine", near(s2.p, 30));
}

// ─── B. Conversione %→grammi a calorie costanti ───
{
  const kcal = 2000;
  const split = { p: 30, c: 50, g: 20 };
  const gP = Math.round((kcal * split.p / 100) / 4); // 150
  const gC = Math.round((kcal * split.c / 100) / 4); // 250
  const gG = Math.round((kcal * split.g / 100) / 9); // ~44
  ok("2000kcal 30% prot = 150 g", gP === 150);
  ok("2000kcal 50% carb = 250 g", gC === 250);
  ok("2000kcal 20% grassi ≈ 44 g", near(gG, 44));
  // Le calorie ricostruite dai grammi tornano ≈ kcal di partenza
  const kcalRic = gP * 4 + gC * 4 + gG * 9;
  ok("calorie ricostruite ≈ totale", near(kcalRic, kcal, 10));
}

// ─── C. Redistribuzione proporzionale ───
{
  // Parto da 30/45/25, fisso proteine a 40 → il resto (60) va a carbo/grassi
  // mantenendo il loro rapporto 45:25.
  const { a, b } = ridistribuisciMacro(40, 45, 25); // a=carbo, b=grassi
  ok("redistribuzione somma col fisso = 100", near(40 + a + b, 100, 0.01));
  ok("carbo resta maggiore dei grassi (rapporto preservato)", a > b);
  ok("carbo ≈ 60*45/70", near(a, 60 * 45 / 70, 0.01));
  // Se le altre due erano 0, si dividono a metà
  const r2 = ridistribuisciMacro(50, 0, 0);
  ok("altre due a zero → metà ciascuna", near(r2.a, 25, 0.01) && near(r2.b, 25, 0.01));
}

// ─── D. Avviso minimo proteico via calcTargetAdattivo ───
{
  // Persona adulta 80kg sedentaria, nessuna misura.
  const base = { id: "x", nome: "Test", sesso: "M", eta: 35, peso: 80, altezza: 178,
                 lavoro: "sedentario", allenamenti: 2, obiettivo: "mantenimento" };

  // Senza split: ripartizione di default, nessun warning, macroSplit null
  const def = calcTargetAdattivo(base, []);
  ok("default: nessuno split", def.macroSplit === null);
  ok("default: nessun warning", def.macroWarning === null);
  ok("default: pMinSano calcolato (>0)", def.pMinSano > 0);

  // Con split a bassissime proteine (10%) → proteine sotto il minimo → warning
  const sbil = calcTargetAdattivo({ ...base, macroSplit: { p: 10, c: 70, g: 20 } }, []);
  ok("split 10% prot: warning presente", sbil.macroWarning && sbil.macroWarning.tipo === "proteine_basse");
  ok("split 10% prot: kcal invariate vs default", sbil.kcal === def.kcal);
  ok("split 10% prot: proteine < pMinSano", sbil.p < sbil.pMinSano);

  // Con split proteico generoso (35%) → nessun warning
  const alto = calcTargetAdattivo({ ...base, macroSplit: { p: 35, c: 40, g: 25 } }, []);
  ok("split 35% prot: nessun warning", alto.macroWarning === null);
  ok("split 35% prot: kcal invariate", alto.kcal === def.kcal);
}

let allPass = true;
for (const r of results) { console.log((r.pass ? '✓' : '✗') + ' ' + r.name); if (!r.pass) allPass = false; }
console.log(allPass ? '\nTEST 4: TUTTO OK' : '\nTEST 4: FALLITO');
process.exit(allPass ? 0 : 1);
