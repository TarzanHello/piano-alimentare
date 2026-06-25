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
      <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #E7EDE2",padding:"12px 14px",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:800,color:"#15251C",marginBottom:10}}>📅 Per quali giorni fare la spesa?</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
          {DAYS.map((d,i)=>{
            const sel=selDays.includes(i);
            return <button key={i} onClick={()=>toggleDay(i)} style={{padding:"6px 11px",borderRadius:8,border:"2px solid",borderColor:sel?"#2F6B3A":"#E7EDE2",background:sel?"#2F6B3A":"#fff",color:sel?"#fff":"#6E8576",fontWeight:700,fontSize:11,cursor:"pointer",transition:"all 0.15s"}}>{d.slice(0,3)}</button>;
          })}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[{label:"Lun–Mer",days:[0,1,2]},{label:"Gio–Sab",days:[3,4,5]},{label:"Weekend",days:[5,6]},{label:"Tutta la settimana",days:[0,1,2,3,4,5,6]}].map(({label,days})=>(
            <button key={label} onClick={()=>setQuick(days)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #E7EDE2",background:"#F5F8F1",color:"#6E8576",fontSize:11,fontWeight:600,cursor:"pointer"}}>{label}</button>
          ))}
        </div>
      </div>
      {selDays.length===0 ? (
        <div style={{textAlign:"center",padding:"30px 0",color:"#9DB1A2",fontSize:13}}>Seleziona almeno un giorno</div>
      ) : (
        <>
          <div style={{background:"linear-gradient(140deg,#15251C,#1D3A28)",borderRadius:18,padding:"16px 18px",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:12}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"#7FA890",letterSpacing:0.8,textTransform:"uppercase"}}>Spesa per {selDays.length} giorn{selDays.length===1?"o":"i"}</div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:20,fontWeight:800,color:"#F4F7EF",marginTop:3}}>{done} su {allIds.length} articoli</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {done>0&&<button onClick={onReset} style={{fontSize:10,color:"#9DB1A2",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:6,padding:"4px 9px",cursor:"pointer"}}>Reset</button>}
                <div style={{width:46,height:46,borderRadius:"50%",background:"rgba(157,232,55,0.16)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:800,color:"#C7F23E",flexShrink:0}}>{allIds.length?Math.round(done/allIds.length*100):0}%</div>
              </div>
            </div>
            <div style={{height:9,background:"rgba(255,255,255,0.12)",borderRadius:99,overflow:"hidden"}}>
              <div style={{width:`${allIds.length?Math.round(done/allIds.length*100):0}%`,height:"100%",background:"linear-gradient(90deg,#2F6B3A,#C7F23E)",borderRadius:99,transition:"width 0.3s"}}/>
            </div>
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
                {items.map((ing,i)=>{
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
        </>
      )}
    </div>
  );
}

// ─── IngredientiPage ─────────────────────────────────────────────────

