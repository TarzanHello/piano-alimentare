// ── Motore di sincronizzazione v2 ────────────────────────────
// Architettura semplificata con lock piano esplicito.
// Regola unica: chi ha scritto per ultimo sul cloud ha ragione.

import { SK_EXCL, SK_MEALS_LOG, SK_MISURE, SK_MY_PERSONA, SK_OVERRIDES,
         SK_PERSONAS, SK_PREFS, SK_SEED, SK_SPESA, SK_TARGET_GIORNALIERO } from '@/core/constants';
import { calcTargetAdattivo } from '@/core/engine';
import { dataNascitaToEta, etaToDataNascita, getSession, supabase } from './cloud';
import { logSync } from './synclog';
import { pullCustomIngredients } from './customIngredients';

const SK_CLOUD_ME = "pf-cloud-me";

let started   = false;
let me        = null;
let channel   = null;
let timers    = {};
let pianoLock = false;   // true mentre un push piano è in corso
// Seed dell'ultimo piano che QUESTO dispositivo ha scritto sul cloud.
// Serve a scartare gli echi realtime "vecchi": un pull che riporta un
// seed più vecchio di quello appena pushato verrebbe altrimenti applicato,
// annullando la modifica locale appena fatta (bug osservato: il device
// rigenera il piano, lo pusha, e 250ms dopo un evento in coda glielo
// riscarica al valore precedente). Confronto numerico: il seed È un
// timestamp Date.now(), quindi monotòno crescente.
let lastPushedPianoSeed = 0;
// pendingSpesa rimosso: il cloud è authoritative per la spesa
let pullSpesaQueue = Promise.resolve();

// NOTA: window.CustomEvent (non il CustomEvent globale di Node) per restare
// compatibili con eventuali test in jsdom: Node 22+ ha una propria CustomEvent
// nativa, diversa da quella di jsdom, e window.dispatchEvent la rifiuterebbe.
const emit       = (key, detail={}) => window.dispatchEvent(new window.CustomEvent("pf-cloud-update",{detail:{key,...detail}}));
const emitStatus = (s) => window.dispatchEvent(new window.CustomEvent("pf-cloud-status",{detail:s}));

const getLocal    = async (k,fb) => { try { const r=await window.storage.get(k); return JSON.parse(r.value); } catch { return fb; } };
const getLocalRaw = async (k,fb) => { try { const r=await window.storage.get(k); return r.value; } catch { return fb; } };

if (!window.__syncApplying) window.__syncApplying = {};
const setLocalQuiet = async (k,v) => {
  window.__syncApplying[k] = (window.__syncApplying[k]||0)+1;
  try { await window.storage.set(k,v); }
  finally { window.__syncApplying[k] = Math.max(0,(window.__syncApplying[k]||1)-1); }
};
const isApplying = (k) => (window.__syncApplying?.[k]||0)>0;

const dataIT2ISO = (s) => { const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s||"").trim()); return m?`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`:null; };
const dataISO2IT = (s) => { const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||""); return m?`${m[3]}/${m[2]}/${m[1]}`:s; };

export const getCloudMe = () => me;

function profiloToPersona(p) {
  return {id:p.id,nome:p.nome,sesso:p.sesso,eta:dataNascitaToEta(p.data_nascita)??30,
    dataNascita:p.data_nascita||null,peso:p.peso!=null?+p.peso:70,altezza:p.altezza!=null?+p.altezza:170,
    lavoro:p.lavoro||"sedentario",allenamenti:p.allenamenti??3,obiettivo:p.obiettivo||"mantenimento",
    dietaIntensita:p.dieta_intensita??null,
    pesoTarget:p.peso_target!=null?+p.peso_target:null,
    color:p.color||"#18A957",_uid:p.user_id||null,_gestito:!p.user_id,_gestitoDa:p.gestito_da||null};
}
function personaToProfilo(p) {
  return {nome:p.nome,sesso:p.sesso==="F"?"F":"M",data_nascita:p.dataNascita||etaToDataNascita(p.eta),
    peso:p.peso??null,altezza:p.altezza??null,lavoro:p.lavoro||"sedentario",
    allenamenti:p.allenamenti??3,obiettivo:p.obiettivo||"mantenimento",color:p.color||"#18A957",
    dieta_intensita:p.dietaIntensita??null,
    peso_target:p.pesoTarget??null};
}
const editable = (p) => !p._uid || p.id===me?.profiloId;

// === PULL ===

async function pullProfili() {
  const {data,error}=await supabase.from("profili").select("*").eq("famiglia_id",me.famigliaId).order("created_at");
  if (error||!data) { if(error) logSync("error","Pull profili: errore",{error:error.message}); return; }
  data.sort((a,b)=>(a.user_id===me.userId?0:a.user_id?1:2)-(b.user_id===me.userId?0:b.user_id?1:2));
  const locali=await getLocal(SK_PERSONAS,[]);
  const byId=Object.fromEntries(locali.map(p=>[p.id,p]));
  const personas=data.map(c=>{
    const locale=byId[c.id]||{};
    const dalCloud=profiloToPersona(c);
    // Non lasciare che un cloud "dieta_intensita: null" (riga non ancora
    // aggiornata, o colonna non visibile per cache schema PostgREST non
    // ricaricata dopo l'ALTER TABLE) azzeri un valore impostato in locale:
    // finché il cloud non riporta un numero, manteniamo quello locale —
    // verrà ripropagato dal prossimo push.
    if (dalCloud.dietaIntensita===null && locale.dietaIntensita!=null) {
      dalCloud.dietaIntensita=locale.dietaIntensita;
    }
    return {...locale,...dalCloud};
  });
  const soloLocali=await getLocal("pf-local-only",[]);
  for (const p of locali) if (soloLocali.includes(p.id)&&!personas.some(x=>x.id===p.id)) personas.push(p);
  await setLocalQuiet(SK_PERSONAS,JSON.stringify(personas));
  logSync("pull","Profili aggiornati dal cloud",{n:personas.length});
  emit("personas");
}

