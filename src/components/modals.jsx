import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { DB, INGREDIENTS, ING_MAP, ING_QTY, PESO_PEZZO, UNIT_OPTIONS, calcMacroEditor, categoriaDaMealKey, cloudRecipeToMeal, formattaPorzione, ingQtyToEditor, nutriPerGrammi, quantitaInGrammi, scalaPastiGiorno } from '@/core';
import { caricaRicette } from '@/db/ricetteCloud';
import { MealCard, WaterTracker } from '@/features/piano/MealParts';

export function RecipeEditorModal({ meal, mealKey, personaKey, onSave, onClose, quantitaScalate }) {
  // quantitaScalate: { ingId: {valore, unit} } già ottimizzate dal motore per questa persona.
  // Se presenti le usiamo come punto di partenza (preservano intensità dieta).
  // Altrimenti ricadiamo sulle quantità raw di ING_QTY.
  const baseIngQty = React.useMemo(() => {
    if (quantitaScalate && Object.keys(quantitaScalate).length > 0) {
      // Le quantitaScalate di res.perRicetta sono { ingId: { valore, unit } }
      // già nel formato dell'editor — usiamole direttamente (senza il flag _scaled).
      const { _scaled, ...q } = quantitaScalate;
      return { ...q };
    }
    return ingQtyToEditor(meal.id, personaKey);
  }, [meal.id, personaKey, quantitaScalate]);

  const [nome, setNome]       = React.useState(meal.nome);
  const [ings, setIngs]       = React.useState(baseIngQty);
  const [search, setSearch]       = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  // sostituzione: { ingId: ingId da sostituire } | null
  const [replacing, setReplacing]   = React.useState(null);
  const [replSearch, setReplSearch] = React.useState("");
  // suggerimento titolo dopo sostituzione: stringa | null
  const [suggerisciNome, setSuggerisciNome] = React.useState(null);

  const macro = React.useMemo(() => calcMacroEditor(ings), [ings]);

  // Ingredienti raggruppati per categoria
  const ingList = Object.entries(ings);

  const updateQty = (ingId, field, raw) => {
    const val = field === "unit" ? raw : Math.max(0, parseFloat(raw) || 0);
    setIngs(prev => ({ ...prev, [ingId]: { ...prev[ingId], [field]: val } }));
  };

  const removeIng = ingId => {
    setIngs(prev => { const n = {...prev}; delete n[ingId]; return n; });
  };

  // Sostituisce un ingrediente mantenendo la stessa incidenza calorica
  const replaceIng = (oldIngId, newIngId) => {
    const oldQ = ings[oldIngId];
    if (!oldQ) return;

    // kcal dell'ingrediente originale con la sua quantità attuale
    const oldGrammi  = quantitaInGrammi(oldIngId, oldQ.valore, oldQ.unit);
    const oldKcal    = nutriPerGrammi(oldIngId, oldGrammi).kcal;

    // Densità calorica del nuovo ingrediente (kcal per grammo)
    const newNutri   = (ING_MAP[newIngId]||{}).nutri;
    const kcalPer100g = newNutri ? newNutri.kcal : 100; // fallback 100 kcal/100g
    const kcalPerG   = kcalPer100g / 100;

    // Grammi necessari per avere le stesse kcal
    let newGrammi = kcalPerG > 0 ? Math.round(oldKcal / kcalPerG) : oldGrammi;
    newGrammi = Math.max(5, newGrammi); // minimo 5g

    // Scegli unità: pz se il nuovo ingrediente si conta a pezzi
    const pesoPezzo = PESO_PEZZO[newIngId];
    let newUnit = "g", newValore = newGrammi;
    if (pesoPezzo) {
      // Arrotonda a 0.5 pezzi
      newUnit   = "pz";
      newValore = Math.max(0.5, Math.round((newGrammi / pesoPezzo) * 2) / 2);
    } else if (newIngId === "db_olio_di_oliva_extra_vergine" || (ING_MAP[newIngId]?.tags||[]).includes("olio")) {
      newUnit   = "cucchiaio";
      newValore = Math.max(0.5, Math.round((newGrammi / 10) * 2) / 2);
    }

    setIngs(prev => {
      const n = {...prev};
      delete n[oldIngId];
      n[newIngId] = { valore: newValore, unit: newUnit };
      return n;
    });
    setReplacing(null);
    setReplSearch("");

    // ── Suggerimento aggiornamento titolo ─────────────────────────────
    // Cerca il vecchio ingrediente nel titolo suggerito (o nel titolo corrente)
    // e propone di rimpiazzarlo col nome del nuovo. Accumula sostituzioni multiple.
    setSuggerisciNome(prevSuggestion => {
      // Base: usa il suggerimento pendente se esiste, altrimenti il titolo corrente (nome)
      // Non possiamo accedere a `nome` qui direttamente (closure stale), quindi
      // passiamo attraverso setNome per leggere il valore aggiornato.
      const oldIng = ING_MAP[oldIngId];
      const newIng = ING_MAP[newIngId];
      if (!oldIng || !newIng) return prevSuggestion;
      return prevSuggestion; // placeholder, la logica vera è sotto
    });

    setNome(prevNome => {
      const oldIng = ING_MAP[oldIngId];
      const newIng = ING_MAP[newIngId];
      if (!oldIng || !newIng) return prevNome;

      // Base per il suggerimento: usa il suggerimento pendente se diverso dal nome corrente,
      // altrimenti parte dal nome corrente.
      // Poiché setSuggerisciNome è asincrono, leggiamo dall'esterno tramite ref-like trick:
      // usiamo direttamente suggerisciNome (catturato nella closure della chiamata a replaceIng)
      const baseTitle = suggerisciNome || prevNome;

      const oldTerms = [oldIng.nome, ...(oldIng.tags || [])].map(t => t.toLowerCase());
      const titleLower = baseTitle.toLowerCase();

      let matchedOriginal = null;
      for (const term of oldTerms) {
        const idx = titleLower.indexOf(term);
        if (idx !== -1) {
          matchedOriginal = baseTitle.slice(idx, idx + term.length);
          break;
        }
      }

      if (!matchedOriginal) {
        // Nessun termine del vecchio ingrediente nel titolo → mantieni il suggerimento esistente
        if (suggerisciNome && suggerisciNome !== prevNome) {
          // Non cambiare il suggerimento già in corso
        }
        return prevNome;
      }

      const newName = newIng.nome.toLowerCase().split("/")[0].trim();
      const suggested = baseTitle.replace(matchedOriginal, newName);

      if (suggested !== prevNome) {
        setSuggerisciNome(suggested);
      }
      return prevNome; // il titolo NON cambia automaticamente
    });
  };

  const addIng = ingId => {
    if (ings[ingId]) return; // già presente
    // Unità default sensata per categoria
    const ing = ING_MAP[ingId];
    const defaultUnit = ing?.tags?.includes("olio") ? "cucchiaio"
      : PESO_PEZZO[ingId] ? "pz" : "g";
    setIngs(prev => ({ ...prev, [ingId]: { valore: 100, unit: defaultUnit } }));
    setSearch("");
    setShowSearch(false);
  };

  // Ricerca ingredienti (aggiunta)
  const searchResults = React.useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return Object.values(ING_MAP)
      .filter(i => !ings[i.id] && (i.nome.toLowerCase().includes(q) || (i.tags||[]).some(t=>t.includes(q))))
      .slice(0, 8);
  }, [search, ings]);

  // Ricerca ingredienti (sostituzione)
  const replResults = React.useMemo(() => {
    if (!replSearch.trim()) return [];
    const q = replSearch.toLowerCase();
    const usedIds = new Set(Object.keys(ings));
    return Object.values(ING_MAP)
      .filter(i => !usedIds.has(i.id) && i.id !== replacing && (i.nome.toLowerCase().includes(q) || (i.tags||[]).some(t=>t.includes(q))))
      .slice(0, 8);
  }, [replSearch, replacing, ings]);

  const handleSave = () => {
    if (ingList.length === 0) return;
    // Crea oggetto ricetta custom compatibile con il DB
    const customId = "cust_" + Date.now();
    const customMacro = calcMacroEditor(ings);

    // Costruiamo porzioni come testo leggibile
    const porzioneStr = formattaPorzione(ings);

    // La ricetta custom deve avere tutti i campi di una ricetta standard
    const customRecipe = {
      id: customId,
      nome: nome.trim() || meal.nome,
      prep: meal.prep,
      baseId: meal.id,
      isCustom: true,
      // Macro fissi calcolati dagli ingredienti (non scalati)
      uomo: customMacro, donna: customMacro, bimbo: customMacro,
      porzioni: {
        uomo: porzioneStr, donna: porzioneStr, bimbo: porzioneStr
      },
      // Ingredienti salvati per la visualizzazione / ricalcolo
      _ingredienti: ings,
      // Campi opzionali
      ingredients: Object.keys(ings),
      tags: meal.tags || [],
      stagioni: meal.stagioni || null,
    };

    // Registra in ING_QTY runtime con flag _scaled: true per dire a
    // scalaPastiGiorno che queste quantità sono già ottimizzate e non
    // vanno riscalate di nuovo.
    const qtyEntry = { _scaled: true };
    for (const [ingId, q] of Object.entries(ings)) {
      qtyEntry[ingId] = { uomo: q.valore, donna: q.valore, bimbo: q.valore, unit: q.unit };
    }
    ING_QTY[customId] = qtyEntry;

    onSave(customRecipe);
  };

  const ingLabel = ingId => ING_MAP[ingId]?.nome || ingId;
  const ingCat   = ingId => ING_MAP[ingId]?.cat  || "Altro";

  // Raggruppa per categoria per la UI
  const grouped = {};
  for (const [ingId] of ingList) {
    const cat = ingCat(ingId);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(ingId);
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"#00000055"}}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 -8px 40px #0000003a"}}>

        {/* ── Header ── */}
        <div style={{padding:"16px 18px 12px",borderBottom:"1px solid #EFF3EC",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontSize:11,color:"#9DB1A2",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>
              ✏️ Modifica ricetta
            </div>
            <input
              value={nome}
              onChange={e=>setNome(e.target.value)}
              style={{fontSize:15,fontWeight:800,color:"#15251C",border:"none",outline:"none",padding:0,background:"transparent",width:"100%",minWidth:0}}
              placeholder="Nome ricetta…"
            />
          </div>
          <button onClick={onClose}
            style={{width:32,height:32,borderRadius:"50%",border:"none",background:"#EFF3EC",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            ✕
          </button>
        </div>

        {/* ── Macro live ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,padding:"10px 18px",background:"#F5F8F1",flexShrink:0,borderBottom:"1px solid #EFF3EC"}}>
          {[["kcal","#15251C"],["P","#1FA2D8"],["C","#d97706"],["G","#16a34a"]].map(([lbl,col])=>(
            <div key={lbl} style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"#9DB1A2",fontWeight:700,textTransform:"uppercase"}}>{lbl}</div>
              <div style={{fontSize:16,fontWeight:800,color:col,fontFamily:"monospace",lineHeight:1.2}}>
                {lbl==="kcal"?macro.kcal:lbl==="P"?macro.p:lbl==="C"?macro.c:macro.g}
              </div>
              {lbl!=="kcal"&&<div style={{fontSize:8,color:"#9DB1A2"}}>g</div>}
            </div>
          ))}
        </div>

        {/* ── Banner suggerimento titolo ── */}
        {suggerisciNome && (
          <div style={{background:"#fffbeb",borderBottom:"1px solid #fde68a",padding:"10px 18px",flexShrink:0,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:13,flexShrink:0}}>💡</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,fontWeight:700,color:"#92400e",marginBottom:2}}>Aggiorna il titolo?</div>
              <div style={{fontSize:12,color:"#78350f",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {suggerisciNome}
              </div>
            </div>
            <button onClick={()=>{ setNome(suggerisciNome); setSuggerisciNome(null); }}
              style={{flexShrink:0,padding:"5px 10px",borderRadius:7,border:"none",background:"#d97706",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
              Applica
            </button>
            <button onClick={()=>setSuggerisciNome(null)}
              style={{flexShrink:0,padding:"5px 8px",borderRadius:7,border:"1px solid #fde68a",background:"transparent",color:"#92400e",fontWeight:700,fontSize:11,cursor:"pointer"}}>
              Ignora
            </button>
          </div>
        )}

        {/* ── Lista ingredienti (scrollabile) ── */}
        <div style={{flex:1,overflowY:"auto",padding:"10px 18px"}}>
          {Object.entries(grouped).map(([cat, ids]) => (
            <div key={cat} style={{marginBottom:14}}>
              <div style={{fontSize:9,fontWeight:800,color:"#9DB1A2",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>{cat}</div>
              {ids.map(ingId => {
                const q = ings[ingId];
                return (
                  <div key={ingId} style={{borderBottom:"1px solid #EFF3EC",paddingBottom:replacing===ingId?8:0}}>
                    {/* Riga principale */}
                    <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0"}}>
                      {/* Nome */}
                      <div style={{flex:1,fontSize:12,fontWeight:600,color:replacing===ingId?"#7c3aed":"#2F5547",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {ingLabel(ingId)}
                      </div>
                      {/* Quantità */}
                      <input
                        type="number" min="0" step={q.unit==="pz"||q.unit==="cucchiaio"||q.unit==="cucchiaino"?0.5:5}
                        value={q.valore}
                        onChange={e=>updateQty(ingId,"valore",e.target.value)}
                        style={{width:52,padding:"5px 6px",border:"1.5px solid #E7EDE2",borderRadius:7,fontSize:13,fontWeight:700,fontFamily:"monospace",textAlign:"right",outline:"none"}}
                      />
                      {/* Unità */}
                      <select value={q.unit} onChange={e=>updateQty(ingId,"unit",e.target.value)}
                        style={{padding:"5px 2px",border:"1.5px solid #E7EDE2",borderRadius:7,fontSize:11,fontWeight:600,outline:"none",background:"#fff",color:"#4A6152",maxWidth:72}}>
                        {UNIT_OPTIONS.map(u=><option key={u} value={u}>{u}</option>)}
                      </select>
                      {/* Sostituisci */}
                      <button
                        onClick={()=>{ setReplacing(replacing===ingId?null:ingId); setReplSearch(""); }}
                        title="Sostituisci con altro ingrediente (stesse kcal)"
                        style={{width:28,height:28,borderRadius:7,border:`1.5px solid ${replacing===ingId?"#7c3aed":"#E7EDE2"}`,background:replacing===ingId?"#f5f3ff":"#F5F8F1",color:replacing===ingId?"#7c3aed":"#6E8576",fontWeight:800,fontSize:12,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
                        ⇄
                      </button>
                      {/* Rimuovi */}
                      <button onClick={()=>removeIng(ingId)}
                        style={{width:28,height:28,borderRadius:7,border:"1px solid #fecaca",background:"#fef2f2",color:"#ef4444",fontWeight:800,fontSize:13,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
                        −
                      </button>
                    </div>

                    {/* Drawer sostituzione (inline, sotto la riga) */}
                    {replacing===ingId && (
                      <div style={{background:"#f5f3ff",borderRadius:10,padding:"10px 12px",marginBottom:6,border:"1px solid #ddd6fe"}}>
                        <div style={{fontSize:10,fontWeight:800,color:"#7c3aed",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span>⇄ Sostituisci con… <span style={{fontWeight:500,color:"#a78bfa"}}>(stesse kcal: {Math.round(nutriPerGrammi(ingId, quantitaInGrammi(ingId, q.valore, q.unit)).kcal)} kcal)</span></span>
                          <button onClick={()=>{setReplacing(null);setReplSearch("");}} style={{background:"none",border:"none",cursor:"pointer",color:"#a78bfa",fontSize:14,padding:0}}>✕</button>
                        </div>
                        <input
                          autoFocus
                          value={replSearch}
                          onChange={e=>setReplSearch(e.target.value)}
                          placeholder="Cerca ingrediente sostituto…"
                          style={{width:"100%",padding:"8px 10px",border:"1.5px solid #c4b5fd",borderRadius:8,fontSize:12,outline:"none",boxSizing:"border-box",background:"#fff"}}
                        />
                        {replResults.length>0 && (
                          <div style={{marginTop:6,border:"1px solid #ddd6fe",borderRadius:8,overflow:"hidden",background:"#fff"}}>
                            {replResults.map(ing=>{
                              // Preview kcal del sostituto con quantità ricalcolata
                              const oldGrammi = quantitaInGrammi(ingId, q.valore, q.unit);
                              const oldKcal   = nutriPerGrammi(ingId, oldGrammi).kcal;
                              const newNutri  = (ING_MAP[ing.id]||{}).nutri;
                              const kcalPer100 = newNutri?newNutri.kcal:100;
                              const newG = kcalPer100>0 ? Math.round(oldKcal/(kcalPer100/100)) : 0;
                              const pesoPezzo = PESO_PEZZO[ing.id];
                              const qPreview  = pesoPezzo
                                ? `${Math.max(0.5,Math.round((newG/pesoPezzo)*2)/2)} pz`
                                : `${Math.max(5,newG)}g`;
                              return (
                                <div key={ing.id} onClick={()=>replaceIng(ingId,ing.id)}
                                  style={{padding:"9px 12px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #f5f3ff"}}
                                  onMouseEnter={e=>e.currentTarget.style.background="#faf5ff"}
                                  onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                                  <div>
                                    <div style={{fontSize:12,fontWeight:700,color:"#2F5547"}}>{ing.nome}</div>
                                    <div style={{fontSize:9,color:"#9DB1A2"}}>{ing.cat}</div>
                                  </div>
                                  <div style={{textAlign:"right",flexShrink:0}}>
                                    <div style={{fontSize:11,fontWeight:800,color:"#7c3aed",fontFamily:"monospace"}}>{qPreview}</div>
                                    <div style={{fontSize:9,color:"#a78bfa"}}>≈ {Math.round(oldKcal)} kcal</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {replSearch.trim()&&replResults.length===0&&(
                          <div style={{padding:"8px 10px",fontSize:11,color:"#9DB1A2",textAlign:"center",marginTop:4}}>Nessun ingrediente trovato</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* ── Aggiunta ingrediente ── */}
          <div style={{marginTop:8,marginBottom:6}}>
            {!showSearch ? (
              <button onClick={()=>setShowSearch(true)}
                style={{width:"100%",padding:"9px",borderRadius:9,border:"1.5px dashed #C2D0C6",background:"#F5F8F1",color:"#6E8576",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                + Aggiungi ingrediente
              </button>
            ) : (
              <div>
                <div style={{position:"relative",marginBottom:6}}>
                  <input
                    autoFocus
                    value={search}
                    onChange={e=>setSearch(e.target.value)}
                    placeholder="Cerca ingrediente…"
                    style={{width:"100%",padding:"9px 12px",border:"1.5px solid #2F6B3A",borderRadius:9,fontSize:13,outline:"none",boxSizing:"border-box"}}
                  />
                  <button onClick={()=>{setShowSearch(false);setSearch("");}}
                    style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#9DB1A2",fontSize:16}}>✕</button>
                </div>
                {searchResults.length>0 && (
                  <div style={{border:"1px solid #E7EDE2",borderRadius:9,overflow:"hidden"}}>
                    {searchResults.map(ing=>(
                      <div key={ing.id} onClick={()=>addIng(ing.id)}
                        style={{padding:"9px 12px",cursor:"pointer",fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #EFF3EC",background:"#fff"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#F5F8F1"}
                        onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                        <span style={{fontWeight:600,color:"#2F5547"}}>{ing.nome}</span>
                        <span style={{fontSize:9,color:"#9DB1A2"}}>{ing.cat}</span>
                      </div>
                    ))}
                  </div>
                )}
                {search.trim()&&searchResults.length===0&&(
                  <div style={{padding:"10px 12px",fontSize:12,color:"#9DB1A2",textAlign:"center"}}>
                    Nessun ingrediente trovato
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer: salva ── */}
        <div style={{padding:"12px 18px 20px",borderTop:"1px solid #EFF3EC",flexShrink:0,display:"flex",gap:10}}>
          <button onClick={onClose}
            style={{flex:1,padding:"12px",borderRadius:10,border:"1.5px solid #E7EDE2",background:"#F5F8F1",color:"#6E8576",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            Annulla
          </button>
          <button onClick={handleSave}
            style={{flex:2,padding:"12px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#2F6B3A,#235029)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",boxShadow:"0 4px 14px #2F6B3A33"}}>
            ✓ Salva
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ConsumedEditorModal ────────────────────────────────────────────
// Permette di modificare ingredienti e quantità di un pasto già consumato.
// Non crea una ricetta custom: salva direttamente i macro nel mealsLog.

export function ConsumedEditorModal({ meal, mealKey, personaKey, initialIngs, onSave, onClose }) {
  // initialIngs: { ingId: {valore, unit} } — può essere null/vuoto
  const baseIngs = React.useMemo(() => {
    if (initialIngs && Object.keys(initialIngs).length > 0) return { ...initialIngs };
    return ingQtyToEditor(meal.id, personaKey);
  }, []);

  const [ings, setIngs]           = React.useState(baseIngs);
  const [search, setSearch]       = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);

  const macro = React.useMemo(() => calcMacroEditor(ings), [ings]);

  const updateQty = (ingId, field, raw) => {
    const val = field === "unit" ? raw : Math.max(0, parseFloat(raw) || 0);
    setIngs(prev => ({ ...prev, [ingId]: { ...prev[ingId], [field]: val } }));
  };
  const removeIng = ingId => {
    setIngs(prev => { const n = {...prev}; delete n[ingId]; return n; });
  };
  const addIng = ingId => {
    if (ings[ingId]) return;
    const ing = ING_MAP[ingId];
    const defaultUnit = ing?.tags?.includes("olio") ? "cucchiaio" : PESO_PEZZO[ingId] ? "pz" : "g";
    setIngs(prev => ({ ...prev, [ingId]: { valore: 100, unit: defaultUnit } }));
    setSearch(""); setShowSearch(false);
  };

  const searchResults = React.useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return Object.values(ING_MAP)
      .filter(i => !ings[i.id] && (i.nome.toLowerCase().includes(q) || (i.tags||[]).some(t=>t.includes(q))))
      .slice(0, 8);
  }, [search, ings]);

  // Raggruppa per categoria
  const grouped = {};
  for (const ingId of Object.keys(ings)) {
    const cat = ING_MAP[ingId]?.cat || "Altro";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(ingId);
  }

  const handleSave = () => {
    // Salva: macro calcolati dagli ingredienti reali + snapshot ingredienti
    onSave({ ...macro, _ingredienti: ings });
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"#00000055"}}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 -8px 40px #0000003a"}}>

        {/* Header */}
        <div style={{padding:"16px 18px 12px",borderBottom:"1px solid #EFF3EC",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontSize:11,color:"#16a34a",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>
              ✅ Cosa hai mangiato davvero?
            </div>
            <div style={{fontSize:14,fontWeight:800,color:"#15251C"}}>{meal.nome}</div>
          </div>
          <button onClick={onClose}
            style={{width:32,height:32,borderRadius:"50%",border:"none",background:"#EFF3EC",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
        </div>

        {/* Macro live */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,padding:"10px 18px",background:"#f0fdf4",flexShrink:0,borderBottom:"1px solid #dcfce7"}}>
          {[["kcal","#15251C"],["P","#1FA2D8"],["C","#d97706"],["G","#16a34a"]].map(([lbl,col])=>(
            <div key={lbl} style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"#9DB1A2",fontWeight:700,textTransform:"uppercase"}}>{lbl}</div>
              <div style={{fontSize:16,fontWeight:800,color:col,fontFamily:"monospace",lineHeight:1.2}}>
                {lbl==="kcal"?macro.kcal:lbl==="P"?macro.p:lbl==="C"?macro.c:macro.g}
              </div>
              {lbl!=="kcal"&&<div style={{fontSize:8,color:"#9DB1A2"}}>g</div>}
            </div>
          ))}
        </div>

        {/* Lista ingredienti */}
        <div style={{flex:1,overflowY:"auto",padding:"10px 18px"}}>
          {Object.keys(ings).length === 0 && (
            <div style={{textAlign:"center",padding:"20px 0",color:"#9DB1A2",fontSize:12}}>
              Nessun ingrediente — aggiungine uno qui sotto
            </div>
          )}
          {Object.entries(grouped).map(([cat, ids]) => (
            <div key={cat} style={{marginBottom:14}}>
              <div style={{fontSize:9,fontWeight:800,color:"#9DB1A2",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>{cat}</div>
              {ids.map(ingId => {
                const q = ings[ingId];
                return (
                  <div key={ingId} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #EFF3EC"}}>
                    <div style={{flex:1,fontSize:13,fontWeight:600,color:"#15251C",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {ING_MAP[ingId]?.nome || ingId}
                    </div>
                    <input type="number" min="0" step="1"
                      value={q.valore}
                      onChange={e=>updateQty(ingId,"valore",e.target.value)}
                      style={{width:60,padding:"4px 6px",border:"1.5px solid #E7EDE2",borderRadius:7,fontSize:13,fontWeight:700,textAlign:"center",outline:"none",fontFamily:"monospace"}}
                    />
                    <select value={q.unit} onChange={e=>updateQty(ingId,"unit",e.target.value)}
                      style={{padding:"4px 2px",border:"1.5px solid #E7EDE2",borderRadius:7,fontSize:11,background:"#F5F8F1",outline:"none",color:"#2F5547"}}>
                      {UNIT_OPTIONS.map(u=><option key={u} value={u}>{u}</option>)}
                    </select>
                    <button onClick={()=>removeIng(ingId)}
                      style={{flexShrink:0,width:26,height:26,borderRadius:"50%",border:"none",background:"#fef2f2",color:"#ef4444",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Aggiunta ingrediente */}
          <div style={{marginTop:8,marginBottom:6}}>
            {!showSearch ? (
              <button onClick={()=>setShowSearch(true)}
                style={{width:"100%",padding:"9px",borderRadius:9,border:"1.5px dashed #C2D0C6",background:"#F5F8F1",color:"#6E8576",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                + Aggiungi ingrediente
              </button>
            ) : (
              <div>
                <div style={{position:"relative",marginBottom:6}}>
                  <input autoFocus value={search} onChange={e=>setSearch(e.target.value)}
                    placeholder="Cerca ingrediente…"
                    style={{width:"100%",padding:"9px 12px",border:"1.5px solid #16a34a",borderRadius:9,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                  <button onClick={()=>{setShowSearch(false);setSearch("");}}
                    style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#9DB1A2",fontSize:16}}>✕</button>
                </div>
                {searchResults.length>0 && (
                  <div style={{border:"1px solid #E7EDE2",borderRadius:9,overflow:"hidden"}}>
                    {searchResults.map(ing=>(
                      <div key={ing.id} onClick={()=>addIng(ing.id)}
                        style={{padding:"9px 12px",cursor:"pointer",fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #EFF3EC",background:"#fff"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#F5F8F1"}
                        onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                        <span style={{fontWeight:600,color:"#2F5547"}}>{ing.nome}</span>
                        <span style={{fontSize:9,color:"#9DB1A2"}}>{ing.cat}</span>
                      </div>
                    ))}
                  </div>
                )}
                {search.trim()&&searchResults.length===0&&(
                  <div style={{padding:"10px 12px",fontSize:12,color:"#9DB1A2",textAlign:"center"}}>Nessun ingrediente trovato</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:"12px 18px 20px",borderTop:"1px solid #EFF3EC",flexShrink:0,display:"flex",gap:10}}>
          <button onClick={onClose}
            style={{flex:1,padding:"12px",borderRadius:10,border:"1.5px solid #E7EDE2",background:"#F5F8F1",color:"#6E8576",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            Annulla
          </button>
          <button onClick={handleSave}
            style={{flex:2,padding:"12px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",boxShadow:"0 4px 14px #16a34a33"}}>
            ✅ Aggiorna calorie consumate
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MealCard ────────────────────────────────────────────────────────
// ─── WaterTracker ─────────────────────────────────────────────────

// ─── RicettarioModal ───────────────────────────────────────────────
// Mostra TUTTE le ricette disponibili per una categoria (colazione,
// pranzo, cena, spuntino): catalogo CRA-NUT + ricette mie + ricette di
// famiglia, con il tempo di preparazione ben visibile su ognuna.
// Usato dal drawer di scambio quando nessuna alternativa proposta
// convince: l'utente può scorrere l'intero ricettario di quella
// categoria e scegliere liberamente.
const CAT_META = {
  colazione: { label: "Colazione", icon: "🌅" },
  pranzo:    { label: "Pranzo",    icon: "🍝" },
  cena:      { label: "Cena",      icon: "🍽️" },
  spuntino:  { label: "Spuntino",  icon: "🍎" },
};

function RicettarioCard({ r, personaKey, onPick, badge }) {
  const m = r[personaKey] || r.uomo || { kcal:0, p:0, c:0, g:0 };
  const prep = r.prep;
  const prepColor = prep==null ? "#9DB1A2" : prep <= 15 ? "#16a34a" : prep <= 30 ? "#d97706" : "#dc2626";
  const prepBg    = prep==null ? "#F5F8F1"  : prep <= 15 ? "#f0fdf4" : prep <= 30 ? "#fffbeb" : "#fef2f2";
  const prepLabel = prep==null ? "—" : prep >= 60 ? `${prep/60}h` : `${prep}'`;
  return (
    <div onClick={()=>onPick(r)}
      style={{background:"#fff",borderRadius:10,border:"1.5px solid #E7EDE2",padding:"10px 12px",marginBottom:7,cursor:"pointer",transition:"border-color 0.15s",display:"flex",alignItems:"center",gap:10}}
      onMouseEnter={e=>e.currentTarget.style.borderColor="#7c3aed80"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="#E7EDE2"}>
      <div style={{flexShrink:0,width:42,height:42,borderRadius:9,background:prepBg,border:`1.5px solid ${prepColor}30`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:12,fontWeight:800,color:prepColor,lineHeight:1.1}}>⏱{prepLabel}</span>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:700,color:"#15251C",lineHeight:1.3,marginBottom:5}}>{r.nome}</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:10,fontFamily:"monospace",fontWeight:700,color:"#15251C"}}>{m.kcal} kcal</span>
          <span style={{fontSize:10,color:"#9DB1A2"}}>P{m.p} C{m.c} G{m.g}</span>
          {badge}
        </div>
      </div>
      <div style={{flexShrink:0,width:28,height:28,borderRadius:"50%",background:"#7c3aed10",border:"1.5px solid #7c3aed30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>→</div>
    </div>
  );
}

export function RicettarioModal({ mealKey, currentMeal, personaKey, onPick, onClose, cloudStatus }) {
  const cat = categoriaDaMealKey(mealKey);
  const meta = CAT_META[cat] || { label: cat, icon: "📖" };
  const [mie, setMie] = useState([]);
  const [diFamiglia, setDiFamiglia] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState("");
  // Ricerca per nome o ingrediente dentro il ricettario
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const norm = t => (t || "").toLowerCase();
  const matchCloud = r => !q
    || norm(r.titolo).includes(q)
    || Object.keys(r.quantita || {}).some(id => id !== "_scaled" && norm(ING_MAP[id]?.nome).includes(q));
  const matchCatalogo = r => !q
    || norm(r.nome).includes(q)
    || (r.ingredients || []).some(id => norm(ING_MAP[id]?.nome).includes(q));

  useEffect(() => {
    let attivo = true;
    if (!cloudStatus?.loggedIn) return;
    setLoading(true);
    caricaRicette().then(ricette => {
      if (!attivo) return;
      const dellaCategoria = ricette.filter(r => r.categoria === cat);
      setMie(dellaCategoria.filter(r => r.isMine));
      setDiFamiglia(dellaCategoria.filter(r => !r.isMine));
    }).catch(() => { if (attivo) setErrore("Impossibile caricare le ricette di famiglia."); })
      .finally(() => { if (attivo) setLoading(false); });
    return () => { attivo = false; };
  }, [cat, cloudStatus?.loggedIn]);

  // Catalogo: tutte le ricette CRA-NUT della categoria, ordinate per tempo
  // di preparazione (le più rapide prima), escludendo quella attuale.
  const catalogo = useMemo(() => {
    return (DB[cat] || [])
      .filter(r => r.id !== currentMeal?.id)
      .filter(matchCatalogo)
      .slice()
      .sort((a,b) => (a.prep||0) - (b.prep||0));
  }, [cat, currentMeal?.id, q]);

  const handlePick = (r, isMineOrFamily) => {
    const meal = isMineOrFamily ? cloudRecipeToMeal(r, currentMeal?.id) : r;
    onPick(meal);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"#00000055"}}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 -8px 40px #0000003a"}}>

        {/* ── Header ── */}
        <div style={{padding:"16px 18px 12px",borderBottom:"1px solid #EFF3EC",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontSize:11,color:"#9DB1A2",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>
              📖 Ricettario
            </div>
            <div style={{fontSize:15,fontWeight:800,color:"#15251C"}}>{meta.icon} {meta.label}</div>
          </div>
          <button onClick={onClose}
            style={{width:32,height:32,borderRadius:"50%",border:"none",background:"#EFF3EC",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            ✕
          </button>
        </div>

        {/* ── Corpo scorrevole ── */}
        <div style={{flex:1,overflowY:"auto",padding:"12px 18px 20px"}}>
          {/* Ricerca per nome o ingrediente */}
          <div style={{position:"relative",marginBottom:10}}>
            <input value={query} onChange={e=>setQuery(e.target.value)}
              placeholder="🔍 Cerca per nome o ingrediente…"
              style={{width:"100%",boxSizing:"border-box",padding:"10px 34px 10px 13px",borderRadius:11,border:"1.5px solid #E7EDE2",background:"#F9FBF7",fontSize:13.5,color:"#15251C",outline:"none"}}/>
            {q && (
              <button onClick={()=>setQuery("")} title="Cancella ricerca"
                style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",width:22,height:22,borderRadius:"50%",border:"none",background:"#EFF3EC",color:"#6E8576",fontWeight:900,fontSize:11,cursor:"pointer",lineHeight:1}}>✕</button>
            )}
          </div>
          <div style={{fontSize:10,color:"#9DB1A2",marginBottom:8,fontWeight:600}}>
            ⏱ il tempo di preparazione è indicato su ogni ricetta
          </div>

          {!cloudStatus?.loggedIn && (
            <div style={{background:"#F5F8F1",border:"1px solid #E7EDE2",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:"#6E8576",lineHeight:1.5}}>
              ☁️ Accedi per vedere anche le tue ricette personalizzate e quelle della famiglia.
            </div>
          )}
          {errore && <div style={{color:"#dc2626",fontSize:11,marginBottom:10}}>{errore}</div>}

          {/* Ricette mie */}
          {cloudStatus?.loggedIn && (
            <>
              <div style={{fontSize:10,fontWeight:800,color:"#15251C",marginBottom:8,textTransform:"uppercase",letterSpacing:0.8}}>
                ✏️ Le mie ricette
              </div>
              {loading ? (
                <div style={{fontSize:11,color:"#9DB1A2",padding:"6px 0 12px"}}>Caricamento…</div>
              ) : mie.filter(matchCloud).length === 0 ? (
                <div style={{fontSize:11,color:"#9DB1A2",padding:"6px 0 12px"}}>{q ? "Nessuna tua ricetta corrisponde alla ricerca." : "Nessuna ricetta tua in questa categoria."}</div>
              ) : (
                <div style={{marginBottom:14}}>
                  {mie.filter(matchCloud).map(r => (
                    <RicettarioCard key={r.id} r={r} personaKey={personaKey} onPick={x=>handlePick(x,true)}
                      badge={<span style={{fontSize:9,background:"#D6EFDD",color:"#235029",borderRadius:4,padding:"1px 5px",fontWeight:700}}>mia</span>}/>
                  ))}
                </div>
              )}

              {/* Ricette di famiglia */}
              <div style={{fontSize:10,fontWeight:800,color:"#15251C",marginBottom:8,textTransform:"uppercase",letterSpacing:0.8}}>
                👨‍👩‍👧 Ricette di famiglia
              </div>
              {loading ? (
                <div style={{fontSize:11,color:"#9DB1A2",padding:"6px 0 12px"}}>Caricamento…</div>
              ) : diFamiglia.filter(matchCloud).length === 0 ? (
                <div style={{fontSize:11,color:"#9DB1A2",padding:"6px 0 12px"}}>{q ? "Nessuna ricetta di famiglia corrisponde alla ricerca." : "Nessuna ricetta condivisa in questa categoria."}</div>
              ) : (
                <div style={{marginBottom:14}}>
                  {diFamiglia.filter(matchCloud).map(r => (
                    <RicettarioCard key={r.id} r={r} personaKey={personaKey} onPick={x=>handlePick(x,true)}
                      badge={<span style={{fontSize:9,background:"#f5f3ff",color:"#7c3aed",borderRadius:4,padding:"1px 5px",fontWeight:700}}>famiglia</span>}/>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Catalogo */}
          <div style={{fontSize:10,fontWeight:800,color:"#15251C",marginBottom:8,textTransform:"uppercase",letterSpacing:0.8}}>
            {meta.icon} Catalogo {meta.label.toLowerCase()} · {catalogo.length} ricette
          </div>
          {catalogo.length === 0 && q && (
            <div style={{fontSize:11,color:"#9DB1A2",padding:"6px 0 12px"}}>Nessuna ricetta del catalogo corrisponde alla ricerca.</div>
          )}
          {catalogo.map(r => (
            <RicettarioCard key={r.id} r={r} personaKey={personaKey} onPick={x=>handlePick(x,false)}/>
          ))}
        </div>
      </div>
    </div>
  );
}
