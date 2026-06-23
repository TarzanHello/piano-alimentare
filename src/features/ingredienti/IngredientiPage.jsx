import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { DB, INGREDIENTS, depColor, meseCorrente } from '@/core';
import { PersonaForm } from '@/features/famiglia/FamigliaPage';

export function IngredientiPage({ excluded, onToggle }) {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("Tutte");
  const cats = ["Tutte", ...Array.from(new Set(INGREDIENTS.map(i=>i.cat)))];
  const visible = INGREDIENTS.filter(ing => {
    const matchCat = filterCat==="Tutte" || ing.cat===filterCat;
    const matchSearch = ing.nome.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });
  const nExcluded = excluded.length;
  return (
    <div>
      <div style={{background:nExcluded>0?"#fef2f2":"#f0fdf4",border:`1px solid ${nExcluded>0?"#fecaca":"#bbf7d0"}`,borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:nExcluded>0?"#dc2626":"#16a34a"}}>
            {nExcluded>0 ? `⚠️ ${nExcluded} ingredient${nExcluded===1?"e":"i"} esclus${nExcluded===1?"o":"i"}` : "✅ Nessun ingrediente escluso"}
          </div>
          <div style={{fontSize:10,color:"#6E8576",marginTop:2}}>Le ricette con ingredienti esclusi non verranno proposte</div>
        </div>
        {nExcluded>0&&<button onClick={()=>excluded.forEach(id=>onToggle(id))} style={{fontSize:10,color:"#dc2626",background:"none",border:"1px solid #fecaca",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontWeight:700}}>Riabilita tutti</button>}
      </div>
      <div style={{background:"#fff",borderRadius:10,border:"1.5px solid #E7EDE2",padding:"10px 14px",marginBottom:12}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Cerca ingrediente..."
          style={{width:"100%",padding:"7px 10px",border:"1.5px solid #E7EDE2",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {cats.map(c=>(
            <button key={c} onClick={()=>setFilterCat(c)} style={{padding:"4px 10px",borderRadius:6,border:`1.5px solid ${filterCat===c?"#18A957":"#E7EDE2"}`,background:filterCat===c?"#18A957":"#F5F8F1",color:filterCat===c?"#fff":"#6E8576",fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              {c==="Tutte"?"Tutte":c.split(" ").slice(1).join(" ")}
            </button>
          ))}
        </div>
      </div>
      {(()=>{
        const grouped={};
        visible.forEach(ing=>{ if(!grouped[ing.cat]) grouped[ing.cat]=[]; grouped[ing.cat].push(ing); });
        return Object.entries(grouped).map(([cat,items])=>(
          <div key={cat} style={{background:"#fff",borderRadius:12,border:"1.5px solid #E7EDE2",marginBottom:10,overflow:"hidden"}}>
            <div style={{background:"#F5F8F1",borderBottom:"1px solid #EFF3EC",padding:"9px 14px",fontWeight:800,fontSize:12,color:"#13231A",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span>{cat}</span>
              <span style={{fontSize:10,color:"#9DB1A2"}}>{items.filter(i=>excluded.includes(i.id)).length>0?`${items.filter(i=>excluded.includes(i.id)).length} esclus${items.filter(i=>excluded.includes(i.id)).length===1?"o":"i"}`:""}</span>
            </div>
            <div style={{padding:"4px 14px"}}>
              {items.map((ing,i)=>{
                const isExcl=excluded.includes(ing.id), dc=depColor(ing.deperibile);
                const recCount=Object.values(DB).flat().filter(r=>r.ingredients.includes(ing.id)).length;
                return (
                  <div key={ing.id} onClick={()=>onToggle(ing.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<items.length-1?"1px solid #F5F8F1":"none",cursor:"pointer",opacity:isExcl?0.45:1,transition:"opacity 0.2s"}}>
                    <div style={{width:36,height:20,borderRadius:10,background:isExcl?"#E7EDE2":"#22c55e",flexShrink:0,position:"relative",transition:"background 0.2s"}}>
                      <div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:isExcl?2:18,transition:"left 0.2s",boxShadow:"0 1px 3px #0003"}}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:isExcl?"#9DB1A2":"#13231A",textDecoration:isExcl?"line-through":"none"}}>{ing.nome}</div>
                      <div style={{fontSize:10,color:"#9DB1A2",marginTop:1,display:"flex",gap:6,flexWrap:"wrap"}}>
                        <span>{recCount} ricett{recCount===1?"a":"e"}</span>
                        <span style={{color:dc,fontWeight:700}}>{ing.deperibile>=365?"stabile":`${ing.deperibile}g`}</span>
                        {ing.stagioni ? (()=>{
                          const m=meseCorrente();
                          const nomiMesi=["","Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
                          const inStag=ing.stagioni.includes(m);
                          return <span style={{color:inStag?"#16a34a":"#f97316",fontWeight:700}}>{inStag?"✓ stagione":"⚠ fuori stagione"} · {ing.stagioni.map(x=>nomiMesi[x]).join(" ")}</span>;
                        })() : <span>tutto l'anno</span>}
                      </div>
                    </div>
                    {isExcl&&<span style={{fontSize:10,background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:5,padding:"2px 6px",fontWeight:700}}>Escluso</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ));
      })()}
    </div>
  );
}

// ─── PersonaForm ─────────────────────────────────────────────────────

