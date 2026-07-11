// ── Motore: calcolo macro, scaling, piano, lista spesa ────────────
import { DB, INGREDIENTS, ING_MAP, ING_QTY, PESO_PEZZO } from '@/data';
import { CONFIDENZA, DAYS, LAF_TAB_LARN, LAVORI, LIMITI_SCALING, MB_COEFF_LARN, MEAL_HOUR, MEAL_KEYS, MEAL_META, PERSONAS_KEYS, PREF_WEIGHTS, RICALCOLO_AUTO, STILE_LEGACY_ADULTI, STILE_LEGACY_BAMBINI, SWAP_CONTEXT_HOURS } from './constants';
import { logCalc } from '@/db/synclog';

// ── Ricerca ingredienti per tag/sottostringa ──────────────────────
// "soia" → tutto ciò che contiene "soia" nel nome O nei tag.
// Normalizza accenti e maiuscole. Ordina: prima i match nel nome, poi nei tag.
function _norm(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
export function cercaIngredienti(query, sorgente, escludiIds) {
  const lista = sorgente || INGREDIENTS;
  const q = _norm(query).trim();
  if (!q) return [];
  const escl = escludiIds instanceof Set ? escludiIds : new Set(escludiIds || []);
  const termini = q.split(/\s+/).filter(Boolean);   // "latte soia" → ["latte","soia"]
  const out = [];
  for (const ing of lista) {
    if (escl.has(ing.id)) continue;
    const nome = _norm(ing.nome);
    const tags = (ing.tags || []).map(_norm);
    // ogni termine deve comparire nel nome o in almeno un tag
    const ok = termini.every(t => nome.includes(t) || tags.some(tag => tag.includes(t)));
    if (!ok) continue;
    // punteggio: nome che inizia con la query > nome che la contiene > solo tag
    let score = 2;
    if (nome.includes(q)) score = nome.startsWith(q) ? 0 : 1;
    out.push({ ing, score });
  }
  out.sort((a, b) => a.score - b.score || a.ing.nome.length - b.ing.nome.length);
  return out.map(o => o.ing);
}

export function nutriPerGrammi(ingId, grammi) {
  const n = (ING_MAP[ingId] || {}).nutri;
  if (!n || !grammi) return { p:0, c:0, z:0, g:0, f:0, kcal:0 };
  const k = grammi / 100;
  return {
    p:    +(n.p    * k).toFixed(1),
    c:    +(n.c    * k).toFixed(1),
    z:    +(n.z    * k).toFixed(1),
    g:    +(n.g    * k).toFixed(1),
    f:    +(n.f    * k).toFixed(1),
    kcal: Math.round(n.kcal * k),
  };
}

export function quantitaInGrammi(ingId, valore, unit) {
  if (!valore) return 0;
  switch (unit) {
    case "g":          return valore;
    case "ml":         return valore;                       // densità ≈ 1
    case "cucchiaio":  return valore * 10;                   // 1 cucchiaio ≈ 10 g
    case "cucchiaino": return valore * 5;
    case "pz":         return valore * (PESO_PEZZO[ingId] || 100);
    default:           return valore;
  }
}

// ── Ricetta → ingrediente ─────────────────────────────────────────
// Converte la quantita di una ricetta (batch di riferimento, persona
// "uomo" o campo g per ricette utente) in valori nutrizionali per 100g,
// così una preparazione (es. salsa teriyaki fatta in casa) può essere
// salvata come ingrediente custom e riusata in altre ricette.
// Nota: non modella i cali di cottura (evaporazione): i valori sono
// riferiti al peso a crudo degli ingredienti.
export function nutriPer100DaQuantita(quantita) {
  if (!quantita || typeof quantita !== "object") return null;
  let tot = 0;
  const sum = { kcal:0, p:0, c:0, z:0, g:0, f:0 };
  for (const [ingId, v] of Object.entries(quantita)) {
    if (ingId === "_scaled" || !v) continue;
    const grams = quantitaInGrammi(ingId, v.uomo ?? v.g ?? 0, v.unit || "g");
    if (!grams) continue;
    tot += grams;
    const n = ING_MAP[ingId]?.nutri;
    if (n) for (const k of Object.keys(sum)) sum[k] += (n[k] || 0) * grams / 100;
  }
  if (!tot) return null;
  const per100 = {};
  for (const k of Object.keys(sum))
    per100[k] = k === "kcal" ? Math.round(sum[k] / tot * 100)
                             : Math.round(sum[k] / tot * 100 * 10) / 10;
  return { per100, pesoTotale: Math.round(tot) };
}

// Macro di una ricetta per una persona ("uomo" | "donna" | "bimbo"),
// calcolati sommando gli ingredienti. Restituisce null se mancano le
// quantità per quella ricetta.

export function macroRicettaCalc(ricettaId, persona) {
  const qty = ING_QTY[ricettaId];
  if (!qty) return null;
  const tot = { p:0, c:0, z:0, g:0, f:0, kcal:0 };
  for (const [ingId, q] of Object.entries(qty)) {
    const grammi = quantitaInGrammi(ingId, q[persona], q.unit);
    const n = nutriPerGrammi(ingId, grammi);
    tot.p += n.p; tot.c += n.c; tot.z += n.z;
    tot.g += n.g; tot.f += n.f; tot.kcal += n.kcal;
  }
  return {
    p:    Math.round(tot.p),
    c:    Math.round(tot.c),
    z:    Math.round(tot.z),
    g:    Math.round(tot.g),
    f:    Math.round(tot.f),
    kcal: Math.round(tot.kcal),
  };
}

// ═══════════════════════════════════════════════════════════════════
// MOTORE DI SCALING DELLE PORZIONI
// ═══════════════════════════════════════════════════════════════════
// Dato il fabbisogno (personaTarget da calcTargetAdattivo) e i pasti
// del giorno, ricalcola le quantità di ING_QTY perché i totali del
// giorno aderiscano a kcal, proteine, carboidrati e grassi.
// Ogni ingrediente ha un fattore di scala proprio, ottimizzato per
// discesa iterativa sui 4 macro; condimenti e aromi restano quasi
// fissi grazie a un'elasticità ridotta.
// ═══════════════════════════════════════════════════════════════════

// Elasticità (min/max sul fattore) in base alla categoria.

export function elasticitaIngrediente(ing) {
  if (!ing) return { min: 0.9, max: 1.15 };
  switch (ing.cat) {
    // Proteine magre: tetto alto. L'ottimizzatore deve poter scalare
    // generosamente carne/pesce/uova per centrare target proteici elevati
    // (es. 170+ g/die in deficit). Con 1.8× restava sempre corto del 7-14%
    // perché il petto di pollo si fermava a ~270 g pur volendone molto di più.
    // NB: le categorie sono quelle REALI del DB (🍖/🐟/🍳/…), non "🥩 Proteine"
    // che di fatto non esiste nei dati — prima carni e pesce cadevano nel
    // default restrittivo.
    case "🍖 Carni":        return { min: 0.55, max: 2.8 };
    case "🐟 Pesce":        return { min: 0.55, max: 2.8 };
    case "🍳 Uova":         return { min: 0.55, max: 2.2 };
    case "🥓 Salumi":       return { min: 0.55, max: 1.8 };
    case "🫀 Frattaglie":   return { min: 0.55, max: 2.2 };
    case "🥩 Proteine":     return { min: 0.55, max: 2.8 };  // legacy, per sicurezza
    case "🥛 Latticini":    return { min: 0.55, max: 1.8 };
    case "🌾 Cereali":      return { min: 0.5,  max: 2.5 };
    case "🫘 Legumi":       return { min: 0.5,  max: 2.5 };
    case "🥦 Verdure":      return { min: 0.6,  max: 1.8 };
    case "🍎 Frutta":       return { min: 0.6,  max: 1.6 };
    case "🥜 Frutta secca": return { min: 0.5,  max: 1.5 };
    case "🫒 Oli e grassi": return { min: 0.5,  max: 1.6 };
    case "🧂 Dispensa":     return { min: 0.85, max: 1.2 };
    case "🛒 Altro":        return { min: 0.85, max: 1.2 };
    default:                return { min: 0.7,  max: 1.6 };
  }
}

// Limiti assoluti per singolo ingrediente (g di parte edibile).
// Limiti assoluti per singolo ingrediente (g di parte edibile).
// I massimi coprono porzioni abbondanti per fabbisogni alti (uomo
// molto attivo); i minimi restano contenuti per i bambini. Tetti
// troppo bassi impediscono al motore di centrare target elevati.

export function clampScale(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Sceglie la taglia base (uomo/donna/bimbo) per lo scaling del giorno.
//
// FIX taglia irraggiungibile: il vecchio criterio guardava solo la vicinanza
// delle kcal DI PARTENZA al target. Ma i limiti di elasticità sono relativi
// alla base scelta (gBase × el.min/max): partendo da "bimbo", un adulto con
// target 2000+ kcal poteva finire sistematicamente sotto target (nel log
// reale: −12% kcal, −33% carboidrati, loss 0.149) perché l'intervallo
// raggiungibile non copriva né le kcal né le macro richieste.
//
// Nuovo criterio, in due passi:
//   1. RAGGIUNGIBILITÀ — per ogni taglia calcolo l'inviluppo [min, max] di
//      kcal e macro ottenibile entro i limiti elastici (e i LIMITI_SCALING
//      assoluti). La distanza del target dall'inviluppo, normalizzata e
//      sommata sulle dimensioni, è la penalità "fuori". Nota: l'inviluppo
//      per-ingrediente è ottimistico (le macro di un ingrediente scalano
//      insieme), quindi non scarta mai una taglia in realtà raggiungibile —
//      penalizza solo le violazioni certe, che è ciò che serve.
//   2. VICINANZA — a parità di raggiungibilità (tipicamente fuori = 0),
//      vince la base con kcal di partenza più vicine al target: è il
//      criterio storico, che resta il tie-break.
export function scegliTagliaBase(pastiDelGiorno, target) {
  const analizza = (slot) => {
    const base = { kcal:0, p:0, c:0, g:0 };
    const min  = { kcal:0, p:0, c:0, g:0 };
    const max  = { kcal:0, p:0, c:0, g:0 };
    for (const ricetta of pastiDelGiorno) {
      const qty = ING_QTY[ricetta.id];
      if (!qty) continue;
      const custom = !!qty._scaled;
      for (const [ingId, v] of Object.entries(qty)) {
        if (ingId === '_scaled') continue;
        const gBase = quantitaInGrammi(ingId, custom ? (v[slot] ?? v.uomo) : v[slot], v.unit);
        if (gBase <= 0) continue;
        // Stessi vincoli usati poi da scalaPastiGiorno:
        // custom → fattore condiviso 0.5–2.0, nessun limite assoluto;
        // catalogo → elasticità per categoria + eventuale LIMITI_SCALING.
        const el  = custom ? { min: 0.5, max: 2.0 } : elasticitaIngrediente(ING_MAP[ingId]);
        const lim = custom ? null : (LIMITI_SCALING[ingId] || null);
        let gMin = gBase * el.min, gMax = gBase * el.max;
        if (lim) { gMin = clampScale(gMin, lim.min, lim.max); gMax = clampScale(gMax, lim.min, lim.max); }
        for (const [dim, g] of [["base", gBase], ["min", gMin], ["max", gMax]]) {
          const n = nutriPerGrammi(ingId, g);
          const acc = dim === "base" ? base : dim === "min" ? min : max;
          acc.kcal += n.kcal; acc.p += n.p; acc.c += n.c; acc.g += n.g;
        }
      }
    }
    return { base, min, max };
  };

  // Distanza normalizzata del target dall'inviluppo raggiungibile,
  // sommata su kcal e macro (le dimensioni con target 0 vengono ignorate).
  const fuoriInviluppo = ({ min, max }) => {
    let fuori = 0;
    for (const dim of ["kcal", "p", "c", "g"]) {
      const t = target[dim] || 0;
      if (t <= 0) continue;
      if (t > max[dim])      fuori += (t - max[dim]) / t;
      else if (t < min[dim]) fuori += (min[dim] - t) / t;
    }
    return fuori;
  };

  let migliore = "donna", minFuori = Infinity, minDiff = Infinity;
  for (const persona of ["uomo", "donna", "bimbo"]) {
    const a = analizza(persona);
    const fuori = fuoriInviluppo(a);
    const diff  = Math.abs(a.base.kcal - target.kcal);
    if (fuori < minFuori - 1e-9 || (Math.abs(fuori - minFuori) <= 1e-9 && diff < minDiff)) {
      minFuori = fuori; minDiff = diff; migliore = persona;
    }
  }
  return migliore;
}

// scalaPastiGiorno(pastiDelGiorno, target, personaBase?)
//   pastiDelGiorno : array di ricette (oggetti del DB) del giorno
//   target         : { kcal, p, c, g }
//   personaBase    : opzionale; se assente, scelta automatica
// Ritorna { perRicetta, totali, totaliBase, tagliaBase }.

export function scalaPastiGiorno(pastiDelGiorno, target, personaBase) {
  if (!personaBase) personaBase = scegliTagliaBase(pastiDelGiorno, target);

  // Ricette custom (_scaled): mantengono le proporzioni interne scelte dall'utente
  // ma scalano proporzionalmente al target kcal come le altre ricette.
  // Le rappresentiamo come un singolo "super-ingrediente" con fattore globale.
  // customBlocks: { ricettaId: [ {ingId, unit, gBase, pPg, cPg, gPg, kPg} ] }
  const customBlocks = {};

  const items = [];
  for (const ricetta of pastiDelGiorno) {
    if (!ricetta) continue;
    const qty = ING_QTY[ricetta.id];
    if (!qty) continue;

    if (qty._scaled) {
      // Ricetta custom: costruiamo gli ingredienti con gBase dalle quantità salvate,
      // ma condividono tutti lo stesso fattore (scalano insieme).
      const block = [];
      for (const [ingId, v] of Object.entries(qty)) {
        if (ingId === '_scaled') continue;
        const gBase = quantitaInGrammi(ingId, v[personaBase] ?? v.uomo, v.unit);
        if (gBase <= 0) continue;
        const ing = ING_MAP[ingId];
        const n = (ing && ing.nutri) || { p:0, c:0, g:0, kcal:0 };
        block.push({ ingId, unit: v.unit, gBase, pPg:n.p/100, cPg:n.c/100, gPg:n.g/100, kPg:n.kcal/100 });
      }
      if (block.length > 0) {
        customBlocks[ricetta.id] = block;
        // Aggiungi agli items come gruppo con fattore condiviso (oggetto per riferimento)
        const shared = { fattore: 1 };
        // Limiti di scala per le ricette custom: più permissivi (0.5x - 2x)
        for (const b of block) {
          items.push({
            ricettaId: ricetta.id, ingId: b.ingId, unit: b.unit,
            gBase: b.gBase, sharedFattore: shared,
            el: { min: 0.5, max: 2.0 }, lim: null,
            pPg: b.pPg, cPg: b.cPg, gPg: b.gPg, kPg: b.kPg,
            isCustom: true,
          });
        }
      }
    } else {
      for (const [ingId, v] of Object.entries(qty)) {
        if (ingId === '_scaled') continue;
        const gBase = quantitaInGrammi(ingId, v[personaBase], v.unit);
        if (gBase <= 0) continue;
        const ing = ING_MAP[ingId];
        const n = (ing && ing.nutri) || { p:0, c:0, g:0, kcal:0 };
        items.push({
          ricettaId: ricetta.id, ingId, unit: v.unit,
          gBase, fattore: 1,
          el: elasticitaIngrediente(ing),
          lim: LIMITI_SCALING[ingId] || null,
          pPg: n.p/100, cPg: n.c/100, gPg: n.g/100, kPg: n.kcal/100,
        });
      }
    }
  }
  if (!items.length) {
    return { perRicetta:{}, totali:{kcal:0,p:0,c:0,g:0}, totaliBase:{kcal:0,p:0,c:0,g:0}, tagliaBase:personaBase };
  }

  const grammiDi = (it) => {
    // Le ricette custom usano un fattore condiviso tra tutti i loro ingredienti
    const f = it.sharedFattore ? it.sharedFattore.fattore : it.fattore;
    let g = it.gBase * f;
    g = clampScale(g, it.gBase * it.el.min, it.gBase * it.el.max);
    if (it.lim) g = clampScale(g, it.lim.min, it.lim.max);
    return g;
  };
  const totali = () => {
    const t = { kcal:0, p:0, c:0, g:0 };
    for (const it of items) {
      const g = grammiDi(it);
      t.p += it.pPg*g; t.c += it.cPg*g; t.g += it.gPg*g; t.kcal += it.kPg*g;
    }
    return t;
  };

  const totBase = totali();

  // Ottimizzazione a gradiente sull'errore quadratico dei macro.
  // Concettualmente: ogni ricetta è una SOMMATORIA di ingredienti, e
  // ogni ingrediente può variare indipendentemente. Definiamo
  //   L = wp·(p_tot/p_target - 1)² + wc·(c_tot/c_target - 1)² + wg·(g_tot/g_target - 1)²
  // e muoviamo ogni fattore lungo -∂L/∂f. La derivata è proporzionale
  // al contributo dell'ingrediente al macro in errore: un cibo molto
  // proteico riceve una spinta forte quando le proteine sono in eccesso
  // o in difetto, mentre i grassi lo influenzano solo in proporzione
  // al suo contenuto di grassi reale.
  // Questo permette al motore di RIBILANCIARE INTERNAMENTE una ricetta:
  // a parità di kcal, alza il riso e abbassa il salmone se servono più
  // carbo e meno grassi (la ricetta è la somma dei suoi ingredienti).
  const W = { p:1.2, c:1.0, g:1.0 };       // pesi macro
  const PASSO = 0.35, MAX_ITER = 60;
  let prevLoss = Infinity;
  let iterEseguite = 0, lossFinale = null;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    iterEseguite = iter + 1;
    const t = totali();
    // errori relativi (target/attuale - 1), invertiti perché derivare in fattore
    // crescente significa aumentare il macro
    const eP = t.p > 0 ? (target.p - t.p) / target.p : 0;
    const eC = t.c > 0 ? (target.c - t.c) / target.c : 0;
    const eG = t.g > 0 ? (target.g - t.g) / target.g : 0;
    // loss per controllo convergenza
    const loss = W.p*eP*eP + W.c*eC*eC + W.g*eG*eG;
    // spinta per ingrediente: somma dei contributi normalizzati × errore × peso
    let maxDelta = 0;
    // Per le ricette custom: accumula gradiente su tutti gli ingredienti del blocco,
    // poi aggiorna il fattore condiviso una sola volta (le proporzioni restano fisse).
    const customGrad = {}; // ricettaId → { spintaTot, pesoTot, fattoreRef }
    for (const it of items) {
      const g = grammiDi(it);
      const dP = (it.pPg * g) / Math.max(target.p, 1);
      const dC = (it.cPg * g) / Math.max(target.c, 1);
      const dG = (it.gPg * g) / Math.max(target.g, 1);
      const spinta = W.p*eP*dP + W.c*eC*dC + W.g*eG*dG;
      const peso = W.p*dP + W.c*dC + W.g*dG;
      if (peso < 1e-9) continue;

      if (it.sharedFattore) {
        // Accumula per aggiornamento condiviso
        if (!customGrad[it.ricettaId]) customGrad[it.ricettaId] = { spintaTot:0, pesoTot:0, ref: it.sharedFattore };
        customGrad[it.ricettaId].spintaTot += spinta;
        customGrad[it.ricettaId].pesoTot   += peso;
      } else {
        const delta = (spinta / peso) * PASSO;
        const nuovoF = it.fattore * (1 + delta);
        maxDelta = Math.max(maxDelta, Math.abs(nuovoF - it.fattore));
        it.fattore = nuovoF;
      }
    }
    // Applica aggiornamento fattore condiviso per ogni blocco custom
    for (const { spintaTot, pesoTot, ref } of Object.values(customGrad)) {
      if (pesoTot < 1e-9) continue;
      const delta = (spintaTot / pesoTot) * PASSO;
      const nuovoF = ref.fattore * (1 + delta);
      maxDelta = Math.max(maxDelta, Math.abs(nuovoF - ref.fattore));
      ref.fattore = nuovoF;
    }
    // convergenza: loss che smette di scendere o passi piccolissimi
    lossFinale = loss;
    if (maxDelta < 0.002) break;
    if (iter > 8 && loss > prevLoss * 0.999) break;
    prevLoss = loss;
  }

  const perRicetta = {};
  for (const it of items) {
    const g = grammiDi(it);
    if (!perRicetta[it.ricettaId]) perRicetta[it.ricettaId] = {};
    let val;
    if (it.unit === "g" || it.unit === "ml") {
      val = Math.max(5, Math.round(g / 5) * 5);
    } else {
      const perUnit = quantitaInGrammi(it.ingId, 1, it.unit) || 1;
      val = Math.round((g / perUnit) * 2) / 2;
    }
    perRicetta[it.ricettaId][it.ingId] = { valore: val, unit: it.unit };
  }

  const totFin = totali();
  const round = (o) => ({ kcal:Math.round(o.kcal), p:Math.round(o.p), c:Math.round(o.c), g:Math.round(o.g) });

  // ── LOG diagnostico scaling/sostituzione (dedup per insieme di ricette) ──
  // Mostra target, totali finali e scostamento %, più gli ingredienti finiti
  // CONTRO un limite (clamp): spesso è lì la causa di una sostituzione che
  // "non torna" (un ingrediente non può scalare oltre un certo punto, quindi
  // i macro restano fuori target).
  try {
    const ricetteIds = pastiDelGiorno.filter(Boolean).map(r => r.id);
    const scost = (att, tgt) => tgt > 0 ? Math.round(((att - tgt) / tgt) * 100) : 0;
    const clampati = [];
    for (const it of items) {
      const f = it.sharedFattore ? it.sharedFattore.fattore : it.fattore;
      const gIdeale = it.gBase * f;
      const gReale = grammiDi(it);
      if (Math.abs(gReale - gIdeale) > 0.5) {
        clampati.push({ ricetta: it.ricettaId, ing: it.ingId,
          gIdeale: Math.round(gIdeale), gReale: Math.round(gReale),
          motivo: it.lim && (gReale <= it.lim.min + 0.5 || gReale >= it.lim.max - 0.5) ? "limite ingrediente" : "elasticità" });
      }
    }
    logCalc("scale", ricetteIds.join(","),
      `Scaling giorno (${ricetteIds.length} ricette) · ${round(totFin).kcal} kcal`, {
      target: { kcal: target.kcal, p: target.p, c: target.c, g: target.g },
      tagliaBase: personaBase,
      iterazioni: iterEseguite,
      lossFinale: lossFinale != null ? Math.round(lossFinale * 10000) / 10000 : null,
      totaliBase: round(totBase),
      totaliFinali: round(totFin),
      scostamentoPct: { p: scost(totFin.p, target.p), c: scost(totFin.c, target.c), g: scost(totFin.g, target.g) },
      ingredientiAlLimite: clampati.length ? clampati : "nessuno",
    });
  } catch {}

  return { perRicetta, totali: round(totFin), totaliBase: round(totBase), tagliaBase: personaBase };
}

// Macro di UNA ricetta data una mappa di quantità {ingId:{valore,unit}}.

export function macroDaQuantita(quantitaMap) {
  const tot = { kcal:0, p:0, c:0, g:0 };
  for (const [ingId, q] of Object.entries(quantitaMap || {})) {
    const grammi = quantitaInGrammi(ingId, q.valore, q.unit);
    const n = nutriPerGrammi(ingId, grammi);
    tot.kcal += n.kcal; tot.p += n.p; tot.c += n.c; tot.g += n.g;
  }
  return { kcal:Math.round(tot.kcal), p:Math.round(tot.p), c:Math.round(tot.c), g:Math.round(tot.g) };
}

// Peso REALE di una porzione (somma dei grammi degli ingredienti) a partire
// da una mappa quantità in formato unificato {ingId:{valore,unit}} — lo stesso
// che produce pianoPersonalizzato in `quantita`. Serve a pesare i pasti nella
// ridistribuzione calorica (vedi ricalcolaMacroAdattati).
export function grammiDaQuantita(quantitaMap) {
  let tot = 0;
  for (const [ingId, q] of Object.entries(quantitaMap || {})) {
    if (ingId === "_scaled") continue;
    tot += quantitaInGrammi(ingId, q.valore, q.unit);
  }
  return Math.round(tot);
}

// Peso REALE di una ricetta del catalogo per uno slot (uomo|donna|bimbo),
// letto da ING_QTY (formato {ingId:{uomo,donna,bimbo,unit}}). Usato quando il
// piano NON è personalizzato e quindi non c'è una mappa quantità scalata.
export function grammiRicettaCalc(ricettaId, slot) {
  const qty = ING_QTY[ricettaId];
  if (!qty) return 0;
  let tot = 0;
  for (const [ingId, q] of Object.entries(qty)) {
    if (ingId === "_scaled") continue;
    tot += quantitaInGrammi(ingId, q[slot] ?? q.uomo ?? 0, q.unit);
  }
  return Math.round(tot);
}

// Trasforma una mappa di quantità {ingId:{valore,unit}} in testo leggibile,
// es. "255g yogurt greco · 110g avena · 130g frutti di bosco".
// Usata per mostrare le porzioni personalizzate nella scheda pasto.

export function formattaPorzione(quantitaMap) {
  const pezzi = [];
  for (const [ingId, q] of Object.entries(quantitaMap || {})) {
    if (ingId === "_scaled") continue;   // flag interno: mai mostrarlo all'utente
    const ing = ING_MAP[ingId];
    // Fallback: se l'id non è risolvibile in ING_MAP (es. ingrediente custom
    // non ancora sincronizzato) NON mostrare l'id grezzo all'utente.
    const nome = ing
      ? ing.nome.toLowerCase()
      : (/^(custom_|cust_|ing_)/.test(ingId) ? "ingrediente personalizzato" : ingId);
    let qta;
    if (q.unit === "g" || q.unit === "ml") {
      qta = Math.round(q.valore) + q.unit;
    } else if (q.unit === "cucchiaio" || q.unit === "cucchiaino") {
      const n = q.valore;
      qta = (n === 0.5 ? "½" : n) + " " + q.unit + (n > 1 ? "i" : "");
    } else if (q.unit === "pz") {
      qta = (q.valore === 0.5 ? "½" : q.valore) + " pz";
    } else {
      qta = q.valore + " " + q.unit;
    }
    pezzi.push(qta + " " + nome);
  }
  return pezzi.join(" · ");
}

// Converte una ricetta utente/famiglia (dal cloud, formato "ricette_utente":
// {kcal,p,c,g} fissi + ingredienti:[{ing,g}]) in un oggetto "pasto" compatibile
// con quelli del catalogo, così può essere usata per uno scambio (swap) dal
// Ricettario. Stessa forma del customRecipe creato da RecipeEditorModal:
// macro fissi uguali per ogni profilo, ING_QTY registrato per il ricalcolo
// porzioni, baseId per ricollegarla al pasto che sta sostituendo.
export function cloudRecipeToMeal(ricetta, baseMealId) {
  const macro = { kcal: Math.round(ricetta.kcal||0), p: Math.round(ricetta.p||0), c: Math.round(ricetta.c||0), g: Math.round(ricetta.g||0) };
  const ings = {};
  for (const it of (ricetta.ingredienti || [])) {
    if (!it?.ing) continue;
    ings[it.ing] = { valore: Number(it.g)||0, unit: "g" };
  }
  const porzioneStr = formattaPorzione(ings);
  const meal = {
    id: "cloud_" + ricetta.id,
    nome: ricetta.titolo || ricetta.nome || "Ricetta",
    prep: ricetta.prep ?? null,
    baseId: baseMealId || null,
    isCustom: true,
    uomo: macro, donna: macro, bimbo: macro,
    porzioni: { uomo: porzioneStr, donna: porzioneStr, bimbo: porzioneStr },
    _ingredienti: ings,
    ingredients: Object.keys(ings),
    tags: [],
    stagioni: null,
    _scope: ricetta.scope,
    _isMine: ricetta.isMine,
  };
  const qtyEntry = { _scaled: true };
  for (const [ingId, q] of Object.entries(ings)) qtyEntry[ingId] = { uomo: q.valore, donna: q.valore, bimbo: q.valore, unit: q.unit };
  ING_QTY[meal.id] = qtyEntry;
  return meal;
}

export function confrontoMacro(sogliaPct = 20, prefisso = "") {
  const righe = [];
  Object.values(DB).flat().forEach(r => {
    if (prefisso && !r.id.startsWith(prefisso)) return;
    const h = r.uomo, c = r.uomoCalc;
    if (!c) { righe.push({ id:r.id, nome:r.nome, stato:"NO ING_QTY" }); return; }
    const diff = h.kcal ? Math.round((c.kcal - h.kcal) / h.kcal * 100) : 0;
    if (Math.abs(diff) >= sogliaPct) {
      righe.push({
        id:r.id, nome:r.nome,
        kcalManuale:h.kcal, kcalCalcolato:c.kcal,
        scostamento:(diff>0?"+":"")+diff+"%",
      });
    }
  });
  console.table(righe);
  console.log(`${righe.length} ricette con scostamento ≥ ${sogliaPct}% (o senza ING_QTY).`);
  return righe;
}

export function hoursUntilMeal(dayIdx, mealKey) {
  const now = new Date();
  const today = todayDayIndex();          // 0=Lun..6=Dom
  let dayDelta = dayIdx - today;          // giorni di distanza nel piano
  // il piano è una settimana fissa Lun→Dom: niente wrap, range -6..+6
  const mealHour = MEAL_HOUR[mealKey] != null ? MEAL_HOUR[mealKey] : 13;
  const nowHours = now.getHours() + now.getMinutes() / 60;
  return dayDelta * 24 + (mealHour - nowHours);
}

// Classifica uno swap: "contesto" se il pasto è imminente, "gusto" altrimenti.
// Gli swap già passati (hoursAhead negativo) li trattiamo come gusto:
// rivedere a posteriori un pasto è una valutazione, non fretta.

export function classifySwap(dayIdx, mealKey) {
  const h = hoursUntilMeal(dayIdx, mealKey);
  if (h >= 0 && h < SWAP_CONTEXT_HOURS) return "contesto";
  return "gusto";
}

// Calcola lo score sintetico a partire dai segnali grezzi.

export function computePrefScore(entry) {
  if (!entry) return 0;
  const like = entry.liked ? PREF_WEIGHTS.like : 0;
  // Dislike esplicito: peso forte e negativo (più della somma di un like),
  // così una ricetta segnata 👎 finisce sotto qualunque ricetta neutra.
  const dis  = entry.disliked ? PREF_WEIGHTS.dislike : 0;
  const out  = (entry.swapsOut || 0) * PREF_WEIGHTS.swapOut;
  const sIn  = (entry.swapsIn  || 0) * PREF_WEIGHTS.swapIn;
  return like + dis + out + sIn;
}

// Normalizza la struttura prefs completa (mai undefined).
// Retrocompatibile col vecchio formato piatto { id: {...} }.

export function normalizePrefs(raw) {
  if (!raw || typeof raw !== "object") return { recipes:{}, contextSwaps:[] };
  // Vecchio formato: oggetto con chiavi ricetta direttamente in radice
  if (!raw.recipes && !raw.contextSwaps) {
    const looksLikeRecipes = Object.keys(raw).some(k => /^(col|spu|pra|cen)_/.test(k));
    if (looksLikeRecipes) return { recipes: raw, contextSwaps: [] };
    return { recipes:{}, contextSwaps:[] };
  }
  return {
    recipes: (raw.recipes && typeof raw.recipes==="object") ? raw.recipes : {},
    contextSwaps: Array.isArray(raw.contextSwaps) ? raw.contextSwaps : [],
  };
}

// Restituisce la entry di una ricetta normalizzata (mai undefined).

export function getPrefEntry(prefs, recipeId) {
  const recipes = (prefs && prefs.recipes) || {};
  const e = recipes[recipeId];
  return e ? { score:0, liked:false, disliked:false, swapsOut:0, swapsIn:0, ...e }
           : { score:0, liked:false, disliked:false, swapsOut:0, swapsIn:0 };
}

// ─── Trova alternativa per tempo ────────────────────────────────────
// Restituisce le ricette della stessa categoria ordinate per:
// 1. appartengono alla fascia di tempo ESCLUSIVA [minPrep, maxPrep]
//    (così le proposte non si ripetono tra una fascia e l'altra)
// 2. simili per kcal al pasto corrente (slot personaSlot)
// 3. non già usate nella settimana (weekMealIds)

// Mappa mealKey ("colazione"|"pranzo"|"cena"|"spuntino_m"|"spuntino_p") →
// categoria del DB ("colazione"|"pranzo"|"cena"|"spuntino"). Usata sia per
// trovare alternative sia per aprire il Ricettario sulla categoria giusta.
export function categoriaDaMealKey(mealKey) {
  return mealKey === "spuntino_m" || mealKey === "spuntino_p" ? "spuntino"
       : mealKey === "colazione" ? "colazione"
       : mealKey === "pranzo"    ? "pranzo"
       : "cena";
}

// Categorie da cui un pasto può pescare quando l'utente SCEGLIE una
// ricetta (swap / Ricettario): pranzo e cena sono intercambiabili — un
// piatto da cena può finire a pranzo e viceversa. La GENERAZIONE del
// piano resta invece per categoria (bilanciamento invariato).
export function categorieCompatibili(mealKey) {
  const cat = categoriaDaMealKey(mealKey);
  return (cat === "pranzo" || cat === "cena") ? ["pranzo", "cena"] : [cat];
}

export function findAlternatives(mealKey, currentMeal, minPrep, maxPrep, excludedIds, weekMealIds, personaSlot, ricetteUtente = []) {
  const cats = categorieCompatibili(mealKey);
  const cat = cats.join("+");
  const currentKcal = currentMeal[personaSlot]?.kcal || 500;
  const m = meseCorrente();

  // Pool unificato: ricette utente delle categorie compatibili + catalogo
  // (pranzo+cena insieme quando il pasto è uno dei due)
  const utenteConvertite = (ricetteUtente || [])
    .filter(r => cats.includes(r.categoria) && !r.esclusa)
    .map(r => { try { return ricettaUtenteToMealObj(r); } catch { return null; } })
    .filter(Boolean);

  const tuttiCandidati = [...utenteConvertite, ...cats.flatMap(c => DB[c] || [])];

  let scartFascia = 0, scartEscl = 0, scartStag = 0, scartStessa = 0, ammessi = 0;
  for (const r of tuttiCandidati) {
    if (r.id === currentMeal.id) { scartStessa++; continue; }
    if (!((r.prep || 0) >= minPrep && (r.prep || 0) <= maxPrep)) { scartFascia++; continue; }
    if (r.ingredients.some(id => excludedIds.includes(id))) { scartEscl++; continue; }
    if (pesoStagionale(r, m) <= 0 && r.fonte !== "utente" && r.fonte !== "famiglia") { scartStag++; continue; }
    ammessi++;
  }

  const risultato = tuttiCandidati
    .filter(r =>
      r.id !== currentMeal.id &&
      (r.prep || 0) >= minPrep && (r.prep || 0) <= maxPrep &&
      !r.ingredients.some(id => excludedIds.includes(id)) &&
      (r.fonte === "utente" || r.fonte === "famiglia" || pesoStagionale(r, m) > 0)
    )
    .map(r => ({
      ...r,
      _kcalDiff: Math.abs((r[personaSlot]?.kcal || 0) - currentKcal),
      _inWeek:   weekMealIds.has(r.id),
      // Le ricette utente vengono mostrate prima
      _priority: (r.fonte === "utente" || r.fonte === "famiglia") ? 0 : 1,
    }))
    .sort((a, b) => {
      if (a._priority !== b._priority) return a._priority - b._priority;
      if (a._inWeek !== b._inWeek) return a._inWeek ? 1 : -1;
      return a._kcalDiff - b._kcalDiff;
    })
    .slice(0, 6);

  try {
    logCalc("swap", `${mealKey}|${currentMeal.id}|${minPrep}-${maxPrep}`,
      `Alternative · ${mealKey} (${cat}) · ${risultato.length} proposte`, {
      pastoCorrente: currentMeal.id, categoria: cat,
      fasciaTempo: { min: minPrep, max: maxPrep }, kcalCorrente: currentKcal, slot: personaSlot,
      totaliCategoria: tuttiCandidati.length,
      scartati: { stessaRicetta: scartStessa, fasciaTempo: scartFascia, esclusione: scartEscl, stagione: scartStag },
      ammessi,
      proposte: risultato.map(r => ({ id: r.id, fonte: r.fonte || "catalogo", kcalDiff: r._kcalDiff, giaInSettimana: r._inWeek })),
    });
  } catch {}

  return risultato;
}

// ─── Giorno corrente automatico (0=Lun … 6=Dom) ───────────────────

export function todayDayIndex() {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

// Chiave data in ora LOCALE (YYYY-MM-DD). NON usare toISOString(): converte in
// UTC e, in un fuso diverso da UTC, può restituire il giorno precedente
// (in Italia tra mezzanotte e le 02:00), facendo "scivolare" i log del giorno
// sbagliato sulla schermata Oggi.
export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dateKeyForDayIdx(dayIdx) {
  const today = new Date();
  const d = new Date(today);
  d.setDate(today.getDate() + (dayIdx - todayDayIndex()));
  return localDateKey(d);
}

// ═══════════════════════════════════════════════════════════════════
// SEQUENZA SETTIMANALE — piano a finestra mobile centrata su oggi
// ═══════════════════════════════════════════════════════════════════
// Il piano non è più una settimana fissa Lun→Dom: è una SEQUENZA di
// settimane (… −1, corrente, +1 …) ciascuna derivata in modo
// deterministico dal baseSeed condiviso. La finestra mostrata è
// [oggi−3 … oggi … oggi+3]; ogni giorno risolve da sé la sua settimana.
//   weekday: 0=Lunedì … 6=Domenica (coerente con DAYS e con l'array piano)

const _MS_DAY = 86400000;

// Indice di settimana ASSOLUTO (numero di lunedì dall'epoca). Due lunedì
// consecutivi differiscono esattamente di 1. Calcolato in UTC sulla data
// locale per non sballare con l'ora legale.
export function weekIndexForDate(d = new Date()) {
  const dow = (d.getDay() + 6) % 7;                 // 0=Lun … 6=Dom
  const mon = new Date(d); mon.setHours(0,0,0,0); mon.setDate(d.getDate() - dow);
  const utcMon = Date.UTC(mon.getFullYear(), mon.getMonth(), mon.getDate());
  return Math.round(utcMon / (7 * _MS_DAY));
}

export function weekdayForDate(d = new Date()) { return (d.getDay() + 6) % 7; }

// Data (oggetto Date, mezzanotte locale) a `off` giorni da una base.
export function dateForOffset(off, base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + off);
  return d;
}
export function dateKeyForOffset(off, base = new Date()) { return localDateKey(dateForOffset(off, base)); }

// Combinazione deterministica baseSeed + indice settimana → seed di quella
// settimana. Mescola i bit così settimane adiacenti producono piani diversi.
export function combinaSeedSettimana(baseSeed, weekIndex) {
  let h = ((Number(baseSeed) || 0) ^ Math.imul(weekIndex, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Stato piano sincronizzato: { baseSeed, frozen: { [weekIndex]: seed } }.
// Le settimane passate "congelate" hanno un seed esplicito che NON cambia
// quando si rigenera; le altre derivano dal baseSeed corrente.
export function seedForWeek(planState, weekIndex) {
  const fr = planState && planState.frozen ? planState.frozen[weekIndex] : undefined;
  if (fr != null) return Number(fr);
  return combinaSeedSettimana(planState ? planState.baseSeed : 0, weekIndex);
}

// Genera il piano (7 giorni Lun→Dom) di una specifica settimana.
export function planForWeek(planState, weekIndex, genArgs = {}) {
  const seed = seedForWeek(planState, weekIndex);
  return generateWeekPlan(seed, genArgs.excludedIds || [], genArgs.mese, genArgs.ricetteUtente || [], genArgs.ricetteEscluseIds);
}

// Risolve un singolo giorno-data: { weekIndex, weekday, dateKey, week, day }.
export function planForDate(planState, date, genArgs = {}) {
  const wk = weekIndexForDate(date);
  const wd = weekdayForDate(date);
  const week = planForWeek(planState, wk, genArgs);
  return { weekIndex: wk, weekday: wd, dateKey: localDateKey(date), week, day: week[wd] };
}

// "Rigenera": congela le settimane passate (entro la finestra di ritenzione)
// col loro seed ATTUALE, poi assegna un nuovo baseSeed che rimescola la
// settimana corrente e quelle future. Le passate restano identiche.
export function regeneraPlanState(planState, opts = {}) {
  const today = opts.today || new Date();
  const cur = weekIndexForDate(today);
  const retain = opts.retain == null ? 12 : opts.retain;
  const oldFrozen = (planState && planState.frozen) || {};
  const frozen = {};
  // Tieni solo le settimane PASSATE già congelate (le future/corrente si
  // ri-derivano dal nuovo baseSeed → vengono rimescolate).
  for (const [wk, s] of Object.entries(oldFrozen)) {
    if (Number(wk) < cur) frozen[wk] = s;
  }
  // Congela le passate non ancora pinnate (entro la finestra di ritenzione)
  // col loro seed ATTUALE, così restano identiche dopo la rigenerazione.
  for (let wk = cur - 1; wk >= cur - retain; wk--) {
    if (frozen[wk] == null) frozen[wk] = seedForWeek(planState, wk);
  }
  return { baseSeed: opts.newSeed != null ? opts.newSeed : Date.now(), frozen };
}

// ── Override per-settimana ─────────────────────────────────────────
// Nuova chiave: "weekIndex:weekday-mealKey". Migrazione una-tantum dal
// vecchio formato "weekday-mealKey" (assegnato alla settimana indicata).
export function overrideKey(weekIndex, weekday, mealKey) { return `${weekIndex}:${weekday}-${mealKey}`; }

export function migraOverridesASettimana(overrides, weekIndex) {
  const out = {};
  for (const [k, v] of Object.entries(overrides || {})) {
    if (/^-?\d+:/.test(k)) { out[k] = v; continue; }   // già nel nuovo formato
    out[`${weekIndex}:${k}`] = v;                        // "weekday-mealKey" → "wk:weekday-mealKey"
  }
  return out;
}

// Applica gli override (per-settimana) a un piano-settimana di weekIndex dato.
export function applyOverridesWeek(week, overrides, weekIndex) {
  if (!overrides || Object.keys(overrides).length === 0) return week;
  return week.map((day, wd) => {
    let copy = null;
    MEAL_KEYS.forEach(mk => {
      const ov = overrides[`${weekIndex}:${wd}-${mk}`];
      if (ov) { if (!copy) copy = { ...day }; copy[mk] = ov; }
    });
    return copy || day;
  });
}

// ─── SVG Line Chart ────────────────────────────────────────────────

export function calcPesoObiettivo(persona, lastMisura, pesoTargetManuale) {
  const { sesso="M", eta=30, altezza=170, obiettivo="mantenimento" } = persona;
  const pesoAttualeRaw = lastMisura ? parseFloat(lastMisura.peso) : parseFloat(persona.peso);
  const pesoAttuale = isNaN(pesoAttualeRaw) ? (parseFloat(persona.peso)||70) : pesoAttualeRaw;
  if (eta < 18) return { peso: pesoAttuale, metodo: "n/a", descrizione: "Non applicabile sotto i 18 anni" };
  if (obiettivo === "mantenimento") return { peso: pesoAttuale, metodo: "attuale", descrizione: "Obiettivo: mantenere il peso attuale" };
  // Override manuale: se presente e fisiologicamente plausibile, usalo direttamente
  const manuale = pesoTargetManuale ?? persona.pesoTarget ?? null;
  const altM = altezza / 100;
  const bmiMinKg = Math.round(18.5 * altM * altM * 2) / 2;
  const bmiMaxKg = Math.round(30   * altM * altM * 2) / 2;
  if (manuale !== null && manuale !== undefined) {
    const m = parseFloat(manuale);
    if (!isNaN(m) && m >= 30 && m <= 200) {
      return { peso: Math.round(m * 2) / 2, metodo: "manuale", descrizione: "Peso obiettivo impostato manualmente", bmiMin: bmiMinKg, bmiMax: bmiMaxKg };
    }
  }
  const meta = { bmiMin: bmiMinKg, bmiMax: bmiMaxKg };
  const pctGrasso = stimaGrasso(persona, lastMisura);
  if (pctGrasso !== null) {
    const lbm = pesoAttuale * (1 - pctGrasso / 100);
    let pctTarget;
    if (sesso === "M") pctTarget = eta < 30 ? 13 : eta < 40 ? 15 : eta < 50 ? 17 : 19;
    else               pctTarget = eta < 30 ? 22 : eta < 40 ? 24 : eta < 50 ? 26 : 28;
    if (obiettivo === "aumento") {
      const lbmTarget = lbm * 1.05;
      const pesoTarget = Math.round(lbmTarget / (1 - pctTarget / 100) * 2) / 2;
      return { peso: Math.min(pesoTarget, Math.round(25*altM*altM*2)/2), metodo: "LBM+ACSM", descrizione: `Massa magra +5%, %grasso target ${pctTarget}% (ACSM)`, ...meta };
    }
    const pesoTarget = Math.round(lbm / (1 - pctTarget / 100) * 2) / 2;
    return { peso: Math.max(pesoTarget, Math.round(18.5*altM*altM*2)/2), metodo: "LBM+ACSM", descrizione: `%grasso target ${pctTarget}% (ACSM)`, ...meta };
  }
  const baseH = 152.4, kgPer254 = sesso==="M"?2.7:2.2, baseKg = sesso==="M"?48.0:45.5;
  const hamwi = altezza>=baseH ? baseKg+kgPer254*((altezza-baseH)/2.54) : baseKg-kgPer254*((baseH-altezza)/2.54);
  const hamwiR = Math.round(hamwi*2)/2;
  if (obiettivo === "perdita") return { peso: Math.max(hamwiR, Math.round(18.5*altM*altM*2)/2), metodo: "Hamwi", descrizione: "Formula Hamwi", ...meta };
  return { peso: Math.min(Math.round(hamwiR*1.05*2)/2, Math.round(25*altM*altM*2)/2), metodo: "Hamwi+5%", descrizione: "Formula Hamwi +5%", ...meta };
}

// ─── WeightProgressChart ─────────────────────────────────────────────

export function dateToSort(d) {
  // "gg/mm/aaaa" → "aaaammgg" per ordinamento
  try { const [g,m,a]=d.split("/"); return `${a}${m.padStart(2,"0")}${g.padStart(2,"0")}`; }
  catch { return "00000000"; }
}

export function dateToLabel(d) {
  try {
    const [g,m,a]=d.split("/");
    const dt=new Date(+a,+m-1,+g);
    const giorni=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
    return `${giorni[dt.getDay()]} ${g}/${m}`;
  } catch { return d; }
}

export function seededRng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

// ─── Helpers stagionalità ───────────────────────────────────────────

export function meseCorrente() { return new Date().getMonth() + 1; } // 1–12

// ═══════════════════════════════════════════════════════════════════
// RICETTARIO UNIFICATO — pool globale catalogo + ricette utente
// ═══════════════════════════════════════════════════════════════════

// Ratio medi uomo→donna e uomo→bimbo nel catalogo CRA-NUT.
// Usati per inferire gli slot quando l'utente inserisce solo le quantità "uomo".
const RATIO_DONNA = 0.74;
const RATIO_BIMBO = 0.41;

// Arrotonda alla granularità naturale dell'ingrediente per lo slot inferito:
// - pz/cucchiaio → 0.5 (mezzo cucchiaio, mezza porzione)
// - g/ml → 5g
function arrotondaSlot(valore, unit) {
  if (unit === "g" || unit === "ml") return Math.max(5, Math.round(valore / 5) * 5);
  return Math.round(valore * 2) / 2;
}

// Converte una ricetta dal formato cloud (rowToRicetta) nel formato
// interno del motore (stesso schema delle ricette catalogo in DB[cat]).
// Supporta sia il vecchio formato {ingredienti:[{ing,g}]} che il nuovo
// {quantita:{ing_id:{uomo,donna,bimbo,unit}}}.
// Registra ING_QTY[id] con slot separati (no _scaled) → gradient descent completo.
export function ricettaUtenteToMealObj(ricetta) {
  const id = "usr_" + ricetta.id;

  // ── Costruisci quantita nel formato unificato ──────────────────
  let quantita = {};
  if (ricetta.quantita && typeof ricetta.quantita === "object") {
    // Formato nuovo: {ing_id:{uomo,donna,bimbo,unit}} — usalo direttamente
    quantita = ricetta.quantita;
  } else {
    // Formato vecchio: [{ing, g}] — inferisci slot donna/bimbo dal ratio medio
    for (const it of (ricetta.ingredienti || [])) {
      if (!it?.ing || !(it.g > 0)) continue;
      const unit = it.unit || "g";
      const uomo = it.g;
      quantita[it.ing] = {
        uomo,
        donna: arrotondaSlot(uomo * RATIO_DONNA, unit),
        bimbo: arrotondaSlot(uomo * RATIO_BIMBO, unit),
        unit,
      };
    }
  }

  // ── Calcola macro per slot da ingredienti (cache) ──────────────
  const macroSlot = (persona) => {
    const tot = { kcal:0, p:0, c:0, g:0 };
    for (const [ingId, v] of Object.entries(quantita)) {
      const grams = quantitaInGrammi(ingId, v[persona] ?? v.uomo, v.unit);
      const n = nutriPerGrammi(ingId, grams);
      tot.kcal += n.kcal; tot.p += n.p; tot.c += n.c; tot.g += n.g;
    }
    return { kcal: Math.round(tot.kcal), p: Math.round(tot.p),
             c: Math.round(tot.c), g: Math.round(tot.g) };
  };

  const macroUomo  = macroSlot("uomo");
  const macroDonna = macroSlot("donna");
  const macroBimbo = macroSlot("bimbo");

  // ── Porzioni leggibili ──────────────────────────────────────────
  const porzStr = (persona) => {
    const pezzi = [];
    for (const [ingId, v] of Object.entries(quantita)) {
      const qty = v[persona] ?? v.uomo;
      const ing = ING_MAP[ingId];
      const nome = ing ? ing.nome.toLowerCase() : ingId;
      let qta;
      const unit = v.unit || "g";
      if (unit === "g" || unit === "ml") qta = Math.round(qty) + unit;
      else if (unit === "cucchiaio") qta = (qty === 0.5 ? "½" : qty) + " cucchiaio" + (qty > 1 ? "i" : "");
      else if (unit === "pz") qta = (qty === 0.5 ? "½" : qty) + " pz";
      else qta = qty + " " + unit;
      pezzi.push(qta + " " + nome);
    }
    return pezzi.join(" · ");
  };

  // ── Registra in ING_QTY senza _scaled (path gradient descent) ──
  // Deep copy: ogni slot {uomo,donna,bimbo,unit} viene copiato per valore
  // così una successiva mutazione di quantita non tocca ING_QTY[id].
  const iqEntry = {};
  for (const [k, v] of Object.entries(quantita)) {
    iqEntry[k] = { ...v };  // copia shallow dell'oggetto slot (primitivi = by value)
  }
  ING_QTY[id] = iqEntry;

  return {
    id,
    nome: ricetta.titolo || ricetta.nome || "Ricetta",
    categoria: ricetta.categoria,
    prep: ricetta.prep ?? null,
    fonte: ricetta.isMine ? "utente" : "famiglia",
    autoreId: ricetta.autoreId || null,
    esclusa: ricetta.esclusa || false,
    stagioni: ricetta.stagioni || null,
    uomo:  macroUomo,
    donna: macroDonna,
    bimbo: macroBimbo,
    porzioni: {
      uomo:  porzStr("uomo"),
      donna: porzStr("donna"),
      bimbo: porzStr("bimbo"),
    },
    ingredients: Object.keys(quantita),
    tags: ricetta.tags || [],
    // Mantieni riferimento al cloud per operazioni CRUD
    _cloudId: ricetta.id,
    _scope: ricetta.scope,
    _isMine: ricetta.isMine,
  };
}

// Pool unificato per categoria: catalogo + ricette utente convertite.
// Le ricette utente hanno peso 3× nel sorteggio, così vengono favorite.
// Le ricette escluse (esclusa=true) non entrano nel pool.
// Registra anche ING_QTY per ogni ricetta utente (effetto collaterale idempotente).
export function buildMergedPool(categoria, ricetteUtente, excludedIds, mese, ricetteEscluseIds) {
  const escl = ricetteEscluseIds instanceof Set ? ricetteEscluseIds : new Set(ricetteEscluseIds || []);
  // Catalogo: filtra ingredienti esclusi E ricette escluse per id
  const catalogoFiltrato = (DB[categoria] || []).filter(r => !escl.has(r.id));
  const catalogo = buildWeightedPool(catalogoFiltrato, excludedIds, mese);
  // Ricette utente della categoria: escludi quelle con flag esclusa o id escluso
  const utente = (ricetteUtente || [])
    .filter(r => r.categoria === categoria && !r.esclusa)
    .map(r => {
      try { return ricettaUtenteToMealObj(r); } catch { return null; }
    })
    .filter(Boolean)
    .filter(r => !escl.has(r.id) && !escl.has(r._cloudId))
    .filter(r => !r.ingredients.some(id => (excludedIds||[]).includes(id)));

  if (!utente.length) return catalogo;

  // Peso 3× per le ricette utente (3 copie nel pool pesato)
  const poolUtente = [];
  for (const r of utente) for (let i = 0; i < 3; i++) poolUtente.push(r);

  return [...poolUtente, ...catalogo];
}

export function pesoStagionale(ricetta, mese) {
  // Conta quanti ingredienti della ricetta sono fuori stagione
  let fuori = 0;
  for (const ingId of ricetta.ingredients) {
    const ing = ING_MAP[ingId];
    if (!ing) continue;
    if (ing.stagioni && !ing.stagioni.includes(mese)) fuori++;
  }
  if (fuori === 0) return 4;  // tutto di stagione → priorità massima
  if (fuori === 1) return 2;  // un ingrediente fuori → accettabile
  if (fuori === 2) return 1;  // due fuori → bassa priorità
  return 0;                   // tre+ fuori → esclusa
}

// Bonus di densità proteica: una piccola spinta alle ricette intrinsecamente
// proteiche, così il piano (condiviso in famiglia) tende ad avere abbastanza
// "margine" proteico per i profili con target alto. Soft: non esclude nulla,
// somma solo qualche copia in più nel pool. Calcolato sul macro intrinseco
// (slot uomo), quindi indipendente dal profilo.
function bonusProteico(ricetta) {
  const u = ricetta.uomo;
  if (!u || !u.kcal) return 0;
  const ratio = (u.p * 4) / u.kcal;   // quota calorica da proteine
  if (ratio >= 0.35) return 2;
  if (ratio >= 0.28) return 1;
  return 0;
}

export function buildWeightedPool(ricette, excludedIds, mese) {
  const pool = [];
  for (const r of ricette) {
    if (r.ingredients.some(id => excludedIds.includes(id))) continue;
    const w = pesoStagionale(r, mese);
    if (w > 0) {
      const tot = w + bonusProteico(r);
      for (let i = 0; i < tot; i++) pool.push(r);
    }
  }
  // fallback: se il pool è vuoto (tutti esclusi o fuori stagione) usa tutto
  return pool.length > 0 ? pool : ricette.filter(r => !r.ingredients.some(id => excludedIds.includes(id)));
}

export function generateWeekPlan(seed, excludedIds = [], mese, ricetteUtente = [], ricetteEscluseIds) {
  const m = mese || meseCorrente();
  const rng = seededRng(seed);
  const escl = ricetteEscluseIds instanceof Set ? ricetteEscluseIds : new Set(ricetteEscluseIds || []);

  const diag = {};
  const analizzaCat = (cat) => {
    const tutteDB = (DB[cat] || []).filter(r => !escl.has(r.id));
    const tutteUtente = (ricetteUtente||[]).filter(r => r.categoria === cat && !r.esclusa);
    let perEsclusione = 0, perStagione = 0, ammesse = 0;
    for (const r of tutteDB) {
      if (r.ingredients.some(id => excludedIds.includes(id))) { perEsclusione++; continue; }
      if (pesoStagionale(r, m) <= 0) { perStagione++; continue; }
      ammesse++;
    }
    diag[cat] = { totali: tutteDB.length + tutteUtente.length, ammesse: ammesse + tutteUtente.length, scartate: { esclusione: perEsclusione, stagione: perStagione } };
  };

  const pickSeven = (cat) => {
    const pool = buildMergedPool(cat, ricetteUtente, excludedIds, m, escl);
    if (!pool.length) return (DB[cat]||[]).slice(0, 7);
    const picked = [], usedIds = new Set();
    let attempts = 0;
    while (picked.length < 7 && attempts < 300) {
      attempts++;
      const r = pool[Math.floor(rng() * pool.length)];
      if (!usedIds.has(r.id) || usedIds.size >= new Set(pool.map(x=>x.id)).size) {
        usedIds.add(r.id);
        picked.push(r);
      }
    }
    return picked.slice(0, 7);
  };

  ["colazione","pranzo","cena","spuntino"].forEach(analizzaCat);

  const cols   = pickSeven("colazione");
  const pranzi = pickSeven("pranzo");
  const cene   = pickSeven("cena");

  // Spuntini: pool unificato, no due uguali consecutivi
  const spPool = buildMergedPool("spuntino", ricetteUtente, excludedIds, m, escl);
  const spFallback = buildMergedPool("spuntino", ricetteUtente, [], m, escl);
  const spuntini = [];
  for (let i = 0; i < 14; i++) {
    const excl = spuntini.slice(-2).map(s => s.id);
    const avail = spPool.filter(s => !excl.includes(s.id));
    const src   = avail.length ? avail : (spFallback.length ? spFallback : spPool);
    spuntini.push(src[Math.floor(rng() * src.length)]);
  }

  try {
    const uniche = (arr) => new Set(arr.map(x=>x.id)).size;
    logCalc("plan", String(seed), `Generazione piano · seed ${seed} · mese ${m}`, {
      seed: String(seed), mese: m,
      esclusiIngredienti: excludedIds.length ? excludedIds : "nessuno",
      categorie: diag,
      ricetteUniche: { colazione: uniche(cols), pranzo: uniche(pranzi), cena: uniche(cene), spuntino: uniche(spuntini) },
      sceltePerGiorno: DAYS.map((day,i)=>({
        giorno: day,
        colazione: cols[i]?.id, pranzo: pranzi[i]?.id, cena: cene[i]?.id,
        spuntino_m: spuntini[i*2]?.id, spuntino_p: spuntini[i*2+1]?.id,
      })),
    });
  } catch {}

  return DAYS.map((day, i) => ({
    day,
    colazione:  cols[i],
    spuntino_m: spuntini[i * 2],
    pranzo:     pranzi[i],
    spuntino_p: spuntini[i * 2 + 1],
    cena:       cene[i],
    mese:       m,
  }));
}

// ═══════════════════════════════════════════════════════════════════
// ALGORITMO ADATTIVO — usa tutti i dati disponibili
// ═══════════════════════════════════════════════════════════════════

// Livelli di confidenza

export function parseDataIT(s) {
  try { const [g,m,a]=s.split("/"); return new Date(+a,+m-1,+g); } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
// FABBISOGNO CALORICO — metodo LARN/SINU (tabella italiana)
// ═══════════════════════════════════════════════════════════════════
// Metabolismo Basale per fascia d'età e sesso:  MB = coeff·P + costante.
// Fabbisogno = MB × LAF (Livello Attività Fisica).
// La tabella copre solo adulti (≥18 anni): per i minori chi chiama usa
// il fallback Mifflin-St Jeor.
// ═══════════════════════════════════════════════════════════════════

// Coefficienti MB: [coeff, costante] per fascia d'età, per sesso.

export function metabolismoBasaleLARN(sesso, eta, pesoKg) {
  const tab = MB_COEFF_LARN[sesso === "M" ? "M" : "F"];
  const fascia = tab.find(f => eta <= f.maxEta) || tab[tab.length - 1];
  return fascia.c * pesoKg + fascia.k;
}

// LAF per sesso, fascia d'età, intensità lavoro e giorni di allenamento.

// Normalizza i campi attività di una persona: usa lavoro+allenamenti se
// presenti, altrimenti li deriva dal vecchio campo `stile` (legacy).
export function normalizeAttivita(p) {
  if (p && p.lavoro !== undefined && p.allenamenti !== undefined) {
    return { lavoro: p.lavoro, allenamenti: Math.max(0, Math.min(7, +p.allenamenti || 0)) };
  }
  const stile = p && p.stile;
  if (p && p.eta < 12) {
    const all = STILE_LEGACY_BAMBINI[stile];
    return { lavoro: "sedentario", allenamenti: all !== undefined ? all : 2 };
  }
  return STILE_LEGACY_ADULTI[stile] || { lavoro: "attivo", allenamenti: 4 };
}

export function lafLARN(sesso, eta, lavoro, allenamenti) {
  const S = LAF_TAB_LARN[sesso === "M" ? "M" : "F"];
  const larnLavoro = (LAVORI.find(l => l.key === lavoro) || LAVORI[1]).larn;
  const gg = Math.max(0, Math.min(7, +allenamenti || 0));
  const riga = eta >= 75 ? S.eta75 : eta >= 60 ? S.eta60_74 : S.adulto[larnLavoro];
  // 0 gg = colonna "no", 4 gg = colonna "sì" (attività auspicabile),
  // interpolazione lineare in mezzo; oltre i 4 gg piccolo extra (+0.02/g)
  const f = Math.min(gg, 4) / 4;
  const extra = Math.max(0, gg - 4) * 0.02;
  return Math.round((riga.no + f * (riga.si - riga.no) + extra) * 1000) / 1000;
}

// Fabbisogno calorico LARN completo. Ritorna anche i componenti.

export function fabbisognoLARN(sesso, eta, pesoKg, lavoro, allenamenti) {
  const mb  = metabolismoBasaleLARN(sesso, eta, pesoKg);
  const laf = lafLARN(sesso, eta, lavoro, allenamenti);
  return { mb: Math.round(mb), laf, fabbisogno: Math.round(mb * laf) };
}

// Stima %grasso formula US Navy

export function stimaGrasso(p, misureRec) {
  if (!misureRec) return null;
  const { altezza, sesso } = p;
  const vita   = parseFloat(misureRec.vita);
  const collo  = parseFloat(misureRec.collo);
  const fianchi= parseFloat(misureRec.fianchi);
  if (!altezza || isNaN(collo) || isNaN(vita)) return null;
  let pct;
  try {
    if (sesso === "M") {
      const log1 = Math.log10(vita - collo);
      const log2 = Math.log10(altezza);
      pct = 495 / (1.0324 - 0.19077 * log1 + 0.15456 * log2) - 450;
    } else {
      if (isNaN(fianchi)) return null;
      const log1 = Math.log10(vita + fianchi - collo);
      const log2 = Math.log10(altezza);
      pct = 495 / (1.29579 - 0.35004 * log1 + 0.22100 * log2) - 450;
    }
    if (pct < 3 || pct > 60) return null;
    return Math.round(pct * 10) / 10;
  } catch { return null; }
}

// Analisi trend peso: regressione lineare semplice
// Restituisce { tdeeAdattivo, settimane, rateKgSettimana, kcalMedie }

export function calcolaTDEEAdattivo(misureOrdinateAsc, kcalAssunteStimate) {
  const pesoPunti = misureOrdinateAsc
    .map(r => ({ d: parseDataIT(r.date), v: parseFloat(r.peso) }))
    .filter(x => x.d && !isNaN(x.v));
  if (pesoPunti.length < 3) return null; // con 2 punti il trend è troppo rumoroso

  const first = pesoPunti[0], last = pesoPunti[pesoPunti.length - 1];
  const giorniTotali = (last.d - first.d) / 86400000;
  if (giorniTotali < 14) return null; // meno di due settimane: troppa acqua, poco segnale

  const settimane = giorniTotali / 7;

  // Regressione lineare ai minimi quadrati su TUTTI i punti (robusta agli outlier
  // del singolo giorno, a differenza del semplice primo-vs-ultimo)
  const xs = pesoPunti.map(p => (p.d - first.d) / 86400000);
  const ys = pesoPunti.map(p => p.v);
  const n  = xs.length;
  const mx = xs.reduce((a,b)=>a+b,0) / n;
  const my = ys.reduce((a,b)=>a+b,0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i]-mx)*(ys[i]-my); den += (xs[i]-mx)**2; }
  if (!den) return null;
  let rateKgSett = (num / den) * 7;            // kg/settimana, negativo se in calo

  // Clamp fisiologico: oltre ±1 kg/sett è quasi sempre acqua o errore di misura
  rateKgSett = Math.max(-1, Math.min(1, rateKgSett));

  // 1 kg grasso ≈ 7700 kcal
  // TDEE = kcal realmente assunte − (variazione settimanale in kcal / 7)
  // kcalAssunteStimate DEVE essere l'intake del piano (con deficit), non il mantenimento
  const kcal = kcalAssunteStimate || 0;
  const tdeeAdattivo = Math.round(kcal - (rateKgSett * 7700 / 7));

  return { tdeeAdattivo, settimane, rateKgSett, kcalMedie: kcal };
}

// Analisi ricomposizione: peso stabile ma vita scende

export function isRicomposizione(misureOrdinateAsc) {
  if (misureOrdinateAsc.length < 3) return false;
  const pesoVals = misureOrdinateAsc.map(r=>parseFloat(r.peso)).filter(v=>!isNaN(v));
  const vitaVals = misureOrdinateAsc.map(r=>parseFloat(r.vita)).filter(v=>!isNaN(v));
  if (pesoVals.length < 3 || vitaVals.length < 3) return false;
  const deltaPeso = pesoVals[pesoVals.length-1] - pesoVals[0];
  const deltaVita = vitaVals[vitaVals.length-1] - vitaVals[0];
  return Math.abs(deltaPeso) < 1.5 && deltaVita < -2; // peso quasi fermo, vita scende
}

// ─── FUNZIONE PRINCIPALE ────────────────────────────────────────────

export function calcTargetAdattivo(p, misurePersona) {
  const { peso, altezza, eta, sesso, obiettivo } = p;
  const { lavoro, allenamenti } = normalizeAttivita(p);
  const isChild = eta < 12;
  // Moltiplicatore Mifflin per i minori, derivato dai giorni di allenamento
  const mult = Math.min(1.9, Math.round((1.2 + allenamenti * 0.0875) * 1000) / 1000);

  // misure ordinate dal più vecchio al più recente
  const recs = (misurePersona||[]).slice().sort((a,b)=>dateToSort(a.date).localeCompare(dateToSort(b.date)));
  const latestRec = recs.length ? recs[recs.length-1] : null;

  // ── STEP 1: Fabbisogno base ─────────────────────────────────────
  // Adulti: metodo LARN/SINU (MB per fascia d'età × LAF). I minori non
  // sono coperti dalla tabella LARN → fallback Mifflin-St Jeor.
  const bmrMifflin = sesso==="M"
    ? 10*peso + 6.25*altezza - 5*eta + 5
    : 10*peso + 6.25*altezza - 5*eta - 161;

  let larnInfo = null;
  let tdeeMifflin;            // nome storico mantenuto per compatibilità display
  if (!isChild) {
    larnInfo = fabbisognoLARN(sesso, eta, peso, lavoro, allenamenti);
    tdeeMifflin = larnInfo.fabbisogno;        // fabbisogno LARN = MB × LAF
  } else {
    // minori: Mifflin × moltiplicatore stile, come in precedenza
    tdeeMifflin = Math.round(bmrMifflin * mult);
  }

  // ── STEP 2: Affinamento Katch-McArdle se c'è la %grasso ──────────
  // Se disponibile la massa magra, sostituiamo l'MB con quello
  // Katch-McArdle (più preciso su soggetti con composizione nota) e
  // rical­coliamo il fabbisogno con lo stesso LAF della tabella LARN.
  const pctGrasso = !isChild ? stimaGrasso(p, latestRec) : null;
  let bmr = isChild ? bmrMifflin : (larnInfo ? larnInfo.mb : bmrMifflin);
  let usaKatchMcArdle = false;
  if (pctGrasso !== null && !isChild) {
    const pesoDaRec = latestRec && !isNaN(parseFloat(latestRec.peso)) ? parseFloat(latestRec.peso) : peso;
    const lbm = pesoDaRec * (1 - pctGrasso / 100);
    const bmrKM = 370 + 21.6 * lbm;
    bmr = bmrKM;
    usaKatchMcArdle = true;
    // ricalcolo il fabbisogno con MB Katch-McArdle × LAF LARN
    tdeeMifflin = Math.round(bmrKM * (larnInfo ? larnInfo.laf : mult));
  }

  // ── STEP 3: TDEE adattivo da storico peso ────────────────────────
  let tdeeFinale = tdeeMifflin;
  let usaTDEEAdattivo = false;
  let adattivoInfo = null;

  if (!isChild && recs.length >= 3) {
    const pesoPunti = recs.filter(r=>!isNaN(parseFloat(r.peso)));
    if (pesoPunti.length >= 3) {
      const giorniSpan = (() => {
        const d1 = parseDataIT(pesoPunti[0].date);
        const d2 = parseDataIT(pesoPunti[pesoPunti.length-1].date);
        return d1 && d2 ? (d2-d1)/86400000 : 0;
      })();
      if (giorniSpan >= 14) {
        // Stima di quanto la persona sta REALMENTE mangiando: il target del
        // piano (mantenimento − deficit), non il mantenimento. Passare il
        // mantenimento gonfiava il TDEE adattivo dell'intero deficit (~400-600 kcal).
        let offsetPiano = 0;
        if (p.dietaIntensita !== undefined && p.dietaIntensita !== null) {
          offsetPiano = Math.round(100 + (p.dietaIntensita / 100) * 900);
        } else if (obiettivo === "perdita") {
          offsetPiano = Math.min(600, Math.round(tdeeMifflin * 0.18));
        } else if (obiettivo === "aumento") {
          offsetPiano = -300;
        }
        const kcalAssunteStimate = Math.max(1200, tdeeMifflin - offsetPiano);

        const adattivo = calcolaTDEEAdattivo(pesoPunti, kcalAssunteStimate);
        if (adattivo) {
          // Vincolo di plausibilità: l'adattivo non può discostarsi oltre il
          // ±25% dalla formula LARN (filtra dati sporchi e derive iniziali)
          const tdeeClamped = Math.max(
            Math.round(tdeeMifflin * 0.75),
            Math.min(Math.round(tdeeMifflin * 1.25), adattivo.tdeeAdattivo)
          );
          // Media pesata: più settimane di dati → più peso all'adattivo,
          // ma mai oltre il 60% (la formula LARN resta sempre ≥40%)
          const pesoAdattivo = Math.min(0.60, 0.25 + (adattivo.settimane / 20) * 0.45);
          tdeeFinale = Math.round(tdeeMifflin * (1-pesoAdattivo) + tdeeClamped * pesoAdattivo);
          usaTDEEAdattivo = true;
          adattivoInfo = { ...adattivo, tdeeAdattivo: tdeeClamped };
        }
      }
    }
  }

  // ── STEP 4: Aggiustamento obiettivo ──────────────────────────────
  let deficit = 0;
  let noteObiettivo = "";

  if (!isChild) {
    const ricomposizione = isRicomposizione(recs);
    if (ricomposizione && obiettivo === "perdita") {
      // Ricomposizione in corso: mantieni le calorie, non tagliare
      deficit = Math.round(tdeeFinale * 0.05); // deficit minimo 5%
      noteObiettivo = "ricomposizione";
    } else if (obiettivo === "perdita") {
      // Deficit tra 15% e 22% del TDEE, max 600 kcal
      deficit = Math.min(600, Math.round(tdeeFinale * 0.18));
    } else if (obiettivo === "aumento") {
      deficit = -300;
    }
  }

  let intensitaOffset = null;
  if (!isChild && p.dietaIntensita !== undefined && p.dietaIntensita !== null) {
    intensitaOffset = Math.round(100 + (p.dietaIntensita / 100) * 900);
  }
  const kcal = Math.max(1200, intensitaOffset !== null ? tdeeFinale - intensitaOffset : tdeeFinale - deficit);

  // ── STEP 5: Macros ────────────────────────────────────────────────
  // Proteine: dipendono da massa magra se disponibile, altrimenti da peso
  const sportivo = allenamenti >= 5 || lavoro === "sportivo";
  const protMultiplier = sportivo ? 2.2 : allenamenti >= 3 ? 2.0 : 1.8;
  let prot;
  if (!isChild && pctGrasso !== null && latestRec) {
    const pesoDaRec = !isNaN(parseFloat(latestRec.peso)) ? parseFloat(latestRec.peso) : peso;
    const lbm = pesoDaRec * (1 - pctGrasso / 100);
    // Proteine su massa magra: più preciso
    prot = Math.round(lbm * (sportivo ? 2.6 : allenamenti >= 3 ? 2.4 : 2.2));
  } else {
    prot = isChild ? Math.round(peso*1.2) : Math.round(peso * protMultiplier);
  }
  const grassi = Math.round((kcal * 0.28) / 9);
  const carbo  = Math.round((kcal - prot*4 - grassi*9) / 4);

  // ── STEP 6: Confidenza ────────────────────────────────────────────
  let confidenza;
  const nPesoPunti = recs.filter(r=>!isNaN(parseFloat(r.peso))).length;
  if (usaTDEEAdattivo && usaKatchMcArdle) {
    confidenza = CONFIDENZA.OTTIMA;
  } else if (usaTDEEAdattivo) {
    confidenza = CONFIDENZA.ALTA;
  } else if (usaKatchMcArdle) {
    confidenza = CONFIDENZA.MEDIA;
  } else {
    confidenza = CONFIDENZA.BASSA;
  }

  // ── LOG diagnostico (dedup per profilo): tracciamo input, passaggi e
  // risultato del calcolo calorico. Utile per capire da dove arriva un kcal
  // inatteso. La dedup evita di registrare la stessa identica computazione
  // a ogni render.
  try {
    logCalc("calc", p.id || p.nome || "?", `Calcolo calorie · ${p.nome || "profilo"} → ${kcal} kcal`, {
      input: { sesso, eta, peso, altezza, lavoro, allenamenti, obiettivo,
               dietaIntensita: p.dietaIntensita ?? null, nMisure: recs.length },
      step1_fabbisognoBase: isChild
        ? { metodo: "Mifflin×stile", bmrMifflin: Math.round(bmrMifflin), mult, valore: tdeeMifflin }
        : { metodo: "LARN/SINU", mb: larnInfo?.mb, laf: larnInfo?.laf, valore: larnInfo?.fabbisogno },
      step2_katchMcArdle: usaKatchMcArdle
        ? { applicato: true, pctGrasso, bmr: Math.round(bmr), fabbisognoRical: tdeeMifflin }
        : { applicato: false, pctGrasso },
      step3_tdeeAdattivo: usaTDEEAdattivo
        ? { applicato: true, tdeeAdattivoClamped: adattivoInfo?.tdeeAdattivo, settimane: adattivoInfo?.settimane, tdeeFinale }
        : { applicato: false, motivo: recs.length < 3 ? "meno di 3 misure" : "span < 14 giorni o dati insufficienti", tdeeFinale },
      step4_obiettivo: intensitaOffset !== null
        ? { applicato: "intensità", intensitaOffset, deficitObiettivoIgnorato: deficit, nota: noteObiettivo || "—" }
        : { applicato: "obiettivo", deficit, nota: noteObiettivo || "—" },
      step5_macros: { kcal, proteine: prot, carboidrati: Math.max(50, carbo), grassi },
      step6_confidenza: confidenza,
    });
  } catch {}

  return {
    kcal,
    p: prot,
    c: Math.max(50, carbo),
    g: grassi,
    confidenza,
    // dati di debug/display
    tdeeMifflin,
    tdeeFinale,
    pctGrasso,
    usaTDEEAdattivo,
    usaKatchMcArdle,
    larnInfo,
    adattivoInfo,
    noteObiettivo,
    nMisure: recs.length,
  };
}

// Wrapper retrocompatibile (senza misure → comportamento identico a prima)

export function calcTarget(p) { return calcTargetAdattivo(p, []); }

// ═══════════════════════════════════════════════════════════════════
// PIANO PERSONALIZZATO  ·  collega misure → fabbisogno → porzioni
// ═══════════════════════════════════════════════════════════════════
// Per un giorno del piano restituisce i macro di ogni pasto:
//   - se la persona HA misure → quantità riscalate dal motore sul suo
//     fabbisogno (calcolato con LARN dentro calcTargetAdattivo);
//   - se NON ha misure → macro della taglia uomo/donna/bimbo, come
//     prima. L'app resta quindi usabile anche senza misure.
//
// Ritorna { perPasto:{mealKey:{kcal,p,c,g}}, quantita:{mealKey:{ingId..}},
//           personalizzato:bool, tagliaBase, target }.
// Ripristina ING_QTY per le ricette custom (che hanno _ingredienti).
// Va chiamata ogni volta che si usa una ricetta custom nel piano, perché
// ING_QTY è in memoria e si perde al reload.

export function restoreCustomING_QTY(ricetta) {
  if (!ricetta || !ricetta.isCustom || !ricetta._ingredienti) return;
  if (ING_QTY[ricetta.id] && ING_QTY[ricetta.id]._scaled) return; // già registrata
  const qtyEntry = { _scaled: true };
  for (const [ingId, q] of Object.entries(ricetta._ingredienti)) {
    qtyEntry[ingId] = { uomo: q.valore, donna: q.valore, bimbo: q.valore, unit: q.unit };
  }
  ING_QTY[ricetta.id] = qtyEntry;
}

export function pianoPersonalizzato(giornoPiano, persona, misurePersona) {
  const slot = slotForPersona(persona);

  // Pasti del giorno come oggetti ricetta, in ordine.
  const mealKeys = MEAL_KEYS;
  const ricette = mealKeys.map(mk => giornoPiano && giornoPiano[mk]).filter(Boolean);

  // Il piano si personalizza non appena la persona ha i dati di base
  // (peso, età, sesso): bastano per calcolare il fabbisogno con LARN.
  // Le misure (storico peso) sono un affinamento opzionale, usato da
  // calcTargetAdattivo per il TDEE adattivo se presenti.
  const datiValidi = persona
    && Number(persona.peso)    > 0
    && Number(persona.eta)     > 0
    && (persona.sesso === "M" || persona.sesso === "F");

  // ── BLOCCO RISCALATURA AUTOMATICA PIANO ──────────────────────────
  // Con RICALCOLO_AUTO.piano=false le porzioni NON vengono riscalate sul
  // fabbisogno: si usano le taglie fisse della ricetta (deterministiche).
  // Stesso ramo del "dati non validi" → personalizzato:false.
  if (!datiValidi || !RICALCOLO_AUTO.piano) {
    const perPasto = {};
    for (const mk of mealKeys) {
      const meal = giornoPiano && giornoPiano[mk];
      perPasto[mk] = meal && meal[slot] ? meal[slot] : { kcal:0, p:0, c:0, g:0 };
    }
    return { perPasto, quantita:null, personalizzato:false, tagliaBase:slot, target:null };
  }

  // Fabbisogno LARN (+ TDEE adattivo se ci sono misure) + scaling.
  const target = calcTargetAdattivo(persona, misurePersona || []);
  // Ripristina ING_QTY per eventuali ricette custom nel piano
  ricette.forEach(restoreCustomING_QTY);
  const res = scalaPastiGiorno(ricette, { kcal:target.kcal, p:target.p, c:target.c, g:target.g });

  const perPasto = {};
  for (const mk of mealKeys) {
    const meal = giornoPiano && giornoPiano[mk];
    if (meal && res.perRicetta[meal.id]) {
      perPasto[mk] = macroDaQuantita(res.perRicetta[meal.id]);
    } else if (meal && meal[slot]) {
      // ricetta senza ING_QTY: ricade sulla taglia fissa
      perPasto[mk] = meal[slot];
    } else {
      perPasto[mk] = { kcal:0, p:0, c:0, g:0 };
    }
  }

  // Diagnostica della pipeline per-persona-per-giorno: collega il target
  // calorico al risultato effettivo nel piatto. È il punto dove calcolo
  // calorie e scaling si combinano per il singolo profilo.
  try {
    const somma = { kcal:0, p:0, c:0, g:0 };
    for (const mk of mealKeys) { const x = perPasto[mk]||{}; somma.kcal+=x.kcal||0; somma.p+=x.p||0; somma.c+=x.c||0; somma.g+=x.g||0; }
    const scost = (att, tgt) => tgt > 0 ? Math.round(((att - tgt) / tgt) * 100) : 0;
    logCalc("piano-persona", `${persona.id || persona.nome}|${giornoPiano?.day || "?"}`,
      `Pipeline · ${persona.nome || "profilo"} · ${giornoPiano?.day || "giorno"} → ${Math.round(somma.kcal)} kcal`, {
      profilo: persona.nome || persona.id, giorno: giornoPiano?.day || null,
      target: { kcal: target.kcal, p: target.p, c: target.c, g: target.g },
      pasti: mealKeys.map(mk => ({ pasto: mk, ricetta: giornoPiano?.[mk]?.id || null, macro: perPasto[mk] })),
      totaleGiorno: { kcal: Math.round(somma.kcal), p: Math.round(somma.p), c: Math.round(somma.c), g: Math.round(somma.g) },
      scostamentoVsTarget: { kcal: scost(somma.kcal, target.kcal), p: scost(somma.p, target.p), c: scost(somma.c, target.c), g: scost(somma.g, target.g) },
      tagliaBase: res.tagliaBase,
    });
  } catch {}

  return {
    perPasto,
    quantita: res.perRicetta,
    personalizzato: true,
    tagliaBase: res.tagliaBase,
    target,
  };
}

export function emojiBySesso(p) {
  if (p.eta < 12) return p.sesso==="M" ? "👦" : "👧";
  if (p.eta > 60) return p.sesso==="M" ? "👴" : "👵";
  return p.sesso==="M" ? "👨" : "👩";
}

// ─── Slot ricetta per persona ───────────────────────────────────────
// Le ricette hanno solo 3 profili di porzione: uomo / donna / bimbo.
// Qualsiasi persona del nucleo (anche la 4ª, 5ª…) va mappata su uno
// di questi profili in base a età e sesso — NON in base alla posizione
// nell'array, che cambia quando si aggiungono o rimuovono persone.

export function slotForPersona(p) {
  if (!p) return "donna";
  if (p.eta < 12) return "bimbo";
  return p.sesso === "M" ? "uomo" : "donna";
}

// ─── Shopping engine ────────────────────────────────────────────────

export function formatQty(total, unit) {
  if (unit==="pz") return Math.ceil(total)+" pz";
  if (unit==="cucchiaio"||unit==="cucchiaino"||unit==="qb") return "q.b.";
  if (unit==="ml") {
    if (total>=1000) return (total/1000).toFixed(1).replace(".0","")+" L";
    return (Math.ceil(total/50)*50)+" ml";
  }
  if (total<=50)   return (Math.ceil(total/10)*10)+"g";
  if (total<=200)  return (Math.ceil(total/25)*25)+"g";
  if (total<=500)  return (Math.ceil(total/50)*50)+"g";
  if (total<=1000) return (Math.ceil(total/100)*100)+"g";
  return (Math.ceil(total/500)*500/1000).toFixed(1).replace(".0","")+" kg";
}

// ─── Piano effettivo ────────────────────────────────────────────────
// Fonde il piano grezzo (da seed) con gli override (sostituzioni utente).
// È la FONTE UNICA da cui devono leggere sia la scheda Piano sia la
// scheda Spesa: così le due viste non possono divergere.
// overrides ha chiavi "<dayIdx>-<mealKey>".

export function applyOverrides(plan, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return plan;
  return plan.map((day, di) => {
    let dayCopy = null;
    MEAL_KEYS.forEach(mk => {
      const ov = overrides[`${di}-${mk}`];
      if (ov) {
        if (!dayCopy) dayCopy = { ...day };
        dayCopy[mk] = ov;
      }
    });
    return dayCopy || day;
  });
}

export function buildShoppingForDays(plan, selectedDays) {
  return buildShoppingForDayObjects(selectedDays.map(di => plan[di]).filter(Boolean));
}

// Versione generalizzata: riceve direttamente gli OGGETTI-GIORNO già
// risolti (override applicati), così la spesa può coprire una finestra di
// date che sfora la settimana (es. ven-sab-dom + lun della settimana dopo).
//
// SPESA CONSUMO-AWARE (per persona) — `consumo` opzionale:
//   { personas, mealsLog, dateKeys }
//   dateKeys[i] = chiave data locale (localDateKey) del giorno dayObjs[i].
// Quando attiva, le quantità sono calcolate sui MEMBRI REALI della famiglia:
// ogni persona ancora "in attesa" contribuisce con la porzione del suo slot
// (uomo/donna/bimbo via slotForPersona); chi ha già consumato o saltato il
// pasto in quella data non genera più spesa. Se TUTTI i membri hanno risolto
// il pasto, l'intero pasto esce dalla lista (inclusi gli ingredienti q.b.).
// Senza `consumo` il comportamento resta quello storico: somma dei tre slot
// fissi del batch (uomo+donna+bimbo), indipendente dalla composizione reale.
export function buildShoppingForDayObjects(dayObjs, consumo) {
  const acc = {};
  const aware = !!(consumo && Array.isArray(consumo.personas) && consumo.personas.length
                   && Array.isArray(consumo.dateKeys) && consumo.mealsLog);
  const risolto = (p, dateKey, mk) => {
    const e = consumo.mealsLog?.[p.id]?.[dateKey]?.[mk];
    return !!(e && (e.consumed || e.saltato));
  };
  const addQty = (recipeId, ingId, fattoreSlots) => {
    const qtyMap = ING_QTY[recipeId];
    const q = qtyMap && qtyMap[ingId];
    if (q) {
      if (!acc[ingId]) acc[ingId] = { total:0, unit:q.unit };
      if (acc[ingId].total === null) acc[ingId].total = 0;
      const sum = fattoreSlots
        ? PERSONAS_KEYS.reduce((s,pk) => s+(q[pk]||0)*(fattoreSlots[pk]||0), 0)
        : PERSONAS_KEYS.reduce((s,pk) => s+(q[pk]||0), 0);
      acc[ingId].total += sum;
      acc[ingId].unit = q.unit;
    } else {
      if (!acc[ingId]) acc[ingId] = { total:null, unit:"qb" };
    }
  };
  (dayObjs || []).forEach((day, di) => {
    if (!day) return;
    const dateKey = aware ? consumo.dateKeys[di] : null;
    MEAL_KEYS.forEach(mk => {
      const meal = day[mk];
      if (!meal || !meal.ingredients) return;
      let fattoreSlots = null;
      if (aware && dateKey) {
        // Moltiplicatore per slot = n. persone reali di quello slot in attesa
        fattoreSlots = { uomo:0, donna:0, bimbo:0 };
        let inAttesa = 0;
        consumo.personas.forEach(p => {
          if (!risolto(p, dateKey, mk)) { fattoreSlots[slotForPersona(p)] += 1; inAttesa += 1; }
        });
        if (inAttesa === 0) return; // pasto risolto da tutta la famiglia
      }
      meal.ingredients.forEach(ingId => addQty(meal.id, ingId, fattoreSlots));
    });
  });
  const grouped = {};
  const catOrder = ["🥩 Proteine","🥛 Latticini","🍎 Frutta","🥦 Verdure","🫘 Legumi","🌾 Cereali","🥜 Frutta secca","🧂 Dispensa","🛒 Altro"];
  Object.entries(acc).forEach(([ingId,{total,unit}]) => {
    const ing = ING_MAP[ingId]; if (!ing) return;
    const qtyStr = (total===null||unit==="qb"||unit==="cucchiaio"||unit==="cucchiaino") ? "q.b." : formatQty(total,unit);
    if (!grouped[ing.cat]) grouped[ing.cat] = [];
    grouped[ing.cat].push({...ing, qtyStr, rawTotal:total, rawUnit:unit});
  });
  const result = {};
  catOrder.forEach(cat => { if (grouped[cat]) result[cat] = grouped[cat].sort((a,b)=>a.deperibile-b.deperibile); });
  Object.keys(grouped).forEach(cat => { if (!result[cat]) result[cat] = grouped[cat]; });
  return result;
}

export function depColor(days) {
  if (days<=3) return "#ef4444"; if (days<=7) return "#f97316";
  if (days<=14) return "#eab308"; return "#22c55e";
}

export function depLabel(days) {
  if (days<=14) return `${days}g`; return "Stabile";
}

// ─── UI Atoms ────────────────────────────────────────────────────────
// ── SwipeContainer ──────────────────────────────────────────────────
// Wrapper che intercetta swipe orizzontali e chiama onSwipeLeft/Right.
// Distingue orizzontale da verticale (60% di delta orizzontale prevalente),
// così non ruba lo scroll della pagina. Soglia 50px per evitare tocchi
// accidentali. Non blocca i click su elementi interni.

export function ingQtyToEditor(ricettaId, personaKey) {
  // Converte ING_QTY[id] nel formato editor { ingId: {valore, unit} }
  const qty = ING_QTY[ricettaId];
  if (!qty) return {};
  const result = {};
  for (const [ingId, q] of Object.entries(qty)) {
    const slot = personaKey || "uomo";
    const valore = q[slot] ?? q.uomo ?? 0;
    result[ingId] = { valore: Number(valore), unit: q.unit || "g" };
  }
  return result;
}

export function calcMacroEditor(ingredienti) {
  // Calcola macro totali da { ingId: {valore, unit} }
  return macroDaQuantita(ingredienti);
}

export function ricalcolaMacroAdattati(MEAL_KEYS, macroBase, dayLog, pesoBase) {
  // ── BLOCCO RICALCOLO AUTOMATICO CALORIE ──────────────────────────
  // Con RICALCOLO_AUTO.calorie=false la ridistribuzione è disattivata:
  // ogni pasto in attesa resta sul suo macro pianificato, nessun _adattato.
  if (!RICALCOLO_AUTO.calorie) {
    return { adattato: macroBase, delta: 0, avviso: null };
  }
  // macroBase[mk] = macro piano (o personalizzato) per ogni pasto {kcal,p,c,g}
  // dayLog[mk]    = { consumed, saltato, kcal, p, c, g, ... } oppure assente
  // pesoBase[mk]  = grammi REALI pianificati del pasto (opzionale). Se assente,
  //                la pesatura ricade sul solo peso calorico (compat. legacy).
  //
  // Logica:
  //  • un pasto CONSUMATO con macro reali genera delta = reale − piano
  //  • un pasto SALTATO "libera" le sue calorie pianificate: contano come
  //    delta negativo (= ho mangiato 0 dove ne avevo previste X) e vengono
  //    spinte sui pasti ancora in attesa (forward, perché i rimanenti sono a
  //    valle nell'ordine della giornata)
  //  • i pasti IN ATTESA (né consumati né saltati) sono i destinatari e si
  //    riscalano per assorbire il delta complessivo.
  //
  // Pesatura della ridistribuzione (richiesta prodotto): ogni destinatario
  // riceve in proporzione alla MEDIA tra la sua incidenza sul peso totale
  // (grammi) e la sua incidenza sull'apporto calorico totale dei rimanenti:
  //     w_i = ( grammi_i/Σgrammi + kcal_i/Σkcal ) / 2     con Σ w_i = 1

  let deltaKcal = 0, deltaP = 0, deltaC = 0, deltaG = 0;
  const nonConsumati = []; // destinatari = pasti in attesa

  for (const mk of MEAL_KEYS) {
    const log = dayLog[mk];
    const base = macroBase[mk] || {kcal:0,p:0,c:0,g:0};
    if (log && log.consumed && (log.kcal || log._ingredienti)) {
      // pasto consumato con dati reali
      deltaKcal += (log.kcal||0) - base.kcal;
      deltaP    += (log.p||0)    - base.p;
      deltaC    += (log.c||0)    - base.c;
      deltaG    += (log.g||0)    - base.g;
    } else if (log && log.saltato) {
      // pasto saltato: libera le calorie pianificate (delta negativo)
      deltaKcal += 0 - base.kcal;
      deltaP    += 0 - base.p;
      deltaC    += 0 - base.c;
      deltaG    += 0 - base.g;
      // NON è un destinatario
    } else if (!log || (!log.consumed && !log.saltato)) {
      nonConsumati.push(mk);
    }
    // consumed senza macro reali → nessun delta, non è destinatario
  }

  // Nessun delta o nessun pasto da riadattare → restituisci base invariata
  if (Math.abs(deltaKcal) < 1 || nonConsumati.length === 0) {
    return { adattato: macroBase, delta: deltaKcal, avviso: null };
  }

  // Totali dei destinatari (calorie SEMPRE; grammi se forniti)
  const kcalTot = nonConsumati.reduce((s, mk) => s + (macroBase[mk]?.kcal||0), 0);
  const usaPeso = !!pesoBase;
  const gramTot = usaPeso ? nonConsumati.reduce((s, mk) => s + (pesoBase[mk]||0), 0) : 0;

  if (kcalTot <= 0) {
    // Destinatari senza calorie pianificate: niente da riscalare
    return { adattato: macroBase, delta: deltaKcal, avviso: null };
  }

  // Avviso di assorbibilità (range 50%–200%): confronto col solo peso calorico
  let avviso = null;
  const korrFactor = (kcalTot - deltaKcal) / kcalTot;
  if (korrFactor < 0.5 || korrFactor > 2.0) {
    const tipo = deltaKcal > 0 ? "eccesso" : "deficit";
    avviso = `⚠️ ${Math.abs(Math.round(deltaKcal))} kcal di ${tipo} dai pasti consumati o saltati: i pasti restanti non bastano ad assorbire la differenza.`;
  }

  // Distribuzione secondo il peso combinato grammi+calorie
  const adattato = { ...macroBase };
  let sommaW = 0;
  const pesi = {};
  for (const mk of nonConsumati) {
    const base = macroBase[mk] || {kcal:0,p:0,c:0,g:0};
    const shareKcal = kcalTot > 0 ? (base.kcal||0) / kcalTot : 0;
    const shareGram = (usaPeso && gramTot > 0) ? (pesoBase[mk]||0) / gramTot : shareKcal;
    const w = usaPeso ? (shareKcal + shareGram) / 2 : shareKcal;
    pesi[mk] = w;
    sommaW += w;
  }
  // Normalizza (per sicurezza: se gramTot=0 su qualche pasto, Σw può ≠ 1)
  if (sommaW <= 0) sommaW = 1;
  for (const mk of nonConsumati) {
    const base = macroBase[mk] || {kcal:0,p:0,c:0,g:0};
    const quota = pesi[mk] / sommaW; // quota normalizzata del delta
    adattato[mk] = {
      kcal: Math.max(0, Math.round(base.kcal - deltaKcal * quota)),
      p:    Math.max(0, Math.round((base.p    - deltaP    * quota) * 10) / 10),
      c:    Math.max(0, Math.round((base.c    - deltaC    * quota) * 10) / 10),
      g:    Math.max(0, Math.round((base.g    - deltaG    * quota) * 10) / 10),
      _adattato: true,  // flag per evidenziare visivamente nella MealCard
    };
  }

  return { adattato, delta: deltaKcal, avviso };
}

// ═══════════════════════════════════════════════════════════════════
// AUTO-FLAG "SALTATO" — il sistema deduce i pasti non consumati
// ═══════════════════════════════════════════════════════════════════
// Oltre al flag manuale (pulsante ✗), un pasto IN ATTESA viene marcato
// saltato automaticamente quando c'è EVIDENZA che è stato saltato:
//   regola A · un pasto SUCCESSIVO nella giornata risulta consumato
//              → quelli prima ancora in attesa sono stati saltati
//   regola B · è passata la fascia oraria del pasto (solo per OGGI:
//              now > MEAL_FASCIA[mk].fine)
// Le voci auto portano _auto:true, per distinguerle dalle scelte manuali:
// un tap esplicito dell'utente (consumato o saltato) NON viene mai
// sovrascritto. La funzione è pura e idempotente: se la condizione che
// aveva generato un auto-saltato non vale più, la voce auto viene rimossa
// (ritorno in attesa), così il sistema si auto-corregge.
//
// Ritorna { dayLog, changed }. Non muta l'input.
export function autoFlagSaltati(MEAL_KEYS, MEAL_FASCIA, dayLog, { isOggi = false, nowH = 0 } = {}) {
  // ── BLOCCO AUTO-FLAG SALTATI ─────────────────────────────────────
  // Con RICALCOLO_AUTO.saltati=false nessun pasto viene marcato saltato
  // automaticamente: conta solo il tap manuale ✗ (gestito altrove).
  if (!RICALCOLO_AUTO.saltati) {
    return { dayLog, changed: false };
  }
  const out = { ...(dayLog || {}) };
  let changed = false;

  // Indice dell'ultimo pasto consumato (per la regola A)
  let lastConsumedIdx = -1;
  MEAL_KEYS.forEach((mk, i) => { if (out[mk]?.consumed) lastConsumedIdx = i; });

  MEAL_KEYS.forEach((mk, i) => {
    const cur = out[mk];
    // Non toccare le scelte manuali (consumato, o saltato non-auto)
    if (cur?.consumed) return;
    if (cur?.saltato && !cur._auto) return;

    const isAuto = !!(cur?.saltato && cur._auto);
    const isPending = !cur || (!cur.consumed && !cur.saltato);
    if (!isAuto && !isPending) return;

    // Deve essere saltato?
    const regolaA = i < lastConsumedIdx;                       // c'è un consumato dopo
    const fine = MEAL_FASCIA[mk]?.fine ?? Infinity;
    const regolaB = isOggi && nowH > fine;                     // fascia oraria scaduta oggi
    const deveSaltare = regolaA || regolaB;

    if (deveSaltare && !isAuto) {
      out[mk] = { ...(cur || {}), consumed: false, saltato: true, _auto: true };
      changed = true;
    } else if (!deveSaltare && isAuto) {
      // condizione non più valida → torna in attesa
      delete out[mk];
      changed = true;
    }
  });

  return { dayLog: changed ? out : dayLog, changed };
}

// ═══════════════════════════════════════════════════════════════════
// STATISTICHE DI COMPORTAMENTO — lettura, non stato separato
// ═══════════════════════════════════════════════════════════════════
// Il registro pasti (mealsLog) È già la traccia di come si comporta
// l'utente. Questa funzione lo scorre e restituisce, per ogni pasto,
// quante volte è stato consumato / saltato (a mano o auto) negli ultimi
// `giorni` giorni di log presenti per quel profilo. È il bacino che la
// logica notifiche userà in futuro (es. spuntino saltato sistematicamente
// → smorza o sposta quella push).
//   personaLog = mealsLog[personaId] = { "dd/mm/yyyy": { mealKey:{...} } }
export function statsComportamento(MEAL_KEYS, personaLog, giorni = 14) {
  const stats = {};
  for (const mk of MEAL_KEYS) stats[mk] = { consumati: 0, saltatiManuali: 0, saltatiAuto: 0, totale: 0 };
  const date = Object.keys(personaLog || {}).sort().slice(-giorni);
  for (const d of date) {
    const day = personaLog[d] || {};
    for (const mk of MEAL_KEYS) {
      const e = day[mk];
      if (!e) continue;
      if (e.consumed) { stats[mk].consumati++; stats[mk].totale++; }
      else if (e.saltato) {
        if (e._auto) stats[mk].saltatiAuto++; else stats[mk].saltatiManuali++;
        stats[mk].totale++;
      }
    }
  }
  // tasso di salto (0..1) su quante volte il pasto ha avuto un esito
  for (const mk of MEAL_KEYS) {
    const s = stats[mk];
    s.tassoSalto = s.totale > 0 ? (s.saltatiManuali + s.saltatiAuto) / s.totale : 0;
  }
  return stats;
}

export function encodeSeed(seed, overrides) {
  const hasOverrides = overrides && Object.keys(overrides).length > 0;
  if (!hasOverrides) return String(seed);
  try {
    const ovStr = btoa(unescape(encodeURIComponent(JSON.stringify(overrides))));
    return `${seed}|OV:${ovStr}`;
  } catch { return String(seed); }
}

export function decodeSeed(raw) {
  const s = raw.trim();
  if (!s.includes("|OV:")) {
    const n = parseInt(s, 10);
    return isNaN(n) || n <= 0 ? null : { seed: n, overrides: {} };
  }
  try {
    const [seedPart, ovPart] = s.split("|OV:");
    const seed = parseInt(seedPart, 10);
    if (isNaN(seed) || seed <= 0) return null;
    const overrides = JSON.parse(decodeURIComponent(escape(atob(ovPart))));
    return { seed, overrides };
  } catch { return null; }
}

// ─── SeedSyncSection ─────────────────────────────────────────────────

export function scheduleNotifications(notifSettings, todayPlan, personas, myPersonaId) {
  if (!notifSettings||!notifSettings.enabled){navigator.serviceWorker?.controller?.postMessage({type:"CANCEL_NOTIFICATIONS"});return;}
  if (!("Notification" in window)||Notification.permission!=="granted") return;
  const now=new Date();
  const meals=MEAL_KEYS.map(mk=>{const cfg=notifSettings.meals[mk];if(!cfg||!cfg.active)return null;const fireTime=new Date();fireTime.setHours(cfg.hour,cfg.minute,0,0);const meal=todayPlan&&todayPlan[mk];return{mealKey:mk,label:MEAL_META[mk]?.label||mk,ricetta:meal?meal.nome:"È il momento di mangiare!",delayMs:fireTime.getTime()-now.getTime()};}).filter(Boolean);
  navigator.serviceWorker?.controller?.postMessage({type:"SCHEDULE_NOTIFICATIONS",meals});
}


// ── Precalcolo macro di ogni ricetta (uomoCalc/donnaCalc/bimboCalc) ──
// Ripristina l'istruzione di inizializzazione del file originale: serve
// al bilanciamento dei pasti. Gira una volta all'import del modulo.
Object.values(DB).flat().forEach(r => {
  r.uomoCalc  = macroRicettaCalc(r.id, "uomo");
  r.donnaCalc = macroRicettaCalc(r.id, "donna");
  r.bimboCalc = macroRicettaCalc(r.id, "bimbo");
});
