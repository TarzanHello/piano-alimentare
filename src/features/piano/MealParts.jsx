import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { MEAL_KEYS, MEAL_META, PREP_SLOTS, SK_WATER, WATER_GOAL, WATER_MAX, WATER_ML, classifySwap, findAlternatives, formattaPorzione } from '@/core';
import { logSync } from '@/db/synclog';
import { ConsumedEditorModal, RecipeEditorModal, RicettarioModal } from '@/components/modals';
import { MacroBadge, ProgressBar } from '@/components/shared';
import { ShoppingPage } from '@/features/spesa/ShoppingPage';

export function WaterTracker({ dayKey, personaColor }) {
  // glasses: numero bicchieri bevuti per questo giorno
  const [glasses, setGlasses] = useState(0);
  const [loaded,  setLoaded]  = useState(false);
  const [bounce,  setBounce]  = useState(null); // indice bicchiere animato

  // Chiave storage per questo giorno
  const storageKey = `${SK_WATER}:${dayKey}`;

  useEffect(() => {
    window.storage.get(storageKey)
      .then(r => setGlasses(Math.min(WATER_MAX, parseInt(r.value) || 0)))
      .catch(() => setGlasses(0))
      .finally(() => setLoaded(true));
  }, [storageKey]);

  const setAndSave = async (n) => {
    const clamped = Math.max(0, Math.min(WATER_MAX, n));
    setGlasses(clamped);
    await window.storage.set(storageKey, String(clamped)).catch(() => {});
  };

  const handleGlassClick = (idx) => {
    const next = idx + 1 === glasses ? idx : idx + 1;
    setBounce(idx);
    setTimeout(() => setBounce(null), 300);
    setAndSave(next);
    logSync("acqua", `Acqua aggiornata: ${next * WATER_ML} ml (${next} bicchieri)`, { bicchieri: next, ml: next * WATER_ML, giornoKey: dayKey });
  };

  const ml       = glasses * WATER_ML;
  const pct      = Math.min(100, Math.round((ml / WATER_GOAL) * 100));
  const goal_ok  = ml >= WATER_GOAL;
  const color    = goal_ok ? "#16a34a" : ml >= 1400 ? "#0891b2" : ml >= 800 ? "#d97706" : "#9DB1A2";
  const bgBar    = goal_ok ? "#f0fdf4" : ml >= 1400 ? "#EEF7F0" : ml >= 800 ? "#fffbeb" : "#F5F8F1";
  const label    = goal_ok ? "🎉 Obiettivo raggiunto!" : `${WATER_GOAL - ml} ml al traguardo`;

  if (!loaded) return null;

  return (
    <div style={{background:"#fff",borderRadius:16,border:`1.5px solid ${goal_ok?"#bbf7d0":"#E7EDE2"}`,padding:"16px 18px",marginTop:10,boxShadow:"0 2px 12px #00000008",transition:"border-color 0.3s"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:11,background:"#E8F6FC",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>💧</div>
          <div>
            <div style={{fontSize:13.5,fontWeight:800,color:"#13231A"}}>Idratazione</div>
            <div style={{fontSize:11,color:"#9DB1A2",fontWeight:600}}>Obiettivo {WATER_GOAL/1000} L</div>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div><span style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:21,fontWeight:800,color:"#38BDF8"}}>{(ml/1000).toFixed(1)}</span><span style={{fontSize:12,fontWeight:700,color:"#9DB1A2"}}> L</span></div>
          <div style={{fontSize:9.5,color:goal_ok?"#16a34a":"#9DB1A2",fontWeight:700}}>{label}</div>
        </div>
      </div>

      {/* Segmenti idratazione */}
      <div style={{display:"flex",gap:7}}>
        {Array.from({length: WATER_MAX}).map((_, i) => {
          const filled = i < glasses;
          const anim   = bounce === i;
          return (
            <button key={i} onClick={() => handleGlassClick(i)} title={`${(i+1)*WATER_ML} ml`}
              style={{flex:1,height:38,borderRadius:11,border:"none",cursor:"pointer",padding:0,
                background: filled ? "#38BDF8" : "#E8F1EC",
                transform: anim ? "scaleY(1.15)" : "scaleY(1)",
                transition:"transform 0.15s, background 0.25s",outline:"none"}}/>
          );
        })}
      </div>

      {/* Hint */}
      <div style={{marginTop:10,fontSize:10,color:"#9DB1A2",textAlign:"center"}}>
        Tocca i segmenti per registrare l'acqua bevuta ({WATER_ML} ml l'uno)
      </div>
    </div>
  );
}

