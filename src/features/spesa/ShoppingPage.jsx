import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { DAYS, applyOverridesWeek, buildShoppingPerPersona, dateForOffset, dateKeyForOffset, depColor, depLabel, planForWeek, weekIndexForDate, weekdayForDate } from '@/core';
import { IngredientiPage } from '@/features/ingredienti/IngredientiPage';

export function ShoppingPage({ planState, overrides, genArgs, checks, onToggle, onReset, personas, mealsLog, consumoAttivo, onToggleConsumo }) {
  // Periodo predefinito: oggi + 2 = 3 giorni pieni, SEMPRE (anche ven/sab/dom),
  // perché la finestra mobile sfora liberamente nella settimana successiva.
  // Selezione giorni persistita come FINESTRA RELATIVA a oggi (offset):
  // se l'utente ragiona su 5 giorni, li ritrova selezionati alla prossima visita.
  const [selOffsets, setSelOffsets] = useState(()=>{
    try {
      const v = JSON.parse(localStorage.getItem("pa__spesa-giorni") || "");
      if (Array.isArray(v) && v.length && v.every(n => Number.isInteger(n) && n >= -14 && n <= 14)) return v;
    } catch {}
    return [0,1,2];
  });
  useEffect(()=>{ try { localStorage.setItem("pa__spesa-giorni", JSON.stringify(selOffsets)); } catch {} }, [selOffsets]);

  // ── 20. Articoli extra manuali (fuori dal piano: sale, tovaglioli…) ──
  // Locali al dispositivo (localStorage), indipendenti dal seed del piano.
  const [extra, setExtra] = useState(()=>{
    try { const v = JSON.parse(localStorage.getItem("pa__spesa-extra") || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const [extraInput, setExtraInput] = useState("");
  const saveExtra = (list) => { setExtra(list); try { localStorage.setItem("pa__spesa-extra", JSON.stringify(list)); } catch {} };
  const addExtra = () => {
    const nome = extraInput.trim();
    if (!nome) return;
    saveExtra([...extra, { id: "xtr_" + Date.now().toString(36), nome, done:false }]);
    setExtraInput("");
  };
  const toggleExtra = (id) => saveExtra(extra.map(x => x.id===id ? { ...x, done: !x.done } : x));
  const removeExtra = (id) => saveExtra(extra.filter(x => x.id!==id));
  // Centra "oggi" nel carosello all'apertura (come nel Piano): senza questo
  // la lista dei giorni resta scrollata all'inizio (≈2 settimane fa).
  const scRef = useRef(null);
  useEffect(() => {
    const el = scRef.current && scRef.current.querySelector('[data-off="0"]');
    if (el && el.scrollIntoView) {
      try { el.scrollIntoView({ inline:"center", block:"nearest" }); } catch { el.scrollIntoView(); }
    }
  }, []);
  // Spunte persistenti e condivise con la famiglia (gestite da App)
  const checked = checks || {};
  const toggle = id => onToggle(id);
  const toggleDay = off => setSelOffsets(p => p.includes(off) ? p.filter(d=>d!==off) : [...p,off].sort((a,b)=>a-b));
  // Risolve ogni offset → oggetto-giorno (settimana risolta + override applicati).
  // Le dateKeys restano ALLINEATE ai dayObjs (indice per indice): servono al
  // motore per l'esclusione consumo-aware per persona.
  const grouped = useMemo(() => {
    // Giorni per-persona: ogni membro contribuisce col SUO piatto effettivo
    // (override propri inclusi) e col suo slot.
    const giorni = [];
    selOffsets.forEach(off => {
      const d = dateForOffset(off);
      const wk = weekIndexForDate(d), wd = weekdayForDate(d);
      const base = planForWeek(planState, wk, genArgs || {});
      if (!base[wd]) return;
      const byPersona = Object.fromEntries((personas || []).map(p =>
        [p.id, applyOverridesWeek(base, overrides || {}, wk, p.id)[wd]]));
      giorni.push({ dateKey: dateKeyForOffset(off), byPersona });
    });
    const consumo = (consumoAttivo && personas?.length) ? { mealsLog } : null;
    return buildShoppingPerPersona(giorni, personas || [], consumo);
  }, [selOffsets, planState, overrides, genArgs, consumoAttivo, personas, mealsLog]);
  const allIds = Object.values(grouped).flat().map(i=>i.id);
  const done = allIds.filter(id=>checked[id]).length;
  return (
    <div>
      <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #E7EDE2",padding:"12px 14px",marginBottom:12}}>
        <div style={{display:"flex",gap:8,alignItems:"stretch"}}>
        {/* Chip "torna a oggi": seleziona oggi e ricentra il carosello */}
        {!selOffsets.includes(0) && (
          <button title="Torna a oggi"
            onClick={()=>{
              setSelOffsets(p=>p.includes(0)?p:[0,...p].sort((a,b)=>a-b));
              const el = scRef.current && scRef.current.querySelector('[data-off="0"]');
              if (el && el.scrollIntoView) { try { el.scrollIntoView({ inline:"center", block:"nearest", behavior:"smooth" }); } catch {} }
            }}
            style={{flex:"0 0 auto",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,padding:"9px 11px",borderRadius:14,border:"none",background:"#15251C",color:"#C7F23E",cursor:"pointer",boxShadow:"0 8px 16px -6px #15251C88"}}>
            <span style={{fontSize:13,lineHeight:1}}>⌂</span>
            <span style={{fontSize:9,fontWeight:800,letterSpacing:0.3}}>OGGI</span>
          </button>
        )}
        <div ref={scRef} style={{flex:1,minWidth:0,display:"flex",gap:8,overflowX:"auto",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",paddingBottom:4,scrollbarWidth:"none"}}>
          {Array.from({length:29},(_,i)=>i-14).map(off=>{
            const d=dateForOffset(off);
            const sel=selOffsets.includes(off);
            const isToday=off===0;
            const lab=isToday?"OGGI":DAYS[(d.getDay()+6)%7].slice(0,3).toUpperCase();
            return (
            <button key={off} data-off={off} onClick={()=>toggleDay(off)} style={{flex:"0 0 auto",minWidth:62,scrollSnapAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"9px 12px",borderRadius:14,border:sel?"none":(isToday?"1.5px solid #2F6B3A":"1.5px solid #E7EDE2"),background:sel?"#2F6B3A":"#fff",cursor:"pointer",transition:"all 0.2s",boxShadow:sel?"0 8px 16px -6px #2F6B3A88":"none"}}>
              <span style={{fontSize:9.5,fontWeight:800,color:sel?"#ffffffcc":(isToday?"#2F6B3A":"#9DB1A2")}}>{lab}</span>
              <span style={{fontSize:16,fontWeight:800,color:sel?"#fff":"#4A6152",fontFamily:"'Outfit',sans-serif"}}>{d.getDate()}</span>
            </button>);
          })}
        </div>
        </div>
      </div>
      {selOffsets.length===0 ? (
        <div style={{textAlign:"center",padding:"30px 0",color:"#9DB1A2",fontSize:13}}>Seleziona almeno un giorno</div>
      ) : (
        <>
          <div style={{background:"linear-gradient(140deg,#15251C,#1D3A28)",borderRadius:18,padding:"16px 18px",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:12}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"#7FA890",letterSpacing:0.8,textTransform:"uppercase"}}>Spesa per {selOffsets.length} giorn{selOffsets.length===1?"o":"i"}</div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:20,fontWeight:800,color:"#F4F7EF",marginTop:3}}>{done} su {allIds.length} articoli</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {done>0&&<button onClick={onReset} style={{fontSize:10,color:"#9DB1A2",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:6,padding:"4px 9px",cursor:"pointer"}}>Reset</button>}
                <div style={{width:46,height:46,borderRadius:"50%",background:"rgba(199,242,62,0.16)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:800,color:"#C7F23E",flexShrink:0}}>{allIds.length?Math.round(done/allIds.length*100):0}%</div>
              </div>
            </div>
            <div style={{height:9,background:"rgba(255,255,255,0.12)",borderRadius:99,overflow:"hidden"}}>
              <div style={{width:`${allIds.length?Math.round(done/allIds.length*100):0}%`,height:"100%",background:"linear-gradient(90deg,#2F6B3A,#C7F23E)",borderRadius:99,transition:"width 0.3s"}}/>
            </div>
            {/* Spesa consumo-aware (per persona): chi ha già mangiato/saltato
                un pasto non genera più spesa per quel pasto */}
            {onToggleConsumo && (
              <button onClick={onToggleConsumo}
                style={{marginTop:12,display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",background:consumoAttivo?"rgba(199,242,62,0.14)":"rgba(255,255,255,0.07)",border:`1px solid ${consumoAttivo?"rgba(199,242,62,0.4)":"rgba(255,255,255,0.15)"}`,borderRadius:10,padding:"8px 12px",cursor:"pointer"}}>
                <span style={{fontSize:14,flexShrink:0}}>{consumoAttivo?"🍽️":"🛒"}</span>
                <span style={{flex:1,fontSize:11,fontWeight:700,color:consumoAttivo?"#C7F23E":"#9DB1A2",lineHeight:1.4}}>
                  {consumoAttivo
                    ? "Pasti già consumati o saltati esclusi (per persona)"
                    : "Tutti i pasti inclusi — tocca per escludere i consumati"}
                </span>
                <span style={{flexShrink:0,fontSize:10,fontWeight:800,color:consumoAttivo?"#C7F23E":"#9DB1A2",background:consumoAttivo?"rgba(199,242,62,0.18)":"rgba(255,255,255,0.1)",borderRadius:6,padding:"3px 8px"}}>{consumoAttivo?"ON":"OFF"}</span>
              </button>
            )}
          </div>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            {[[2,"≤3g","Freschissimo"],[7,"≤7g","Breve conservaz."],[14,"≤14g","Media conservaz."],[365,"Stabile","Lunga conservaz."]].map(([days,lab,desc])=>(
              <div key={days} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#6E8576"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:depColor(days),flexShrink:0}}/><span style={{fontWeight:700,color:depColor(days)}}>{lab}</span><span>{desc}</span>
              </div>
            ))}
          </div>
          {Object.entries(grouped).map(([cat,items])=>(
            <div key={cat} style={{background:"#fff",borderRadius:12,border:"1.5px solid #E7EDE2",marginBottom:10,overflow:"hidden"}}>
              <div style={{background:"#F5F8F1",borderBottom:"1px solid #EFF3EC",padding:"9px 14px",fontWeight:800,fontSize:12,color:"#15251C"}}>{cat}</div>
              <div style={{padding:"4px 14px"}}>
                {/* Spuntati in fondo: la parte alta della lista resta
                    scansionabile al supermercato (sort stabile) */}
                {[...items].sort((a,b)=>(checked[a.id]?1:0)-(checked[b.id]?1:0)).map((ing,i)=>{
                  const isChk=!!checked[ing.id], dc=depColor(ing.deperibile);
                  return (
                    <div key={ing.id} onClick={()=>toggle(ing.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<items.length-1?"1px solid #F5F8F1":"none",cursor:"pointer",opacity:isChk?0.4:1,transition:"opacity 0.2s"}}>
                      <div style={{width:19,height:19,borderRadius:5,flexShrink:0,border:`2px solid ${isChk?"#16a34a":"#C2D0C6"}`,background:isChk?"#16a34a":"#fff",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
                        {isChk&&<span style={{color:"#fff",fontSize:11,fontWeight:900}}>✓</span>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#15251C",textDecoration:isChk?"line-through":"none",lineHeight:1.3}}>{ing.nome}</div>
                        <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                          <div style={{width:6,height:6,borderRadius:"50%",background:dc,flexShrink:0}}/><span style={{fontSize:10.5,color:dc,fontWeight:700}}>Conservazione: {ing.deperibile} giorni</span>
                        </div>
                      </div>
                      <div style={{background:isChk?"#EFF3EC":"#15251C",color:isChk?"#9DB1A2":"#F5F8F1",borderRadius:8,padding:"4px 10px",fontSize:12,fontFamily:"monospace",fontWeight:800,minWidth:54,textAlign:"center",flexShrink:0,transition:"all 0.2s"}}>{ing.qtyStr}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── Articoli extra (fuori dal piano) ── */}
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #E7EDE2",marginBottom:10,overflow:"hidden"}}>
            <div style={{background:"#F5F8F1",borderBottom:"1px solid #EFF3EC",padding:"9px 14px",fontWeight:800,fontSize:12,color:"#15251C"}}>🛒 Articoli extra</div>
            <div style={{padding:"4px 14px"}}>
              {extra.length===0 && (
                <div style={{fontSize:11,color:"#9DB1A2",padding:"8px 0"}}>Aggiungi quello che non fa parte del piano: sale, tovaglioli, un ingrediente per gli ospiti…</div>
              )}
              {[...extra].sort((a,b)=>(a.done?1:0)-(b.done?1:0)).map((x,i,arr)=>(
                <div key={x.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<arr.length-1?"1px solid #F5F8F1":"none",opacity:x.done?0.45:1,transition:"opacity 0.2s"}}>
                  <div onClick={()=>toggleExtra(x.id)} style={{width:19,height:19,borderRadius:5,flexShrink:0,border:`2px solid ${x.done?"#16a34a":"#C2D0C6"}`,background:x.done?"#16a34a":"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all 0.2s"}}>
                    {x.done&&<span style={{color:"#fff",fontSize:11,fontWeight:900}}>✓</span>}
                  </div>
                  <div onClick={()=>toggleExtra(x.id)} style={{flex:1,minWidth:0,fontSize:13,fontWeight:600,color:"#15251C",textDecoration:x.done?"line-through":"none",lineHeight:1.3,cursor:"pointer"}}>{x.nome}</div>
                  <button onClick={()=>removeExtra(x.id)} title="Rimuovi"
                    style={{flexShrink:0,width:24,height:24,borderRadius:"50%",border:"none",background:"#F5F8F1",color:"#9DB1A2",fontWeight:900,fontSize:11,cursor:"pointer",lineHeight:1}}>✕</button>
                </div>
              ))}
              <div style={{display:"flex",gap:8,padding:"10px 0 12px"}}>
                <input value={extraInput} onChange={e=>setExtraInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter") addExtra(); }}
                  placeholder="+ Aggiungi articolo…"
                  style={{flex:1,minWidth:0,padding:"9px 12px",borderRadius:10,border:"1.5px solid #E7EDE2",background:"#F9FBF7",fontSize:13,color:"#15251C",outline:"none",boxSizing:"border-box"}}/>
                <button onClick={addExtra} disabled={!extraInput.trim()}
                  style={{flexShrink:0,padding:"9px 15px",borderRadius:10,border:"none",background:extraInput.trim()?"#15251C":"#E7EDE2",color:extraInput.trim()?"#C7F23E":"#9DB1A2",fontWeight:800,fontSize:13,cursor:extraInput.trim()?"pointer":"default"}}>
                  Aggiungi
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── IngredientiPage ─────────────────────────────────────────────────

