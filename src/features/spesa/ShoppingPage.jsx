import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { DAYS, buildShoppingForDays, depColor, depLabel } from '@/core';
import { IngredientiPage } from '@/features/ingredienti/IngredientiPage';

export function ShoppingPage({ plan, checks, onToggle, onReset }) {
  const [selDays, setSelDays] = useState([0,1,2,3,4,5,6]);
  // Spunte persistenti e condivise con la famiglia (gestite da App)
  const checked = checks || {};
  const toggle = id => onToggle(id);
  const toggleDay = i => setSelDays(p => p.includes(i) ? p.filter(d=>d!==i) : [...p,i].sort());
  const setQuick = (days) => { setSelDays(days); };
  const grouped = buildShoppingForDays(plan, selDays);
  const allIds = Object.values(grouped).flat().map(i=>i.id);
  const done = allIds.filter(id=>checked[id]).length;
  return (
    <div>
      <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"12px 14px",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:800,color:"#1e293b",marginBottom:10}}>📅 Per quali giorni fare la spesa?</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
          {DAYS.map((d,i)=>{
            const sel=selDays.includes(i);
            return <button key={i} onClick={()=>toggleDay(i)} style={{padding:"6px 11px",borderRadius:8,border:"2px solid",borderColor:sel?"#2563eb":"#e2e8f0",background:sel?"#2563eb":"#fff",color:sel?"#fff":"#64748b",fontWeight:700,fontSize:11,cursor:"pointer",transition:"all 0.15s"}}>{d.slice(0,3)}</button>;
          })}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[{label:"Lun–Mer",days:[0,1,2]},{label:"Gio–Sab",days:[3,4,5]},{label:"Weekend",days:[5,6]},{label:"Tutta la settimana",days:[0,1,2,3,4,5,6]}].map(({label,days})=>(
            <button key={label} onClick={()=>setQuick(days)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontSize:11,fontWeight:600,cursor:"pointer"}}>{label}</button>
          ))}
        </div>
      </div>
      {selDays.length===0 ? (
        <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8",fontSize:13}}>Seleziona almeno un giorno</div>
      ) : (
        <>
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:10,color:"#64748b",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:700}}>Spesa per {selDays.length} giorn{selDays.length===1?"o":"i"}</div>
              <div style={{background:"#f1f5f9",borderRadius:99,height:7,overflow:"hidden"}}>
                <div style={{width:`${allIds.length?Math.round(done/allIds.length*100):0}%`,height:"100%",background:"linear-gradient(90deg,#2563eb,#16a34a)",borderRadius:99,transition:"width 0.3s"}}/>
              </div>
            </div>
            <span style={{fontFamily:"monospace",fontWeight:800,fontSize:14,color:"#1e293b"}}>{done}/{allIds.length}</span>
            {done>0&&<button onClick={onReset} style={{fontSize:10,color:"#94a3b8",background:"none",border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 8px",cursor:"pointer"}}>Reset</button>}
          </div>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            {[[2,"≤3g","Freschissimo"],[7,"≤7g","Breve conservaz."],[14,"≤14g","Media conservaz."],[365,"Stabile","Lunga conservaz."]].map(([days,lab,desc])=>(
              <div key={days} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#64748b"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:depColor(days),flexShrink:0}}/><span style={{fontWeight:700,color:depColor(days)}}>{lab}</span><span>{desc}</span>
              </div>
            ))}
          </div>
          {Object.entries(grouped).map(([cat,items])=>(
            <div key={cat} style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",marginBottom:10,overflow:"hidden"}}>
              <div style={{background:"#f8fafc",borderBottom:"1px solid #f1f5f9",padding:"9px 14px",fontWeight:800,fontSize:12,color:"#1e293b"}}>{cat}</div>
              <div style={{padding:"4px 14px"}}>
                {items.map((ing,i)=>{
                  const isChk=!!checked[ing.id], dc=depColor(ing.deperibile);
                  return (
                    <div key={ing.id} onClick={()=>toggle(ing.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<items.length-1?"1px solid #f8fafc":"none",cursor:"pointer",opacity:isChk?0.4:1,transition:"opacity 0.2s"}}>
                      <div style={{width:19,height:19,borderRadius:5,flexShrink:0,border:`2px solid ${isChk?"#16a34a":"#cbd5e1"}`,background:isChk?"#16a34a":"#fff",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
                        {isChk&&<span style={{color:"#fff",fontSize:11,fontWeight:900}}>✓</span>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#1e293b",textDecoration:isChk?"line-through":"none",lineHeight:1.3}}>{ing.nome}</div>
                        <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                          <div style={{width:6,height:6,borderRadius:"50%",background:dc,flexShrink:0}}/><span style={{fontSize:10,color:dc,fontWeight:600}}>{depLabel(ing.deperibile)}</span>
                        </div>
                      </div>
                      <div style={{background:isChk?"#f1f5f9":"#1e293b",color:isChk?"#94a3b8":"#f8fafc",borderRadius:8,padding:"4px 10px",fontSize:12,fontFamily:"monospace",fontWeight:800,minWidth:54,textAlign:"center",flexShrink:0,transition:"all 0.2s"}}>{ing.qtyStr}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── IngredientiPage ─────────────────────────────────────────────────

