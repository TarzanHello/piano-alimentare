import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { SK_MISURE, TUTTI_FIELDS, calcTargetAdattivo, dateToLabel, dateToSort, emojiBySesso, stimaGrasso } from '@/core';
import { CalorieChart, WeightProgressChart } from '@/components/charts';
import { SwipeContainer } from '@/components/shared';
import { logSync } from '@/db/synclog';

export function MisurePage({ personas, myPersonaId, onMisureChange, mealsLog }) {
  const [misure, setMisure]   = useState({});
  const [selPid, setSelPid]   = useState(myPersonaId || personas[0]?.id);

  const [loaded, setLoaded]   = useState(false);
  const [view, setView]       = useState("stats");   // "stats" | "history" | "form"
  const [editRec, setEditRec] = useState(null);      // record in modifica (null = nuovo)
  const [calcCard, setCalcCard] = useState(0);        // indice scheda calcolatore (0-5)

  const emptyForm = () => Object.fromEntries(TUTTI_FIELDS.map(f=>[f.key,""]));
  const [form, setForm]       = useState(emptyForm());
  const [formDate, setFormDate] = useState(() => new Date().toLocaleDateString("it-IT"));

  useEffect(()=>{
    window.storage.get(SK_MISURE).then(r=>setMisure(JSON.parse(r.value))).catch(()=>{}).finally(()=>setLoaded(true));
  },[]);

  const persist = async next => {
    setMisure(next);
    await window.storage.set(SK_MISURE,JSON.stringify(next)).catch(()=>{});
    if (onMisureChange) onMisureChange(next);
  };

  // record persona corrente, ordinati dal più vecchio al più recente
  const allRecs = (misure[selPid]||[]).slice().sort((a,b)=>dateToSort(a.date).localeCompare(dateToSort(b.date)));
  // dal più recente per la history
  const recsDesc = [...allRecs].reverse();

  const persona = personas.find(p=>p.id===selPid)||personas[0];

  // Etichetta del campo "petto/seno" adattata al sesso della persona
  // selezionata: "Petto" per gli uomini, "Seno" per le donne.
  const campi = useMemo(() => TUTTI_FIELDS.map(f =>
    f.key === "petto" ? { ...f, label: persona?.sesso === "F" ? "Seno" : "Petto" } : f
  ), [persona?.sesso]);

  // ── apertura form ──
  const openNew = () => {
    setForm(emptyForm());
    setFormDate(new Date().toLocaleDateString("it-IT"));
    setEditRec(null);
    setView("form");
  };
  const openEdit = rec => {
    setForm(Object.fromEntries(TUTTI_FIELDS.map(f=>[f.key, rec[f.key]!==undefined&&rec[f.key]!==""?String(rec[f.key]):""])));
    setFormDate(rec.date);
    setEditRec(rec);
    setView("form");
  };

  // ── salvataggio ──
  const handleSave = async () => {
    const entry = { date:formDate, ...Object.fromEntries(TUTTI_FIELDS.map(f=>[f.key, form[f.key]===""?"":parseFloat(form[f.key])||""])) };
    const cur = (misure[selPid]||[]).slice();
    if (editRec) {
      const idx = cur.findIndex(r=>JSON.stringify(r)===JSON.stringify(editRec));
      if (idx>=0) cur[idx]=entry; else cur.push(entry);
      logSync("misure", `Misurazione modificata: ${formDate}`, { profiloId: selPid?.slice(0,8), peso: entry.peso, bmi: entry.bmi });
    } else {
      cur.push(entry);
      logSync("misure", `Nuova misurazione inserita: ${formDate}`, { profiloId: selPid?.slice(0,8), peso: entry.peso, nMisure: cur.length });
    }
    await persist({...misure,[selPid]:cur});
    setView("stats");
  };

  const handleDelete = async rec => {
    logSync("misure", `Misurazione eliminata: ${rec.date}`, { profiloId: selPid?.slice(0,8), peso: rec.peso });
    const cur = (misure[selPid]||[]).filter(r=>JSON.stringify(r)!==JSON.stringify(rec));
    await persist({...misure,[selPid]:cur});
  };

  // ── statistiche riassuntive ──
  const statFor = key => {
    const vals = allRecs.map(r=>parseFloat(r[key])).filter(v=>!isNaN(v));
    if (!vals.length) return null;
    const first=vals[0], last=vals[vals.length-1];
    return { first, last, delta:(last-first).toFixed(1), min:Math.min(...vals), max:Math.max(...vals), n:vals.length };
  };

  if (!loaded) return <div style={{textAlign:"center",padding:"60px 0",color:"#64748b",fontSize:24}}>⏳</div>;

  // ════════════════════ FORM ════════════════════
  if (view==="form") return (
    <div>
      <button onClick={()=>setView("stats")} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer",padding:"0 0 14px 0"}}>
        ← Indietro
      </button>
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:"16px",boxShadow:"0 4px 20px #0000000f"}}>
        <div style={{fontSize:14,fontWeight:800,color:"#1e293b",marginBottom:16}}>
          {editRec ? "✏️ Modifica misurazione" : "➕ Nuova misurazione"}
        </div>
        {/* Data */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:5}}>📅 Data</label>
          <input value={formDate} onChange={e=>setFormDate(e.target.value)} placeholder="gg/mm/aaaa"
            style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
        {/* Peso separato — campo grande */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:10,fontWeight:700,color:"#1e293b",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:5}}>⚖️ Peso <span style={{color:"#94a3b8",fontWeight:400}}>(kg)</span></label>
          <input type="number" inputMode="decimal" min="1" max="500" step="0.1"
            value={form.peso} onChange={e=>setForm(v=>({...v,peso:e.target.value}))} placeholder="—"
            style={{width:"100%",padding:"12px",border:"2px solid #1e293b30",borderRadius:9,fontSize:20,fontFamily:"monospace",fontWeight:800,outline:"none",boxSizing:"border-box",color:"#1e293b",textAlign:"center"}}/>
        </div>
        {/* Circonferenze 2 colonne */}
        <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Circonferenze (cm)</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
          {campi.filter(f=>f.key!=="peso").map(f=>(
            <div key={f.key}>
              <label style={{fontSize:10,fontWeight:700,color:f.color,textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}}>
                {f.emoji} {f.label}
              </label>
              <input type="number" inputMode="decimal" min="0" max="300" step="0.1"
                value={form[f.key]} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))} placeholder="—"
                style={{width:"100%",padding:"9px 12px",border:`1.5px solid ${f.color}40`,borderRadius:8,fontSize:15,fontFamily:"monospace",fontWeight:700,outline:"none",boxSizing:"border-box",color:"#1e293b"}}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={handleSave} style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:persona.color,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>
            {editRec?"✓ Aggiorna":"✓ Salva"}
          </button>
          <button onClick={()=>setView("stats")} style={{padding:"12px 18px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",fontWeight:700,fontSize:14,cursor:"pointer"}}>Annulla</button>
        </div>
      </div>
    </div>
  );

  // ════════════════════ STATS + HISTORY ════════════════════
  // Nota: in questa pagina lo swipe orizzontale cambia SOLO la scheda
  // calcolatore (carosello interno). La persona si cambia con i bottoni
  // in alto, per non avere due gesti di swipe in conflitto.
  return (
    <div>
      {/* Selettore persona */}
      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
        {personas.map(p=>(
          <button key={p.id} onClick={()=>setSelPid(p.id)}
            style={{flexShrink:0,padding:"8px 14px",borderRadius:10,border:"2px solid",borderColor:selPid===p.id?p.color:"#e2e8f0",background:selPid===p.id?p.color+"12":"#fff",color:selPid===p.id?p.color:"#64748b",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5}}>
            {emojiBySesso(p)} {p.nome}
          </button>
        ))}
      </div>

      {/* Sub-nav: Statistiche / Storico */}
      <div style={{display:"flex",gap:0,marginBottom:16,background:"#f1f5f9",borderRadius:10,padding:3}}>
        {[{k:"stats",l:"📊 Statistiche"},{k:"calories",l:"🍽️ Calorie"},{k:"history",l:"📋 Storico"}].map(({k,l})=>(
          <button key={k} onClick={()=>setView(k)}
            style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:view===k?"#fff":"transparent",color:view===k?"#1e293b":"#94a3b8",fontWeight:700,fontSize:12,cursor:"pointer",boxShadow:view===k?"0 1px 4px #0000001a":"none",transition:"all 0.15s"}}>
            {l}
          </button>
        ))}
      </div>

      {/* Bottone aggiungi */}
      <button onClick={openNew}
        style={{width:"100%",padding:"11px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${persona.color},${persona.color}cc)`,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:16,boxShadow:`0 4px 14px ${persona.color}44`}}>
        ➕ Aggiungi misurazione
      </button>

      {allRecs.length === 0 ? (
        <div style={{textAlign:"center",padding:"50px 0",color:"#94a3b8"}}>
          <div style={{fontSize:48,marginBottom:12}}>📏</div>
          <div style={{fontSize:14,fontWeight:700,color:"#64748b"}}>Nessuna misurazione</div>
          <div style={{fontSize:12,marginTop:6}}>Aggiungi la prima per iniziare a tracciare i progressi</div>
        </div>
      ) : view==="stats" ? (
        (()=>{
          // ── Dati per i calcolatori ──
          const last = allRecs.length ? allRecs[allRecs.length-1] : null;
          const pesoVal = last && !isNaN(parseFloat(last.peso)) ? parseFloat(last.peso) : (persona.peso||0);
          const altezzaCm = persona.altezza||0;
          const target = calcTargetAdattivo(persona, allRecs);
          const pctG = stimaGrasso(persona, last);
          const bmi = altezzaCm>0 ? pesoVal/Math.pow(altezzaCm/100,2) : 0;
          const bmiClass = bmi===0?{l:"—",c:"#94a3b8"}
            : bmi<18.5?{l:"Sottopeso",c:"#0ea5e9"}
            : bmi<25?{l:"Normopeso",c:"#16a34a"}
            : bmi<30?{l:"Sovrappeso",c:"#d97706"}
            :{l:"Obesità",c:"#ef4444"};
          const massaGrassaKg = pctG!==null ? pesoVal*pctG/100 : null;
          const massaMagraKg  = pctG!==null ? pesoVal*(1-pctG/100) : null;
          const deficit = target.kcal - target.tdeeFinale;
          const circonf = campi.filter(f=>f.key!=="peso");
          const pesoRecs = allRecs.filter(r=>!isNaN(parseFloat(r.peso)));

          // ── Definizione delle 6 schede ──
          const SCHEDE = [
            {
              id:"peso", titolo:"Peso & IMC", icona:"⚖️", colore:"#1e293b",
              render:()=>(
                <>
                  <div style={{display:"flex",justifyContent:"space-around",textAlign:"center",marginBottom:16}}>
                    <div>
                      <div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.8,fontWeight:700}}>Peso attuale</div>
                      <div style={{fontSize:30,fontWeight:800,color:"#1e293b",fontFamily:"monospace",lineHeight:1.1}}>{pesoVal||"—"}<span style={{fontSize:13,color:"#94a3b8"}}>kg</span></div>
                    </div>
                    <div>
                      <div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.8,fontWeight:700}}>Altezza</div>
                      <div style={{fontSize:30,fontWeight:800,color:"#1e293b",fontFamily:"monospace",lineHeight:1.1}}>{altezzaCm||"—"}<span style={{fontSize:13,color:"#94a3b8"}}>cm</span></div>
                    </div>
                  </div>
                  <div style={{background:bmiClass.c+"12",borderRadius:12,padding:"14px",textAlign:"center"}}>
                    <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,fontWeight:700}}>Indice di Massa Corporea</div>
                    <div style={{fontSize:34,fontWeight:800,color:bmiClass.c,fontFamily:"monospace",lineHeight:1.2}}>{bmi>0?bmi.toFixed(1):"—"}</div>
                    <div style={{fontSize:13,fontWeight:700,color:bmiClass.c}}>{bmiClass.l}</div>
                  </div>
                  {pesoRecs.length >= 1 && (
                    <div style={{marginTop:16}}>
                      <WeightProgressChart records={allRecs} persona={persona}/>
                    </div>
                  )}
                </>
              ),
            },
            {
              id:"grasso", titolo:"Massa grassa", icona:"🔬", colore:"#db2777",
              render:()=>(
                pctG===null ? (
                  <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:"30px 10px"}}>
                    <div style={{fontSize:36,marginBottom:10}}>📐</div>
                    Per stimare la massa grassa servono <b>collo</b> e <b>vita</b> {persona.sesso==="F"?"e fianchi":""} (formula US Navy).<br/>Aggiungi questi dati con ➕.
                  </div>
                ) : (
                  <>
                    <div style={{textAlign:"center",marginBottom:16}}>
                      <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,fontWeight:700}}>Grasso corporeo stimato</div>
                      <div style={{fontSize:38,fontWeight:800,color:"#db2777",fontFamily:"monospace",lineHeight:1.2}}>{pctG.toFixed(1)}<span style={{fontSize:16}}>%</span></div>
                      <div style={{fontSize:10,color:"#94a3b8"}}>metodo US Navy (circonferenze)</div>
                    </div>
                    <div style={{display:"flex",gap:10}}>
                      <div style={{flex:1,background:"#fef2f8",borderRadius:12,padding:"12px",textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#db2777",textTransform:"uppercase",letterSpacing:0.6,fontWeight:700}}>Massa grassa</div>
                        <div style={{fontSize:22,fontWeight:800,color:"#db2777",fontFamily:"monospace"}}>{massaGrassaKg.toFixed(1)}<span style={{fontSize:11}}>kg</span></div>
                      </div>
                      <div style={{flex:1,background:"#f0fdf4",borderRadius:12,padding:"12px",textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#16a34a",textTransform:"uppercase",letterSpacing:0.6,fontWeight:700}}>Massa magra</div>
                        <div style={{fontSize:22,fontWeight:800,color:"#16a34a",fontFamily:"monospace"}}>{massaMagraKg.toFixed(1)}<span style={{fontSize:11}}>kg</span></div>
                      </div>
                    </div>
                  </>
                )
              ),
            },
            {
              id:"calorie", titolo:"Calorie & deficit", icona:"🔥", colore:"#ea580c",
              render:()=>(
                <>
                  <div style={{textAlign:"center",marginBottom:16}}>
                    <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,fontWeight:700}}>Fabbisogno giornaliero</div>
                    <div style={{fontSize:38,fontWeight:800,color:"#ea580c",fontFamily:"monospace",lineHeight:1.2}}>{target.kcal}<span style={{fontSize:15,color:"#94a3b8"}}>kcal</span></div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"#f8fafc",borderRadius:8}}>
                      <span style={{color:"#64748b"}}>Metabolismo + attività (TDEE)</span>
                      <span style={{fontFamily:"monospace",fontWeight:700,color:"#1e293b"}}>{target.tdeeFinale} kcal</span>
                    </div>
                    {Math.abs(deficit)>=1 && (
                      <div style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:deficit<0?"#eff6ff":"#fef2f2",borderRadius:8}}>
                        <span style={{color:"#64748b"}}>Aggiustamento obiettivo</span>
                        <span style={{fontFamily:"monospace",fontWeight:700,color:deficit<0?"#2563eb":"#dc2626"}}>{deficit<0?`deficit ${-deficit}`:`surplus +${deficit}`} kcal</span>
                      </div>
                    )}
                    {target.larnInfo && (
                      <div style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"#f8fafc",borderRadius:8}}>
                        <span style={{color:"#64748b"}}>Metabolismo basale (LARN)</span>
                        <span style={{fontFamily:"monospace",fontWeight:700,color:"#1e293b"}}>{target.larnInfo.mb} kcal</span>
                      </div>
                    )}
                  </div>
                </>
              ),
            },
            {
              id:"macro", titolo:"Macronutrienti", icona:"🍽️", colore:"#2563eb",
              render:()=>(
                <>
                  <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,fontWeight:700,textAlign:"center",marginBottom:14}}>Obiettivo giornaliero</div>
                  <div style={{display:"flex",gap:8}}>
                    {[{l:"Proteine",v:target.p,c:"#dc2626",e:"🥩"},{l:"Carboidrati",v:target.c,c:"#d97706",e:"🌾"},{l:"Grassi",v:target.g,c:"#16a34a",e:"🥑"}].map(m=>(
                      <div key={m.l} style={{flex:1,background:m.c+"10",borderRadius:12,padding:"14px 8px",textAlign:"center",border:`1.5px solid ${m.c}25`}}>
                        <div style={{fontSize:20}}>{m.e}</div>
                        <div style={{fontSize:24,fontWeight:800,color:m.c,fontFamily:"monospace",lineHeight:1.1,marginTop:4}}>{m.v}<span style={{fontSize:11}}>g</span></div>
                        <div style={{fontSize:9,color:m.c,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,marginTop:2}}>{m.l}</div>
                        <div style={{fontSize:9,color:"#94a3b8",marginTop:2}}>{Math.round(m.v*(m.l==="Grassi"?9:4))} kcal</div>
                      </div>
                    ))}
                  </div>
                  <div style={{textAlign:"center",fontSize:11,color:"#94a3b8",marginTop:14}}>
                    Ripartizione di {target.kcal} kcal — proteine {Math.round(target.p*4/target.kcal*100)}% · carbo {Math.round(target.c*4/target.kcal*100)}% · grassi {Math.round(target.g*9/target.kcal*100)}%
                  </div>
                </>
              ),
            },
            {
              id:"circonf", titolo:"Circonferenze", icona:"📐", colore:"#7c3aed",
              render:()=>{
                const conDati = circonf.filter(f=>statFor(f.key));
                if (!conDati.length) return (
                  <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:"30px 10px"}}>
                    <div style={{fontSize:36,marginBottom:10}}>📏</div>
                    Nessuna circonferenza registrata.<br/>Aggiungi vita, fianchi, petto/seno… con ➕.
                  </div>
                );
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {conDati.map(f=>{
                      const s=statFor(f.key); const d=parseFloat(s.delta); const pos=d>0,neu=d===0;
                      return (
                        <div key={f.key} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#f8fafc",borderRadius:10}}>
                          <span style={{fontSize:18}}>{f.emoji}</span>
                          <span style={{flex:1,fontSize:12,fontWeight:700,color:"#475569"}}>{f.label}</span>
                          <span style={{fontSize:18,fontWeight:800,color:f.color,fontFamily:"monospace"}}>{s.last}<span style={{fontSize:10,color:"#94a3b8"}}>{f.unit}</span></span>
                          <span style={{fontSize:11,fontWeight:700,minWidth:46,textAlign:"right",color:neu?"#94a3b8":pos?"#ef4444":"#16a34a"}}>{neu?"—":pos?`▲${s.delta}`:`▼${s.delta}`}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              },
            },
            {
              id:"storico", titolo:"Storico", icona:"🕐", colore:"#0891b2",
              render:()=>(
                recsDesc.length===0 ? (
                  <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:"30px"}}>Nessuna misurazione</div>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {recsDesc.slice(0,8).map((rec,idx)=>(
                      <div key={idx} onClick={()=>openEdit(rec)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",background:"#f8fafc",borderRadius:10,cursor:"pointer"}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{rec.date}</div>
                          <div style={{fontSize:10,color:"#94a3b8"}}>{rec.peso?`${rec.peso}kg`:""}{rec.vita?` · vita ${rec.vita}`:""}</div>
                        </div>
                        <span style={{fontSize:12,color:"#0891b2",fontWeight:700}}>✏️</span>
                      </div>
                    ))}
                    {recsDesc.length>8 && <div style={{textAlign:"center",fontSize:11,color:"#94a3b8"}}>+ altre {recsDesc.length-8} nello Storico completo</div>}
                  </div>
                )
              ),
            },
          ];

          const idx = Math.max(0, Math.min(calcCard, SCHEDE.length-1));
          const scheda = SCHEDE[idx];

          return (
            <>
              {/* Carosello schede calcolatore con swipe */}
              <SwipeContainer
                onSwipeLeft={()=>setCalcCard(i=>Math.min(SCHEDE.length-1,i+1))}
                onSwipeRight={()=>setCalcCard(i=>Math.max(0,i-1))}
                style={{touchAction:"pan-y"}}>
                <div style={{background:"#fff",borderRadius:16,border:`1.5px solid ${scheda.colore}25`,padding:"18px 16px",boxShadow:"0 4px 20px #0000000f",minHeight:240}}>
                  {/* Intestazione scheda con frecce */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                    <button onClick={()=>setCalcCard(i=>Math.max(0,i-1))} disabled={idx===0}
                      style={{border:"none",background:"none",fontSize:20,color:idx===0?"#e2e8f0":scheda.colore,cursor:idx===0?"default":"pointer",padding:"0 4px"}}>‹</button>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:18}}>{scheda.icona}</span>
                      <span style={{fontSize:14,fontWeight:800,color:scheda.colore}}>{scheda.titolo}</span>
                    </div>
                    <button onClick={()=>setCalcCard(i=>Math.min(SCHEDE.length-1,i+1))} disabled={idx===SCHEDE.length-1}
                      style={{border:"none",background:"none",fontSize:20,color:idx===SCHEDE.length-1?"#e2e8f0":scheda.colore,cursor:idx===SCHEDE.length-1?"default":"pointer",padding:"0 4px"}}>›</button>
                  </div>
                  {scheda.render()}
                </div>
              </SwipeContainer>

              {/* Indicatori a puntini */}
              <div style={{display:"flex",justifyContent:"center",gap:7,margin:"14px 0 4px"}}>
                {SCHEDE.map((s,i)=>(
                  <button key={s.id} onClick={()=>setCalcCard(i)}
                    style={{width:i===idx?22:8,height:8,borderRadius:4,border:"none",background:i===idx?scheda.colore:"#cbd5e1",cursor:"pointer",transition:"all 0.2s",padding:0}}
                    aria-label={s.titolo}/>
                ))}
              </div>
              <div style={{textAlign:"center",fontSize:10,color:"#94a3b8",marginBottom:8}}>← scorri tra i calcolatori →</div>
            </>
          );
        })()
      ) : view==="calories" ? (
        (()=>{
          const target2=calcTargetAdattivo(persona,allRecs);
          const pLog=(mealsLog||{})[selPid]||{};
          const today2=new Date();
          const weekDays=Array.from({length:7},(_,i)=>{const d=new Date(today2);d.setDate(today2.getDate()-(6-i));const key=d.toISOString().slice(0,10);const dayLog=pLog[key]||{};const meals=Object.entries(dayLog).filter(([,m])=>m.consumed).map(([mk,m])=>({mk,kcal:m.kcal||0}));return{key,meals,totKcal:meals.reduce((s,m)=>s+m.kcal,0),isToday:i===6};});
          const giorniConDati=weekDays.filter(d=>d.totKcal>0).length;
          const media=giorniConDati>0?Math.round(weekDays.reduce((s,d)=>s+d.totKcal,0)/giorniConDati):0;
          const todayData=weekDays[6];
          const MLABEL={colazione:"☀️ Colazione",spuntino_m:"🍎 Spuntino mattina",pranzo:"🥗 Pranzo",spuntino_p:"🫐 Spuntino pom.",cena:"🍽️ Cena"};
          return (
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                {[{l:"Oggi",v:todayData.totKcal||"—",c:persona.color,bg:persona.color+"10"},{l:"Media/g.",v:media||"—",c:"#16a34a",bg:"#f0fdf4"},{l:"Target",v:target2.kcal,c:"#2563eb",bg:"#eff6ff"}].map(item=>(
                  <div key={item.l} style={{background:item.bg,borderRadius:10,padding:"10px 8px",textAlign:"center",border:`1px solid ${item.c}25`}}>
                    <div style={{fontSize:9,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,fontWeight:700}}>{item.l}</div>
                    <div style={{fontSize:20,fontWeight:800,color:item.c,fontFamily:"monospace",lineHeight:1.2}}>{item.v}</div>
                    <div style={{fontSize:9,color:"#94a3b8"}}>kcal</div>
                  </div>
                ))}
              </div>
              <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"14px 16px",marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,color:"#1e293b",marginBottom:12}}>📊 Ultimi 7 giorni</div>
                <CalorieChart personaId={selPid} mealsLog={mealsLog||{}} target={target2.kcal}/>
              </div>
              {todayData.meals.length>0&&(<div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"14px 16px",marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,color:"#1e293b",marginBottom:10}}>✅ Pasti di oggi</div>
                {todayData.meals.map(m=>(<div key={m.mk} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}><span style={{fontSize:12,color:"#475569",fontWeight:600}}>{MLABEL[m.mk]||m.mk}</span><span style={{fontFamily:"monospace",fontSize:12,fontWeight:700}}>{m.kcal} kcal</span></div>))}
                <div style={{display:"flex",justifyContent:"space-between",marginTop:8,paddingTop:6,borderTop:"1.5px solid #e2e8f0"}}><span style={{fontSize:12,fontWeight:800}}>Totale</span><span style={{fontFamily:"monospace",fontSize:13,fontWeight:800,color:todayData.totKcal>=target2.kcal*0.9?"#16a34a":"#d97706"}}>{todayData.totKcal} kcal · {Math.round(todayData.totKcal/target2.kcal*100)}%</span></div>
              </div>)}
              {giorniConDati===0&&<div style={{textAlign:"center",padding:"30px 20px",color:"#94a3b8"}}><div style={{fontSize:40,marginBottom:10}}>☑️</div><div style={{fontSize:13,fontWeight:700,color:"#64748b"}}>Nessun pasto registrato</div><div style={{fontSize:11,marginTop:6}}>Torna al piano e spunta i pasti con ✅</div></div>}
            </>
          );
        })()
      ) : (
        /* ══ STORICO ══ */
        <>
          {recsDesc.map((rec,idx)=>{
            const prevRec = recsDesc[idx+1] || null;
            return (
              <div key={idx} style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"14px 16px",marginBottom:10,boxShadow:"0 2px 8px #0000000a"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:"#1e293b"}}>{dateToLabel(rec.date)}</div>
                    <div style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>{rec.date}</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>openEdit(rec)} style={{padding:"6px 10px",borderRadius:7,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#475569",fontSize:11,fontWeight:700,cursor:"pointer"}}>✏️</button>
                    <button onClick={()=>handleDelete(rec)} style={{padding:"6px 10px",borderRadius:7,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑</button>
                  </div>
                </div>
                {/* Griglia valori */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                  {campi.map(f=>{
                    const val = rec[f.key];
                    const hasVal = val!==""&&val!==undefined&&!isNaN(parseFloat(val));
                    const prevVal = prevRec ? parseFloat(prevRec[f.key]) : NaN;
                    const curVal  = parseFloat(val);
                    const d = (!isNaN(curVal)&&!isNaN(prevVal)) ? (curVal-prevVal).toFixed(1) : null;
                    const dNum = parseFloat(d);
                    return (
                      <div key={f.key} style={{background:f.color+"08",borderRadius:8,padding:"8px 6px",border:`1px solid ${f.color}20`,textAlign:"center"}}>
                        <div style={{fontSize:9,color:f.color,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,marginBottom:2}}>{f.emoji} {f.label}</div>
                        <div style={{fontSize:15,fontWeight:800,color:hasVal?"#1e293b":"#cbd5e1",fontFamily:"monospace"}}>
                          {hasVal?val:"—"}
                          {hasVal&&<span style={{fontSize:8,color:"#94a3b8",marginLeft:1}}>{f.unit}</span>}
                        </div>
                        {d!==null&&(
                          <div style={{fontSize:9,fontWeight:700,color:dNum===0?"#94a3b8":dNum<0?"#16a34a":"#ef4444",marginTop:1}}>
                            {dNum===0?"=":dNum<0?`▼${Math.abs(dNum)}`:`▲${Math.abs(dNum)}`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div style={{marginTop:4,fontSize:10,color:"#94a3b8",textAlign:"center",paddingBottom:8}}>
            ▼ verde = riduzione · ▲ rosso = aumento rispetto alla rilevazione precedente
          </div>
        </>
      )}
    </div>
  );
}