async function pullMisure() {
  const {data,error}=await supabase.from("misure").select("*");
  if (error||!data) { if(error) logSync("error","Pull misure: errore",{error:error.message}); return; }
  const misureApp={};
  for (const r of data) (misureApp[r.profilo_id]=misureApp[r.profilo_id]||[]).push({...r.valori,date:r.valori?.date||dataISO2IT(r.data)});
  for (const pid of Object.keys(misureApp)) misureApp[pid].sort((a,b)=>(dataIT2ISO(a.date)||"").localeCompare(dataIT2ISO(b.date)||""));
  const locale=await getLocal(SK_MISURE,{});
  for (const k of Object.keys(locale)) if (!misureApp[k]) misureApp[k]=locale[k];
  await setLocalQuiet(SK_MISURE,JSON.stringify(misureApp));
  logSync("pull","Misure aggiornate dal cloud",{profili:Object.keys(misureApp).length,righe:data.length});
  emit("misure");
}

async function pullMealsLog() {
  const {data,error}=await supabase.from("profilo_dati").select("*").eq("chiave","meals_log");
  if (error||!data) { if(error) logSync("error","Pull log pasti: errore",{error:error.message}); return; }
  const log=await getLocal(SK_MEALS_LOG,{});
  for (const r of data) log[r.profilo_id]=r.valore||{};
  await setLocalQuiet(SK_MEALS_LOG,JSON.stringify(log));
  logSync("pull","Log pasti aggiornato dal cloud",{profili:data.length});
  emit("mealsLog");
}

// Legge i target giornalieri pushati dai rispettivi owner e li salva in cache
// locale indicizzata per profilo_id. Emette "targetGiornaliero" per aggiornare
// l'App senza ricalcolo locale.
async function pullTargetGiornaliero() {
  const {data,error}=await supabase.from("profilo_dati").select("*").eq("chiave","target_giornaliero");
  if (error||!data) { if(error) logSync("error","Pull target giornaliero: errore",{error:error.message}); return; }
  const cache=await getLocal(SK_TARGET_GIORNALIERO,{});
  for (const r of data) if (r.valore) cache[r.profilo_id]=r.valore;
  await setLocalQuiet(SK_TARGET_GIORNALIERO,JSON.stringify(cache));
  logSync("pull","Target giornalieri aggiornati dal cloud",{profili:data.length});
  emit("targetGiornaliero");
}

// Push il target calcolato dall'owner su profilo_dati. Chiamato solo per le
// persone editabili (il proprietario del profilo). Il target è la fonte di
// verità per tutti gli altri dispositivi: sovrascrive il ricalcolo locale,
// eliminando la finestra di disallineamento durante i drag in-flight.
// Guard anti-loop: ricorda l'ultimo valore di target pushato sul cloud per ogni profilo.
// Se il valore non è cambiato rispetto all'ultimo push andato a buon fine, non ripusha.
const lastPushedTarget = {};  // { [profilo_id]: { kcal, p, c, g, tdeeFinale } }

export async function pushTargetGiornaliero(persona, targetObj) {
  if (!supabase||!me) return;
  if (!editable(persona)) return;
  if (!targetObj||!targetObj.kcal) return;
  // Guard anti-loop a due livelli:
  // 1. Confronto con il valore in cache locale (evita write storage ridondanti)
  // 2. Confronto con l'ultimo push cloud andato a buon fine (evita round-trip cloud)
  const cache=await getLocal(SK_TARGET_GIORNALIERO,{});
  const prev=cache[persona.id];
  const sig = `${targetObj.kcal}|${targetObj.p}|${targetObj.c}|${targetObj.g}|${targetObj.tdeeFinale}`;
  const changed = !prev || prev.kcal!==targetObj.kcal || prev.p!==targetObj.p ||
                  prev.c!==targetObj.c || prev.g!==targetObj.g || prev.tdeeFinale!==targetObj.tdeeFinale;
  const alreadyPushed = lastPushedTarget[persona.id] === sig;
  cache[persona.id]=targetObj;
  await setLocalQuiet(SK_TARGET_GIORNALIERO,JSON.stringify(cache));
  emit("targetGiornaliero");
  // Non pusha se il valore è identico all'ultimo push cloud (anti-loop realtime)
  if (!changed || alreadyPushed) return;
  const {error}=await supabase.from("profilo_dati").upsert(
    {profilo_id:persona.id, chiave:"target_giornaliero", valore:targetObj},
    {onConflict:"profilo_id,chiave"}
  );
  if (error) logSync("error","Push target giornaliero: errore",{profilo:persona.id,error:error.message});
  else {
    lastPushedTarget[persona.id] = sig;  // aggiorna guard solo su successo
    logSync("push","Target giornaliero caricato sul cloud",{profilo:persona.id,kcal:targetObj.kcal});
  }
}

