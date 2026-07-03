// Test: eco del log pasti — la race osservata sul telefono (03/07).
//
// Timeline del bug: l'utente salta la COLAZIONE (push schedulato), poi
// ~1.5s dopo salta lo SPUNTINO (solo locale). L'eco realtime del push
// della colazione innescava un pullMealsLog che sovrascriveva il blob
// locale con lo stato cloud PRIVO dello spuntino → l'azione veniva
// "smarcata" sotto le dita (4 tentativi in 5 secondi nel log reale).
//
// Il fix replica la difesa del piano: pull rinviato se c'è un push del
// log schedulato o in volo (lock tenuto oltre il push per coprire l'eco),
// e risposta scartata se il locale è cambiato mentre il fetch era in volo.
// Qui simuliamo la macchina a stati con la stessa semantica del codice
// (pattern dei test di logica sync: G/H in test_sync_logic).

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };

// ── Modello minimale di device + cloud con la logica del fix ─────────
function creaMondo() {
  const cloud = { log: {} };                       // profilo_dati (un profilo)
  const dev = {
    locale: {},          // log pasti locale { mealKey: {saltato:true} }
    dirty: 0,            // mealsLogDirty
    lock: false,         // mealsLogLock
    pushPending: false,  // timers.__pushLog
    retryProgrammato: false,
    eventi: [],
  };

  // Scrittura locale (tap dell'utente) → come hookStorage
  const tap = (mealKey) => {
    dev.locale[mealKey] = { saltato: true };
    dev.dirty++;
    dev.pushPending = true;
    dev.eventi.push(`tap:${mealKey}`);
  };

  // Esecuzione del push schedulato (timer 900ms scaduto)
  const eseguiPush = () => {
    dev.pushPending = false;
    dev.lock = true;                               // lock durante push + finestra eco
    cloud.log = JSON.parse(JSON.stringify(dev.locale));
    dev.eventi.push("push");
  };
  const rilasciaLock = () => { dev.lock = false; dev.eventi.push("lock-release"); };

  // pullMealsLog con la logica del fix. `tapDuranteFetch` simula una
  // scrittura locale arrivata mentre la risposta era in volo.
  const pull = ({ tapDuranteFetch = null } = {}) => {
    if (dev.lock || dev.pushPending) {             // ── rinvio
      dev.retryProgrammato = true;
      dev.eventi.push("pull:rinviato");
      return "rinviato";
    }
    const dirtyAlFetch = dev.dirty;
    const risposta = JSON.parse(JSON.stringify(cloud.log)); // fetch parte ORA
    if (tapDuranteFetch) tap(tapDuranteFetch);              // tap in volo
    if (dirtyAlFetch !== dev.dirty || dev.lock || dev.pushPending) {  // ── scarto
      dev.retryProgrammato = true;
      dev.eventi.push("pull:scartato");
      return "scartato";
    }
    dev.locale = risposta;                          // ── applica (sovrascrive)
    dev.eventi.push("pull:applicato");
    return "applicato";
  };

  return { cloud, dev, tap, eseguiPush, rilasciaLock, pull };
}

// ── Caso 1: la timeline ESATTA del bug — con il fix la 2ª azione vive ──
{
  const m = creaMondo();
  m.tap("colazione");                 // t0: salto colazione (push schedulato)
  m.eseguiPush();                     // t0+900: push1 (cloud = {colazione})
  m.tap("spuntino_m");                // t0+1500: salto spuntino (locale, push2 pendente)
  const esito = m.pull();             // t0+1700: ECO del push1
  ok(esito !== "applicato", `eco del push1 non applicato (esito: ${esito})`);
  ok(m.dev.locale.spuntino_m?.saltato === true, "lo spuntino resta saltato dopo l'eco");
  ok(m.dev.retryProgrammato, "retry differito programmato (i delta remoti non vanno persi)");
  // il giro si chiude: push2 + rilascio lock, il retry ora può applicare
  m.eseguiPush(); m.rilasciaLock();
  const esito2 = m.pull();
  ok(esito2 === "applicato", "a push completato il pull torna ad applicare");
  ok(m.dev.locale.colazione?.saltato && m.dev.locale.spuntino_m?.saltato,
     "stato finale: ENTRAMBE le azioni presenti (prima ne spariva una)");
}

// ── Caso 2 (controprova): senza la difesa, l'eco cancellava l'azione ──
{
  const m = creaMondo();
  m.tap("colazione"); m.eseguiPush(); m.rilasciaLock();  // niente lock attivo
  m.tap("spuntino_m");
  // vecchio comportamento = applicare sempre: simulo bypassando le guardie
  m.dev.pushPending = false;                        // (il vecchio codice non guardava nulla)
  const rispostaStantia = JSON.parse(JSON.stringify(m.cloud.log));
  m.dev.locale = rispostaStantia;                   // sovrascrittura cieca
  ok(m.dev.locale.spuntino_m === undefined,
     "controprova: il vecchio comportamento cancellava davvero lo spuntino");
}

// ── Caso 3: tap mentre il fetch è in volo → risposta stantia scartata ──
{
  const m = creaMondo();
  m.tap("colazione"); m.eseguiPush(); m.rilasciaLock();
  const esito = m.pull({ tapDuranteFetch: "cena" }); // tap arriva a fetch partito
  ok(esito === "scartato", `risposta stantia scartata (esito: ${esito})`);
  ok(m.dev.locale.cena?.saltato === true, "il tap in volo sopravvive");
}

// ── Caso 4 (regressione): nessuna attività locale → il pull applica ──
{
  const m = creaMondo();
  m.cloud.log = { pranzo: { saltato: true } };      // modifica di un ALTRO device
  const esito = m.pull();
  ok(esito === "applicato", "senza push locali in corso il pull applica normalmente");
  ok(m.dev.locale.pranzo?.saltato === true, "il delta remoto arriva");
}

if (fail) { console.log(`\nTEST ECO LOG PASTI: ${fail} FALLITI`); process.exit(1); }
console.log("\nTEST ECO LOG PASTI: TUTTO OK");