// Soglie tempo per i pulsanti del selettore

export function MealCard({ mealKey, dayIdx, meal, personaKey, color, onSwap, weekMealIds, excludedIds, isOverride, onReset, prefEntry, onToggleLike, macroOverride, quantitaOverride, consumed, onToggleConsumed, onEdit, loggedMacros, loggedIngs, onEditConsumed, isAdattato, cloudStatus, ricetteUtente, onSalvaRicetta }) {
  const [open, setOpen]               = useState(false);
  const [swapOpen, setSwapOpen]       = useState(false);
  const [editOpen, setEditOpen]       = useState(false);
  const [consumedEditOpen, setConsumedEditOpen] = useState(false);
  const [ricettarioOpen, setRicettarioOpen] = useState(false);
  const [prepSlot, setPrepSlot]       = useState(null); // fascia di tempo selezionata (oggetto di PREP_SLOTS)

  // Se consumato e abbiamo macro reali dal log, mostriamo quelle; altrimenti le macro del piano
  const m = (consumed && loggedMacros) ? loggedMacros : (macroOverride || meal[personaKey]);
  const { label: rawLabel, isSnack } = MEAL_META[mealKey];
  const mealEmoji = (rawLabel.match(/^\S+/)||[""])[0];
  const label = rawLabel.replace(/^\S+\s*/,"");
  const iconBg = isSnack?"#FDF3E2":mealKey==="colazione"?"#FFF4DA":mealKey==="cena"?"#F3F9EC":"#EAF7EE";

  const prep = meal.prep;
  const prepColor = !prep ? "#9DB1A2" : prep <= 15 ? "#16a34a" : prep <= 30 ? "#d97706" : "#dc2626";
  const prepBg    = !prep ? "#F5F8F1"  : prep <= 15 ? "#f0fdf4" : prep <= 30 ? "#fffbeb" : "#fef2f2";
  const prepLabel = !prep ? null : prep >= 60 ? `${prep/60}h` : `${prep}'`;

  // Alternative calcolate al volo quando l'utente sceglie un filtro tempo
  const alternatives = prepSlot !== null
    ? findAlternatives(mealKey, meal, prepSlot.min, prepSlot.max, excludedIds || [], weekMealIds || new Set(), personaKey, ricetteUtente || [])
    : [];

  return (
    <div style={{background:"#fff",borderRadius:18,border:`1.5px solid ${isOverride?"#DCEBCF":"#fff"}`,marginBottom:11,overflow:"hidden",boxShadow:"0 12px 30px -18px rgba(15,58,41,0.28)"}}>

      {/* ── Header pasto ── */}
      <div onClick={()=>{ setOpen(o=>!o); if(swapOpen) setSwapOpen(false); }}
        style={{background:consumed?"#f0fdf4":"#fff",borderBottom:(open||swapOpen)?`1px solid #F1F5EE`:"none",padding:"12px 14px",display:"flex",alignItems:"center",gap:11,cursor:"pointer",userSelect:"none"}}>
        <div style={{width:32,height:32,borderRadius:10,background:iconBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{mealEmoji}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontWeight:800,fontSize:isSnack?12:13.5,color:"#10271B"}}>{label}</span>
            {isOverride && <span style={{fontSize:9,background:"#7c3aed",color:"#fff",borderRadius:5,padding:"1px 5px",fontWeight:800}}>MOD</span>}
            {consumed && loggedMacros && <span style={{fontSize:9,background:"#16a34a",color:"#fff",borderRadius:5,padding:"1px 5px",fontWeight:800}}>✓ reale</span>}
            {isAdattato && <span style={{fontSize:9,background:"#0891b2",color:"#fff",borderRadius:5,padding:"1px 5px",fontWeight:800}}>⚖ riadattato</span>}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {prepLabel && (
            <span style={{fontSize:10.5,fontWeight:700,color:"#18A957",background:"#EAF7EE",borderRadius:7,padding:"3px 8px"}}>
              {prepLabel}
            </span>
          )}
          <span style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:14,fontWeight:800,color:consumed&&loggedMacros?"#16a34a":"#10271B"}}>{m.kcal}</span>
          <span style={{color:"#C2D0C6",fontSize:10}}>{open?"▲":"▼"}</span>
        </div>
      </div>

      {/* ── Corpo principale ── */}
      <div style={{padding:"10px 14px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:8}}>
          <div onClick={()=>{ setOpen(o=>!o); if(swapOpen) setSwapOpen(false); }}
            style={{fontSize:isSnack?13:14.5,fontWeight:600,color:"#13231A",lineHeight:1.35,flex:1,cursor:"pointer",userSelect:"none"}}>
            {meal.nome}
          </div>
          <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
            {/* Bottone like */}
            <button
              onClick={e=>{ e.stopPropagation(); onToggleLike && (logSync("gusti", `${prefEntry?.liked?"Rimosso like":"Like"}: ${meal.nome?.slice(0,30)}`, {id:meal.id}), onToggleLike()); }}
              aria-label={prefEntry?.liked ? "Rimuovi preferito" : "Segna come preferito"}
              title={prefEntry?.liked ? "Tolta dai preferiti" : "Aggiungi ai preferiti"}
              style={{flexShrink:0,width:31,height:28,borderRadius:7,border:`1.5px solid ${prefEntry?.liked?"#ef4444":"#E7EDE2"}`,background:prefEntry?.liked?"#fef2f2":"#F5F8F1",cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,padding:0}}>
              <span style={{filter:prefEntry?.liked?"none":"grayscale(1) opacity(0.55)"}}>{prefEntry?.liked?"❤️":"🤍"}</span>
            </button>
            {/* Bottone consumato */}
            <button onClick={e=>{ e.stopPropagation(); logSync("pasto-log", `${consumed?"Rimarca non consumato":"Segna consumato"}: ${mealKey}`, {dayIdx, mealKey, pasto:meal?.nome?.slice(0,25)}); onToggleConsumed&&onToggleConsumed(); }} title={consumed?"Segna come non consumato":"Segna come consumato"}
              style={{flexShrink:0,width:31,height:28,borderRadius:7,border:`1.5px solid ${consumed?"#16a34a":"#E7EDE2"}`,background:consumed?"#f0fdf4":"#F5F8F1",cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,padding:0}}>
              <span style={{filter:consumed?"none":"grayscale(1) opacity(0.4)"}}>{consumed?"✅":"☑️"}</span>
            </button>
            {/* Bottone modifica calorie consumate — visibile solo se consumato */}
            {consumed && (
              <button
                onClick={e=>{ e.stopPropagation(); setConsumedEditOpen(true); setOpen(false); setSwapOpen(false); }}
                title="Modifica cosa hai mangiato davvero"
                style={{flexShrink:0,padding:"5px 8px",borderRadius:7,border:"1.5px solid #16a34a",background:"#f0fdf4",color:"#16a34a",fontWeight:700,fontSize:11,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:3}}>
                ✏️ <span style={{fontSize:10}}>mangiato</span>
              </button>
            )}
            {/* Bottone modifica ricetta (solo se NON consumato) */}
            {!consumed && (
              <button
                onClick={e=>{ e.stopPropagation(); setEditOpen(true); setOpen(false); setSwapOpen(false); }}
                title="Modifica ingredienti e quantità"
                style={{flexShrink:0,width:31,height:28,borderRadius:7,border:"1.5px solid #E7EDE2",background:"#F5F8F1",cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,padding:0,color:"#6E8576",fontWeight:700}}>
                ✏️
              </button>
            )}
            {/* Bottone swap (solo se NON consumato) */}
            {!consumed && (
              <button
                onClick={e=>{ e.stopPropagation(); setSwapOpen(s=>!s); setOpen(false); if(!swapOpen) setMaxPrep(null); }}
                style={{flexShrink:0,padding:"5px 10px",borderRadius:7,border:`1.5px solid ${swapOpen?"#7c3aed":"#E7EDE2"}`,background:swapOpen?"#7c3aed":"#F5F8F1",color:swapOpen?"#fff":"#6E8576",fontWeight:700,fontSize:11,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                {swapOpen?"✕":"⇄ Cambia"}
              </button>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <MacroBadge label="P" value={m.p} color="#1FA2D8"/>
          <MacroBadge label="C" value={m.c} color="#F2A93B"/>
          <MacroBadge label="G" value={m.g} color="#8E7BE8"/>
        </div>

        {/* Porzione reale (se consumato con ingredienti personalizzati) */}
        {consumed && loggedIngs && open && (
          <div style={{marginTop:10,background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#166534",lineHeight:1.6}}>
            <span style={{fontWeight:700,color:"#16a34a",fontSize:10,textTransform:"uppercase",letterSpacing:0.8}}>✅ Mangiato davvero · </span>
            {formattaPorzione(loggedIngs)}
          </div>
        )}

        {/* Porzione pianificata (espansa) — se non consumato o senza dati reali */}
        {open && !loggedIngs && (quantitaOverride || meal.porzioni?.[personaKey]) && (
          <div style={{marginTop:10,background:color+"08",border:`1px solid ${color}20`,borderRadius:8,padding:"8px 12px",fontSize:12,color:"#2F5547",lineHeight:1.6}}>
            <span style={{fontWeight:700,color,fontSize:10,textTransform:"uppercase",letterSpacing:0.8}}>
              📏 Porzione{quantitaOverride ? " personalizzata" : ""} · </span>
            {quantitaOverride ? formattaPorzione(quantitaOverride) : meal.porzioni[personaKey]}
          </div>
        )}

        {/* Reset override */}
        {isOverride && !swapOpen && (
          <div style={{display:"flex",gap:6,marginTop:8}}>
            <button onClick={e=>{ e.stopPropagation(); onReset(); }}
              style={{flex:1,padding:"6px",borderRadius:7,border:"1px solid #7c3aed30",background:"#f5f3ff",color:"#7c3aed",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              ↩ Ripristina originale
            </button>
            {cloudStatus?.loggedIn && onSalvaRicetta && (
              <button onClick={e=>{ e.stopPropagation(); onSalvaRicetta(meal); }}
                style={{flex:1,padding:"6px",borderRadius:7,border:"1px solid #16a34a30",background:"#f0fdf4",color:"#16a34a",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                💾 Salva come ricetta
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Modal modifica ricetta ── */}
      {editOpen && (
        <RecipeEditorModal
          meal={meal}
          mealKey={mealKey}
          personaKey={personaKey}
          quantitaScalate={quantitaOverride || null}
          onSave={customRecipe => {
            setEditOpen(false);
            onEdit && onEdit(customRecipe);
          }}
          onClose={() => setEditOpen(false)}
        />
      )}

      {/* ── Modal modifica pasto consumato ── */}
      {consumedEditOpen && (
        <ConsumedEditorModal
          meal={meal}
          mealKey={mealKey}
          personaKey={personaKey}
          initialIngs={loggedIngs || null}
          onSave={data => {
            setConsumedEditOpen(false);
            onEditConsumed && onEditConsumed(data);
          }}
          onClose={() => setConsumedEditOpen(false)}
        />
      )}

      {/* ── Drawer sostituzione ── */}
      {swapOpen && (
        <div style={{borderTop:"1px solid #E7EDE2",background:"#fafafa",padding:"12px 14px"}}>
          {/* Come verrà interpretato questo swap */}
          {(()=>{
            const tipo = classifySwap(dayIdx, mealKey);
            const isContesto = tipo === "contesto";
            return (
              <div style={{display:"flex",alignItems:"flex-start",gap:7,background:isContesto?"#fffbeb":"#f5f3ff",border:`1px solid ${isContesto?"#fde68a":"#ddd6fe"}`,borderRadius:8,padding:"8px 11px",marginBottom:12,fontSize:10.5,lineHeight:1.5,color:isContesto?"#92400e":"#6d28d9"}}>
                <span style={{fontSize:13,flexShrink:0}}>{isContesto?"⏱":"🔄"}</span>
                <span>
                  {isContesto
                    ? <>Pasto imminente: questo cambio conta come <strong>fretta</strong>, non penalizza i gusti della ricetta.</>
                    : <>Cambio pianificato in anticipo: conta come <strong>preferenza di gusto</strong>.</>}
                </span>
              </div>
            );
          })()}
          {/* Selettore tempo + accesso al ricettario completo */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,gap:8}}>
            <div style={{fontSize:10,fontWeight:800,color:"#13231A",textTransform:"uppercase",letterSpacing:0.8}}>
              ⏱ Quanto tempo hai?
            </div>
            <button onClick={()=>setRicettarioOpen(true)}
              title="Sfoglia tutte le ricette di questa categoria"
              style={{flexShrink:0,display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:7,border:"1.5px solid #7c3aed30",background:"#f5f3ff",color:"#7c3aed",fontWeight:700,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>
              📖 Ricettario
            </button>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
            {PREP_SLOTS.map(s=>(
              <button key={s.label} onClick={()=>setPrepSlot(prepSlot===s?null:s)}
                style={{padding:"6px 12px",borderRadius:8,border:`2px solid ${prepSlot===s?s.color:"#E7EDE2"}`,background:prepSlot===s?s.bg:"#fff",color:prepSlot===s?s.color:"#6E8576",fontWeight:700,fontSize:12,cursor:"pointer",transition:"all 0.15s"}}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Risultati */}
          {prepSlot === null ? (
            <div style={{textAlign:"center",padding:"12px 0",color:"#9DB1A2",fontSize:12}}>
              Seleziona il tempo disponibile per vedere le alternative,<br/>
              oppure apri il <strong>📖 Ricettario</strong> per scegliere tra tutte le ricette
            </div>
          ) : alternatives.length === 0 ? (
            <div style={{textAlign:"center",padding:"12px 0",color:"#9DB1A2",fontSize:12}}>
              Nessuna ricetta nella fascia {prepSlot.label} 😔<br/>
              <span style={{fontSize:11}}>Prova un'altra fascia di tempo, oppure apri il 📖 Ricettario per vedere tutte le ricette</span>
            </div>
          ) : (
            <div>
              <div style={{fontSize:10,color:"#6E8576",marginBottom:8,fontWeight:600}}>
                {alternatives.length} alternative trovate · ordinate per calorie simili
              </div>
              {alternatives.map(alt=>{
                const altM = alt[personaKey];
                const altPrep = alt.prep || 0;
                const altPrepColor = altPrep<=15?"#16a34a":altPrep<=30?"#d97706":"#dc2626";
                const kcalDiff = altM?.kcal - m.kcal;
                const diffColor = Math.abs(kcalDiff)<=50?"#16a34a":Math.abs(kcalDiff)<=100?"#d97706":"#9DB1A2";
                return (
                  <div key={alt.id} onClick={()=>{ onSwap(alt); setSwapOpen(false); setMaxPrep(null); }}
                    style={{background:"#fff",borderRadius:10,border:"1.5px solid #E7EDE2",padding:"10px 12px",marginBottom:7,cursor:"pointer",transition:"border-color 0.15s",display:"flex",alignItems:"center",gap:10}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#7c3aed80"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="#E7EDE2"}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#13231A",lineHeight:1.3,marginBottom:5}}>{alt.nome}</div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{fontSize:10,fontWeight:700,color:altPrepColor,background:altPrepColor+"18",borderRadius:5,padding:"1px 6px"}}>⏱ {altPrep}'</span>
                        <span style={{fontSize:10,fontFamily:"monospace",fontWeight:700,color:"#13231A"}}>{altM?.kcal} kcal</span>
                        <span style={{fontSize:10,fontWeight:700,color:diffColor}}>
                          {kcalDiff===0?"=":`${kcalDiff>0?"+":""}${kcalDiff} kcal`}
                        </span>
                        {alt._inWeek && <span style={{fontSize:9,color:"#f97316",background:"#fff7ed",borderRadius:4,padding:"1px 5px",fontWeight:700}}>già in sett.</span>}
                      </div>
                    </div>
                    <div style={{flexShrink:0,width:28,height:28,borderRadius:"50%",background:"#7c3aed10",border:"1.5px solid #7c3aed30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>→</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modal Ricettario: tutte le ricette della categoria ── */}
      {ricettarioOpen && (
        <RicettarioModal
          mealKey={mealKey}
          currentMeal={meal}
          personaKey={personaKey}
          cloudStatus={cloudStatus}
          onClose={()=>setRicettarioOpen(false)}
          onPick={alt => { onSwap(alt); setRicettarioOpen(false); setSwapOpen(false); setPrepSlot(null); }}
        />
      )}
    </div>
  );
}

// ─── Ricalcolo proporzionale porzioni non consumate ──────────────────
// Dato il dayLog (pasti consumati con macro reali) e i macro piano per ogni
// pasto, ridistribuisce il delta calorico sui pasti non ancora consumati,
// proporzionalmente al loro peso calorico nel piano.
// Restituisce:
//   { adattato: { [mk]: {kcal,p,c,g} },   // macro riadattati x pasti non consumati
//     delta: number,                        // kcal di scarto dai pasti consumati
//     avviso: string|null }                 // messaggio se delta non assorbibile

export function TotaleBar({ dayData, personaKey, color, target, macroPerPasto, dayLog }) {
  // macroPerPasto: se presente (persona con misure), contiene i macro
  // riscalati per ogni mealKey; altrimenti si usa la taglia fissa.
  // dayLog: dati mealsLog del giorno corrente per questa persona;
  //         se un pasto è consumed, si usano i macro reali dal log.
  const tot = MEAL_KEYS.reduce((a,mk)=>{
    const logEntry = dayLog && dayLog[mk];
    // Se il pasto è stato consumato e ha macro nel log, usa quelli (valori reali)
    const m = (logEntry && logEntry.consumed && (logEntry.kcal || logEntry._ingredienti))
      ? {kcal: logEntry.kcal||0, p: logEntry.p||0, c: logEntry.c||0, g: logEntry.g||0}
      : (macroPerPasto && macroPerPasto[mk]) || dayData[mk][personaKey];
    return {kcal:a.kcal+m.kcal,p:a.p+m.p,c:a.c+m.c,g:a.g+m.g};
  },{kcal:0,p:0,c:0,g:0});
  const t = target||{kcal:2000,p:150,c:200,g:65};
  return (
    <div style={{background:"linear-gradient(140deg,#10271B,#13402C)",borderRadius:18,padding:"16px 18px",marginTop:6}}>
      <div style={{fontSize:10,fontWeight:800,color:"#9DE837",marginBottom:13,letterSpacing:1.2,textTransform:"uppercase"}}>Totale giornaliero</div>
      {[{l:"Kcal",v:tot.kcal,m:t.kcal,c:"#9DE837"},{l:"Proteine",v:tot.p,m:t.p,c:"#1FA2D8"},{l:"Carbo",v:tot.c,m:t.c,c:"#F2A93B"},{l:"Grassi",v:tot.g,m:t.g,c:"#8E7BE8"}].map(({l,v,m,c})=>{
        const pct = m>0?Math.min(100,Math.round(v/m*100)):0;
        return (
        <div key={l} style={{display:"flex",alignItems:"center",gap:11,marginBottom:l==="Grassi"?0:10}}>
          <span style={{width:58,fontSize:11,fontWeight:700,color:"#9DB1A2"}}>{l}</span>
          <div style={{flex:1,height:7,background:"rgba(255,255,255,0.12)",borderRadius:99,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:v>m?"#ef4444":c,borderRadius:99,transition:"width 0.5s ease"}}/>
          </div>
          <span style={{fontSize:11,fontWeight:800,minWidth:72,textAlign:"right",color:v>m?"#fca5a5":"#F4F7EF"}}>{Math.round(v)}/{m}</span>
        </div>
      );})}
    </div>
  );
}

// ─── ShoppingPage ────────────────────────────────────────────────────