// Calcola e pusha il target per tutte le persone editabili (chiamato da hookStorage
// dopo SK_PERSONAS o SK_MISURE, con debounce 1200ms per attendere che i push
// profili/misure abbiano già completato).
async function pushTargetTuttiEditabili() {
  const personas=await getLocal(SK_PERSONAS,[]);
  const misureApp=await getLocal(SK_MISURE,{});
  for (const p of personas) {
    if (!editable(p)) continue;
    try {
      const t=calcTargetAdattivo(p, misureApp[p.id]||[]);
      await pushTargetGiornaliero(p, t);
    } catch {}
  }
}

async function pullPiano() {
  if (pianoLock) {
    logSync("info","Pull piano: rinviato (push piano in corso)");
    clearTimeout(timers.__pullPianoRetry);
    timers.__pullPianoRetry=setTimeout(pullPiano,2500);
    return;
  }
  const {data,error}=await supabase.from("famiglia_dati").select("*")
    .eq("famiglia_id",me.famigliaId).eq("chiave","piano").maybeSingle();
  if (error) { logSync("error","Pull piano: errore",{error:error.message}); return; }
  if (!data?.valore) return;
  const {seed,overrides}=data.valore;
  if (!seed) return;
  const curSeed=await getLocalRaw(SK_SEED,null);
  const curOvr=await getLocalRaw(SK_OVERRIDES,"{}");
  const newOvr=JSON.stringify(overrides||{});
  if (String(seed)===curSeed&&newOvr===curOvr) return;
  // Scarta gli echi "vecchi": se il seed dal cloud è numericamente più
  // vecchio di quello che ho appena pushato (o di quello locale), è un
  // evento realtime in coda che NON deve sovrascrivere la mia modifica.
  // Il seed è un Date.now(): più grande = più recente. Confronto solo se
  // entrambi sono numerici e i seed differiscono (per stesso seed con
  // overrides diversi il confronto non si applica: vince comunque il pull).
  const seedNum = Number(seed);
  if (String(seed) !== curSeed && Number.isFinite(seedNum)) {
    const curSeedNum = Number(curSeed);
    const soglia = Math.max(lastPushedPianoSeed || 0, Number.isFinite(curSeedNum) ? curSeedNum : 0);
    if (soglia && seedNum < soglia) {
      logSync("info","Pull piano: eco vecchio ignorato",{seedCloud:String(seed),seedLocale:curSeed,ultimoPushato:String(lastPushedPianoSeed||"")});
      return;
    }
  }
  if (curSeed&&String(seed)!==curSeed) {
    try {
      const hist=await getLocal("pf-history",[]);
      if (!hist.some(h=>String(h.seed)===curSeed)) {
        hist.unshift({seed:curSeed,date:new Date().toLocaleDateString("it-IT"),label:"Piano precedente"});
        await setLocalQuiet("pf-history",JSON.stringify(hist.slice(0,5)));
        emit("history");
      }
    } catch {}
  }
  await setLocalQuiet(SK_SEED,String(seed));
  await setLocalQuiet(SK_OVERRIDES,newOvr);
  logSync("pull","Piano aggiornato dal cloud",{seed:String(seed),seedPrecedente:curSeed});
  emit("piano",{seed:String(seed),overrides:overrides||{}});
}

async function pullAltriDatiFamiglia() {
  const {data,error}=await supabase.from("famiglia_dati").select("*")
    .eq("famiglia_id",me.famigliaId).in("chiave",["gusti","esclusioni"]);
  if (error||!data) { if(error) logSync("error","Pull gusti/esclusioni: errore",{error:error.message}); return; }
  for (const r of data) {
    if (r.chiave==="gusti")      {await setLocalQuiet(SK_PREFS,JSON.stringify(r.valore||{}));logSync("pull","Preferenze (gusti) aggiornate dal cloud");emit("prefs");}
    if (r.chiave==="esclusioni") {await setLocalQuiet(SK_EXCL,JSON.stringify(r.valore||[]));logSync("pull","Esclusioni aggiornate dal cloud",{n:(r.valore||[]).length});emit("excluded");}
  }
}

// Forza un ricalcolo del piano locale riusando il percorso "piano" di App.jsx,
// senza cambiare seed/overrides. Serve quando cambia qualcosa che incide sul
// piano ma NON sul seed (es. un ingrediente custom arrivato via realtime):
// pullPiano in quel caso esce senza emettere perché il seed è invariato.
async function recomputePianoLocale() {
  const seed=await getLocalRaw(SK_SEED,null);
  if(!seed) return;
  let overrides={};
  try { overrides=JSON.parse(await getLocalRaw(SK_OVERRIDES,"{}"))||{}; } catch {}
  emit("piano",{seed:String(seed),overrides});
}

