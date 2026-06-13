// ── Motore di sincronizzazione v2 ────────────────────────────
// Architettura semplificata con lock piano esplicito.
// Regola unica: chi ha scritto per ultimo sul cloud ha ragione.

import { SK_EXCL, SK_MEALS_LOG, SK_MISURE, SK_MY_PERSONA, SK_OVERRIDES,
         SK_PERSONAS, SK_PREFS, SK_SEED, SK_SPESA } from '@/core/constants';
import { dataNascitaToEta, etaToDataNascita, getSession, supabase } from './cloud';

const SK_CLOUD_ME = "pf-cloud-me";

let started   = false;
let me        = null;
let channel   = null;
let timers    = {};
let pianoLock = false;   // true mentre un push piano è in corso
let pendingSpesa = {};   // { itemId: { checked, ts } }
let pullSpesaQueue = Promise.resolve();

const emit       = (key, detail={}) => window.dispatchEvent(new CustomEvent("pf-cloud-update",{detail:{key,...detail}}));
const emitStatus = (s) => window.dispatchEvent(new CustomEvent("pf-cloud-status",{detail:s}));

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
    color:p.color||"#2563eb",_uid:p.user_id||null,_gestito:!p.user_id};
}
function personaToProfilo(p) {
  return {nome:p.nome,sesso:p.sesso==="F"?"F":"M",data_nascita:p.dataNascita||etaToDataNascita(p.eta),
    peso:p.peso??null,altezza:p.altezza??null,lavoro:p.lavoro||"sedentario",
    allenamenti:p.allenamenti??3,obiettivo:p.obiettivo||"mantenimento",color:p.color||"#2563eb"};
}
const editable = (p) => !p._uid || p.id===me?.profiloId;

// === PULL ===

async function pullProfili() {
  const {data,error}=await supabase.from("profili").select("*").eq("famiglia_id",me.famigliaId).order("created_at");
  if (error||!data) return;
  data.sort((a,b)=>(a.user_id===me.userId?0:a.user_id?1:2)-(b.user_id===me.userId?0:b.user_id?1:2));
  const locali=await getLocal(SK_PERSONAS,[]);
  const byId=Object.fromEntries(locali.map(p=>[p.id,p]));
  const personas=data.map(c=>({...(byId[c.id]||{}),...profiloToPersona(c)}));
  const soloLocali=await getLocal("pf-local-only",[]);
  for (const p of locali) if (soloLocali.includes(p.id)&&!personas.some(x=>x.id===p.id)) personas.push(p);
  await setLocalQuiet(SK_PERSONAS,JSON.stringify(personas));
  emit("personas");
}

async function pullMisure() {
  const {data,error}=await supabase.from("misure").select("*");
  if (error||!data) return;
  const misureApp={};
  for (const r of data) (misureApp[r.profilo_id]=misureApp[r.profilo_id]||[]).push({...r.valori,date:r.valori?.date||dataISO2IT(r.data)});
  for (const pid of Object.keys(misureApp)) misureApp[pid].sort((a,b)=>(dataIT2ISO(a.date)||"").localeCompare(dataIT2ISO(b.date)||""));
  const locale=await getLocal(SK_MISURE,{});
  for (const k of Object.keys(locale)) if (!misureApp[k]) misureApp[k]=locale[k];
  await setLocalQuiet(SK_MISURE,JSON.stringify(misureApp));
  emit("misure");
}

async function pullMealsLog() {
  const {data,error}=await supabase.from("profilo_dati").select("*").eq("chiave","meals_log");
  if (error||!data) return;
  const log=await getLocal(SK_MEALS_LOG,{});
  for (const r of data) log[r.profilo_id]=r.valore||{};
  await setLocalQuiet(SK_MEALS_LOG,JSON.stringify(log));
  emit("mealsLog");
}

async function pullPiano() {
  if (pianoLock) {
    clearTimeout(timers.__pullPianoRetry);
    timers.__pullPianoRetry=setTimeout(pullPiano,2500);
    return;
  }
  const {data,error}=await supabase.from("famiglia_dati").select("*")
    .eq("famiglia_id",me.famigliaId).eq("chiave","piano").maybeSingle();
  if (error||!data?.valore) return;
  const {seed,overrides}=data.valore;
  if (!seed) return;
  const curSeed=await getLocalRaw(SK_SEED,null);
  const curOvr=await getLocalRaw(SK_OVERRIDES,"{}");
  const newOvr=JSON.stringify(overrides||{});
  if (String(seed)===curSeed&&newOvr===curOvr) return;
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
  emit("piano",{seed:String(seed),overrides:overrides||{}});
}

