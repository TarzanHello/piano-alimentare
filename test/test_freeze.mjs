// Test kill-switch "piano": la riscalatura per-persona (pianoPersonalizzato →
// scalaPastiGiorno) deve essere DISATTIVA con RICALCOLO_AUTO.piano=false
// (porzioni = taglia fissa della ricetta) e ATTIVA quando riportato a true.
import {
  RICALCOLO_AUTO, MEAL_KEYS,
  planForWeek, weekIndexForDate, pianoPersonalizzato,
} from '@/core';

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };

// Giorno reale dal motore + persona con dati validi (peso/eta/sesso)
const wk = weekIndexForDate(new Date());
const week = planForWeek({ baseSeed: 12345, frozen: {} }, wk, {});
const giorno = week[0];
const persona = { id: "p1", nome: "Test", peso: 85, eta: 35, sesso: "M" };
const slotFisso = "uomo";

console.log("▸ [OFF piano] porzioni = taglia fissa, nessuna personalizzazione");
{
  RICALCOLO_AUTO.piano = false;
  const r = pianoPersonalizzato(giorno, persona, []);
  ok(r.personalizzato === false, "personalizzato=false anche con dati validi");
  ok(r.quantita === null, "nessuna quantità riscalata");
  // il macro per pasto coincide con la taglia fissa della ricetta
  const mk = MEAL_KEYS.find(k => giorno[k] && giorno[k][slotFisso]);
  ok(!!mk, "trovato un pasto con taglia fissa");
  ok(r.perPasto[mk].kcal === giorno[mk][slotFisso].kcal, "kcal pasto = taglia fissa della ricetta");
}

console.log("▸ [ON piano] personalizzazione attiva");
{
  RICALCOLO_AUTO.piano = true;
  const r = pianoPersonalizzato(giorno, persona, []);
  ok(r.personalizzato === true, "personalizzato=true");
  ok(r.quantita && typeof r.quantita === "object", "quantità riscalate presenti");
  ok(r.target && r.target.kcal > 0, "target LARN calcolato");
}

// ripristina default congelato
RICALCOLO_AUTO.piano = false;

console.log("");
console.log(fail === 0 ? "✅ TEST FREEZE PIANO: TUTTO VERDE" : `❌ TEST FREEZE PIANO: ${fail} fallimenti`);
process.exit(fail === 0 ? 0 : 1);