function pullSpesa() {
  // Serializzato: ogni pull aspetta il precedente.
  // Nessun merge locale: il cloud è authoritative, lo stato locale
  // rispecchia esattamente il cloud. Niente pendingSpesa.
  pullSpesaQueue=pullSpesaQueue.then(async()=>{
    if (!me) return;
    const seed=await getLocalRaw(SK_SEED,null);
    if (!seed) return;
    const {data,error}=await supabase.from("famiglia_spesa").select("*")
      .eq("famiglia_id",me.famigliaId).eq("settimana",String(seed));
    if (error||!data) { if(error) logSync("error","Pull spesa: errore",{error:error.message}); return; }
    const wk={};
    for (const r of data) if (r.checked) wk[r.item_id]=true;
    const all=await getLocal(SK_SPESA,{});
    const prev=JSON.stringify(all[String(seed)]||{});
    if (JSON.stringify(wk)===prev) return;
    await setLocalQuiet(SK_SPESA,JSON.stringify({...all,[String(seed)]:wk}));
    logSync("pull","Lista spesa aggiornata dal cloud",{seed:String(seed),spuntati:Object.keys(wk).length});
    emit("spesa");
  }).catch(e=>{console.warn("[sync] pullSpesa",e?.message);logSync("error","Pull spesa: eccezione",{error:e?.message});});
  return pullSpesaQueue;
}

// === PUSH ===

async function pushFamigliaDato(chiave,valore) {
  const {error}=await supabase.from("famiglia_dati").upsert({famiglia_id:me.famigliaId,chiave,valore},{onConflict:"famiglia_id,chiave"});
  if (error) logSync("error",`Push dato famiglia "${chiave}": errore`,{error:error.message});
  else logSync("push",`Dato famiglia "${chiave}" caricato sul cloud`);
}

async function pushPianoConLock() {
  const seed=await getLocalRaw(SK_SEED,null);
  if (!seed) return;
  const overrides=await getLocal(SK_OVERRIDES,{});
  // Registra subito il seed come "il più recente che conosco": anche se
  // un eco realtime arriva mentre l'upsert è ancora in volo, pullPiano lo
  // confronterà con questo valore e scarterà gli stati più vecchi.
  const seedNum = Number(seed);
  if (Number.isFinite(seedNum)) lastPushedPianoSeed = Math.max(lastPushedPianoSeed, seedNum);
  pianoLock=true;
  clearTimeout(timers.__pianoLockRelease);
  try {
    const {error}=await supabase.from("famiglia_dati").upsert({famiglia_id:me.famigliaId,chiave:"piano",valore:{seed:String(seed),overrides}},{onConflict:"famiglia_id,chiave"});
    if (error) logSync("error","Push piano: errore",{error:error.message});
    else { console.log("[sync] piano pushato:",seed); logSync("push","Piano caricato sul cloud",{seed:String(seed)}); }
  }
  finally {
    // Non rilasciare il lock immediatamente: l'evento realtime di eco arriva
    // tipicamente 200-500ms dopo la scrittura. Tenendo pianoLock attivo per
    // un breve margine evitiamo che un pull scattato da quell'eco rilegga uno
    // stato non ancora coerente. Il confronto-seed in pullPiano è la difesa
    // principale; questo è una cintura aggiuntiva per il caso "stesso seed,
    // overrides diversi" che il solo confronto numerico non copre.
    timers.__pianoLockRelease=setTimeout(()=>{pianoLock=false;delete timers.__pianoLockRelease;},1500);
  }
}

async function pushPersonas() {
  const personas=await getLocal(SK_PERSONAS,[]);
  const {data:cloud,error}=await supabase.from("profili").select("*").eq("famiglia_id",me.famigliaId);
  if (error||!cloud) { if(error) logSync("error","Push profili: errore lettura cloud",{error:error.message}); return; }
  const cloudById=Object.fromEntries(cloud.map(c=>[c.id,c]));
  for (let i=0;i<personas.length;i++) {
    const p=personas[i];const c=cloudById[p.id];
    if (c) {
      if (!editable(profiloToPersona(c))) continue;
      const upd=personaToProfilo(p);const cambia=Object.keys(upd).some(k=>String(c[k]??"")!==String(upd[k]??""));
      if(cambia) { await supabase.from("profili").update(upd).eq("id",p.id); logSync("push","Profilo aggiornato sul cloud",{profilo:p.id,nome:p.nome}); }
    } else if (!p._uid) {
      const sl=await getLocal("pf-local-only",[]);if(sl.includes(p.id)) continue;
      const {data:nuovo}=await supabase.from("profili").insert({user_id:null,gestito_da:me.userId,famiglia_id:me.famigliaId,...personaToProfilo(p)}).select().single();
      if(nuovo){await remapPersonaId(p.id,nuovo.id);personas[i]={...p,id:nuovo.id,_gestito:true};await setLocalQuiet(SK_PERSONAS,JSON.stringify(personas));logSync("push","Nuovo profilo a carico creato sul cloud",{localId:p.id,cloudId:nuovo.id,nome:p.nome});emit("personas");}
    }
  }
}

async function pushMisureSoloNuove() {
  const misureApp=await getLocal(SK_MISURE,{});const personas=await getLocal(SK_PERSONAS,[]);
  for (const p of personas) {
    if (!editable(p)) continue;const recs=misureApp[p.id]||[];if(!recs.length) continue;
    const {data:cloud}=await supabase.from("misure").select("data").eq("profilo_id",p.id);
    const cloudDates=new Set((cloud||[]).map(c=>c.data?.slice(0,10)));
    const rows=recs.map(r=>({profilo_id:p.id,data:dataIT2ISO(r.date),valori:r})).filter(r=>r.data&&!cloudDates.has(r.data));
    if(rows.length) { await supabase.from("misure").upsert(rows,{onConflict:"profilo_id,data"}); logSync("push","Misure mancanti caricate sul cloud",{profilo:p.id,righe:rows.length}); }
  }
}

