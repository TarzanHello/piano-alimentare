import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { MEAL_KEYS, MEAL_META, PREP_SLOTS, SK_WATER, WATER_GOAL, WATER_MAX, WATER_ML, classifySwap, findAlternatives, formattaPorzione } from '@/core';
import { logSync } from '@/db/synclog';
import { ConsumedEditorModal, RecipeEditorModal, RicettarioModal } from '@/components/modals';
import { ShoppingPage } from '@/features/spesa/ShoppingPage';

export function WaterTracker({ dayKey, personaColor, personaId, readOnly }) {
  // glasses: numero bicchieri bevuti per questo giorno
  const [glasses, setGlasses] = useState(0);
  const [loaded,  setLoaded]  = useState(false);
  const [bounce,  setBounce]  = useState(null); // indice bicchiere animato

  // Chiave storage PER PERSONA e per giorno: l'idratazione è un dato del singolo
  // profilo, non condiviso. (Retro-compatibile: se manca personaId usa la
  // vecchia chiave solo-giorno.)
  const storageKey = personaId ? `${SK_WATER}:${personaId}:${dayKey}` : `${SK_WATER}:${dayKey}`;

  useEffect(() => {
    let vivo = true;
    (async () => {
      // Valore nel formato corrente `SK_WATER:{pid}:{giorno}`
      let n = 0;
      try { const r = await window.storage.get(storageKey); n = parseInt(r.value) || 0; } catch {}
      // MIGRAZIONE: la pagina Piano usava la chiave `SK_WATER:{pid}-{giorno}`
      // (personaId incorporato nel dayKey). Leggo anche quella e tengo il
      // valore più alto, ri-persistendo sulla chiave corrente: così i dati
      // registrati da Oggi e da Piano tornano a coincidere.
      if (personaId) {
        try {
          const leg = await window.storage.get(`${SK_WATER}:${personaId}-${dayKey}`);
          const nLeg = parseInt(leg.value) || 0;
          if (nLeg > n) {
            n = nLeg;
            window.storage.set(storageKey, String(n)).catch(() => {});
          }
        } catch {}
      }
      if (vivo) { setGlasses(Math.min(WATER_MAX, n)); setLoaded(true); }
    })();
    return () => { vivo = false; };
  }, [storageKey]);

  const setAndSave = async (n) => {
    const clamped = Math.max(0, Math.min(WATER_MAX, n));
    setGlasses(clamped);
    await window.storage.set(storageKey, String(clamped)).catch(() => {});
  };

  const handleGlassClick = (idx) => {
    if (readOnly) return;
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
            <div style={{fontSize:13.5,fontWeight:800,color:"#15251C"}}>Idratazione</div>
            <div style={{fontSize:11,color:"#9DB1A2",fontWeight:600}}>Obiettivo {WATER_GOAL/1000} L</div>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div><span style={{fontFamily:"'Outfit',sans-serif",fontSize:21,fontWeight:800,color:"#38BDF8"}}>{(ml/1000).toFixed(1)}</span><span style={{fontSize:12,fontWeight:700,color:"#9DB1A2"}}> L</span></div>
          <div style={{fontSize:9.5,color:goal_ok?"#16a34a":"#9DB1A2",fontWeight:700}}>{label}</div>
        </div>
      </div>

      {/* Segmenti idratazione */}
      <div style={{display:"flex",gap:7}}>
        {Array.from({length: WATER_MAX}).map((_, i) => {
          const filled = i < glasses;
          const anim   = bounce === i;
          return (
            <button key={i} onClick={() => handleGlassClick(i)} title={readOnly?"Sola lettura":`${(i+1)*WATER_ML} ml`} disabled={readOnly}
              style={{flex:1,height:38,borderRadius:11,border:"none",cursor:readOnly?"default":"pointer",padding:0,
                background: filled ? "#38BDF8" : "#E8F1EC",
                opacity: readOnly && !filled ? 0.6 : 1,
                transform: anim ? "scaleY(1.15)" : "scaleY(1)",
                transition:"transform 0.15s, background 0.25s",outline:"none"}}/>
          );
        })}
      </div>

      {/* Hint */}
      <div style={{marginTop:10,fontSize:10,color:"#9DB1A2",textAlign:"center"}}>
        {readOnly ? "🔒 Idratazione di un altro membro: sola lettura" : `Tocca i segmenti per registrare l'acqua bevuta (${WATER_ML} ml l'uno)`}
      </div>
    </div>
  );
}

