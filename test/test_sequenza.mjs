// Test fondamenta Stage 1: indice settimana, seed per settimana, congelamento,
// migrazione override, applicazione override per-settimana, spesa su finestra.
import {
  weekIndexForDate, weekdayForDate, dateForOffset, dateKeyForOffset,
  combinaSeedSettimana, seedForWeek, planForWeek, planForDate,
  regeneraPlanState, overrideKey, migraOverridesASettimana, applyOverridesWeek,
  buildShoppingForDayObjects, localDateKey,
} from '@/core';

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };

console.log("▸ weekIndexForDate: lunedì consecutivi differiscono di 1");
{
  const lun = new Date(2026, 5, 29);   // lunedì 29 giugno 2026
  const mar = new Date(2026, 5, 30);
  const dom = new Date(2026, 6, 5);    // domenica stessa settimana
  const lunDopo = new Date(2026, 6, 6);// lunedì successivo
  ok(weekdayForDate(lun) === 0, "lunedì → weekday 0");
  ok(weekdayForDate(dom) === 6, "domenica → weekday 6");
  ok(weekIndexForDate(lun) === weekIndexForDate(mar), "lun e mar stessa settimana");
  ok(weekIndexForDate(lun) === weekIndexForDate(dom), "lun e dom stessa settimana");
  ok(weekIndexForDate(lunDopo) === weekIndexForDate(lun) + 1, "lunedì dopo = +1");
}

console.log("▸ offset date");
{
  const base = new Date(2026, 5, 29);
  ok(dateKeyForOffset(0, base) === "2026-06-29", "offset 0 = oggi");
  ok(dateKeyForOffset(-3, base) === "2026-06-26", "offset -3");
  ok(dateKeyForOffset(3, base) === "2026-07-02", "offset +3 (sfora il mese)");
}

console.log("▸ seedForWeek: derivato stabile e distinto, congelato vince");
{
  const st = { baseSeed: 1782509918110, frozen: { 100: 42 } };
  ok(seedForWeek(st, 200) === seedForWeek(st, 200), "derivato deterministico");
  ok(seedForWeek(st, 200) !== seedForWeek(st, 201), "settimane diverse → seed diversi");
  ok(seedForWeek(st, 100) === 42, "settimana congelata usa il seed pinnato");
  ok(combinaSeedSettimana(1, 0) !== combinaSeedSettimana(1, 1), "combina mescola i bit");
}

console.log("▸ regenera: congela passate, rimescola corrente+future");
{
  const today = new Date(2026, 5, 29);
  const cur = weekIndexForDate(today);
  const st0 = { baseSeed: 111, frozen: {} };
  const seedPassataPrima = seedForWeek(st0, cur - 1);
  const seedCorrentePrima = seedForWeek(st0, cur);
  const st1 = regeneraPlanState(st0, { today, newSeed: 999 });
  ok(st1.frozen[cur - 1] === seedPassataPrima, "settimana passata congelata col suo seed di prima");
  ok(st1.frozen[cur - 2] === seedForWeek(st0, cur - 2), "anche -2 congelata");
  ok(st1.frozen[cur] === undefined, "la corrente NON viene congelata");
  ok(seedForWeek(st1, cur) !== seedCorrentePrima, "corrente rimescolata dal nuovo baseSeed");
  ok(seedForWeek(st1, cur - 1) === seedPassataPrima, "passata invariata dopo rigenera");
  ok(seedForWeek(st1, cur + 1) !== seedForWeek(st0, cur + 1), "futura rimescolata");
  // se la corrente era congelata (es. dalla migrazione), regenera la rilascia
  const stFrozenCur = { baseSeed: 111, frozen: { [cur]: 12345 } };
  const st2 = regeneraPlanState(stFrozenCur, { today, newSeed: 777 });
  ok(st2.frozen[cur] === undefined, "regenera sblocca la settimana corrente congelata");
  ok(seedForWeek(st2, cur) === combinaSeedSettimana(777, cur), "corrente ora deriva dal nuovo baseSeed");
}

