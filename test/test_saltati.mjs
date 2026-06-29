// Test mirato: stato "saltato", auto-flag e ridistribuzione pesata grammi+kcal.
import {
  MEAL_KEYS, MEAL_FASCIA,
  ricalcolaMacroAdattati, autoFlagSaltati, statsComportamento,
  grammiDaQuantita, grammiRicettaCalc,
} from '@/core';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };
const approx = (a, b, t = 1) => Math.abs(a - b) <= t;

// ── Fixture: 5 pasti pianificati ──────────────────────────────────
const MK = ["colazione","spuntino_m","pranzo","spuntino_p","cena"];
const macroBase = {
  colazione:  { kcal: 400, p: 20, c: 50, g: 12 },
  spuntino_m: { kcal: 150, p: 5,  c: 25, g: 4  },
  pranzo:     { kcal: 700, p: 35, c: 80, g: 22 },
  spuntino_p: { kcal: 150, p: 5,  c: 25, g: 4  },
  cena:       { kcal: 600, p: 40, c: 55, g: 20 },
};
// peso reale (grammi) — volutamente NON proporzionale alle kcal
const pesoBase = { colazione: 350, spuntino_m: 200, pranzo: 500, spuntino_p: 120, cena: 450 };

console.log("▸ Ridistribuzione: salto lo spuntino_m, le sue kcal vanno avanti");
{
  const dayLog = { spuntino_m: { saltato: true } };
  const { adattato } = ricalcolaMacroAdattati(MK, macroBase, dayLog, pesoBase);
  const destinatari = ["colazione","pranzo","spuntino_p","cena"];
  const sommaDest = destinatari.reduce((s,mk)=>s+adattato[mk].kcal,0);
  const baseDest  = destinatari.reduce((s,mk)=>s+macroBase[mk].kcal,0);
  ok(adattato.spuntino_m.kcal === macroBase.spuntino_m.kcal, "il saltato resta a piano (non è destinatario)");
  ok(approx(sommaDest, baseDest + 150, 3), `i destinatari assorbono ~150 kcal (Δ=${Math.round(sommaDest-baseDest)})`);
  ok(destinatari.every(mk => adattato[mk].kcal >= macroBase[mk].kcal), "ogni destinatario cresce o resta uguale");
}

console.log("▸ Pesatura grammi+kcal: il pasto con più grammi prende di più a parità di kcal");
{
  // due destinatari con STESSE kcal ma grammi diversi
  const base2 = { a:{kcal:300,p:10,c:40,g:8}, b:{kcal:300,p:10,c:40,g:8}, c:{kcal:200,p:5,c:30,g:5} };
  const peso2 = { a: 600, b: 200, c: 100 };
  const MK2 = ["a","b","c"];
  const dayLog2 = { c: { saltato: true } }; // libera 200 kcal verso a,b
  const { adattato } = ricalcolaMacroAdattati(MK2, base2, dayLog2, peso2);
  const incA = adattato.a.kcal - base2.a.kcal;
  const incB = adattato.b.kcal - base2.b.kcal;
  ok(incA > incB, `a (600g) riceve più di b (200g): +${incA} vs +${incB}`);
}

console.log("▸ Compat. legacy: senza pesoBase ricade sul solo peso calorico");
{
  const dayLog = { pranzo: { consumed: true, kcal: 900, p: 45, c: 100, g: 30 } }; // +200 vs piano
  const r1 = ricalcolaMacroAdattati(MK, macroBase, dayLog);          // niente peso
  const r2 = ricalcolaMacroAdattati(MK, macroBase, dayLog, null);    // null peso
  ok(r1.adattato.cena.kcal < macroBase.cena.kcal, "surplus reale → i restanti calano");
  ok(r1.adattato.cena.kcal === r2.adattato.cena.kcal, "comportamento identico con/ senza pesoBase nullo");
}

console.log("▸ Auto-flag regola A: pasto successivo consumato");
{
  const dayLog = { pranzo: { consumed: true, kcal: 700 } }; // colazione+spuntino_m prima, in attesa
  const { dayLog: out, changed } = autoFlagSaltati(MK, MEAL_FASCIA, dayLog, { isOggi: false, nowH: 9 });
  ok(changed, "ha modificato il log");
  ok(out.colazione?.saltato && out.colazione._auto, "colazione → saltato auto");
  ok(out.spuntino_m?.saltato && out.spuntino_m._auto, "spuntino_m → saltato auto");
  ok(!out.spuntino_p && !out.cena, "i pasti DOPO il pranzo restano in attesa");
}

console.log("▸ Auto-flag regola B: fascia oraria scaduta (oggi)");
{
  // sono le 14: colazione (fine 11) e spuntino_m (fine 13) scaduti; pranzo (fine 16) no
  const { dayLog: out } = autoFlagSaltati(MK, MEAL_FASCIA, {}, { isOggi: true, nowH: 14 });
  ok(out.colazione?.saltato && out.colazione._auto, "colazione scaduta → saltato auto");
  ok(out.spuntino_m?.saltato && out.spuntino_m._auto, "spuntino_m scaduto → saltato auto");
  ok(!out.pranzo, "pranzo non ancora scaduto → in attesa");
}

console.log("▸ Auto-flag NON tocca le scelte manuali");
{
  const dayLog = { colazione: { saltato: true }, pranzo: { consumed: true } }; // colazione saltata a MANO
  const { dayLog: out } = autoFlagSaltati(MK, MEAL_FASCIA, dayLog, { isOggi: true, nowH: 23 });
  ok(out.colazione.saltato && !out.colazione._auto, "saltato manuale resta manuale");
}

console.log("▸ Auto-flag idempotente / auto-correzione");
{
  // prima salta per regola A, poi rimuovo il consumato → l'auto deve sparire
  let dayLog = { pranzo: { consumed: true } };
  ({ dayLog } = autoFlagSaltati(MK, MEAL_FASCIA, dayLog, { isOggi: false, nowH: 9 }));
  ok(dayLog.colazione?._auto, "prima: colazione auto-saltata");
  delete dayLog.pranzo; // non più consumato
  ({ dayLog } = autoFlagSaltati(MK, MEAL_FASCIA, dayLog, { isOggi: false, nowH: 9 }));
  ok(!dayLog.colazione, "dopo: l'auto-saltato è rientrato in attesa");
}

console.log("▸ statsComportamento legge il registro");
{
  const personaLog = {
    "01/01/2026": { colazione:{consumed:true}, spuntino_m:{saltato:true,_auto:true}, pranzo:{consumed:true} },
    "02/01/2026": { colazione:{consumed:true}, spuntino_m:{saltato:true},            pranzo:{consumed:true} },
  };
  const s = statsComportamento(MK, personaLog, 14);
  ok(s.spuntino_m.saltatiAuto === 1 && s.spuntino_m.saltatiManuali === 1, "conta auto e manuali separati");
  ok(approx(s.spuntino_m.tassoSalto, 1, 0.001), "tasso di salto spuntino_m = 1");
  ok(approx(s.colazione.tassoSalto, 0, 0.001), "tasso di salto colazione = 0");
}

console.log("");
console.log(fail === 0 ? "✅ TEST SALTATI: TUTTO VERDE" : `❌ TEST SALTATI: ${fail} fallimenti`);
process.exit(fail === 0 ? 0 : 1);
