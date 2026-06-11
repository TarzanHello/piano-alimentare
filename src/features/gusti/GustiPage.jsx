import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { DB, getPrefEntry } from '@/core';
import { App } from '@/App';

export function GustiPage({ prefs, onToggleLike, onResetPrefs }) {
  // Costruisce l'elenco completo: ogni ricetta del DB + i suoi segnali.
  const allRecipes = Object.values(DB).flat();
  const catLabel = { colazione:"☀️ Colazione", spuntino:"🍎 Spuntino", pranzo:"🥗 Pranzo", cena:"🍽️ Cena" };
  const recipeCat = {};
  Object.entries(DB).forEach(([cat, list]) => list.forEach(r => { recipeCat[r.id] = cat; }));

  const rows = allRecipes.map(r => {
    const e = getPrefEntry(prefs, r.id);
    return { ...r, _pref:e, _hasSignal: e.liked || e.swapsOut>0 || e.swapsIn>0 };
  });

  const liked     = rows.filter(r => r._pref.liked);
  const disliked  = rows.filter(r => !r._pref.liked && r._pref.swapsOut > 0)
                        .sort((a,b) => b._pref.swapsOut - a._pref.swapsOut);
  const nSignals  = rows.filter(r => r._hasSignal).length;

  // Swap di contesto registrati (fretta / vincoli orari)
  const contextSwaps = (prefs && prefs.contextSwaps) || [];
  const hasAnyData   = nSignals > 0 || contextSwaps.length > 0;

  // Sintesi per fascia oraria: per ogni pasto, quante volte è stato
  // cambiato all'ultimo minuto e la media dei minuti di preparazione
  // delle ricette scartate (segnale "in quella fascia voglio cose veloci").
  const mealLabel = { colazione:"☀️ Colazione", spuntino_m:"🍎 Spunt. mattina",
                      pranzo:"🥗 Pranzo", spuntino_p:"🫐 Spunt. pomeriggio", cena:"🍽️ Cena" };
  const byMeal = {};
  contextSwaps.forEach(s => {
    if (!byMeal[s.mealKey]) byMeal[s.mealKey] = { n:0, sumOutPrep:0 };
    byMeal[s.mealKey].n += 1;
    byMeal[s.mealKey].sumOutPrep += (s.outPrep || 0);
  });
  const contextByMeal = Object.entries(byMeal)
    .map(([mk,v]) => ({ mealKey:mk, n:v.n, avgOutPrep: Math.round(v.sumOutPrep / v.n) }))
    .sort((a,b) => b.n - a.n);

  const Stat = ({emoji,n,label,color}) => (
    <div style={{flex:1,background:"#fff",borderRadius:10,border:"1.5px solid #e2e8f0",padding:"12px 8px",textAlign:"center"}}>
      <div style={{fontSize:20}}>{emoji}</div>
      <div style={{fontSize:20,fontWeight:800,color,fontFamily:"monospace",marginTop:2}}>{n}</div>
      <div style={{fontSize:9,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,marginTop:2}}>{label}</div>
    </div>
  );

  return (
    <div>
      {/* Intro */}
      <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:11,color:"#0369a1",lineHeight:1.6}}>
        ℹ️ L'app distingue due cose: le sostituzioni fatte <strong>con anticipo</strong> contano come <strong>gusto</strong>, quelle fatte <strong>a ridosso del pasto</strong> come <strong>fretta</strong> — e non penalizzano la ricetta.
      </div>

      {/* Statistiche */}
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <Stat emoji="❤️" n={liked.length}          label="Preferite"  color="#ef4444"/>
        <Stat emoji="🔄" n={disliked.length}       label="Non gradite" color="#7c3aed"/>
        <Stat emoji="⏱" n={contextSwaps.length}    label="Per fretta" color="#d97706"/>
      </div>

      {!hasAnyData ? (
        <div style={{textAlign:"center",padding:"50px 20px",color:"#94a3b8"}}>
          <div style={{fontSize:48,marginBottom:12}}>🌱</div>
          <div style={{fontSize:14,fontWeight:700,color:"#64748b"}}>Nessun dato ancora</div>
          <div style={{fontSize:12,marginTop:6,lineHeight:1.6}}>
            Metti ❤️ alle ricette che ami e usa <strong>⇄ Cambia</strong> per sostituire quelle che non ti convincono.<br/>L'app inizierà a imparare.
          </div>
        </div>
      ) : (
        <>
          {/* Preferite */}
          {liked.length > 0 && (
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",marginBottom:12,overflow:"hidden"}}>
              <div style={{background:"#fef2f2",borderBottom:"1px solid #fee2e2",padding:"9px 14px",fontWeight:800,fontSize:12,color:"#dc2626"}}>
                ❤️ Ricette preferite
              </div>
              <div style={{padding:"4px 14px"}}>
                {liked.map((r,i)=>(
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<liked.length-1?"1px solid #f8fafc":"none"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12.5,fontWeight:600,color:"#1e293b",lineHeight:1.3}}>{r.nome}</div>
                      <div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>{catLabel[recipeCat[r.id]]||""}</div>
                    </div>
                    <button onClick={()=>onToggleLike(r.id)}
                      style={{flexShrink:0,width:30,height:28,borderRadius:7,border:"1.5px solid #ef4444",background:"#fef2f2",cursor:"pointer",fontSize:13,padding:0}}>
                      ❤️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Non gradite (swap di gusto) */}
          {disliked.length > 0 && (
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",marginBottom:12,overflow:"hidden"}}>
              <div style={{background:"#f5f3ff",borderBottom:"1px solid #ede9fe",padding:"9px 14px",fontWeight:800,fontSize:12,color:"#7c3aed"}}>
                🔄 Ricette che cambi spesso
              </div>
              <div style={{padding:"4px 14px"}}>
                {disliked.map((r,i)=>(
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<disliked.length-1?"1px solid #f8fafc":"none"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12.5,fontWeight:600,color:"#1e293b",lineHeight:1.3}}>{r.nome}</div>
                      <div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>{catLabel[recipeCat[r.id]]||""}</div>
                    </div>
                    <span style={{flexShrink:0,fontSize:10,fontWeight:700,color:"#7c3aed",background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:5,padding:"3px 8px"}}>
                      cambiata {r._pref.swapsOut}×
                    </span>
                  </div>
                ))}
              </div>
              <div style={{padding:"8px 14px",fontSize:10,color:"#94a3b8",lineHeight:1.5}}>
                Sostituzioni decise con anticipo: contano come gusto. Con la generazione adattiva verranno proposte meno spesso.
              </div>
            </div>
          )}

          {/* Fasce orarie — swap fatti per fretta */}
          {contextByMeal.length > 0 && (
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",marginBottom:12,overflow:"hidden"}}>
              <div style={{background:"#fffbeb",borderBottom:"1px solid #fde68a",padding:"9px 14px",fontWeight:800,fontSize:12,color:"#d97706"}}>
                ⏱ Pasti cambiati per fretta
              </div>
              <div style={{padding:"4px 14px"}}>
                {contextByMeal.map((c,i)=>(
                  <div key={c.mealKey} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<contextByMeal.length-1?"1px solid #f8fafc":"none"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12.5,fontWeight:600,color:"#1e293b",lineHeight:1.3}}>{mealLabel[c.mealKey]||c.mealKey}</div>
                      <div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>
                        ricette scartate: ~{c.avgOutPrep}′ di preparazione in media
                      </div>
                    </div>
                    <span style={{flexShrink:0,fontSize:10,fontWeight:700,color:"#d97706",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:5,padding:"3px 8px"}}>
                      {c.n}× di fretta
                    </span>
                  </div>
                ))}
              </div>
              <div style={{padding:"8px 14px",fontSize:10,color:"#94a3b8",lineHeight:1.5}}>
                Cambi fatti vicino all'orario del pasto: <strong>non penalizzano la ricetta</strong>. Indicano in quali fasce servono piatti più rapidi — utile per i piani futuri.
              </div>
            </div>
          )}

          {/* Reset */}
          <button onClick={onResetPrefs}
            style={{width:"100%",padding:"10px",borderRadius:10,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontWeight:700,fontSize:12,cursor:"pointer",marginTop:4}}>
            🗑 Azzera tutti i dati sui gusti
          </button>
        </>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────

