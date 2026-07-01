// Test rigenerazione selettiva: "Genera piano" deve rigenerare solo i pasti
// futuri e quelli di oggi NON consumati, preservando i giorni già trascorsi
// della settimana corrente e i pasti di oggi GIÀ consumati.
import {
  weekIndexForDate, weekdayForDate, planForWeek, regeneraPlanState,
  overrideKey, applyOverridesWeek,
} from '@/core';
import { MEAL_KEYS } from '@/core/constants';

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };
const mealId = (day, mk) => (day && day[mk] && day[mk].id) || null;

// Replica della logica di selezione dell'handler regenerate() in App.jsx.
function regenSelettivo(oldState, cur, twd, consumatiOggi, genArgs) {
  const oldWeek = applyOverridesWeek(planForWeek(oldState, cur, genArgs), {}, cur);
  const newState = regeneraPlanState(oldState, {});
  const np = planForWeek(newState, cur, genArgs);
  const nextOv = {};
  for (let wd = 0; wd <= twd; wd++) {
    for (const mk of MEAL_KEYS) {
      const preserva = wd < twd || (wd === twd && consumatiOggi.has(mk));
      if (!preserva) continue;
      const meal = oldWeek[wd] && oldWeek[wd][mk];
      if (meal) nextOv[overrideKey(cur, wd, mk)] = meal;
    }
  }
  const resWeek = applyOverridesWeek(np, nextOv, cur);
  return { oldWeek, np, resWeek };
}

const genArgs = { excludedIds: [], ricetteUtente: [], ricetteEscluseIds: [] };
const cur = weekIndexForDate(new Date());

console.log("▸ giovedì (twd=3), colazione+pranzo consumati oggi");
{
  const twd = 3;
  const oldState = { baseSeed: 111111, frozen: {} };
  const consumati = new Set(["colazione", "pranzo"]);
  const { oldWeek, np, resWeek } = regenSelettivo(oldState, cur, twd, consumati, genArgs);

  // il nuovo seed deve produrre una settimana diversa (altrimenti il test è vuoto)
  let diversi = 0;
  for (let wd = 0; wd < 7; wd++) for (const mk of MEAL_KEYS) if (mealId(oldWeek[wd], mk) !== mealId(np[wd], mk)) diversi++;
  ok(diversi > 0, "il nuovo baseSeed cambia effettivamente qualche pasto");

  // giorni < oggi: interi preservati
  let pastPreservati = true;
  for (let wd = 0; wd < twd; wd++) for (const mk of MEAL_KEYS) if (mealId(resWeek[wd], mk) !== mealId(oldWeek[wd], mk)) pastPreservati = false;
  ok(pastPreservati, "giorni precedenti a oggi: interi preservati");

  // oggi: consumati preservati, non-consumati rigenerati
  ok(mealId(resWeek[twd], "colazione") === mealId(oldWeek[twd], "colazione"), "oggi colazione (consumata) preservata");
  ok(mealId(resWeek[twd], "pranzo") === mealId(oldWeek[twd], "pranzo"), "oggi pranzo (consumato) preservato");
  ok(mealId(resWeek[twd], "cena") === mealId(np[twd], "cena"), "oggi cena (non consumata) rigenerata");

  // giorni futuri della settimana: rigenerati
  let futuriRigenerati = true;
  for (let wd = twd + 1; wd < 7; wd++) for (const mk of MEAL_KEYS) if (mealId(resWeek[wd], mk) !== mealId(np[wd], mk)) futuriRigenerati = false;
  ok(futuriRigenerati, "giorni futuri della settimana: rigenerati");
}

console.log("▸ lunedì (twd=0), nulla consumato → intera settimana rigenerata");
{
  const twd = 0;
  const oldState = { baseSeed: 222222, frozen: {} };
  const { np, resWeek } = regenSelettivo(oldState, cur, twd, new Set(), genArgs);
  let tuttoNuovo = true;
  for (let wd = 0; wd < 7; wd++) for (const mk of MEAL_KEYS) if (mealId(resWeek[wd], mk) !== mealId(np[wd], mk)) tuttoNuovo = false;
  ok(tuttoNuovo, "nessun override: settimana corrente tutta rigenerata");
}

console.log("▸ settimane passate congelate dal nuovo stato");
{
  const oldState = { baseSeed: 333333, frozen: {} };
  const newState = regeneraPlanState(oldState, {});
  ok(newState.frozen[cur - 1] != null, "settimana scorsa congelata");
  ok(newState.frozen[cur] == null, "settimana corrente NON congelata (riseminata)");
  ok(newState.baseSeed !== oldState.baseSeed, "baseSeed cambiato");
}

console.log(fail === 0 ? "\n✅ TEST REGEN: TUTTO VERDE" : `\n❌ TEST REGEN: ${fail} FALLITI`);
process.exit(fail === 0 ? 0 : 1);