async function pullAltriDatiFamiglia() {
  const {data,error}=await supabase.from("famiglia_dati").select("*")
    .eq("famiglia_id",me.famigliaId).in("chiave",["gusti","esclusioni"]);
  if (error||!data) return;
  for (const r of data) {
    if (r.chiave==="gusti")      {await setLocalQuiet(SK_PREFS,JSON.stringify(r.valore||{}));emit("prefs");}
    if (r.chiave==="esclusioni") {await setLocalQuiet(SK_EXCL,JSON.stringify(r.valore||[]));emit("excluded");}
  }
}

function pullSpesa() {
  pullSpesaQueue=pullSpesaQueue.then(async()=>{
    if (!me) return;
    const seed=await getLocalRaw(SK_SEED,null);
    if (!seed) return;
    const {data,error}=await supabase.from("famiglia_spesa").select("*")
      .eq("famiglia_id",me.famigliaId).eq("settimana",String(seed));
    if (error||!data) return;
    const all=await getLocal(SK_SPESA,{});
    const wk={};
    for (const r of data) if (r.checked) wk[r.item_id]=true;
    const ora=Date.now();
    for (const [id,p] of Object.entries(pendingSpesa)) {
      if ((ora-(p.ts||0))<5000) {if(p.checked) wk[id]=true; else delete wk[id];}
    }
    const prev=JSON.stringify(all[String(seed)]||{});
    if (JSON.stringify(wk)===prev) return;
    await setLocalQuiet(SK_SPESA,JSON.stringify({...all,[String(seed)]:wk}));
    emit("spesa");
  }).catch(e=>console.warn("[sync] pullSpesa",e?.message));
  return pullSpesaQueue;
}

// === PUSH ===

async function pushFamigliaDato(chiave,valore) {
  await supabase.from("famiglia_dati").upsert({famiglia_id:me.famigliaId,chiave,valore},{onConflict:"famiglia_id,chiave"});
}

async function pushPianoConLock() {
  const seed=await getLocalRaw(SK_SEED,null);
  if (!seed) return;
  const overrides=await getLocal(SK_OVERRIDES,{});
  pianoLock=true;
  try { await pushFamigliaDato("piano",{seed:String(seed),overrides}); console.log("[sync] piano pushato:",seed); }
  finally { pianoLock=false; }
}