// Soglie tempo per i pulsanti del selettore

export function MealCard({ mealKey, dayIdx, meal, personaKey, color, onSwap, weekMealIds, excludedIds, isOverride, onReset, prefEntry, onToggleLike, onToggleDislike, macroOverride, quantitaOverride, consumed, saltato, saltatoAuto, onToggleConsumed, onToggleSaltato, onEdit, loggedMacros, loggedIngs, onEditConsumed, gPiano, gConsumati, isAdattato, cloudStatus, ricetteUtente, onSalvaRicetta, readOnly, autoApriSwap, onAutoSwapDone , onAdotta, adottata }) {
  const [open, setOpen]               = useState(false);
  const [swapOpen, setSwapOpen]       = useState(false);
  const [editOpen, setEditOpen]       = useState(false);
  const [consumedEditOpen, setConsumedEditOpen] = useState(false);
  const [ricettarioOpen, setRicettarioOpen] = useState(false);
  const [prepSlot, setPrepSlot]       = useState(null); // fascia di tempo selezionata (oggetto di PREP_SLOTS)
  const rootRef = useRef(null);

  // Salto da "Oggi": apre il drawer di sostituzione già al montaggio e
  // porta la card al centro dello schermo. One-shot: consumato il segnale,
  // avvisa il padre così non si ripete alla prossima visita del Piano.
  useEffect(() => {
    if (!autoApriSwap || readOnly) { if (autoApriSwap) onAutoSwapDone && onAutoSwapDone(); return; }
    setSwapOpen(true);
    const t = setTimeout(() => {
      try { rootRef.current?.scrollIntoView({ behavior:"smooth", block:"center" }); } catch {}
    }, 80);
    onAutoSwapDone && onAutoSwapDone();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Quantità consumata (grammi) ──────────────────────────────────────
  // Base per lo scaling = macro PIANIFICATO del pasto (macroOverride), peso = gPiano.
  // Vuoto ⇒ ricetta intera. Scala kcal/p/c/g in proporzione ai grammi mangiati.
  const scalabile = consumed && !readOnly && gPiano > 0;
  const [gStr, setGStr] = useState(gConsumati != null ? String(gConsumati) : "");
  useEffect(() => { setGStr(gConsumati != null ? String(gConsumati) : ""); }, [gConsumati]);
  const commitGrammi = () => {
    if (!scalabile || !onEditConsumed) return;
    const base = macroOverride || meal[personaKey] || { kcal:0, p:0, c:0, g:0 };
    const raw = gStr.trim().replace(",", ".");
    if (raw === "") {   // vuoto ⇒ intero
      onEditConsumed({ kcal:Math.round(base.kcal), p:Math.round(base.p), c:Math.round(base.c), g:Math.round(base.g), gPiano, gConsumati:null, _ingredienti:null });
      return;
    }
    const g = parseFloat(raw);
    if (!isFinite(g) || g < 0) { setGStr(gConsumati != null ? String(gConsumati) : ""); return; }
    const factor = Math.min(Math.max(g / gPiano, 0.05), 10);   // clamp 5%–1000%
    onEditConsumed({ kcal:Math.round(base.kcal*factor), p:Math.round(base.p*factor), c:Math.round(base.c*factor), g:Math.round(base.g*factor), gPiano, gConsumati:g, _ingredienti:null });
  };

  // ── Bottone azione della card: icona + micro-etichetta, larghezza fluida ──
  const ActionBtn = ({ onClick, title, ariaLabel, active, accent="#2F6B3A", filled, icon, label, dimIcon=true }) => (
    <button onClick={onClick} title={title} aria-label={ariaLabel || title}
      style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2.5,
        padding:"7px 2px",borderRadius:10,cursor:"pointer",transition:"all 0.15s",
        border:`1.5px solid ${filled?accent:active?accent:"#E7EDE2"}`,
        background: filled?accent : active?accent+"14" : "#F8FAF6",
        color: filled?"#fff" : active?accent : "#6E8576"}}>
      <span style={{fontSize:14,lineHeight:1,fontWeight:800,filter:(active||filled||!dimIcon)?"none":"grayscale(1) opacity(0.55)"}}>{icon}</span>
      <span style={{fontSize:8.5,fontWeight:800,letterSpacing:0.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{label}</span>
    </button>
  );

  return (
    <div ref={rootRef} style={{background:"#fff",borderRadius:18,border:`1.5px solid ${isOverride?"#DCEBCF":"#fff"}`,marginBottom:11,overflow:"hidden",boxShadow:"0 12px 30px -18px rgba(15,58,41,0.28)"}}>

      {/* ── Header pasto ── */}
      <div onClick={()=>{ setOpen(o=>!o); if(swapOpen) setSwapOpen(false); }}
        style={{background:saltato?"#fbf3f3":consumed?"#f0fdf4":"#fff",borderBottom:(open||swapOpen)?`1px solid #F1F5EE`:"none",padding:"12px 14px",display:"flex",alignItems:"center",gap:11,cursor:"pointer",userSelect:"none",opacity:saltato?0.85:1}}>
        <div style={{width:32,height:32,borderRadius:10,background:iconBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,filter:saltato?"grayscale(0.6)":"none"}}>{mealEmoji}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontWeight:800,fontSize:isSnack?12:13.5,color:saltato?"#9DB1A2":"#15251C",textDecoration:saltato?"line-through":"none"}}>{label}</span>
            {isOverride && <span style={{fontSize:9,background:"#7c3aed",color:"#fff",borderRadius:5,padding:"1px 5px",fontWeight:800}}>MOD</span>}
            {consumed && loggedMacros && <span style={{fontSize:9,background:"#16a34a",color:"#fff",borderRadius:5,padding:"1px 5px",fontWeight:800}}>✓ reale</span>}
            {saltato && <span style={{fontSize:9,background:"#dc2626",color:"#fff",borderRadius:5,padding:"1px 5px",fontWeight:800}}>{saltatoAuto?"✗ non mangiato · auto":"✗ non mangiato"}</span>}
            {isAdattato && <span style={{fontSize:9,background:"#0891b2",color:"#fff",borderRadius:5,padding:"1px 5px",fontWeight:800}}>⚖ riadattato</span>}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {prepLabel && !saltato && (
            <span style={{fontSize:10.5,fontWeight:700,color:"#2F6B3A",background:"#EAF7EE",borderRadius:7,padding:"3px 8px"}}>
              {prepLabel}
            </span>
          )}
          <span style={{fontFamily:"'Outfit',sans-serif",fontSize:14,fontWeight:800,color:consumed&&loggedMacros?"#16a34a":"#15251C",textDecoration:saltato?"line-through":"none",opacity:saltato?0.6:1}}>{m.kcal}</span>
          <span style={{color:"#C2D0C6",fontSize:10}}>{open?"▲":"▼"}</span>
        </div>
      </div>

      {/* ── Corpo principale ── */}
      <div style={{padding:"12px 14px"}}>
        {/* Nome pasto: riga piena, mai schiacciato dalle azioni */}
        <div onClick={()=>{ setOpen(o=>!o); if(swapOpen) setSwapOpen(false); }}
          style={{fontSize:isSnack?13.5:15.5,fontWeight:700,color:saltato?"#9DB1A2":"#15251C",lineHeight:1.3,letterSpacing:-0.2,cursor:"pointer",userSelect:"none",textDecoration:saltato?"line-through":"none"}}>
          {meal.nome}
        </div>

        {/* Ripartizione energetica: barra segmentata + chip P/C/G con % kcal */}
        {(()=>{
          const segs = [
            { k:"P", nome:"Proteine",    g:m.p, kcal:(m.p||0)*4, c:"#1FA2D8" },
            { k:"C", nome:"Carboidrati", g:m.c, kcal:(m.c||0)*4, c:"#F2A93B" },
            { k:"G", nome:"Grassi",      g:m.g, kcal:(m.g||0)*9, c:"#8E7BE8" },
          ];
          const kTot = Math.max(1, segs.reduce((a,s)=>a+s.kcal,0));
          return (
            <div style={{marginTop:10,opacity:saltato?0.55:1}}>
              <div style={{display:"flex",gap:2.5,height:7,borderRadius:99,overflow:"hidden",background:"#EFF3EC"}}>
                {segs.map(s=>(
                  <div key={s.k} title={`${s.nome}: ${Math.round(s.kcal/kTot*100)}% delle kcal`}
                    style={{width:`${Math.max(2, s.kcal/kTot*100)}%`,background:s.c,transition:"width 0.4s ease"}}/>
                ))}
              </div>
              <div style={{display:"flex",gap:6,marginTop:7}}>
                {segs.map(s=>(
                  <div key={s.k} title={s.nome} style={{flex:1,display:"flex",alignItems:"baseline",justifyContent:"center",gap:4,background:s.c+"12",borderRadius:8,padding:"5px 4px",minWidth:0}}>
                    <span style={{fontSize:10,fontWeight:800,color:s.c}}>{s.k}</span>
                    <span style={{fontSize:11.5,fontWeight:800,color:"#15251C",whiteSpace:"nowrap"}}>{Math.round(s.g||0)}g</span>
                    <span style={{fontSize:9,fontWeight:700,color:"#8AA192",whiteSpace:"nowrap"}}>{Math.round(s.kcal/kTot*100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Barra azioni: larghezza piena, bottoni equidistribuiti icona+etichetta */}
        <div style={{display:"flex",gap:6,marginTop:11}}>
          {/* Like */}
          <ActionBtn
            onClick={e=>{ e.stopPropagation(); onToggleLike && (logSync("gusti", `${prefEntry?.liked?"Rimosso like":"Like"}: ${meal.nome?.slice(0,30)}`, {id:meal.id}), onToggleLike()); }}
            ariaLabel={prefEntry?.liked ? "Rimuovi preferito" : "Segna come preferito"}
            title={prefEntry?.liked ? "Tolta dai preferiti" : "Aggiungi ai preferiti"}
            active={!!prefEntry?.liked} accent="#ef4444"
            icon={prefEntry?.liked?"❤️":"🤍"} label="Adoro"/>
          {/* Dislike esplicito: "non proporla più" senza dover
              aspettare che si accumulino gli swap */}
          {onToggleDislike && (
            <ActionBtn
              onClick={e=>{ e.stopPropagation(); logSync("gusti", `${prefEntry?.disliked?"Rimosso dislike":"Dislike"}: ${meal.nome?.slice(0,30)}`, {id:meal.id}); onToggleDislike(); }}
              ariaLabel={prefEntry?.disliked ? "Rimuovi non gradita" : "Segna come non gradita"}
              title={prefEntry?.disliked ? "Tolta dalle non gradite" : "Non mi piace: proponila il meno possibile"}
              active={!!prefEntry?.disliked} accent="#7c3aed"
              icon="👎" label="Evita"/>
          )}
          {/* Consumato */}
          {!readOnly && (
            <ActionBtn
              onClick={e=>{ e.stopPropagation(); logSync("pasto-log", `${consumed?"Rimarca non consumato":"Segna consumato"}: ${mealKey}`, {dayIdx, mealKey, pasto:meal?.nome?.slice(0,25)}); onToggleConsumed&&onToggleConsumed(); }}
              title={consumed?"Segna come non consumato":"Segna come consumato"}
              active={consumed} accent="#16a34a"
              icon={consumed?"✅":"☑️"} label="Fatto"/>
          )}
          {/* Non mangiato (✗) — nascosto se già consumato */}
          {!readOnly && !consumed && (
            <ActionBtn
              onClick={e=>{ e.stopPropagation(); logSync("pasto-log", `${saltato?"Annulla saltato":"Segna non mangiato"}: ${mealKey}`, {dayIdx, mealKey, pasto:meal?.nome?.slice(0,25)}); onToggleSaltato&&onToggleSaltato(); }}
              title={saltato?"Annulla: non saltato":"Non l'ho mangiato"}
              active={saltato} accent="#dc2626"
              icon="✗" label="Salto" dimIcon={false}/>
          )}
          {/* Modifica calorie consumate — visibile solo se consumato */}
          {!readOnly && consumed && (
            <ActionBtn
              onClick={e=>{ e.stopPropagation(); setConsumedEditOpen(true); setOpen(false); setSwapOpen(false); }}
              title="Modifica cosa hai mangiato davvero"
              active accent="#16a34a"
              icon="✏️" label="Mangiato"/>
          )}
          {/* Modifica ricetta (solo se NON consumato e NON saltato) */}
          {!readOnly && !consumed && !saltato && (
            <ActionBtn
              onClick={e=>{ e.stopPropagation(); setEditOpen(true); setOpen(false); setSwapOpen(false); }}
              title="Modifica ingredienti e quantità"
              icon="✏️" label="Modifica"/>
          )}
          {/* Swap (solo se NON consumato e NON saltato) */}
          {!readOnly && !consumed && !saltato && (
            <ActionBtn
              onClick={e=>{ e.stopPropagation(); setSwapOpen(s=>!s); setOpen(false); if(!swapOpen) setPrepSlot(null); }}
              title={swapOpen?"Chiudi le alternative":"Cambia ricetta"}
              active accent="#7c3aed" filled={swapOpen}
              icon={swapOpen?"✕":"⇄"} label={swapOpen?"Chiudi":"Cambia"} dimIcon={false}/>
          )}
          {/* Sola lettura: profilo di un altro membro. Il piatto di un altro
              membro si può sempre ADOTTARE (anche fuori dal readOnly):
              viene scritto come swap nel piano di chi guarda. */}
          {readOnly && (
            <div title="Profilo di un altro membro: sola lettura" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:4,borderRadius:10,background:"#EFF3EC",color:"#9DB1A2",fontWeight:700,fontSize:10.5}}>🔒 sola lettura</div>
          )}
          {onAdotta && (
            adottata
              ? <div style={{flex:1.3,display:"flex",alignItems:"center",justifyContent:"center",gap:4,borderRadius:10,background:"#EDF7EF",border:"1.5px solid #2F6B3A30",color:"#2F6B3A",fontWeight:800,fontSize:10.5}}>✓ Nel tuo piano</div>
              : <ActionBtn
                  onClick={e=>{ e.stopPropagation(); onAdotta(); }}
                  title="Imposta questa ricetta nello stesso pasto del TUO piano"
                  active accent="#2F6B3A"
                  icon="⤵" label="Adotta" dimIcon={false}/>
          )}
        </div>

        {/* Quantità consumata: appare sul pasto mangiato; vuoto ⇒ ricetta intera */}
        {scalabile && (
          <div onClick={e=>e.stopPropagation()} style={{marginTop:10,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 11px"}}>
            <span style={{fontSize:10,fontWeight:800,color:"#16a34a",textTransform:"uppercase",letterSpacing:0.6}}>Quantità consumata</span>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <input
                type="number" inputMode="decimal" min="0"
                value={gStr}
                placeholder={String(Math.round(gPiano))}
                onClick={e=>e.stopPropagation()}
                onChange={e=>setGStr(e.target.value)}
                onBlur={commitGrammi}
                onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); e.currentTarget.blur(); } }}
                style={{width:74,padding:"6px 8px",borderRadius:7,border:"1.5px solid #86efac",background:"#fff",fontSize:13,fontWeight:700,color:"#15251C",fontFamily:"'Outfit',sans-serif",textAlign:"right"}}
              />
              <span style={{fontSize:12,fontWeight:700,color:"#166534"}}>g</span>
            </div>
            <span style={{fontSize:10.5,color:"#6E8576"}}>su {Math.round(gPiano)}g pianificati{gConsumati==null?" · intero":""}</span>
          </div>
        )}

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

        {/* Preparazione (se la ricetta la fornisce) — visibile a card espansa */}
        {open && meal.preparazione && (
          <div style={{marginTop:6,background:"#F5F8F1",border:"1px solid #E7EDE2",borderRadius:8,padding:"8px 12px",fontSize:11.5,color:"#5B6E62",lineHeight:1.5}}>
            <span style={{fontWeight:700,color:"#2F6B3A",fontSize:10,textTransform:"uppercase",letterSpacing:0.8}}>🍳 Preparazione · </span>
            {meal.preparazione}
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
            <div style={{fontSize:10,fontWeight:800,color:"#15251C",textTransform:"uppercase",letterSpacing:0.8}}>
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
                  <div key={alt.id} onClick={()=>{ onSwap(alt); setSwapOpen(false); setPrepSlot(null); }}
                    style={{background:"#fff",borderRadius:10,border:"1.5px solid #E7EDE2",padding:"10px 12px",marginBottom:7,cursor:"pointer",transition:"border-color 0.15s",display:"flex",alignItems:"center",gap:10}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#7c3aed80"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="#E7EDE2"}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#15251C",lineHeight:1.3,marginBottom:5}}>{alt.nome}</div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{fontSize:10,fontWeight:700,color:altPrepColor,background:altPrepColor+"18",borderRadius:5,padding:"1px 6px"}}>⏱ {altPrep}'</span>
                        <span style={{fontSize:10,fontFamily:"monospace",fontWeight:700,color:"#15251C"}}>{altM?.kcal} kcal</span>
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
    // Pasto saltato → non contribuisce al totale
    if (logEntry && logEntry.saltato) return a;
    // Se il pasto è stato consumato e ha macro nel log, usa quelli (valori reali)
    const m = (logEntry && logEntry.consumed && (logEntry.kcal || logEntry._ingredienti))
      ? {kcal: logEntry.kcal||0, p: logEntry.p||0, c: logEntry.c||0, g: logEntry.g||0}
      : (macroPerPasto && macroPerPasto[mk]) || dayData[mk][personaKey];
    return {kcal:a.kcal+m.kcal,p:a.p+m.p,c:a.c+m.c,g:a.g+m.g};
  },{kcal:0,p:0,c:0,g:0});
  const t = target||{kcal:2000,p:150,c:200,g:65};
  return (
    <div style={{background:"linear-gradient(140deg,#15251C,#1D3A28)",borderRadius:18,padding:"16px 18px",marginTop:6}}>
      <div style={{fontSize:10,fontWeight:800,color:"#C7F23E",marginBottom:13,letterSpacing:1.2,textTransform:"uppercase"}}>Totale giornaliero</div>
      {[{l:"Kcal",v:tot.kcal,m:t.kcal,c:"#C7F23E"},{l:"Proteine",v:tot.p,m:t.p,c:"#1FA2D8"},{l:"Carbo",v:tot.c,m:t.c,c:"#F2A93B"},{l:"Grassi",v:tot.g,m:t.g,c:"#8E7BE8"}].map(({l,v,m,c})=>{
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