async function pushMealsLogSoloVuoti() {
  const log=await getLocal(SK_MEALS_LOG,{});const personas=await getLocal(SK_PERSONAS,[]);
  for (const p of personas) {
    if(!editable(p)||!log[p.id]) continue;
    const {data}=await supabase.from("profilo_dati").select("chiave").eq("profilo_id",p.id).eq("chiave","meals_log");
    if(!data?.length) { await supabase.from("profilo_dati").upsert({profilo_id:p.id,chiave:"meals_log",valore:log[p.id]},{onConflict:"profilo_id,chiave"}); logSync("push","Log pasti mancante caricato sul cloud",{profilo:p.id}); }
  }
}

// toggleSpesaItem: scrive direttamente sul cloud e poi aggiorna il locale.
// NON usa pendingSpesa: l'aggiornamento ottimistico è gestito dall'App.
// Il cloud è authoritative — il pull dopo la scrittura è la fonte di verità.
export async function toggleSpesaItem(itemId, checked) {
  if (!supabase||!me) throw new Error("sync non pronto");
  const seed = await getLocalRaw(SK_SEED, null);
  if (!seed) throw new Error("seed non disponibile");
  if (checked) {
    const {error} = await supabase.from("famiglia_spesa").upsert(
      {famiglia_id:me.famigliaId, settimana:String(seed), item_id:itemId, checked:true},
      {onConflict:"famiglia_id,settimana,item_id"});
    if (error) { logSync("error","Toggle spesa: errore",{itemId,error:error.message}); throw new Error(error.message); }
  } else {
    const {error} = await supabase.from("famiglia_spesa").delete()
      .eq("famiglia_id",me.famigliaId).eq("settimana",String(seed)).eq("item_id",itemId);
    if (error) { logSync("error","Toggle spesa: errore",{itemId,error:error.message}); throw new Error(error.message); }
  }
  logSync("push",`Spesa: articolo ${checked?"spuntato":"rimosso"}`,{itemId});
  // Pull immediato: aggiorna lo stato locale con la verità del cloud
  await pullSpesa();
}

// Azzera tutte le spunte di una settimana (pulsante reset lista spesa)
export async function resetSpesaSeed(seed) {
  if (!supabase||!me) throw new Error("sync non pronto");
  const {error} = await supabase.from("famiglia_spesa").delete()
    .eq("famiglia_id",me.famigliaId).eq("settimana",String(seed));
  if (error) { logSync("error","Reset spesa: errore",{seed:String(seed),error:error.message}); throw new Error(error.message); }
  logSync("push","Lista spesa azzerata sul cloud",{seed:String(seed)});
  await pullSpesa();
}

// === Hook storage ===

function hookStorage() {
  const orig=window.storage.set.bind(window.storage);
  window.storage.set=async(key,value)=>{
    const r=await orig(key,value);
    if (!me||isApplying(key)) return r;
    if (key===SK_SEED||key===SK_OVERRIDES) {
      logSync("push-schedule","Push pianificato: piano");
      clearTimeout(timers.__pushPiano);
      timers.__pushPiano=setTimeout(async()=>{delete timers.__pushPiano;await pushPianoConLock();},2000);
    } else if (key===SK_PREFS) {
      logSync("push-schedule","Push pianificato: gusti");
      clearTimeout(timers.__pushGusti);
      timers.__pushGusti=setTimeout(async()=>{delete timers.__pushGusti;await pushFamigliaDato("gusti",await getLocal(SK_PREFS,{}));},900);
    } else if (key===SK_EXCL) {
      logSync("push-schedule","Push pianificato: esclusioni");
      clearTimeout(timers.__pushExcl);
      timers.__pushExcl=setTimeout(async()=>{delete timers.__pushExcl;await pushFamigliaDato("esclusioni",await getLocal(SK_EXCL,[]));},900);
    } else if (key===SK_PERSONAS) {
      logSync("push-schedule","Push pianificato: profili");
      clearTimeout(timers.__pushPersonas);
      timers.__pushPersonas=setTimeout(pushPersonas,900);
      // Dopo che il push profili ha completato (1200ms), ricalcola e pusha
      // il target giornaliero per tutte le persone editabili, usando i dati
      // definitivi appena scritti.
      clearTimeout(timers.__pushTarget);
      timers.__pushTarget=setTimeout(async()=>{delete timers.__pushTarget;await pushTargetTuttiEditabili();},1200);
    } else if (key===SK_MISURE) {
      logSync("push-schedule","Push pianificato: misure");
      clearTimeout(timers.__pushMisure);
      timers.__pushMisure=setTimeout(async()=>{
        delete timers.__pushMisure;
        const misureApp=await getLocal(SK_MISURE,{});const ps=await getLocal(SK_PERSONAS,[]);
        const rows=[];for(const p of ps){if(!editable(p))continue;for(const r of(misureApp[p.id]||[])){const d=dataIT2ISO(r.date);if(d)rows.push({profilo_id:p.id,data:d,valori:r});}}
        if(rows.length) {
          const {error}=await supabase.from("misure").upsert(rows,{onConflict:"profilo_id,data"});
          if (error) logSync("error","Push misure: errore",{error:error.message});
          else logSync("push","Misure caricate sul cloud",{righe:rows.length});
        }
        // Ricalcola il target dopo aggiornamento misure (le misure influenzano il TDEE adattivo)
        await pushTargetTuttiEditabili();
      },900);
    } else if (key===SK_MEALS_LOG) {
      logSync("push-schedule","Push pianificato: log pasti");
      clearTimeout(timers.__pushLog);
      timers.__pushLog=setTimeout(async()=>{
        delete timers.__pushLog;
        const log=await getLocal(SK_MEALS_LOG,{});const ps=await getLocal(SK_PERSONAS,[]);
        const rows=ps.filter(p=>editable(p)&&log[p.id]).map(p=>({profilo_id:p.id,chiave:"meals_log",valore:log[p.id]}));
        if(rows.length) {
          const {error}=await supabase.from("profilo_dati").upsert(rows,{onConflict:"profilo_id,chiave"});
          if (error) logSync("error","Push log pasti: errore",{error:error.message});
          else logSync("push","Log pasti caricato sul cloud",{profili:rows.length});
        }
      },900);
    }
    return r;
  };
}

