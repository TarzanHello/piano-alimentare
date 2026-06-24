import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { SK_MISURE, TUTTI_FIELDS, calcTargetAdattivo, dateToLabel, dateToSort, emojiBySesso, localDateKey, stimaGrasso } from '@/core';
import { CalorieChart } from '@/components/charts';
import { SwipeContainer } from '@/components/shared';
import { logSync } from '@/db/synclog';

export function MisurePage({ personas, myPersonaId, onMisureChange, mealsLog, inFamily, myUid }) {
  const [misure, setMisure]   = useState({});
  const [selPid, setSelPid]   = useState(myPersonaId || personas[0]?.id);
  // Sola lettura STRETTA: le misure sono modificabili solo sul proprio profilo
  // (myPersonaId). I dati degli altri membri sono in sola lettura.
  const selPersona = personas.find(p=>p.id===selPid);
  const readOnly = inFamily ? (selPid !== myPersonaId) : false;

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

  if (!loaded) return <div style={{textAlign:"center",padding:"60px 0",color:"#6E8576",fontSize:24}}>⏳</div>;

  // ════════════════════ FORM ════════════════════
  if (view==="form") return (
    <div>
      <button onClick={()=>setView("stats")} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:"#6E8576",fontWeight:700,fontSize:13,cursor:"pointer",padding:"0 0 14px 0"}}>
        ← Indietro
      </button>
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #E7EDE2",padding:"16px",boxShadow:"0 4px 20px #0000000f"}}>
        <div style={{fontSize:14,fontWeight:800,color:"#13231A",marginBottom:16}}>
          {editRec ? "✏️ Modifica misurazione" : "➕ Nuova misurazione"}
        </div>
        {/* Data */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:10,fontWeight:700,color:"#6E8576",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:5}}>📅 Data</label>
          <input value={formDate} onChange={e=>setFormDate(e.target.value)} placeholder="gg/mm/aaaa"
            style={{width:"100%",padding:"10px 12px",border:"1.5px solid #E7EDE2",borderRadius:9,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
        {/* Peso separato — campo grande */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:10,fontWeight:700,color:"#13231A",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:5}}>⚖️ Peso <span style={{color:"#9DB1A2",fontWeight:400}}>(kg)</span></label>
          <input type="number" inputMode="decimal" min="1" max="500" step="0.1"
            value={form.peso} onChange={e=>setForm(v=>({...v,peso:e.target.value}))} placeholder="—"
            style={{width:"100%",padding:"12px",border:"2px solid #13231A30",borderRadius:9,fontSize:20,fontFamily:"monospace",fontWeight:800,outline:"none",boxSizing:"border-box",color:"#13231A",textAlign:"center"}}/>
        </div>
        {/* Circonferenze 2 colonne */}
        <div style={{fontSize:10,fontWeight:700,color:"#6E8576",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Circonferenze (cm)</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
          {campi.filter(f=>f.key!=="peso").map(f=>(
            <div key={f.key}>
              <label style={{fontSize:10,fontWeight:700,color:f.color,textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}}>
                {f.emoji} {f.label}
              </label>
              <input type="number" inputMode="decimal" min="0" max="300" step="0.1"
                value={form[f.key]} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))} placeholder="—"
                style={{width:"100%",padding:"9px 12px",border:`1.5px solid ${f.color}40`,borderRadius:8,fontSize:15,fontFamily:"monospace",fontWeight:700,outline:"none",boxSizing:"border-box",color:"#13231A"}}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={handleSave} style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:persona.color,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>
            {editRec?"✓ Aggiorna":"✓ Salva"}
          </button>
          <button onClick={()=>setView("stats")} style={{padding:"12px 18px",borderRadius:10,border:"1.5px solid #E7EDE2",background:"#fff",color:"#6E8576",fontWeight:700,fontSize:14,cursor:"pointer"}}>Annulla</button>
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
            style={{flexShrink:0,padding:"8px 14px",borderRadius:10,border:"2px solid",borderColor:selPid===p.id?p.color:"#E7EDE2",background:selPid===p.id?p.color+"12":"#fff",color:selPid===p.id?p.color:"#6E8576",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5}}>
            {emojiBySesso(p)} {p.nome}
          </button>
        ))}
      </div>

      {/* Sub-nav: Statistiche / Storico */}
      <div style={{display:"flex",gap:0,marginBottom:16,background:"#EFF3EC",borderRadius:10,padding:3}}>
        {[{k:"stats",l:"📊 Statistiche"},{k:"calories",l:"🍽️ Calorie"},{k:"history",l:"📋 Storico"}].map(({k,l})=>(
          <button key={k} onClick={()=>setView(k)}
            style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:view===k?"#fff":"transparent",color:view===k?"#13231A":"#9DB1A2",fontWeight:700,fontSize:12,cursor:"pointer",boxShadow:view===k?"0 1px 4px #0000001a":"none",transition:"all 0.15s"}}>
            {l}
          </button>
        ))}
      </div>

      {/* Bottone aggiungi */}
      {readOnly ? (
        <div style={{width:"100%",padding:"11px",borderRadius:12,background:"#EFF3EC",color:"#6E8576",fontWeight:700,fontSize:12,textAlign:"center",marginBottom:16}}>
          🔒 Misure di un altro membro: sola lettura
        </div>
      ) : (
      <button onClick={openNew}
        style={{width:"100%",padding:"11px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${persona.color},${persona.color}cc)`,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:16,boxShadow:`0 4px 14px ${persona.color}44`}}>
        ➕ Aggiungi misurazione
      </button>
      )}

      {allRecs.length === 0 ? (
        <div style={{textAlign:"center",padding:"50px 0",color:"#9DB1A2"}}>
          <div style={{fontSize:48,marginBottom:12}}>📏</div>
          <div style={{fontSize:14,fontWeight:700,color:"#6E8576"}}>Nessuna misurazione</div>
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
          const bmiClass = bmi===0?{l:"—",c:"#9DB1A2"}
            : bmi<18.5?{l:"Sottopeso",c:"#0ea5e9"}
            : bmi<25?{l:"Normopeso",c:"#16a34a"}
            : bmi<30?{l:"Sovrappeso",c:"#d97706"}
            :{l:"Obesità",c:"#ef4444"};
          const massaGrassaKg = pctG!==null ? pesoVal*pctG/100 : null;
          const massaMagraKg  = pctG!==null ? pesoVal*(1-pctG/100) : null;
          const deficit = target.kcal - target.tdeeFinale;
          const circonf = campi.filter(f=>f.key!=="peso");
          const pesoRecs = allRecs.filter(r=>!isNaN(parseFloat(r.peso)));

          // ── Dati derivati per le slide ──
          const conDati = circonf.filter(f=>statFor(f.key));
          // Stima grasso del primo record utile, per il delta storico
          const pctGfirst = (()=>{ for(const r of allRecs){ const v=stimaGrasso(persona,r); if(v!==null) return v; } return null; })();
          const pctGdelta = (pctG!==null && pctGfirst!==null) ? (pctG-pctGfirst) : null;

          // Grafico peso (unico) riusato nell'hero
          const renderHeroChart = () => {
            if (pesoRecs.length<2) return null;
            const vals = pesoRecs.map(r=>parseFloat(r.peso)).filter(v=>!isNaN(v));
            if (vals.length<2) return null;
            const mn=Math.min(...vals), mx=Math.max(...vals), rng=(mx-mn)||1;
            const W=300,H=72,P=8;
            const pts=vals.map((v,i)=>({x:(i/(vals.length-1))*W, y:P+(1-(v-mn)/rng)*(H-2*P)}));
            const line=pts.map((p,i)=>`${i?"L":"M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
            const area=line+` L${W},${H} L0,${H} Z`;
            const lastPt=pts[pts.length-1];
            const delta=(vals[vals.length-1]-vals[0]);
            const mesi=["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
            const mFirst=(()=>{try{return mesi[new Date(pesoRecs[0].date.split("/").reverse().join("-")).getMonth()];}catch{return"";}})();
            const mLast=(()=>{try{return mesi[new Date(pesoRecs[pesoRecs.length-1].date.split("/").reverse().join("-")).getMonth()];}catch{return"";}})();
            return (
              <div style={{marginTop:14}}>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(157,232,55,0.16)",borderRadius:999,padding:"5px 11px"}}>
                    <span style={{fontSize:12,color:"#9DE837",fontWeight:900}}>{delta<=0?"↓":"↑"}</span>
                    <span style={{fontSize:12,fontWeight:800,color:"#9DE837"}}>{delta>0?"+":""}{delta.toFixed(1)} kg</span>
                  </div>
                </div>
                <svg width="100%" height="72" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block",overflow:"visible"}}>
                  <defs><linearGradient id="ms-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9DE837" stopOpacity="0.34"/><stop offset="1" stopColor="#9DE837" stopOpacity="0"/></linearGradient></defs>
                  <path d={area} fill="url(#ms-area)"/>
                  <path d={line} fill="none" stroke="#9DE837" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
                  <circle cx={lastPt.x} cy={lastPt.y} r="4" fill="#9DE837" stroke="#10271B" strokeWidth="2"/>
                </svg>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
                  <span style={{fontSize:10,fontWeight:600,color:"#5E7D6C"}}>{mFirst}</span>
                  <span style={{fontSize:10,fontWeight:600,color:"#5E7D6C"}}>{mLast}</span>
                </div>
              </div>
            );
          };

          const cardBox = {background:"#fff",borderRadius:18,boxShadow:"0 12px 30px -18px rgba(15,58,41,0.28)"};

          // ════ SLIDE 1 · RIEPILOGO (layout del mockup) ════
          const SlideRiepilogo = () => (
            <>
              {/* Hero peso + grafico unico */}
              <div style={{background:"linear-gradient(140deg,#10271B,#13402C)",borderRadius:18,padding:"18px 20px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                  <div>
                    <div style={{fontSize:10,color:"#7FA890",textTransform:"uppercase",letterSpacing:1,fontWeight:800}}>Peso attuale</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:5,marginTop:4}}>
                      <span style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:38,fontWeight:800,color:"#F4F7EF",lineHeight:1,letterSpacing:-1}}>{pesoVal||"—"}</span>
                      <span style={{fontSize:14,fontWeight:700,color:"#9DB1A2"}}>kg</span>
                    </div>
                    {persona.pesoTarget>0 && pesoVal>0 && (
                      <div style={{fontSize:11,color:"#7FA890",fontWeight:600,marginTop:7}}>Obiettivo {persona.pesoTarget} kg · {Math.abs(pesoVal-persona.pesoTarget).toFixed(1)} kg al traguardo</div>
                    )}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:10,color:"#7FA890",textTransform:"uppercase",letterSpacing:1,fontWeight:800}}>Altezza</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:4,justifyContent:"flex-end"}}>
                      <span style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:28,fontWeight:800,color:"#F4F7EF",lineHeight:1}}>{altezzaCm||"—"}</span>
                      <span style={{fontSize:13,fontWeight:700,color:"#9DB1A2"}}>cm</span>
                    </div>
                  </div>
                </div>
                {renderHeroChart()}
              </div>

              {/* Composizione: massa grassa + TDEE adattivo */}
              <div style={{display:"flex",gap:11,marginBottom:12}}>
                <div style={{...cardBox,flex:1,padding:"15px 16px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#9DB1A2",textTransform:"uppercase",letterSpacing:0.6}}>Massa grassa</div>
                  {pctG!==null ? (
                    <>
                      <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:23,fontWeight:800,color:"#10271B",marginTop:4}}>{pctG.toFixed(1)}<span style={{fontSize:13,fontWeight:700,color:"#9DB1A2"}}>%</span></div>
                      <div style={{fontSize:11,fontWeight:700,marginTop:2,color:pctGdelta===null?"#7C9183":pctGdelta<0?"#18A957":pctGdelta>0?"#ef4444":"#9DB1A2"}}>
                        {pctGdelta===null?"metodo US Navy":`${pctGdelta>0?"+":""}${pctGdelta.toFixed(1)}% finora`}
                      </div>
                    </>
                  ) : (
                    <div style={{fontSize:12,fontWeight:700,color:"#C2D0C6",marginTop:8,lineHeight:1.4}}>Servono collo e vita</div>
                  )}
                </div>
                <div style={{...cardBox,flex:1,padding:"15px 16px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#9DB1A2",textTransform:"uppercase",letterSpacing:0.6}}>TDEE adattivo</div>
                  <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:23,fontWeight:800,color:"#10271B",marginTop:4}}>{target.tdeeFinale}<span style={{fontSize:13,fontWeight:700,color:"#9DB1A2"}}> kcal</span></div>
                  <div style={{fontSize:11,fontWeight:700,color:"#7C9183",marginTop:2}}>{allRecs.length} misurazion{allRecs.length===1?"e":"i"}</div>
                </div>
              </div>

              {/* Circonferenze (misurazioni) */}
              <div style={{...cardBox,padding:"8px 6px"}}>
                <div style={{padding:"10px 14px 8px",fontSize:11,fontWeight:800,color:"#9DB1A2",letterSpacing:1,textTransform:"uppercase"}}>Circonferenze</div>
                {conDati.length===0 ? (
                  <div style={{padding:"6px 14px 16px",fontSize:12.5,color:"#9DB1A2",lineHeight:1.5}}>Nessuna circonferenza registrata. Aggiungi vita, fianchi, petto/seno… con ➕.</div>
                ) : conDati.map((f,i)=>{
                  const s=statFor(f.key); const d=parseFloat(s.delta); const neu=d===0;
                  return (
                    <div key={f.key} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderTop:i?"1px solid #F1F5EE":"none"}}>
                      <div style={{width:34,height:34,borderRadius:11,background:f.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{f.emoji}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13.5,fontWeight:700,color:"#13231A"}}>{f.label}</div>
                        <div style={{fontSize:11,color:"#9DB1A2",fontWeight:600}}>{s.n} rilevazion{s.n===1?"e":"i"}</div>
                      </div>
                      <span style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:16,fontWeight:800,color:"#10271B"}}>{s.last}<span style={{fontSize:11,color:"#9DB1A2"}}> {f.unit}</span></span>
                      <span style={{fontSize:11,fontWeight:800,minWidth:42,textAlign:"right",color:neu?"#9DB1A2":d<0?"#18A957":"#ef4444"}}>{neu?"=":`${d<0?"−":"+"}${Math.abs(d)}`}</span>
                    </div>
                  );
                })}
              </div>
            </>
          );

          // ════ SLIDE 2 · DETTAGLI (tutto il resto) ════
          const SlideDettagli = () => (
            <>
              {/* IMC */}
              <div style={{...cardBox,padding:"16px 18px",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{fontSize:10,color:"#9DB1A2",textTransform:"uppercase",letterSpacing:0.8,fontWeight:800}}>Indice di Massa Corporea</div>
                  <span style={{fontSize:12,fontWeight:800,color:bmiClass.c,background:bmiClass.c+"18",borderRadius:999,padding:"4px 11px"}}>{bmiClass.l}</span>
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:5,marginBottom:bmi>0?14:0}}>
                  <span style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:36,fontWeight:800,color:"#10271B",lineHeight:1,letterSpacing:-1}}>{bmi>0?bmi.toFixed(1):"—"}</span>
                  <span style={{fontSize:13,fontWeight:700,color:"#9DB1A2"}}>kg/m²</span>
                </div>
                {bmi>0 && (
                  <div style={{position:"relative",height:7,borderRadius:99,background:"linear-gradient(90deg,#0ea5e9 0%,#16a34a 28%,#16a34a 50%,#d97706 72%,#ef4444 100%)"}}>
                    <div style={{position:"absolute",top:"50%",left:`${Math.max(2,Math.min(98,(bmi-15)/20*100))}%`,width:14,height:14,borderRadius:"50%",background:"#fff",border:`3px solid ${bmiClass.c}`,transform:"translate(-50%,-50%)",boxShadow:"0 2px 6px rgba(0,0,0,0.22)"}}/>
                  </div>
                )}
              </div>

              {/* Massa grassa / magra in kg */}
              {pctG!==null && (
                <div style={{...cardBox,padding:"16px 18px",marginBottom:12}}>
                  <div style={{fontSize:10,color:"#9DB1A2",textTransform:"uppercase",letterSpacing:0.8,fontWeight:800,marginBottom:12}}>Composizione corporea</div>
                  <div style={{display:"flex",gap:10}}>
                    <div style={{flex:1,background:"#fef2f8",borderRadius:14,padding:"13px 12px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#db2777",textTransform:"uppercase",letterSpacing:0.6,fontWeight:700}}>Massa grassa</div>
                      <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:22,fontWeight:800,color:"#db2777",marginTop:3}}>{massaGrassaKg.toFixed(1)}<span style={{fontSize:11}}> kg</span></div>
                    </div>
                    <div style={{flex:1,background:"#f0fdf4",borderRadius:14,padding:"13px 12px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#16a34a",textTransform:"uppercase",letterSpacing:0.6,fontWeight:700}}>Massa magra</div>
                      <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:22,fontWeight:800,color:"#16a34a",marginTop:3}}>{massaMagraKg.toFixed(1)}<span style={{fontSize:11}}> kg</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Calorie & deficit */}
              <div style={{...cardBox,padding:"16px 18px",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{fontSize:10,color:"#9DB1A2",textTransform:"uppercase",letterSpacing:0.8,fontWeight:800}}>Fabbisogno giornaliero</div>
                  <div><span style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:24,fontWeight:800,color:"#10271B"}}>{target.kcal}</span><span style={{fontSize:12,fontWeight:700,color:"#9DB1A2"}}> kcal</span></div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:13}}>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"9px 12px",background:"#F5F8F1",borderRadius:10}}>
                    <span style={{color:"#6E8576",fontWeight:600}}>Metabolismo + attività (TDEE)</span>
                    <span style={{fontWeight:800,color:"#13231A"}}>{target.tdeeFinale} kcal</span>
                  </div>
                  {Math.abs(deficit)>=1 && (
                    <div style={{display:"flex",justifyContent:"space-between",padding:"9px 12px",background:deficit<0?"#EDF7EF":"#fef2f2",borderRadius:10}}>
                      <span style={{color:"#6E8576",fontWeight:600}}>Aggiustamento obiettivo</span>
                      <span style={{fontWeight:800,color:deficit<0?"#18A957":"#dc2626"}}>{deficit<0?`deficit ${-deficit}`:`surplus +${deficit}`} kcal</span>
                    </div>
                  )}
                  {target.larnInfo && (
                    <div style={{display:"flex",justifyContent:"space-between",padding:"9px 12px",background:"#F5F8F1",borderRadius:10}}>
                      <span style={{color:"#6E8576",fontWeight:600}}>Metabolismo basale (LARN)</span>
                      <span style={{fontWeight:800,color:"#13231A"}}>{target.larnInfo.mb} kcal</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Macronutrienti */}
              <div style={{...cardBox,padding:"16px 18px"}}>
                <div style={{fontSize:10,color:"#9DB1A2",textTransform:"uppercase",letterSpacing:0.8,fontWeight:800,marginBottom:14}}>Obiettivo macronutrienti</div>
                <div style={{display:"flex",gap:8}}>
                  {[{l:"Proteine",v:target.p,c:"#1FA2D8",e:"🥩"},{l:"Carboidrati",v:target.c,c:"#F2A93B",e:"🌾"},{l:"Grassi",v:target.g,c:"#8E7BE8",e:"🥑"}].map(m=>(
                    <div key={m.l} style={{flex:1,background:m.c+"12",borderRadius:14,padding:"14px 8px",textAlign:"center"}}>
                      <div style={{fontSize:20}}>{m.e}</div>
                      <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:23,fontWeight:800,color:m.c,lineHeight:1.1,marginTop:4}}>{m.v}<span style={{fontSize:11}}>g</span></div>
                      <div style={{fontSize:9,color:m.c,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,marginTop:2}}>{m.l}</div>
                      <div style={{fontSize:9,color:"#9DB1A2",marginTop:2}}>{Math.round(m.v*(m.l==="Grassi"?9:4))} kcal</div>
                    </div>
                  ))}
                </div>
                <div style={{textAlign:"center",fontSize:11,color:"#9DB1A2",marginTop:14,lineHeight:1.5}}>
                  Ripartizione di {target.kcal} kcal — proteine {Math.round(target.p*4/target.kcal*100)}% · carbo {Math.round(target.c*4/target.kcal*100)}% · grassi {Math.round(target.g*9/target.kcal*100)}%
                </div>
              </div>
            </>
          );

          const SLIDES = [
            { id:"riepilogo", titolo:"Riepilogo", render:SlideRiepilogo },
            { id:"dettagli",  titolo:"Dettagli",  render:SlideDettagli  },
          ];
          const idx = Math.max(0, Math.min(calcCard, SLIDES.length-1));

          return (
            <>
              {/* Tab delle due slide */}
              <div style={{display:"flex",gap:0,marginBottom:14,background:"#EFF3EC",borderRadius:12,padding:3}}>
                {SLIDES.map((s,i)=>(
                  <button key={s.id} onClick={()=>setCalcCard(i)}
                    style={{flex:1,padding:"9px",borderRadius:9,border:"none",background:i===idx?"#fff":"transparent",color:i===idx?"#10271B":"#9DB1A2",fontWeight:800,fontSize:12.5,cursor:"pointer",boxShadow:i===idx?"0 2px 6px #0000001a":"none",transition:"all 0.15s"}}>
                    {s.titolo}
                  </button>
                ))}
              </div>

              {/* Slide scrollabile con swipe orizzontale */}
              <SwipeContainer
                onSwipeLeft={()=>setCalcCard(i=>Math.min(SLIDES.length-1,i+1))}
                onSwipeRight={()=>setCalcCard(i=>Math.max(0,i-1))}
                style={{touchAction:"pan-y"}}>
                {SLIDES[idx].render()}
              </SwipeContainer>

              {/* Indicatori a puntini */}
              <div style={{display:"flex",justifyContent:"center",gap:7,margin:"16px 0 4px"}}>
                {SLIDES.map((s,i)=>(
                  <button key={s.id} onClick={()=>setCalcCard(i)}
                    style={{width:i===idx?22:8,height:8,borderRadius:4,border:"none",background:i===idx?"#18A957":"#C2D0C6",cursor:"pointer",transition:"all 0.2s",padding:0}}
                    aria-label={s.titolo}/>
                ))}
              </div>
            </>
          );
        })()
      ) : view==="calories" ? (
        (()=>{
          const target2=calcTargetAdattivo(persona,allRecs);
          const pLog=(mealsLog||{})[selPid]||{};
          const today2=new Date();
          const weekDays=Array.from({length:7},(_,i)=>{const d=new Date(today2);d.setDate(today2.getDate()-(6-i));const key=localDateKey(d);const dayLog=pLog[key]||{};const meals=Object.entries(dayLog).filter(([,m])=>m.consumed).map(([mk,m])=>({mk,kcal:m.kcal||0}));return{key,meals,totKcal:meals.reduce((s,m)=>s+m.kcal,0),isToday:i===6};});
          const giorniConDati=weekDays.filter(d=>d.totKcal>0).length;
          const media=giorniConDati>0?Math.round(weekDays.reduce((s,d)=>s+d.totKcal,0)/giorniConDati):0;
          const todayData=weekDays[6];
          const MLABEL={colazione:"☀️ Colazione",spuntino_m:"🍎 Spuntino mattina",pranzo:"🥗 Pranzo",spuntino_p:"🫐 Spuntino pom.",cena:"🍽️ Cena"};
          return (
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                {[{l:"Oggi",v:todayData.totKcal||"—",c:persona.color,bg:persona.color+"10"},{l:"Media/g.",v:media||"—",c:"#16a34a",bg:"#f0fdf4"},{l:"Target",v:target2.kcal,c:"#18A957",bg:"#EDF7EF"}].map(item=>(
                  <div key={item.l} style={{background:item.bg,borderRadius:10,padding:"10px 8px",textAlign:"center",border:`1px solid ${item.c}25`}}>
                    <div style={{fontSize:9,color:"#6E8576",textTransform:"uppercase",letterSpacing:0.5,fontWeight:700}}>{item.l}</div>
                    <div style={{fontSize:20,fontWeight:800,color:item.c,fontFamily:"monospace",lineHeight:1.2}}>{item.v}</div>
                    <div style={{fontSize:9,color:"#9DB1A2"}}>kcal</div>
                  </div>
                ))}
              </div>
              <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #E7EDE2",padding:"14px 16px",marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,color:"#13231A",marginBottom:12}}>📊 Ultimi 7 giorni</div>
                <CalorieChart personaId={selPid} mealsLog={mealsLog||{}} target={target2.kcal}/>
              </div>
              {todayData.meals.length>0&&(<div style={{background:"#fff",borderRadius:12,border:"1.5px solid #E7EDE2",padding:"14px 16px",marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,color:"#13231A",marginBottom:10}}>✅ Pasti di oggi</div>
                {todayData.meals.map(m=>(<div key={m.mk} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #EFF3EC"}}><span style={{fontSize:12,color:"#4A6152",fontWeight:600}}>{MLABEL[m.mk]||m.mk}</span><span style={{fontFamily:"monospace",fontSize:12,fontWeight:700}}>{m.kcal} kcal</span></div>))}
                <div style={{display:"flex",justifyContent:"space-between",marginTop:8,paddingTop:6,borderTop:"1.5px solid #E7EDE2"}}><span style={{fontSize:12,fontWeight:800}}>Totale</span><span style={{fontFamily:"monospace",fontSize:13,fontWeight:800,color:todayData.totKcal>=target2.kcal*0.9?"#16a34a":"#d97706"}}>{todayData.totKcal} kcal · {Math.round(todayData.totKcal/target2.kcal*100)}%</span></div>
              </div>)}
              {giorniConDati===0&&<div style={{textAlign:"center",padding:"30px 20px",color:"#9DB1A2"}}><div style={{fontSize:40,marginBottom:10}}>☑️</div><div style={{fontSize:13,fontWeight:700,color:"#6E8576"}}>Nessun pasto registrato</div><div style={{fontSize:11,marginTop:6}}>Torna al piano e spunta i pasti con ✅</div></div>}
            </>
          );
        })()
      ) : (
        /* ══ STORICO ══ */
        <>
          {recsDesc.map((rec,idx)=>{
            const prevRec = recsDesc[idx+1] || null;
            return (
              <div key={idx} style={{background:"#fff",borderRadius:12,border:"1.5px solid #E7EDE2",padding:"14px 16px",marginBottom:10,boxShadow:"0 2px 8px #0000000a"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:"#13231A"}}>{dateToLabel(rec.date)}</div>
                    <div style={{fontSize:10,color:"#9DB1A2",fontFamily:"monospace"}}>{rec.date}</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {!readOnly && <button onClick={()=>openEdit(rec)} style={{padding:"6px 10px",borderRadius:7,border:"1.5px solid #E7EDE2",background:"#F5F8F1",color:"#4A6152",fontSize:11,fontWeight:700,cursor:"pointer"}}>✏️</button>}
                    {!readOnly && <button onClick={()=>handleDelete(rec)} style={{padding:"6px 10px",borderRadius:7,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑</button>}
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
                        <div style={{fontSize:15,fontWeight:800,color:hasVal?"#13231A":"#C2D0C6",fontFamily:"monospace"}}>
                          {hasVal?val:"—"}
                          {hasVal&&<span style={{fontSize:8,color:"#9DB1A2",marginLeft:1}}>{f.unit}</span>}
                        </div>
                        {d!==null&&(
                          <div style={{fontSize:9,fontWeight:700,color:dNum===0?"#9DB1A2":dNum<0?"#16a34a":"#ef4444",marginTop:1}}>
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
          <div style={{marginTop:4,fontSize:10,color:"#9DB1A2",textAlign:"center",paddingBottom:8}}>
            ▼ verde = riduzione · ▲ rosso = aumento rispetto alla rilevazione precedente
          </div>
        </>
      )}
    </div>
  );
}

