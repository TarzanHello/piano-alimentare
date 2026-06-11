import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { COLORS, LAVORI, OBIETTIVI, SESSI, calcTarget, calcTargetAdattivo, decodeSeed, emojiBySesso, encodeSeed, normalizeAttivita } from '@/core';

export function PersonaForm({ persona, onSave, onCancel, isNew }) {
  const [form, setForm] = useState({...persona, ...normalizeAttivita(persona)});
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const target = calcTarget(form);
  const isBambino = form.eta < 12;
  return (
    <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:"16px",marginBottom:14,boxShadow:"0 4px 20px #0000000f"}}>
      <div style={{fontSize:13,fontWeight:800,color:"#1e293b",marginBottom:14}}>{isNew ? "➕ Aggiungi persona" : `✏️ Modifica — ${emojiBySesso(form)} ${form.nome}`}</div>
      <div style={{marginBottom:12}}>
        <label style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}}>Nome</label>
        <input value={form.nome} onChange={e=>set("nome",e.target.value)} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}} placeholder="es. Matteo"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div>
          <label style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}}>Sesso</label>
          <div style={{display:"flex",gap:6}}>
            {SESSI.map(s=><button key={s.key} onClick={()=>set("sesso",s.key)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"2px solid",borderColor:form.sesso===s.key?form.color:"#e2e8f0",background:form.sesso===s.key?form.color+"12":"#fff",color:form.sesso===s.key?form.color:"#64748b",fontWeight:700,fontSize:12,cursor:"pointer"}}>{s.label}</button>)}
          </div>
        </div>
        <div>
          <label style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}}>Età (anni)</label>
          <input type="number" value={form.eta} onChange={e=>set("eta",+e.target.value)} min={1} max={99} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div>
          <label style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}}>Peso (kg)</label>
          <input type="number" value={form.peso} onChange={e=>set("peso",+e.target.value)} min={3} max={300} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div>
          <label style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}}>Altezza (cm)</label>
          <input type="number" value={form.altezza} onChange={e=>set("altezza",+e.target.value)} min={50} max={250} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
      </div>
      {!isBambino&&(
        <div style={{marginBottom:12}}>
          <label style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:6}}>Lavoro</label>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {LAVORI.map(l=><button key={l.key} onClick={()=>set("lavoro",l.key)} style={{padding:"6px 11px",borderRadius:7,border:"2px solid",borderColor:form.lavoro===l.key?form.color:"#e2e8f0",background:form.lavoro===l.key?form.color:"#fff",color:form.lavoro===l.key?"#fff":"#64748b",fontWeight:700,fontSize:11,cursor:"pointer"}}>{l.label}</button>)}
          </div>
        </div>
      )}
      <div style={{marginBottom:12}}>
        <label style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:6}}>Allenamento — giorni a settimana</label>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {[0,1,2,3,4,5,6,7].map(g=><button key={g} onClick={()=>set("allenamenti",g)} style={{minWidth:34,padding:"6px 0",borderRadius:7,border:"2px solid",borderColor:form.allenamenti===g?form.color:"#e2e8f0",background:form.allenamenti===g?form.color:"#fff",color:form.allenamenti===g?"#fff":"#64748b",fontWeight:700,fontSize:11,cursor:"pointer"}}>{g}</button>)}
        </div>
      </div>
      {!isBambino&&(
        <div style={{marginBottom:12}}>
          <label style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:6}}>Obiettivo</label>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {OBIETTIVI.map(o=><button key={o.key} onClick={()=>set("obiettivo",o.key)} style={{padding:"6px 11px",borderRadius:7,border:"2px solid",borderColor:form.obiettivo===o.key?form.color:"#e2e8f0",background:form.obiettivo===o.key?form.color:"#fff",color:form.obiettivo===o.key?"#fff":"#64748b",fontWeight:700,fontSize:11,cursor:"pointer"}}>{o.label}</button>)}
          </div>
        </div>
      )}
      <div style={{marginBottom:14}}>
        <label style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:6}}>Colore</label>
        <div style={{display:"flex",gap:8}}>{COLORS.map(c=><div key={c} onClick={()=>set("color",c)} style={{width:24,height:24,borderRadius:"50%",background:c,cursor:"pointer",border:form.color===c?"3px solid #1e293b":"3px solid transparent",boxSizing:"border-box"}}/>)}</div>
      </div>
      <div style={{background:form.color+"08",border:`1px solid ${form.color}25`,borderRadius:10,padding:"10px 14px",marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:700,color:form.color,marginBottom:6,textTransform:"uppercase",letterSpacing:0.8}}>Target calcolato</div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          {[{l:"Kcal",v:target.kcal,u:""},{l:"P",v:target.p,u:"g"},{l:"C",v:target.c,u:"g"},{l:"G",v:target.g,u:"g"}].map(({l,v,u})=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:800,color:form.color,fontFamily:"monospace"}}>{v}{u}</div>
              <div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase"}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>onSave(form)} style={{flex:1,padding:"10px",borderRadius:9,border:"none",background:form.color,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>{isNew?"➕ Aggiungi":"✓ Salva"}</button>
        <button onClick={onCancel} style={{padding:"10px 16px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer"}}>Annulla</button>
      </div>
    </div>
  );
}

