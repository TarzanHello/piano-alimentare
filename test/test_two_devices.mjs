// TEST 3 ? Due device sul medesimo finto cloud: accoppiamento famiglia,
// propagazione delle scritture via Realtime, uscita dalla famiglia.
// ? il test end-to-end che mancava e che avrebbe colto i bug di oggi.
import { makeFakeCloud } from './harness.mjs';

const results = [];
const ok = (name, cond) => { results.push({ name, pass: !!cond }); };

const cloud = makeFakeCloud();

// Utente A e Utente B (account Google diversi)
const userA = { id: 'uidA', email: 'a@test.it' };
const userB = { id: 'uidB', email: 'b@test.it' };

// helper: imposta la sessione "attiva" sul cloud per simulare il device corrente
const as = (u) => { cloud.__session = u ? { user: u } : null; };

// 1. Ciascun utente crea il proprio profilo (come fa ensureMyProfile)
as(userA);
await cloud.from('profili').insert({ id:'profA', user_id:userA.id, nome:'Aureliano', famiglia_id:null });
as(userB);
await cloud.from('profili').insert({ id:'profB', user_id:userB.id, nome:'Federica', famiglia_id:null });
ok('due profili registrati creati', cloud.__tables.profili.length === 2);

// 2. A crea la famiglia
as(userA);
const cre = await cloud.rpc('create_family', { p_nome:'Pallette' });
ok('A crea la famiglia', !cre.error && cre.data?.invite_code);
const code = cre.data.invite_code;
const profA = cloud.__tables.profili.find(p=>p.id==='profA');
ok('A ? in famiglia dopo create', !!profA.famiglia_id);

// 3. A non pu? creare una seconda famiglia (anti-doppione)
const cre2 = await cloud.rpc('create_family', { p_nome:'Doppia' });
ok('create rifiutato se gi? in famiglia', !!cre2.error);

// 4. B entra col codice
as(userB);
const join = await cloud.rpc('join_family', { p_code: code });
ok('B entra in famiglia col codice', !join.error);
const profB = cloud.__tables.profili.find(p=>p.id==='profB');
ok('A e B nella STESSA famiglia', profA.famiglia_id && profA.famiglia_id === profB.famiglia_id);

// 5. B con codice sbagliato fallisce
//    (prima deve uscire, altrimenti "gi? in famiglia")
await cloud.rpc('leave_family');
const joinBad = await cloud.rpc('join_family', { p_code: 'CODE-INESISTENTE' });
ok('codice errato ? errore', !!joinBad.error);
// rientra con quello giusto
await cloud.rpc('join_family', { p_code: code });

// 6. PROPAGAZIONE: A scrive una spunta spesa, il device B (sottoscritto) la riceve
const famId = profA.famiglia_id;
let bNotificato = false;
const chB = cloud.channel('fam-sync-B')
  .on('postgres_changes', { event:'*', schema:'public', table:'famiglia_spesa' }, () => { bNotificato = true; })
  .subscribe();
as(userA);
await cloud.from('famiglia_spesa').upsert(
  { famiglia_id:famId, settimana:'123', item_id:'pane', checked:true },
  { onConflict:'famiglia_id,settimana,item_id' });
await new Promise(r=>setTimeout(r,20));
ok('Realtime: scrittura di A notifica il device B', bNotificato === true);

// 7. B legge la spesa e vede l'articolo di A
const spesaB = (await cloud.from('famiglia_spesa').select().eq('famiglia_id',famId).eq('settimana','123').then(r=>r)).data;
ok('B vede la spunta scritta da A', spesaB.some(r=>r.item_id==='pane'&&r.checked));

// 8. Uscita dalla famiglia: B esce, A resta
as(userB);
await cloud.rpc('leave_family');
const profB2 = cloud.__tables.profili.find(p=>p.id==='profB');
ok('B esce dalla famiglia', profB2.famiglia_id === null);
ok('A resta in famiglia', cloud.__tables.profili.find(p=>p.id==='profA').famiglia_id === famId);

cloud.removeChannel(chB);

// 9. Verifica statica: subscribeRealtime usa filter esplicito per famiglia_id
import { readFileSync } from "fs";
const syncSrc = readFileSync("src/db/sync.js", "utf8");
ok("filtro famiglia_id esplicito nel Realtime", syncSrc.includes("famFilter") && syncSrc.includes("filter: famFilter"));

let allPass = true;
for (const r of results) {
  console.log((r.pass ? 'OK' : 'FAIL') + ' ' + r.name);
  if (!r.pass) allPass = false;
}
if (allPass) console.log('TEST 3: TUTTO OK'); else console.log('TEST 3: FALLITO');
process.exit(allPass ? 0 : 1);