// === Realtime ===

function subscribeRealtime() {
  if (!me?.famigliaId) return;
  // Non ricreare il canale se è già attivo per questa famiglia:
  // due chiamate ravvicinate (onAuthStateChange + visibilitychange)
  // non devono spegnersi a vicenda.
  if (channel && channel.__famId === me.famigliaId && channel.__stato === "SUBSCRIBED") {
    console.log("[sync] canale già attivo, skip subscribe");
    logSync("realtime","Canale già attivo, sottoscrizione saltata");
    return;
  }
  if (channel){try{supabase.removeChannel(channel);}catch{}channel=null;}
  const famFilter=`famiglia_id=eq.${me.famigliaId}`;
  const devId=Math.random().toString(36).slice(2,10);
  const nomeCanale="fam-"+devId;
  logSync("realtime","Sottoscrizione canale realtime",{canale:nomeCanale});
  channel=supabase.channel(nomeCanale);
  channel.__famId = me.famigliaId;
  channel.__stato = "PENDING";
  channel
    .on("postgres_changes",{event:"*",schema:"public",table:"profili"},()=>{logSync("realtime","Evento ricevuto: profili");pullProfili();})
    .on("postgres_changes",{event:"*",schema:"public",table:"misure"},()=>{logSync("realtime","Evento ricevuto: misure");pullMisure();})
    .on("postgres_changes",{event:"*",schema:"public",table:"profilo_dati"},()=>{logSync("realtime","Evento ricevuto: profilo_dati");pullMealsLog();pullTargetGiornaliero();})
    .on("postgres_changes",{event:"*",schema:"public",table:"famiglia_dati",filter:famFilter},(p)=>{
      const chiave=p?.new?.chiave||p?.old?.chiave;
      logSync("realtime","Evento ricevuto: dati famiglia",{chiave});
      if(chiave==="piano") pullPiano();
      else if(chiave==="ingredienti_custom") pullCustomIngredients().then(recomputePianoLocale);
      else pullAltriDatiFamiglia();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"famiglia_spesa",filter:famFilter},()=>{logSync("realtime","Evento ricevuto: spesa");pullSpesa();})
    .subscribe((status)=>{
      if (channel) channel.__stato = status;
      logSync("realtime",`Stato canale: ${status}`,{canale:nomeCanale});
      if(status==="SUBSCRIBED"){console.log("[sync] Realtime attivo");emitStatus({loggedIn:true,inFamily:true,me,realtime:"ok"});}
      else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status)){
        console.warn("[sync] Realtime",status,"→ retry 3s");
        emitStatus({loggedIn:true,inFamily:true,me,realtime:status});
        clearTimeout(timers.__rt);timers.__rt=setTimeout(()=>{if(me)subscribeRealtime();},3000);
      }
    });
}

// === Avvio ===

export async function startSync() {
  if (started||!supabase){
    if(!supabase){logSync("status","Cloud non configurato: sync non avviata");emitStatus({loggedIn:false,inFamily:false});}
    return;
  }
  started=true;
  logSync("info","Avvio motore di sincronizzazione");
  hookStorage();
  const boot=async()=>{
    const session=await getSession();
    if(!session){me=null;logSync("status","Nessuna sessione: utente non collegato");emitStatus({loggedIn:false,inFamily:false});return;}
    const {data:mio,error}=await supabase.from("profili").select("id,famiglia_id").eq("user_id",session.user.id).maybeSingle();
    if(error) logSync("error","Boot: errore lettura profilo",{error:error.message});
    if(!mio?.famiglia_id){me=null;logSync("status","Collegato, ma non in una famiglia",{userId:session.user.id});emitStatus({loggedIn:true,inFamily:false});return;}
    me={userId:session.user.id,profiloId:mio.id,famigliaId:mio.famiglia_id};
    await setLocalQuiet(SK_CLOUD_ME,JSON.stringify(me));
    logSync("status","Collegato e in famiglia",{profiloId:me.profiloId,famigliaId:me.famigliaId});
    emitStatus({loggedIn:true,inFamily:true,me});
    await ancoraIdentitaAlCloud();
    // Propaga l'identità corretta (profiloId cloud) all'App non appena disponibile,
    // senza aspettare la fine della reconcile. Questo risolve il caso "all'avvio
    // l'App mostra il profilo default finché il cloud non ha completato il boot".
    emit("cloudMe", { profiloId: me.profiloId, myPersonaId: await getLocalRaw(SK_MY_PERSONA, null) });
    await window.storage.set("pf-cloud-migrated","1");
    await reconcile();
    subscribeRealtime();
    clearInterval(timers.__poll);
    timers.__poll=setInterval(async()=>{
      if(!me||document.visibilityState!=="visible") return;
      if(!pianoLock&&!timers.__pushPiano) await pullPiano();
      pullSpesa();
    },15000);
  };
  await boot();
  // onAuthStateChange registrato UNA SOLA VOLTA: chiamate multiple a
  // startSync (es. React StrictMode o import multipli) non devono
  // registrare listener duplicati che chiamano boot() più volte,
  // causando la sovrascrittura del canale Realtime.
  if (!window.__syncAuthListenerRegistered) {
    window.__syncAuthListenerRegistered = true;
    supabase.auth.onAuthStateChange(()=>{logSync("info","Stato autenticazione cambiato: nuovo boot");boot();});
  }
  if (!window.__syncVisListenerRegistered) {
    window.__syncVisListenerRegistered = true;
    document.addEventListener("visibilitychange",()=>{
      if(document.visibilityState==="visible"&&me){
        logSync("info","App tornata in primo piano: riallineo");
        if(!pianoLock&&!timers.__pushPiano) pullPiano();
        pullSpesa();pullProfili();pullMisure();
        // subscribeRealtime controlla internamente se il canale è già attivo
        subscribeRealtime();
      }
    });
  }
}

