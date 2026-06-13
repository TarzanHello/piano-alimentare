// TEST 2 — Logica di sincronizzazione: riproduce gli scenari che ci
// hanno fatto penare e verifica che non regrediscano.

const results = [];
const ok = (name, cond) => { results.push({ name, pass: !!cond }); };

// ─── A. Contatore "applying" regge applicazioni annidate ───
// (col vecchio Set, dopo il 2° pull la chiave risultava già libera → bug)
{
  let applying = {};
  const add = k => applying[k] = (applying[k]||0)+1;
  const del = k => applying[k] = Math.max(0,(applying[k]||1)-1);
  const busy = k => applying[k] > 0;
  add('S'); add('S');           // due pull annidati
  del('S');                     // il 2° finisce
  const stillBusy = busy('S');  // il 1° è ancora in corso
  del('S');                     // il 1° finisce
  ok('contatore applying: resta occupato finché il pull esterno non finisce', stillBusy === true);
  ok('contatore applying: libero solo a fine di tutti i pull', busy('S') === false);
}

// ─── B. Merge spesa con timestamp: select/deselect concorrenti ───
// Riproduce: A seleziona, B deseleziona quasi in contemporanea.
// Vince chi ha il timestamp piu recente; dopo 5s il server e autorevole.
{
  const mergePull = (serverRows, pending) => {
    const ora = Date.now();
    const wk = {};
    for (const r of serverRows) if (r.checked) wk[r.item_id] = true;
    for (const [id, p] of Object.entries(pending)) {
      const fresco = (ora - (p.ts || 0)) < 5000;
      if (fresco) { if (p.checked) wk[id] = true; else delete wk[id]; }
    }
    return wk;
  };
  const mk = (checked) => ({ checked, ts: Date.now() });
  const mkVecchio = (checked) => ({ checked, ts: Date.now() - 6000 });

  let local;
  local = mergePull([], { pane: mk(true) });
  ok('spesa: selezione fresca vince su server vuoto', local.pane === true);
  local = mergePull([{item_id:'pane',checked:true}], { pane: mk(false) });
  ok('spesa: deselezione fresca vince su server spuntato', local.pane === undefined);
  local = mergePull([], { pane: mkVecchio(true) });
  ok('spesa: pending vecchio ignorato, server vince', local.pane === undefined);
  local = mergePull([], { A: mk(true), B: mk(true), C: mk(true) });
  ok('spesa: selezioni multiple tutte presenti', local.A && local.B && local.C);
}

// ─── C. Anti-eco: non ripusha un valore appena ricevuto dal cloud ───
{
  let lastJson = {}, pushed = [];
  const applying = {};
  const hookSet = (key, value, isRemote) => {
    if (isRemote) { applying[key] = (applying[key]||0)+1; lastJson[key] = value; applying[key]--; return; }
    if (!(applying[key] > 0) && lastJson[key] !== value) { lastJson[key] = value; pushed.push(key); }
  };
  hookSet('spesa', '{"A":true}', true);   // arriva dal cloud
  hookSet('spesa', '{"A":true}', false);  // l'app risalva lo stesso valore
  ok('anti-eco: stesso valore non viene ripushato', pushed.length === 0);
  hookSet('spesa', '{"A":true,"B":true}', false); // modifica reale locale
  ok('anti-eco: modifica reale viene pushata', pushed.length === 1);
}

// ─── D. Last-write-wins per timestamp ───
{
  const resolve = (a, b) => (a.updated_at >= b.updated_at ? a : b);
  const vincente = resolve({ val:'vecchio', updated_at:100 }, { val:'nuovo', updated_at:200 });
  ok('last-write-wins: vince la modifica più recente', vincente.val === 'nuovo');
}

// ─── E. Anti-loop del piano: ricevere un piano non lo fa ripushare ───
// Riproduce il "ping-pong": A pusha seed X, B lo riceve; B NON deve
// rispedire X (altrimenti i due device si rimbalzano il seed all'infinito).
{
  let lastPianoSync = null;
  let pushCount = 0;
  // simula pushPiano col guard
  const pushPiano = (seed, overrides) => {
    const firma = JSON.stringify({ seed:String(seed), overrides });
    if (firma === lastPianoSync) return;       // guard
    lastPianoSync = firma;
    pushCount++;
  };
  // simula la ricezione dal cloud (registra la firma)
  const receivePiano = (seed, overrides) => {
    lastPianoSync = JSON.stringify({ seed:String(seed), overrides });
  };
  // A pusha X
  pushPiano('X', {});
  ok('anti-loop: il primo push del piano avviene', pushCount === 1);
  // B riceve X, poi il suo storage cambia e schedula un push di X
  receivePiano('X', {});
  pushPiano('X', {});
  ok('anti-loop: ricevuto X, B non lo rimbalza', pushCount === 1);
  // un piano DIVERSO invece viene pushato
  pushPiano('Y', {});
  ok('anti-loop: un piano nuovo viene comunque pushato', pushCount === 2);
}

// ─── F. Reconcile non sovrascrive piano locale con push pendente ───
// Riproduce il bug: telefono genera piano Y, reconcile parte prima del
// debounce (900ms), pull del cloud porta il vecchio X → ping-pong.
{
  let cloudPiano = { seed: "178369590193", overrides: {} };
  let localSeed = "178369590193";
  let timersMap = {};

  // simula schedulePush con lock
  const schedulePush = (key) => {
    clearTimeout(timersMap[key]);
    timersMap[key] = setTimeout(() => { delete timersMap[key]; }, 2000);
  };

  // il telefono genera un nuovo piano
  localSeed = "99999";
  schedulePush("pf-seed"); // debounce: push non ancora partito

  // reconcile parte prima del push
  const pianoPendente = !!timersMap["pf-seed"];
  let pullEseguito = false;
  if (!pianoPendente) {
    // pull dal cloud: overriderebbe con "178369590193"
    localSeed = cloudPiano.seed;
    pullEseguito = true;
  }

  ok('reconcile con push pendente: NON fa pull del piano', !pullEseguito);
  ok('reconcile con push pendente: seed locale resta quello nuovo', localSeed === "99999");
}

let allPass = true;
for (const r of results) { console.log((r.pass?'✓':'✗')+' '+r.name); if(!r.pass) allPass=false; }
console.log(allPass ? '\nTEST 2: TUTTO OK' : '\nTEST 2: FALLITO');
process.exit(allPass ? 0 : 1);
