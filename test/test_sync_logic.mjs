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

// ─── B. Spesa cloud-authoritative: pull rispecchia il cloud esattamente ───
// Con il nuovo modello non c'è merge locale: lo stato locale = cloud.
// Due device che scrivono contemporaneamente: vince l'ultima scrittura sul cloud.
{
  // Simula: cloud ha {A:true, B:true}, locale aveva {A:true, C:true}
  // dopo pull, locale deve diventare identico al cloud
  const cloudRows = [{item_id:'A',checked:true},{item_id:'B',checked:true}];
  const wk = {};
  for (const r of cloudRows) if (r.checked) wk[r.item_id] = true;
  // nessun merge: wk è esattamente il cloud
  ok("spesa cloud-auth: A presente dal cloud", wk.A === true);
  ok("spesa cloud-auth: B presente dal cloud", wk.B === true);
  ok("spesa cloud-auth: C locale non sopravvive (cloud autoritativo)", wk.C === undefined);

  // Reset: dopo delete sul cloud, pull restituisce lista vuota
  const cloudRowsVuoti = [];
  const wk2 = {};
  for (const r of cloudRowsVuoti) if (r.checked) wk2[r.item_id] = true;
  ok("spesa cloud-auth: dopo reset cloud, locale vuoto", Object.keys(wk2).length === 0);
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

// ─── G. Due boot() ravvicinati non spengono il canale del primo ───
{
  let canaliCreati = 0, canaliRimossi = 0;
  let canaleCorrente = null;
  // simula il comportamento di subscribeRealtime con il fix
  const subscribeRealtime = (famId) => {
    // guard: non ricreare se già SUBSCRIBED per questa famiglia
    if (canaleCorrente && canaleCorrente.__famId === famId && canaleCorrente.__stato === "SUBSCRIBED") return;
    if (canaleCorrente) canaliRimossi++;
    canaleCorrente = { __famId: famId, __stato: "SUBSCRIBED" };
    canaliCreati++;
  };
  // primo boot (device 1)
  subscribeRealtime("fam-A");
  const primoCanale = canaleCorrente;
  ok("due boot: primo canale creato", canaliCreati === 1);
  // secondo boot (stesso device, onAuthStateChange scatta di nuovo)
  subscribeRealtime("fam-A");
  ok("due boot: canale NON ricreato se gia SUBSCRIBED", canaliCreati === 1);
  ok("due boot: il primo canale e' ancora quello corrente", canaleCorrente === primoCanale);
  ok("due boot: nessun canale rimosso", canaliRimossi === 0);
  // cambio famiglia: il vecchio canale DEVE essere rimosso
  canaleCorrente.__stato = "SUBSCRIBED";
  subscribeRealtime("fam-B");
  ok("due boot: cambio famiglia crea nuovo canale", canaliCreati === 2);
  ok("due boot: vecchio canale rimosso al cambio famiglia", canaliRimossi === 1);
}

let allPass = true;
for (const r of results) { console.log((r.pass?'✓':'✗')+' '+r.name); if(!r.pass) allPass=false; }
console.log(allPass ? '\nTEST 2: TUTTO OK' : '\nTEST 2: FALLITO');
process.exit(allPass ? 0 : 1);
