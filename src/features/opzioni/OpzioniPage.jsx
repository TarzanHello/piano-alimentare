import { SeedSyncSection } from '@/features/famiglia/FamigliaPage';
import { RecuperoDati } from './RecuperoDati';
import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { DB, DEFAULT_NOTIF, MEAL_KEYS, MEAL_META, scheduleNotifications, todayDayIndex } from '@/core';
import { GustiPage } from '@/features/gusti/GustiPage';
import { cloudEnabled, getSession, deleteAccount, exportMyData } from '@/db/cloud';

export function OpzioniPage({ devMode, onToggleDev, notifSettings, onNotifChange, plan, personas, myPersonaId, currentSeed, overrides, onApplySeed, history, onLoadHistory }) {
  // Gesto nascosto: 7 tap ravvicinati sul footer attivano/disattivano gli
  // strumenti di diagnostica (Test Sync / Log Sync) nel menu.
  const devTaps = useRef(0);
  const devTapTimer = useRef(null);
  const handleDevTap = () => {
    devTaps.current += 1;
    if (devTapTimer.current) clearTimeout(devTapTimer.current);
    devTapTimer.current = setTimeout(() => { devTaps.current = 0; }, 1200);
    if (devTaps.current >= 7) { devTaps.current = 0; onToggleDev && onToggleDev(); }
  };
  const [permStatus, setPermStatus] = React.useState("Notification" in window ? Notification.permission : "unsupported");
  const [requesting, setRequesting] = React.useState(false);

  // ─── Stato eliminazione account ───────────────────────────────
  const [hasSession, setHasSession] = React.useState(false);
  const [delOpen, setDelOpen] = React.useState(false);   // pannello di conferma aperto
  const [delText, setDelText] = React.useState("");      // testo digitato dall'utente
  const [delBusy, setDelBusy] = React.useState(false);
  const [delErr, setDelErr] = React.useState("");
  React.useEffect(() => {
    let vivo = true;
    if (cloudEnabled) getSession().then(s => { if (vivo) setHasSession(!!s); });
    return () => { vivo = false; };
  }, []);

  // ─── Stato esportazione dati ──────────────────────────────────
  const [expBusy, setExpBusy] = React.useState(false);
  const [expErr, setExpErr] = React.useState("");
  const [expOk, setExpOk] = React.useState(false);
  const handleExport = async () => {
    if (expBusy) return;
    setExpBusy(true); setExpErr(""); setExpOk(false);
    const { data, error } = await exportMyData();
    if (error) { setExpErr(error); setExpBusy(false); return; }
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const oggi = new Date().toISOString().slice(0, 10);
      a.href = url; a.download = `fitsy-dati-${oggi}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExpOk(true);
    } catch (e) { setExpErr(e?.message || "Errore durante il download"); }
    setExpBusy(false);
  };

  const delPronto = delText.trim().toUpperCase() === "ELIMINA";
  const handleDelete = async () => {
    if (!delPronto || delBusy) return;
    setDelBusy(true); setDelErr("");
    const { error } = await deleteAccount();
    if (error) { setDelErr(error); setDelBusy(false); return; }
    // Tutto cancellato: ricarico l'app per ripartire da stato pulito.
    window.location.href = window.location.origin + window.location.pathname;
  };
  const settings = {
    ...DEFAULT_NOTIF,
    ...(notifSettings || {}),
    meals: { ...(DEFAULT_NOTIF.meals || {}), ...((notifSettings && notifSettings.meals) || {}) },
  };
  const todayPlan = plan ? plan[todayDayIndex()] : null;
  const requestPermission = async () => {
    if (!("Notification" in window)) return; setRequesting(true);
    try { const result=await Notification.requestPermission(); setPermStatus(result); if(result==="granted"){const next={...settings,enabled:true};onNotifChange(next);scheduleNotifications(next,todayPlan,personas,myPersonaId);} } finally{setRequesting(false);}
  };
  const toggleEnabled=()=>{const next={...settings,enabled:!settings.enabled};onNotifChange(next);scheduleNotifications(next,todayPlan,personas,myPersonaId);};
  const toggleMeal=mk=>{const next={...settings,meals:{...settings.meals,[mk]:{...settings.meals[mk],active:!settings.meals[mk].active}}};onNotifChange(next);if(settings.enabled&&permStatus==="granted")scheduleNotifications(next,todayPlan,personas,myPersonaId);};
  const setMealTime=(mk,field,val)=>{const next={...settings,meals:{...settings.meals,[mk]:{...settings.meals[mk],[field]:parseInt(val)||0}}};onNotifChange(next);if(settings.enabled&&permStatus==="granted")scheduleNotifications(next,todayPlan,personas,myPersonaId);};
  const isGranted=permStatus==="granted",isDenied=permStatus==="denied";
  const MICONS={colazione:"☀️",spuntino_m:"🍎",pranzo:"🥗",spuntino_p:"🫐",cena:"🍽️"};
  return (
    <div>
      <RecuperoDati personas={personas}/>
      <SeedSyncSection currentSeed={currentSeed} overrides={overrides} onApplySeed={onApplySeed}/>
      {Array.isArray(history) && history.length>0 && (
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #E7EDE2",padding:"16px",marginBottom:14,boxShadow:"0 2px 10px #0000000a"}}>
          <div style={{fontSize:13,fontWeight:800,color:"#15251C",marginBottom:4}}>🕐 Cronologia piani</div>
          <div style={{fontSize:11,color:"#6E8576",marginBottom:14,lineHeight:1.6}}>Ricarica uno dei piani generati in precedenza.</div>
          {history.map((h,i)=>(
            <div key={i} onClick={()=>onLoadHistory&&onLoadHistory(h.seed)} style={{background:"#F8FAF5",borderRadius:10,border:"1.5px solid #E7EDE2",padding:"12px 14px",marginBottom:i<history.length-1?8:0,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div><div style={{fontWeight:700,fontSize:13,color:"#15251C"}}>{h.label}</div><div style={{fontSize:10,color:"#9DB1A2",fontFamily:"monospace"}}>seed: {h.seed}</div></div>
              <span style={{fontSize:12,color:"#2F6B3A",fontWeight:700}}>Ricarica →</span>
            </div>
          ))}
        </div>
      )}
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #E7EDE2",padding:"16px",marginBottom:14,boxShadow:"0 2px 10px #0000000a"}}>
        <div style={{fontSize:13,fontWeight:800,color:"#15251C",marginBottom:4}}>🔔 Notifiche pasto</div>
        <div style={{fontSize:11,color:"#6E8576",marginBottom:14,lineHeight:1.6}}>Ricevi un promemoria con il nome della ricetta prima di ogni pasto.</div>
        {permStatus==="unsupported"&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:9,padding:"10px 14px",fontSize:11,color:"#dc2626",fontWeight:600}}>⚠️ Browser non supporta le notifiche.</div>}
        {isDenied&&<div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:9,padding:"10px 14px",fontSize:11,color:"#c2410c",lineHeight:1.6}}>🚫 Notifiche bloccate. Vai nelle impostazioni del browser per abilitarle.</div>}
        {permStatus==="default"&&<button onClick={requestPermission} disabled={requesting} style={{width:"100%",padding:"11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#2F6B3A,#235029)",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",boxShadow:"0 4px 14px #2F6B3A44"}}>{requesting?"⏳ Richiesta…":"🔔 Abilita notifiche"}</button>}
        {isGranted&&<div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:12,color:"#4A6152",fontWeight:600,flex:1}}>Notifiche attive</span><div onClick={toggleEnabled} style={{position:"relative",width:44,height:24,borderRadius:12,background:settings.enabled?"#2F6B3A":"#C2D0C6",cursor:"pointer",transition:"background 0.2s",flexShrink:0}}><div style={{position:"absolute",top:3,left:settings.enabled?22:2,width:18,height:18,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px #0003",transition:"left 0.2s"}}/></div><span style={{fontSize:11,color:settings.enabled?"#2F6B3A":"#9DB1A2",fontWeight:700}}>{settings.enabled?"ON":"OFF"}</span></div>}
      </div>
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #E7EDE2",padding:"16px",marginBottom:14,opacity:(isGranted&&settings.enabled)?1:0.5,pointerEvents:(isGranted&&settings.enabled)?"auto":"none"}}>
        <div style={{fontSize:13,fontWeight:800,color:"#15251C",marginBottom:4}}>⏰ Orario promemoria</div>
        <div style={{fontSize:11,color:"#6E8576",marginBottom:14}}>Personalizza l'orario per ogni pasto.</div>
        {MEAL_KEYS.map((mk,i)=>{const cfg=settings.meals[mk]||{active:false,hour:8,minute:0};const meta=MEAL_META[mk];const todayMeal=todayPlan&&todayPlan[mk];return(<div key={mk} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:i<MEAL_KEYS.length-1?"1px solid #EFF3EC":"none"}}><div onClick={()=>toggleMeal(mk)} style={{position:"relative",width:36,height:20,borderRadius:10,background:cfg.active?"#2F6B3A":"#E7EDE2",cursor:"pointer",transition:"background 0.2s",flexShrink:0}}><div style={{position:"absolute",top:2,left:cfg.active?17:2,width:16,height:16,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px #0003",transition:"left 0.2s"}}/></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:700,color:cfg.active?"#15251C":"#9DB1A2"}}>{MICONS[mk]} {meta.label.split(" ").slice(1).join(" ")}</div>{todayMeal&&cfg.active&&<div style={{fontSize:10,color:"#6E8576",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Oggi: {todayMeal.nome}</div>}</div><div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}><input type="number" min="0" max="23" value={cfg.hour} onChange={e=>setMealTime(mk,"hour",e.target.value)} style={{width:38,padding:"5px 4px",border:"1.5px solid #E7EDE2",borderRadius:7,fontSize:14,fontFamily:"monospace",fontWeight:700,textAlign:"center",outline:"none",color:cfg.active?"#15251C":"#9DB1A2"}}/><span style={{fontWeight:800,color:"#9DB1A2"}}>:</span><input type="number" min="0" max="59" value={cfg.minute} onChange={e=>setMealTime(mk,"minute",e.target.value)} style={{width:38,padding:"5px 4px",border:"1.5px solid #E7EDE2",borderRadius:7,fontSize:14,fontFamily:"monospace",fontWeight:700,textAlign:"center",outline:"none",color:cfg.active?"#15251C":"#9DB1A2"}}/></div></div>);})}
      </div>
      {isGranted&&<div style={{background:"#fff",borderRadius:14,border:"1.5px solid #E7EDE2",padding:"16px",marginBottom:14}}><div style={{fontSize:13,fontWeight:800,color:"#15251C",marginBottom:10}}>🧪 Test</div><button onClick={()=>{const m=todayPlan&&todayPlan["pranzo"];new Notification("🥗 Pranzo",{body:m?m.nome:"È ora di pranzo!",icon:"./icon-192.png",tag:"test"});}} style={{width:"100%",padding:"10px",borderRadius:10,border:"1.5px solid #2F6B3A30",background:"#EDF7EF",color:"#2F6B3A",fontWeight:700,fontSize:12,cursor:"pointer"}}>📣 Invia notifica di prova (Pranzo)</button></div>}
      {cloudEnabled && hasSession && (
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #E7EDE2",padding:"16px",marginBottom:14,boxShadow:"0 2px 10px #0000000a"}}>
          <div style={{fontSize:13,fontWeight:800,color:"#15251C",marginBottom:4}}>📦 I miei dati</div>
          <div style={{fontSize:11,color:"#6E8576",marginBottom:14,lineHeight:1.6}}>Scarica una copia di tutti i tuoi dati in formato JSON: profili, misurazioni, ricette, dati di famiglia e i dati salvati su questo dispositivo.</div>
          <button onClick={handleExport} disabled={expBusy} style={{width:"100%",padding:"11px",borderRadius:10,border:"1.5px solid #2F6B3A30",background:"#EDF7EF",color:"#2F6B3A",fontWeight:700,fontSize:13,cursor:expBusy?"default":"pointer"}}>{expBusy?"⏳ Preparo l'esportazione…":"⬇️ Esporta i miei dati (JSON)"}</button>
          {expErr && <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:9,padding:"9px 12px",fontSize:11,color:"#dc2626",fontWeight:600,marginTop:10}}>{expErr}</div>}
          {expOk && !expErr && <div style={{fontSize:11,color:"#2F6B3A",fontWeight:600,marginTop:10}}>✓ Esportazione scaricata.</div>}
        </div>
      )}
      {cloudEnabled && hasSession && (
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #F3D6D6",padding:"16px",marginBottom:14,boxShadow:"0 2px 10px #0000000a"}}>
          <div style={{fontSize:13,fontWeight:800,color:"#b91c1c",marginBottom:4}}>⚠️ Elimina account</div>
          <div style={{fontSize:11,color:"#6E8576",marginBottom:14,lineHeight:1.6}}>Cancella in modo <b>definitivo e irreversibile</b> il tuo account e tutti i dati associati: profili (tuoi e a carico), misurazioni, ricette e i dati salvati su questo dispositivo. I dati condivisi con la famiglia restano agli altri membri.</div>
          {!delOpen ? (
            <button onClick={()=>{setDelOpen(true);setDelText("");setDelErr("");}} style={{width:"100%",padding:"11px",borderRadius:10,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#b91c1c",fontWeight:700,fontSize:13,cursor:"pointer"}}>🗑️ Elimina account e tutti i dati</button>
          ) : (
            <div>
              <div style={{fontSize:11,color:"#15251C",marginBottom:8,lineHeight:1.6}}>Per confermare, scrivi <b>ELIMINA</b> qui sotto.</div>
              <input value={delText} onChange={e=>setDelText(e.target.value)} placeholder="ELIMINA" autoCapitalize="characters" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #E7EDE2",borderRadius:9,fontSize:14,fontWeight:700,letterSpacing:1,outline:"none",marginBottom:10,boxSizing:"border-box"}}/>
              {delErr && <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:9,padding:"9px 12px",fontSize:11,color:"#dc2626",fontWeight:600,marginBottom:10}}>{delErr}</div>}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setDelOpen(false);setDelText("");setDelErr("");}} disabled={delBusy} style={{flex:1,padding:"11px",borderRadius:10,border:"1.5px solid #E7EDE2",background:"#fff",color:"#4A6152",fontWeight:700,fontSize:13,cursor:delBusy?"default":"pointer"}}>Annulla</button>
                <button onClick={handleDelete} disabled={!delPronto||delBusy} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:(delPronto&&!delBusy)?"linear-gradient(135deg,#dc2626,#b91c1c)":"#E7C4C4",color:"#fff",fontWeight:700,fontSize:13,cursor:(delPronto&&!delBusy)?"pointer":"default"}}>{delBusy?"⏳ Elimino…":"Elimina definitivamente"}</button>
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{fontSize:10,color:"#9DB1A2",textAlign:"center",lineHeight:1.8,padding:"0 10px"}}>
        Le notifiche vengono schedulate ad ogni apertura dell'app.
        {/* Info tecnica spostata qui dal Piano (era rumore per l'utente finale) */}
        <div style={{marginTop:4}}>Ricettario base: {DB.colazione.length} colazioni · {DB.pranzo.length} pranzi · {DB.cena.length} cene · {DB.spuntino.length} spuntini</div>
        <div onClick={handleDevTap} style={{marginTop:6,userSelect:"none",WebkitUserSelect:"none",cursor:"default"}}>
          Fitsy{devMode ? " · 🔬 diagnostica attiva" : ""}
        </div>
      </div>
    </div>
  );
}

// ─── GustiPage ───────────────────────────────────────────────────────
// Mostra i dati di preferenza accumulati: ricette preferite, ricette
// sostituite spesso, e la classifica completa per punteggio.