async function ancoraIdentitaAlCloud() {
  const personas=await getLocal(SK_PERSONAS,[]);
  const myLocal=await getLocalRaw(SK_MY_PERSONA,null);
  const ioLocale=personas.find(p=>p.id===myLocal)||personas.find(p=>!p._uid)||personas[0];
  if(ioLocale&&ioLocale.id!==me.profiloId) { logSync("info","Identità locale ancorata al profilo cloud",{da:ioLocale.id,a:me.profiloId}); await remapPersonaId(ioLocale.id,me.profiloId); }
  await setLocalQuiet(SK_MY_PERSONA,me.profiloId);
}

async function reconcile() {
  logSync("info","Riconciliazione con il cloud: avvio");
  const {data:fd}=await supabase.from("famiglia_dati").select("chiave,valore").eq("famiglia_id",me.famigliaId);
  const righe=fd||[];
  const chiaviCloud=new Set(righe.map(r=>r.chiave));
  // Idrata gli ingredienti custom PRIMA del blocco piano: così se pullPiano
  // emette "piano" e App rigenera il piano, ING_MAP contiene già le entry
  // custom e le ricette che le richiamano risolvono nome/macro correttamente.
  await pullCustomIngredients();
  if(!chiaviCloud.has("piano")) {
    logSync("info","Riconciliazione: piano assente sul cloud, lo carico");
    await pushPianoConLock();
  } else {
    // Decidi push o pull confrontando la freschezza dei seed (Date.now).
    // Se il piano LOCALE è più recente di quello sul cloud — tipicamente un
    // piano rigenerato mentre la PWA si è ricaricata prima che scattasse il
    // push, oppure offline — va PROPAGATO, non scartato né sovrascritto.
    // Senza questo, un piano locale "orfano" più nuovo del cloud non
    // raggiungeva mai gli altri dispositivi.
    const pianoRow=righe.find(r=>r.chiave==="piano");
    const localSeedNum=Number(await getLocalRaw(SK_SEED,"0"));
    const cloudSeedNum=Number(pianoRow?.valore?.seed||0);
    if (Number.isFinite(localSeedNum) && localSeedNum>cloudSeedNum) {
      logSync("info","Riconciliazione: piano locale più recente del cloud, lo carico",{seedLocale:String(localSeedNum),seedCloud:String(cloudSeedNum)});
      await pushPianoConLock();
    } else {
      await pullPiano();
    }
  }
  if(!chiaviCloud.has("gusti"))      { logSync("info","Riconciliazione: gusti assenti sul cloud, li carico"); await pushFamigliaDato("gusti",await getLocal(SK_PREFS,{})); }
  if(!chiaviCloud.has("esclusioni")) { logSync("info","Riconciliazione: esclusioni assenti sul cloud, le carico"); await pushFamigliaDato("esclusioni",await getLocal(SK_EXCL,[])); }
  await pullAltriDatiFamiglia();
  await pullProfili();await pullMisure();await pullMealsLog();await pullTargetGiornaliero();
  await pushMisureSoloNuove();await pushMealsLogSoloVuoti();
  // NB: pushTargetTuttiEditabili NON viene chiamato qui per evitare loop:
  // il target viene pushato solo da hookStorage (su cambio profilo/misure)
  // e da App.jsx (su handleUpdatePersona/handleMisureChange).
  await pullSpesa();
  logSync("info","Riconciliazione con il cloud: completata");
}

async function remapPersonaId(vecchioId,nuovoId) {
  if(vecchioId===nuovoId) return;
  const misure=await getLocal(SK_MISURE,{});if(misure[vecchioId]){misure[nuovoId]=misure[vecchioId];delete misure[vecchioId];await setLocalQuiet(SK_MISURE,JSON.stringify(misure));}
  const log=await getLocal(SK_MEALS_LOG,{});if(log[vecchioId]){log[nuovoId]=log[vecchioId];delete log[vecchioId];await setLocalQuiet(SK_MEALS_LOG,JSON.stringify(log));}
  const myP=await getLocalRaw(SK_MY_PERSONA,null);if(myP===vecchioId) await setLocalQuiet(SK_MY_PERSONA,nuovoId);
}

