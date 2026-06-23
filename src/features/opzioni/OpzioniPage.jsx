import { SeedSyncSection } from '@/features/famiglia/FamigliaPage';
import { RecuperoDati } from './RecuperoDati';
import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { DEFAULT_NOTIF, MEAL_KEYS, MEAL_META, scheduleNotifications, todayDayIndex } from '@/core';
import { GustiPage } from '@/features/gusti/GustiPage';

export function OpzioniPage({ notifSettings, onNotifChange, plan, personas, myPersonaId, currentSeed, overrides, onApplySeed }) {
  const [permStatus, setPermStatus] = React.useState("Notification" in window ? Notification.permission : "unsupported");
  const [requesting, setRequesting] = React.useState(false);
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
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #E7EDE2",padding:"16px",marginBottom:14,boxShadow:"0 2px 10px #0000000a"}}>
        <div style={{fontSize:13,fontWeight:800,color:"#13231A",marginBottom:4}}>🔔 Notifiche pasto</div>
        <div style={{fontSize:11,color:"#6E8576",marginBottom:14,lineHeight:1.6}}>Ricevi un promemoria con il nome della ricetta prima di ogni pasto.</div>
        {permStatus==="unsupported"&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:9,padding:"10px 14px",fontSize:11,color:"#dc2626",fontWeight:600}}>⚠️ Browser non supporta le notifiche.</div>}
        {isDenied&&<div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:9,padding:"10px 14px",fontSize:11,color:"#c2410c",lineHeight:1.6}}>🚫 Notifiche bloccate. Vai nelle impostazioni del browser per abilitarle.</div>}
        {permStatus==="default"&&<button onClick={requestPermission} disabled={requesting} style={{width:"100%",padding:"11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#18A957,#0F8F47)",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",boxShadow:"0 4px 14px #18A95744"}}>{requesting?"⏳ Richiesta…":"🔔 Abilita notifiche"}</button>}
        {isGranted&&<div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:12,color:"#4A6152",fontWeight:600,flex:1}}>Notifiche attive</span><div onClick={toggleEnabled} style={{position:"relative",width:44,height:24,borderRadius:12,background:settings.enabled?"#18A957":"#C2D0C6",cursor:"pointer",transition:"background 0.2s",flexShrink:0}}><div style={{position:"absolute",top:3,left:settings.enabled?22:2,width:18,height:18,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px #0003",transition:"left 0.2s"}}/></div><span style={{fontSize:11,color:settings.enabled?"#18A957":"#9DB1A2",fontWeight:700}}>{settings.enabled?"ON":"OFF"}</span></div>}
      </div>
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #E7EDE2",padding:"16px",marginBottom:14,opacity:(isGranted&&settings.enabled)?1:0.5,pointerEvents:(isGranted&&settings.enabled)?"auto":"none"}}>
        <div style={{fontSize:13,fontWeight:800,color:"#13231A",marginBottom:4}}>⏰ Orario promemoria</div>
        <div style={{fontSize:11,color:"#6E8576",marginBottom:14}}>Personalizza l'orario per ogni pasto.</div>
        {MEAL_KEYS.map((mk,i)=>{const cfg=settings.meals[mk]||{active:false,hour:8,minute:0};const meta=MEAL_META[mk];const todayMeal=todayPlan&&todayPlan[mk];return(<div key={mk} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:i<MEAL_KEYS.length-1?"1px solid #EFF3EC":"none"}}><div onClick={()=>toggleMeal(mk)} style={{position:"relative",width:36,height:20,borderRadius:10,background:cfg.active?"#18A957":"#E7EDE2",cursor:"pointer",transition:"background 0.2s",flexShrink:0}}><div style={{position:"absolute",top:2,left:cfg.active?17:2,width:16,height:16,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px #0003",transition:"left 0.2s"}}/></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:700,color:cfg.active?"#13231A":"#9DB1A2"}}>{MICONS[mk]} {meta.label.split(" ").slice(1).join(" ")}</div>{todayMeal&&cfg.active&&<div style={{fontSize:10,color:"#6E8576",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Oggi: {todayMeal.nome}</div>}</div><div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}><input type="number" min="0" max="23" value={cfg.hour} onChange={e=>setMealTime(mk,"hour",e.target.value)} style={{width:38,padding:"5px 4px",border:"1.5px solid #E7EDE2",borderRadius:7,fontSize:14,fontFamily:"monospace",fontWeight:700,textAlign:"center",outline:"none",color:cfg.active?"#13231A":"#9DB1A2"}}/><span style={{fontWeight:800,color:"#9DB1A2"}}>:</span><input type="number" min="0" max="59" value={cfg.minute} onChange={e=>setMealTime(mk,"minute",e.target.value)} style={{width:38,padding:"5px 4px",border:"1.5px solid #E7EDE2",borderRadius:7,fontSize:14,fontFamily:"monospace",fontWeight:700,textAlign:"center",outline:"none",color:cfg.active?"#13231A":"#9DB1A2"}}/></div></div>);})}
      </div>
      {isGranted&&<div style={{background:"#fff",borderRadius:14,border:"1.5px solid #E7EDE2",padding:"16px",marginBottom:14}}><div style={{fontSize:13,fontWeight:800,color:"#13231A",marginBottom:10}}>🧪 Test</div><button onClick={()=>{const m=todayPlan&&todayPlan["pranzo"];new Notification("🥗 Pranzo",{body:m?m.nome:"È ora di pranzo!",icon:"./icon-192.png",tag:"test"});}} style={{width:"100%",padding:"10px",borderRadius:10,border:"1.5px solid #18A95730",background:"#EDF7EF",color:"#18A957",fontWeight:700,fontSize:12,cursor:"pointer"}}>📣 Invia notifica di prova (Pranzo)</button></div>}
      <div style={{fontSize:10,color:"#9DB1A2",textAlign:"center",lineHeight:1.8,padding:"0 10px"}}>Le notifiche vengono schedulate ad ogni apertura dell'app.</div>
    </div>
  );
}

// ─── GustiPage ───────────────────────────────────────────────────────
// Mostra i dati di preferenza accumulati: ricette preferite, ricette
// sostituite spesso, e la classifica completa per punteggio.