// ─── Seme composito: base seed + overrides serializzati ──────────────
// Formato: "SEED:123456789" oppure "SEED:123456789|OV:base64(json)"

export function SeedSyncSection({ currentSeed, overrides, onApplySeed }) {
  const [inputSeed, setInputSeed] = useState("");
  const [copied, setCopied]       = useState(false);
  const [applied, setApplied]     = useState(false);
  const [error, setError]         = useState("");

  const hasOverrides   = overrides && Object.keys(overrides).length > 0;
  const nOverrides     = hasOverrides ? Object.keys(overrides).length : 0;
  const composite      = encodeSeed(currentSeed, overrides);

  const handleCopy = () => {
    const text = composite;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); });
    } else {
      const el=document.createElement("textarea"); el.value=text; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
      setCopied(true); setTimeout(()=>setCopied(false),2000);
    }
  };

  const handleApply = () => {
    const decoded = decodeSeed(inputSeed);
    if (!decoded) { setError("Seme non valido."); return; }
    setError("");
    onApplySeed(decoded.seed, decoded.overrides);
    setInputSeed(""); setApplied(true); setTimeout(()=>setApplied(false),2500);
  };

  return (
    <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:"16px",marginBottom:16,boxShadow:"0 2px 10px #0000000a"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <span style={{fontSize:20}}>🔗</span>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>Sincronizzazione piano</div>
          <div style={{fontSize:10,color:"#64748b",marginTop:1}}>Condividi il seme per avere lo stesso piano su tutti i dispositivi</div>
        </div>
      </div>

      {/* Seme attivo */}
      <div style={{background:"#f8fafc",borderRadius:10,border:"1.5px solid #e2e8f0",padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8}}>🌱 Seme attivo</div>
          {hasOverrides && (
            <div style={{fontSize:10,fontWeight:700,color:"#7c3aed",background:"#f5f3ff",borderRadius:5,padding:"2px 8px",border:"1px solid #ddd6fe"}}>
              {nOverrides} pasto{nOverrides>1?"i":""} modificato{nOverrides>1?"i":""}
            </div>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,fontFamily:"monospace",fontSize:hasOverrides?11:17,fontWeight:800,color:"#1e293b",letterSpacing:hasOverrides?0:1,wordBreak:"break-all",lineHeight:1.4}}>
            {hasOverrides ? (
              <>
                <span style={{fontSize:15,letterSpacing:1}}>{currentSeed}</span>
                <span style={{fontSize:9,color:"#7c3aed",display:"block",marginTop:2,fontWeight:600}}>+ {nOverrides} sostituzion{nOverrides>1?"i":"e"} incluse nel seme</span>
              </>
            ) : String(currentSeed)}
          </div>
          <button onClick={handleCopy} style={{flexShrink:0,padding:"9px 14px",borderRadius:8,border:"none",background:copied?"#16a34a":"#2563eb",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",transition:"background 0.2s",whiteSpace:"nowrap"}}>
            {copied?"✓ Copiato!":"📋 Copia"}
          </button>
        </div>
        <div style={{marginTop:8,fontSize:10,color:"#94a3b8",lineHeight:1.5}}>
          {hasOverrides
            ? "Il seme include le tue sostituzioni manuali — chi lo riceve vedrà lo stesso piano identico."
            : "Invia questo numero agli altri membri per sincronizzare il piano."}
        </div>
      </div>

      {/* Inserisci seme */}
      <div>
        <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>📥 Inserisci seme ricevuto</div>
        <div style={{display:"flex",gap:8,alignItems:"stretch"}}>
          <input value={inputSeed} onChange={e=>{setInputSeed(e.target.value);setError("");}}
            onKeyDown={e=>e.key==="Enter"&&handleApply()}
            placeholder="Incolla il seme ricevuto..."
            style={{flex:1,padding:"10px 12px",border:`1.5px solid ${error?"#ef4444":"#e2e8f0"}`,borderRadius:9,fontSize:13,fontFamily:"monospace",outline:"none",boxSizing:"border-box",color:"#1e293b"}}/>
          <button onClick={handleApply} disabled={!inputSeed.trim()}
            style={{flexShrink:0,padding:"10px 16px",borderRadius:9,border:"none",background:!inputSeed.trim()?"#e2e8f0":applied?"#16a34a":"#2563eb",color:!inputSeed.trim()?"#94a3b8":"#fff",fontWeight:700,fontSize:12,cursor:!inputSeed.trim()?"not-allowed":"pointer",transition:"all 0.2s",whiteSpace:"nowrap"}}>
            {applied?"✓ Applicato!":"Applica →"}
          </button>
        </div>
        {error&&<div style={{marginTop:6,fontSize:11,color:"#dc2626",fontWeight:600}}>⚠️ {error}</div>}
        {applied&&<div style={{marginTop:6,fontSize:11,color:"#16a34a",fontWeight:600}}>✅ Piano sincronizzato con tutte le modifiche!</div>}
      </div>

      <div style={{marginTop:12,background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"8px 12px",fontSize:10,color:"#92400e",lineHeight:1.6}}>
        💡 <strong>Funziona offline:</strong> stesso seme = stesso piano identico per tutta la famiglia, sostituzioni incluse.
      </div>
    </div>
  );
}

// ─── FamigliaPage ────────────────────────────────────────────────────

export function FamigliaPage({ personas, onUpdate, onAdd, onDelete, currentSeed, overrides, onApplySeed, myPersonaId, onSetMyPersona, misureApp }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding]   = useState(false);
  const newPersona = () => ({ id:"p"+Date.now(), nome:"Nuovo", sesso:"M", eta:30, peso:70, altezza:170, lavoro:"sedentario", allenamenti:3, obiettivo:"mantenimento", color:COLORS[personas.length%COLORS.length] });
  return (
    <div>
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:"16px",marginBottom:14,boxShadow:"0 2px 10px #0000000a"}}>
        <div style={{fontSize:13,fontWeight:800,color:"#1e293b",marginBottom:4}}>👤 Chi sei tu?</div>
        <div style={{fontSize:10,color:"#64748b",marginBottom:12}}>Seleziona il tuo profilo per vedere le porzioni personalizzate</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {personas.map(p=>{
            const isMe=myPersonaId===p.id;
            return (
              <button key={p.id} onClick={()=>onSetMyPersona(p.id)} style={{display:"flex",alignItems:"center",gap:7,padding:"9px 14px",borderRadius:10,border:`2px solid ${isMe?p.color:"#e2e8f0"}`,background:isMe?p.color+"12":"#f8fafc",cursor:"pointer",transition:"all 0.2s",boxShadow:isMe?`0 0 0 3px ${p.color}25`:"none"}}>
                <span style={{fontSize:18}}>{emojiBySesso(p)}</span>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:12,fontWeight:800,color:isMe?p.color:"#475569"}}>{p.nome}</div>
                  <div style={{fontSize:9,color:"#94a3b8"}}>{p.eta} anni · {p.peso}kg</div>
                </div>
                {isMe&&<span style={{marginLeft:4,fontSize:10,background:p.color,color:"#fff",borderRadius:5,padding:"2px 6px",fontWeight:800}}>IO</span>}
              </button>
            );
          })}
        </div>
      </div>
      <SeedSyncSection currentSeed={currentSeed} overrides={overrides} onApplySeed={onApplySeed}/>
      <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:11,color:"#0369a1"}}>
        ℹ️ I target calorici vengono calcolati automaticamente da BMR + TDEE. I valori delle ricette sono approssimazioni medie.
      </div>
      {personas.map(p=>{
        const t=calcTargetAdattivo(p, misureApp?.[p.id]);
        const isEdit=editing===p.id;
        return (
          <div key={p.id}>
            {isEdit ? (
              <PersonaForm persona={p} onSave={updated=>{onUpdate(updated);setEditing(null);}} onCancel={()=>setEditing(null)} isNew={false}/>
            ) : (
              <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"14px 16px",marginBottom:10,boxShadow:"0 2px 8px #0000000a"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:p.color+"18",border:`2px solid ${p.color}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{emojiBySesso(p)}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:800,color:"#1e293b"}}>{p.nome}</div>
                    <div style={{fontSize:11,color:"#64748b"}}>{p.eta} anni · {p.peso}kg · {p.altezza}cm · {(()=>{const a=normalizeAttivita(p);const lav=(LAVORI.find(l=>l.key===a.lavoro)||LAVORI[0]).label;return p.eta<12?`${a.allenamenti}× sport/sett`:`Lavoro ${lav.toLowerCase()} · ${a.allenamenti}× allenamento/sett`;})()}</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setEditing(p.id)} style={{padding:"6px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#475569",fontSize:11,fontWeight:700,cursor:"pointer"}}>✏️</button>
                    {personas.length>1&&<button onClick={()=>onDelete(p.id)} style={{padding:"6px 12px",borderRadius:7,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑</button>}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                  {[{l:"Kcal",v:t.kcal,u:""},{l:"Prot.",v:t.p,u:"g"},{l:"Carbo",v:t.c,u:"g"},{l:"Grassi",v:t.g,u:"g"}].map(({l,v,u})=>(
                    <div key={l} style={{background:p.color+"08",borderRadius:7,padding:"6px 8px",border:`1px solid ${p.color}20`,textAlign:"center"}}>
                      <div style={{fontSize:14,fontWeight:800,color:p.color,fontFamily:"monospace"}}>{v}{u}</div>
                      <div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase"}}>{l}</div>
                    </div>
                  ))}
                </div>
                {(()=>{const intensita=p.dietaIntensita??50;const getLabel=v=>v<=10?{txt:"Molto facile",sub:"−100 kcal",col:"#16a34a",emoji:"😊"}:v<=30?{txt:"Facile",sub:"~−320 kcal",col:"#65a30d",emoji:"🙂"}:v<=55?{txt:"Moderato",sub:"~−550 kcal",col:"#2563eb",emoji:"⚖️"}:v<=80?{txt:"Intenso",sub:"~−775 kcal",col:"#d97706",emoji:"😓"}:{txt:"Molto difficile",sub:"−1000 kcal",col:"#dc2626",emoji:"🔥"};const lbl=getLabel(intensita);const off=Math.round(100+(intensita/100)*900);return(<div style={{marginTop:10,padding:"10px 12px",background:"#f8fafc",borderRadius:9,border:"1px solid #e2e8f0"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontSize:10,fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:0.5}}>⚡ Intensità dieta</span><span style={{fontSize:11,fontWeight:800,color:lbl.col}}>{lbl.emoji} {lbl.txt} <span style={{fontFamily:"monospace",fontSize:10}}>{lbl.sub}</span></span></div><div style={{position:"relative",height:22,display:"flex",alignItems:"center"}}><div style={{position:"absolute",left:0,right:0,height:4,borderRadius:2,background:"linear-gradient(to right,#16a34a,#65a30d,#2563eb,#d97706,#dc2626)"}}/><input type="range" min={0} max={100} step={1} value={intensita} onChange={e=>onUpdate({...p,dietaIntensita:parseInt(e.target.value)})} style={{position:"relative",zIndex:1,width:"100%",margin:0,background:"transparent"}}/></div><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{fontSize:9,color:"#16a34a",fontWeight:700}}>😊 −100 kcal</span><span style={{fontSize:9,color:"#475569",fontWeight:700,fontFamily:"monospace"}}>TDEE − {off} kcal</span><span style={{fontSize:9,color:"#dc2626",fontWeight:700}}>🔥 −1000 kcal</span></div></div>);})()}
                <div style={{marginTop:8,fontSize:10,color:"#94a3b8",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
                  <span>Obiettivo: <strong style={{color:"#475569"}}>{(OBIETTIVI.find(o=>o.key===p.obiettivo)||{label:p.obiettivo||"—"}).label}</strong></span>
                  <div style={{display:"flex",alignItems:"center",gap:4,background:t.confidenza.bg,border:`1px solid ${t.confidenza.border}`,borderRadius:5,padding:"2px 7px"}}>
                    <span style={{fontSize:10}}>{t.confidenza.dot}</span>
                    <span style={{fontSize:9,fontWeight:700,color:t.confidenza.color}}>{t.confidenza.label}</span>
                    {t.pctGrasso!==null&&<span style={{fontSize:9,color:"#94a3b8"}}>· {t.pctGrasso}% grasso</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {adding ? (
        <PersonaForm persona={newPersona()} onSave={p=>{onAdd(p);setAdding(false);}} onCancel={()=>setAdding(false)} isNew={true}/>
      ) : (
        <button onClick={()=>setAdding(true)} style={{width:"100%",padding:"12px",borderRadius:12,border:"2px dashed #cbd5e1",background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          ➕ Aggiungi persona al nucleo
        </button>
      )}
    </div>
  );
}