export async function finishMigration(mapping) {
  logSync("info","Migrazione profili: avvio",{mapping});
  for(const m of mapping) await remapPersonaId(m.localId,m.cloudId);
  await setLocalQuiet(SK_MY_PERSONA,me.profiloId);
  await window.storage.set("pf-cloud-migrated","1");
  await reconcile();subscribeRealtime();
  logSync("info","Migrazione profili: completata");
  emit("misure");emit("mealsLog");
}

export async function autoClaimSingle(persona) {
  if(!supabase||!me) throw new Error("cloud non pronto");
  logSync("info","Associazione automatica profilo unico",{persona:persona.id,cloudProfilo:me.profiloId});
  await supabase.from("profili").update({nome:persona.nome,sesso:persona.sesso==="F"?"F":"M",data_nascita:persona.dataNascita||etaToDataNascita(persona.eta),peso:persona.peso??null,altezza:persona.altezza??null,lavoro:persona.lavoro||"sedentario",allenamenti:persona.allenamenti??3,obiettivo:persona.obiettivo||"mantenimento",color:persona.color||"#18A957"}).eq("id",me.profiloId);
  await finishMigration([{localId:persona.id,cloudId:me.profiloId}]);
}

export {remapPersonaId};

export async function resetSyncState() {
  logSync("status","Uscita dalla famiglia: stato di sincronizzazione azzerato");
  if(channel){try{supabase.removeChannel(channel);}catch{}channel=null;}
  clearInterval(timers.__poll);clearTimeout(timers.__rt);
  clearTimeout(timers.__pushPiano);clearTimeout(timers.__pullPianoRetry);
  clearTimeout(timers.__pianoLockRelease);clearTimeout(timers.__pushTarget);
  // Timer debounce dei push: devono essere azzerati all'uscita per evitare
  // che un push programmato prima dell'uscita esegua dopo il reset, su me=null.
  clearTimeout(timers.__pushPersonas);clearTimeout(timers.__pushMisure);
  clearTimeout(timers.__pushGusti);clearTimeout(timers.__pushExcl);
  clearTimeout(timers.__pushLog);
  // CRITICO: resetta started così il prossimo boot() (via onAuthStateChange)
  // può ri-eseguire correttamente. Senza questo, startSync() ritorna subito
  // per il flag già true e boot() non rileva che famiglia_id è ora null —
  // causando l'uscita "fittizia" osservata nel log (3× STATUS Uscita).
  started = false;
  me=null;pianoLock=false;lastPushedPianoSeed=0;
  // Azzera il guard anti-loop del target così al prossimo login rifarà il push
  for (const k of Object.keys(lastPushedTarget)) delete lastPushedTarget[k];
  // resetta i flag globali così un nuovo boot può ri-registrare i listener
  window.__syncAuthListenerRegistered = false;
  window.__syncVisListenerRegistered  = false;
  try{for(const k of["pf-cloud-migrated","pf-cloud-me"]){try{await window.storage.delete(k);}catch{}}}catch{}
  emitStatus({loggedIn:true,inFamily:false});
}

export async function riallineaForzato() {
  logSync("info","Riallineamento forzato: richiesto");
  if(!supabase) { logSync("error","Riallineamento forzato: cloud non configurato"); return {error:"Cloud non configurato"}; }
  const session=await getSession();if(!session) { logSync("error","Riallineamento forzato: nessuna sessione"); return {error:"Non sei connesso"}; }
  const {data:mio,error}=await supabase.from("profili").select("id,famiglia_id").eq("user_id",session.user.id).maybeSingle();
  if(error) logSync("error","Riallineamento forzato: errore lettura profilo",{error:error.message});
  if(!mio) { logSync("error","Riallineamento forzato: profilo cloud non trovato"); return {error:"Profilo cloud non trovato"}; }
  me={userId:session.user.id,profiloId:mio.id,famigliaId:mio.famiglia_id};
  if(!mio.famiglia_id){try{await window.storage.delete("pf-cloud-migrated");}catch{} logSync("info","Riallineamento forzato: completato (nessuna famiglia)"); return{ok:true,inFamily:false};}
  await ancoraIdentitaAlCloud();
  await pullCustomIngredients();
  await pullPiano();await pullAltriDatiFamiglia();
  await pullProfili();await pullMisure();await pullMealsLog();await pullTargetGiornaliero();await pullSpesa();
  await window.storage.set("pf-cloud-migrated","1");
  subscribeRealtime();
  emit("personas");emit("misure");emit("mealsLog");emit("targetGiornaliero");emit("spesa");
  logSync("info","Riallineamento forzato: completato");
  return {ok:true,inFamily:true};
}

export async function deleteMisuraCloud(profiloId,dataISO) {
  if(!supabase||!me) return;
  try{
    await supabase.from("misure").delete().eq("profilo_id",profiloId).eq("data",dataISO);
    logSync("push","Misura eliminata dal cloud",{profiloId,data:dataISO});
  }catch(e){
    logSync("error","Eliminazione misura dal cloud: errore",{profiloId,data:dataISO,error:e?.message});
  }
}