console.log("▸ migrazione override → chiave per-settimana");
{
  const vecchi = { "2-pranzo": { id:"x" }, "5-cena": { id:"y" } };
  const nuovi = migraOverridesASettimana(vecchi, 3000);
  ok(nuovi["3000:2-pranzo"]?.id === "x", "vecchia chiave assegnata alla settimana");
  ok(nuovi["3000:5-cena"]?.id === "y", "seconda chiave migrata");
  const giaNuovi = migraOverridesASettimana(nuovi, 9999);
  ok(giaNuovi["3000:2-pranzo"]?.id === "x", "idempotente: non ri-migra chiavi già nuove");
  ok(Object.keys(giaNuovi).length === 2, "nessun raddoppio");
  ok(overrideKey(3000, 2, "pranzo") === "3000:2-pranzo", "overrideKey coerente");
}

console.log("▸ applyOverridesWeek: solo la settimana giusta, solo il pasto giusto");
{
  const week = Array.from({length:7}, (_,wd) => ({
    colazione:{id:`c${wd}`,nome:"col"}, pranzo:{id:`p${wd}`,nome:"pra"}, cena:{id:`e${wd}`,nome:"cen"},
    spuntino_m:{id:`m${wd}`}, spuntino_p:{id:`s${wd}`},
  }));
  const ov = { "50:2-pranzo": { id:"OVR", nome:"override" } };
  const applied = applyOverridesWeek(week, ov, 50);
  ok(applied[2].pranzo.id === "OVR", "override applicato a (sett.50, mar, pranzo)");
  ok(applied[2].colazione.id === "c2", "altri pasti del giorno intatti");
  ok(applied[3].pranzo.id === "p3", "altri giorni intatti");
  const altraSett = applyOverridesWeek(week, ov, 51);
  ok(altraSett[2].pranzo.id === "p2", "in un'altra settimana l'override NON si applica");
}

console.log("▸ planForDate: risolve settimana+giorno; settimane adiacenti distinte");
{
  const st = { baseSeed: 1782509918110, frozen: {} };
  const genArgs = { excludedIds: [], ricetteUtente: [] };
  const oggi = new Date(2026, 5, 29);
  const r = planForDate(st, oggi, genArgs);
  ok(r.weekday === 0 && r.dateKey === "2026-06-29", "risolve weekday e dateKey");
  ok(Array.isArray(r.week) && r.week.length === 7 && r.day === r.week[0], "day = week[weekday]");
  const lunProssimo = planForDate(st, new Date(2026, 6, 6), genArgs);
  ok(lunProssimo.weekIndex === r.weekIndex + 1, "lunedì prossimo = settimana +1");
  // i piatti del lunedì prossimo NON sono garantiti uguali a quelli di oggi (no loop)
  const idsOggi = r.week.map(d=>d.pranzo?.id).join(",");
  const idsPross = lunProssimo.week.map(d=>d.pranzo?.id).join(",");
  ok(idsOggi !== idsPross, "settimana successiva ha un set di pranzi diverso (no loop)");
}

console.log("▸ buildShoppingForDayObjects: finestra che sfora la settimana");
{
  const st = { baseSeed: 1782509918110, frozen: {} };
  const genArgs = { excludedIds: [], ricetteUtente: [] };
  // venerdì → spesa oggi+2 = ven, sab, dom della settimana corrente (nessun troncamento)
  const ven = new Date(2026, 6, 3);
  const giorni = [0,1,2].map(off => planForDate(st, dateForOffset(off, ven), genArgs).day);
  const lista = buildShoppingForDayObjects(giorni);
  ok(lista && typeof lista === "object" && Object.keys(lista).length > 0, "lista spesa non vuota a 3 giorni pieni dal venerdì");
}

console.log("");
console.log(fail === 0 ? "✅ TEST SEQUENZA: TUTTO VERDE" : `❌ TEST SEQUENZA: ${fail} fallimenti`);
process.exit(fail === 0 ? 0 : 1);
