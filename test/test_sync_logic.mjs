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

// ─── B. Merge spesa: gli echi non cancellano le spunte locali ───
// Riproduce: spunto A, B, C mentre arrivano echi col cloud non aggiornato.
{
  const mergePull = (serverRows, pending) => {
    const wk = {}; for (const r of serverRows) if (r.checked) wk[r.item_id] = true;
    for (const id of Object.keys(pending)) { if (pending[id]) wk[id]=true; else delete wk[id]; }
    return wk;
  };
  let pending = {}, local = {};
  pending['A'] = true; local = mergePull([], pending);                          // eco: server vuoto
  ok('spesa: dopo A, A resta', local.A === true);
  pending['B'] = true; local = mergePull([{item_id:'A',checked:true}], pending); // eco: server={A}
  ok('spesa: dopo B, A e B restano', local.A && local.B);
  pending['C'] = true; local = mergePull([{item_id:'A',checked:true},{item_id:'B',checked:true}], pending);
  ok('spesa: dopo C, A B C tutti presenti', local.A && local.B && local.C);
  // una deselezione in volo vince sull'eco che ancora lo dà spuntato
  pending['A'] = false; local = mergePull([{item_id:'A',checked:true},{item_id:'B',checked:true},{item_id:'C',checked:true}], pending);
  ok('spesa: deselezione in volo vince sull\'eco', !local.A && local.B && local.C);
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

let allPass = true;
for (const r of results) { console.log((r.pass?'✓':'✗')+' '+r.name); if(!r.pass) allPass=false; }
console.log(allPass ? '\nTEST 2: TUTTO OK' : '\nTEST 2: FALLITO');
process.exit(allPass ? 0 : 1);