async function pushPersonas() {
  const personas=await getLocal(SK_PERSONAS,[]);
  const {data:cloud}=await supabase.from("profili").select("*").eq("famiglia_id",me.famigliaId);
  if (!cloud) return;
  const cloudById=Object.fromEntries(cloud.map(c=>[c.id,c]));
  for (let i=0;i<personas.length;i++) {
    const p=personas[i];const c=cloudById[p.id];
    if (c) {
      if (!editable(profiloToPersona(c))) continue;
      const upd=personaToProfilo(p);const cambia=Object.keys(upd).some(k=>String(c[k]??"")!==String(upd[k]??"")); if(cambia) await supabase.from("profili").update(upd).eq("id",p.id);
    } else if (!p._uid) {
      const sl=await getLocal("pf-local-only",[]);if(sl.includes(p.id)) continue;
      const {data:nuovo}=await supabase.from("profili").insert({user_id:null,gestito_da:me.userId,famiglia_id:me.famigliaId,...personaToProfilo(p)}).select().single();
      if(nuovo){await remapPersonaId(p.id,nuovo.id);personas[i]={...p,id:nuovo.id,_gestito:true};await setLocalQuiet(SK_PERSONAS,JSON.stringify(personas));emit("personas");}
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
    if(rows.length) await supabase.from("misure").upsert(rows,{onConflict:"profilo_id,data"});
  }
}

async function pushMealsLogSoloVuoti() {
  const log=await getLocal(SK_MEALS_LOG,{});const personas=await getLocal(SK_PERSONAS,[]);
  for (const p of personas) {
    if(!editable(p)||!log[p.id]) continue;
    const {data}=await supabase.from("profilo_dati").select("chiave").eq("profilo_id",p.id).eq("chiave","meals_log");
    if(!data?.length) await supabase.from("profilo_dati").upsert({profilo_id:p.id,chiave:"meals_log",valore:log[p.id]},{onConflict:"profilo_id,chiave"});
  }
}

export async function toggleSpesaItem(itemId,checked) {
  if (!supabase||!me) return;
  const seed=await getLocalRaw(SK_SEED,null);if(!seed) return;
  const ts=Date.now();pendingSpesa[itemId]={checked,ts};
  try {
    if (checked) await supabase.from("famiglia_spesa").upsert({famiglia_id:me.famigliaId,settimana:String(seed),item_id:itemId,checked:true},{onConflict:"famiglia_id,settimana,item_id"});
    else await supabase.from("famiglia_spesa").delete().eq("famiglia_id",me.famigliaId).eq("settimana",String(seed)).eq("item_id",itemId);
    await pullSpesa();
  } catch(e){console.warn("[sync] toggleSpesa",e?.message);}
  finally {setTimeout(()=>{if(pendingSpesa[itemId]?.ts===ts) delete pendingSpesa[itemId];},5000);}
}

// === Hook storage ===

function hookStorage() {
  const orig=window.storage.set.bind(window.storage);
  window.storage.set=async(key,value)=>{
    const r=await orig(key,value);
    if (!me||isApplying(key)) return r;
    if (key===SK_SEED||key===SK_OVERRIDES) {
      clearTimeout(timers.__pushPiano);
      timers.__pushPiano=setTimeout(async()=>{delete timers.__pushPiano;await pushPianoConLock();},2000);
    } else if (key===SK_PREFS) {
      clearTimeout(timers.__pushGusti);
      timers.__pushGusti=setTimeout(async()=>{delete timers.__pushGusti;await pushFamigliaDato("gusti",await getLocal(SK_PREFS,{}));},900);
    } else if (key===SK_EXCL) {
      clearTimeout(timers.__pushExcl);
      timers.__pushExcl=setTimeout(async()=>{delete timers.__pushExcl;await pushFamigliaDato("esclusioni",await getLocal(SK_EXCL,[]));},900);
    } else if (key===SK_PERSONAS) {
      clearTimeout(timers.__pushPersonas);
      timers.__pushPersonas=setTimeout(pushPersonas,900);
    } else if (key===SK_MISURE) {
      clearTimeout(timers.__pushMisure);
      timers.__pushMisure=setTimeout(async()=>{
        delete timers.__pushMisure;
        const misureApp=await getLocal(SK_MISURE,{});const ps=await getLocal(SK_PERSONAS,[]);
        const rows=[];for(const p of ps){if(!editable(p))continue;for(const r of(misureApp[p.id]||[])){const d=dataIT2ISO(r.date);if(d)rows.push({profilo_id:p.id,data:d,valori:r});}}
        if(rows.length) await supabase.from("misure").upsert(rows,{onConflict:"profilo_id,data"});
      },900);
    } else if (key===SK_MEALS_LOG) {
      clearTimeout(timers.__pushLog);
      timers.__pushLog=setTimeout(async()=>{
        delete timers.__pushLog;
        const log=await getLocal(SK_MEALS_LOG,{});const ps=await getLocal(SK_PERSONAS,[]);
        const rows=ps.filter(p=>editable(p)&&log[p.id]).map(p=>({profilo_id:p.id,chiave:"meals_log",valore:log[p.id]}));
        if(rows.length) await supabase.from("profilo_dati").upsert(rows,{onConflict:"profilo_id,chiave"});
      },900);
    }
    return r;
  };
}

// === Realtime ===

function subscribeRealtime() {
  if (channel){try{supabase.removeChannel(channel);}catch{}channel=null;}
  if (!me?.famigliaId) return;
  const famFilter=`famiglia_id=eq.${me.famigliaId}`;
  const devId=Math.random().toString(36).slice(2,10);
  channel=supabase.channel("fam-"+devId)
    .on("postgres_changes",{event:"*",schema:"public",table:"profili"},()=>pullProfili())
    .on("postgres_changes",{event:"*",schema:"public",table:"misure"},()=>pullMisure())
    .on("postgres_changes",{event:"*",schema:"public",table:"profilo_dati"},()=>pullMealsLog())
    .on("postgres_changes",{event:"*",schema:"public",table:"famiglia_dati",filter:famFilter},(p)=>{
      const chiave=p?.new?.chiave||p?.old?.chiave;
      if(chiave==="piano") pullPiano(); else pullAltriDatiFamiglia();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"famiglia_spesa",filter:famFilter},()=>pullSpesa())
    .subscribe((status)=>{
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
  if (started||!supabase){if(!supabase)emitStatus({loggedIn:false,inFamily:false});return;}
  started=true;
  hookStorage();
  const boot=async()=>{
    const session=await getSession();
    if(!session){me=null;emitStatus({loggedIn:false,inFamily:false});return;}
    const {data:mio}=await supabase.from("profili").select("id,famiglia_id").eq("user_id",session.user.id).maybeSingle();
    if(!mio?.famiglia_id){me=null;emitStatus({loggedIn:true,inFamily:false});return;}
    me={userId:session.user.id,profiloId:mio.id,famigliaId:mio.famiglia_id};
    await setLocalQuiet(SK_CLOUD_ME,JSON.stringify(me));
    emitStatus({loggedIn:true,inFamily:true,me});
    await ancoraIdentitaAlCloud();
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
  supabase.auth.onAuthStateChange(()=>boot());
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&me){
      if(!pianoLock&&!timers.__pushPiano) pullPiano();
      pullSpesa();pullProfili();pullMisure();
      subscribeRealtime();
    }
  });
}

async function ancoraIdentitaAlCloud() {
  const personas=await getLocal(SK_PERSONAS,[]);
  const myLocal=await getLocalRaw(SK_MY_PERSONA,null);
  const ioLocale=personas.find(p=>p.id===myLocal)||personas.find(p=>!p._uid)||personas[0];
  if(ioLocale&&ioLocale.id!==me.profiloId) await remapPersonaId(ioLocale.id,me.profiloId);
  await setLocalQuiet(SK_MY_PERSONA,me.profiloId);
}

async function reconcile() {
  const {data:fd}=await supabase.from("famiglia_dati").select("chiave").eq("famiglia_id",me.famigliaId);
  const chiaviCloud=new Set((fd||[]).map(r=>r.chiave));
  if(!chiaviCloud.has("piano")) await pushPianoConLock(); else await pullPiano();
  if(!chiaviCloud.has("gusti"))      await pushFamigliaDato("gusti",await getLocal(SK_PREFS,{}));
  if(!chiaviCloud.has("esclusioni")) await pushFamigliaDato("esclusioni",await getLocal(SK_EXCL,[]));
  await pullAltriDatiFamiglia();
  await pullProfili();await pullMisure();await pullMealsLog();
  await pushMisureSoloNuove();await pushMealsLogSoloVuoti();
  await pullSpesa();
}

async function remapPersonaId(vecchioId,nuovoId) {
  if(vecchioId===nuovoId) return;
  const misure=await getLocal(SK_MISURE,{});if(misure[vecchioId]){misure[nuovoId]=misure[vecchioId];delete misure[vecchioId];await setLocalQuiet(SK_MISURE,JSON.stringify(misure));}
  const log=await getLocal(SK_MEALS_LOG,{});if(log[vecchioId]){log[nuovoId]=log[vecchioId];delete log[vecchioId];await setLocalQuiet(SK_MEALS_LOG,JSON.stringify(log));}
  const myP=await getLocalRaw(SK_MY_PERSONA,null);if(myP===vecchioId) await setLocalQuiet(SK_MY_PERSONA,nuovoId);
}

export async function finishMigration(mapping) {
  for(const m of mapping) await remapPersonaId(m.localId,m.cloudId);
  await setLocalQuiet(SK_MY_PERSONA,me.profiloId);
  await window.storage.set("pf-cloud-migrated","1");
  await reconcile();subscribeRealtime();
  emit("misure");emit("mealsLog");
}

export async function autoClaimSingle(persona) {
  if(!supabase||!me) throw new Error("cloud non pronto");
  await supabase.from("profili").update({nome:persona.nome,sesso:persona.sesso==="F"?"F":"M",data_nascita:persona.dataNascita||etaToDataNascita(persona.eta),peso:persona.peso??null,altezza:persona.altezza??null,lavoro:persona.lavoro||"sedentario",allenamenti:persona.allenamenti??3,obiettivo:persona.obiettivo||"mantenimento",color:persona.color||"#2563eb"}).eq("id",me.profiloId);
  await finishMigration([{localId:persona.id,cloudId:me.profiloId}]);
}

export {remapPersonaId};

export async function resetSyncState() {
  if(channel){try{supabase.removeChannel(channel);}catch{}channel=null;}
  clearInterval(timers.__poll);clearTimeout(timers.__rt);
  clearTimeout(timers.__pushPiano);clearTimeout(timers.__pullPianoRetry);
  me=null;pendingSpesa={};pianoLock=false;
  try{for(const k of["pf-cloud-migrated","pf-cloud-me"]){try{await window.storage.delete(k);}catch{}}}catch{}
  emitStatus({loggedIn:true,inFamily:false});
}

export async function riallineaForzato() {
  if(!supabase) return {error:"Cloud non configurato"};
  const session=await getSession();if(!session) return {error:"Non sei connesso"};
  const {data:mio}=await supabase.from("profili").select("id,famiglia_id").eq("user_id",session.user.id).maybeSingle();
  if(!mio) return {error:"Profilo cloud non trovato"};
  me={userId:session.user.id,profiloId:mio.id,famigliaId:mio.famiglia_id};
  if(!mio.famiglia_id){try{await window.storage.delete("pf-cloud-migrated");}catch{}return{ok:true,inFamily:false};}
  await ancoraIdentitaAlCloud();
  await pullPiano();await pullAltriDatiFamiglia();
  await pullProfili();await pullMisure();await pullMealsLog();await pullSpesa();
  await window.storage.set("pf-cloud-migrated","1");
  subscribeRealtime();
  emit("personas");emit("misure");emit("mealsLog");emit("spesa");
  return {ok:true,inFamily:true};
}

export async function deleteMisuraCloud(profiloId,dataISO) {
  if(!supabase||!me) return;
  try{await supabase.from("misure").delete().eq("profilo_id",profiloId).eq("data",dataISO);}catch{}
}
