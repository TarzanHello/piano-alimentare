import React from 'react';
import { MEAL_HOUR, MEAL_KEYS, MEAL_META, dateKeyForDayIdx, emojiBySesso, parseDataIT, pianoPersonalizzato, ricalcolaMacroAdattati, todayDayIndex } from '@/core';
import { WaterTracker } from '@/features/piano/MealParts';

// ─── Anello di progresso kcal ───────────────────────────────────────
function KcalRing({ consumed, target, color }) {
  const R = 56, C = 2 * Math.PI * R;
  const pct = target > 0 ? Math.min(1.25, consumed / target) : 0;
  const over = consumed > target * 1.05;
  const stroke = over ? "#dc2626" : color;
  return (
    <div style={{position:"relative",width:150,height:150,flexShrink:0}}>
      <svg width={150} height={150} style={{transform:"rotate(-90deg)"}}>
        <circle cx={75} cy={75} r={R} fill="none" stroke="#E7EDE2" strokeWidth={12}/>
        <circle cx={75} cy={75} r={R} fill="none" stroke={stroke} strokeWidth={12}
          strokeLinecap="round" strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(1, pct))}
          style={{transition:"stroke-dashoffset 0.6s cubic-bezier(0.2,0.9,0.3,1), stroke 0.3s"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontSize:26,fontWeight:900,color:over?"#dc2626":"#13231A",lineHeight:1}}>{Math.round(consumed)}</div>
        <div style={{fontSize:10,fontWeight:700,color:"#9DB1A2",marginTop:2}}>di {Math.round(target)} kcal</div>
        {over && <div style={{fontSize:9,fontWeight:800,color:"#dc2626",marginTop:2}}>oltre il target</div>}
      </div>
    </div>
  );
}

// ─── Barra macro ────────────────────────────────────────────────────
function MacroBar({ label, val, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0;
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontWeight:700,color:"#6E8576",marginBottom:3}}>
        <span>{label}</span><span>{Math.round(val)} / {Math.round(max)} g</span>
      </div>
      <div style={{height:6,background:"#E7EDE2",borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,transition:"width 0.5s ease"}}/>
      </div>
    </div>
  );
}

// ─── Pagina Oggi ────────────────────────────────────────────────────
export function OggiPage({ personas, selPersonaId, onSelPersona, persona, personaSlot, target, effectivePlan, misure, mealsLog, onToggleMeal, onGoPiano, onGoMisure, readOnly }) {
  const dayIdx  = todayDayIndex();
  const dateKey = dateKeyForDayIdx(dayIdx);
  const day     = effectivePlan[dayIdx] || {};
  const dayLog  = (mealsLog[persona?.id] || {})[dateKey] || {};

  // ── Macro: stessa pipeline della pagina Piano ──
  const pianoPers = pianoPersonalizzato(day, persona, misure);
  const macroBase = {};
  MEAL_KEYS.forEach(mk => {
    macroBase[mk] = (pianoPers.personalizzato ? pianoPers.perPasto[mk] : null) || day[mk]?.[personaSlot] || {kcal:0,p:0,c:0,g:0};
  });
  const { adattato: macroAdattati } = ricalcolaMacroAdattati(MEAL_KEYS, macroBase, dayLog);
  const macroFor = mk => dayLog[mk]?.consumed
    ? { kcal:+dayLog[mk].kcal||0, p:+dayLog[mk].p||0, c:+dayLog[mk].c||0, g:+dayLog[mk].g||0 }
    : macroAdattati[mk];

  // ── Totali consumati ──
  const consumed = MEAL_KEYS.reduce((acc, mk) => {
    if (!dayLog[mk]?.consumed) return acc;
    const m = macroFor(mk);
    return { kcal:acc.kcal+m.kcal, p:acc.p+m.p, c:acc.c+m.c, g:acc.g+m.g };
  }, {kcal:0,p:0,c:0,g:0});
  const nConsumati = MEAL_KEYS.filter(mk => dayLog[mk]?.consumed).length;

  // ── Prossimo pasto: il primo non consumato la cui ora non è passata
  //    da più di 2h; fallback = primo non consumato ──
  const nowH = new Date().getHours() + new Date().getMinutes()/60;
  const nonConsumati = MEAL_KEYS.filter(mk => !dayLog[mk]?.consumed && day[mk]);
  const prossimo = nonConsumati.find(mk => MEAL_HOUR[mk] >= nowH - 2) || nonConsumati[0] || null;
  const giornataCompleta = nConsumati === MEAL_KEYS.filter(mk=>day[mk]).length && nConsumati > 0;

  // ── Nudge misure: nessuna misura o ultima > 7 giorni ──
  const lastMisuraGiorni = (() => {
    const recs = (misure||[]).map(r=>parseDataIT(r.date)).filter(Boolean).sort((a,b)=>b-a);
    if (!recs.length) return Infinity;
    return Math.floor((Date.now() - recs[0].getTime()) / 86400000);
  })();

  const saluto = nowH < 12 ? "Buongiorno" : nowH < 18 ? "Buon pomeriggio" : "Buonasera";
  const dataLabel = new Date().toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"});
  const col = persona?.color || "#18A957";

  return (
    <div>
      {/* Selettore persona compatto */}
      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
        {personas.map(p=>{
          const sel = selPersonaId===p.id;
          return (
          <button key={p.id} onClick={()=>onSelPersona(p.id)} style={{flexShrink:0,display:"flex",alignItems:"center",gap:7,padding:"8px 14px",borderRadius:999,border:sel?"none":"1.5px solid #E7EDE2",background:sel?p.color:"#fff",color:sel?"#fff":"#6E8576",fontWeight:700,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",boxShadow:sel?`0 6px 14px -5px ${p.color}99`:"none"}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:sel?"#fff":p.color}}/>
            {p.nome}
          </button>
        );})}
      </div>

      {/* Saluto */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:24,fontWeight:800,color:"#13231A",fontFamily:"'Bricolage Grotesque',sans-serif"}}>{saluto}, {persona?.nome} 👋</div>
        <div style={{fontSize:12,color:"#9DB1A2",fontWeight:600,textTransform:"capitalize"}}>{dataLabel}</div>
      </div>

      {/* Anello kcal + macro */}
      <div style={{background:"#fff",border:"1.5px solid #E7EDE2",borderRadius:16,padding:"16px",marginBottom:12,display:"flex",alignItems:"center",gap:18,boxShadow:"0 2px 12px #00000008"}}>
        <KcalRing consumed={consumed.kcal} target={target?.kcal||0} color={col}/>
        <div style={{flex:1,minWidth:0}}>
          <MacroBar label="Proteine"    val={consumed.p} max={target?.p||0} color="#0ea5e9"/>
          <MacroBar label="Carboidrati" val={consumed.c} max={target?.c||0} color="#f59e0b"/>
          <MacroBar label="Grassi"      val={consumed.g} max={target?.g||0} color="#8b5cf6"/>
          <div style={{fontSize:10,color:"#9DB1A2",fontWeight:600,marginTop:4}}>{nConsumati} pasti su {MEAL_KEYS.filter(mk=>day[mk]).length} registrati</div>
        </div>
      </div>

      {/* Prossimo pasto in evidenza */}
      {giornataCompleta ? (
        <div style={{background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:16,padding:"18px",marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:28}}>🎉</div>
          <div style={{fontSize:14,fontWeight:800,color:"#166534"}}>Giornata completata!</div>
          <div style={{fontSize:11,color:"#16a34a",marginTop:2}}>Tutti i pasti registrati. Ottimo lavoro.</div>
        </div>
      ) : prossimo && (
        <div style={{background:"linear-gradient(140deg,#10271B,#13402C)",borderRadius:20,padding:"16px 18px",marginBottom:12,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",right:-30,top:-30,width:120,height:120,borderRadius:"50%",background:"radial-gradient(circle,rgba(157,232,55,0.20),transparent 70%)"}}/>
          <div style={{fontSize:10,fontWeight:800,color:"#9DE837",letterSpacing:1.2,textTransform:"uppercase",marginBottom:9}}>Prossimo · ore {String(Math.floor(MEAL_HOUR[prossimo])).padStart(2,"0")}:{MEAL_HOUR[prossimo]%1?"30":"00"}</div>
          <div style={{display:"flex",alignItems:"center",gap:14,position:"relative"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:"#7FA890",marginBottom:2}}>{MEAL_META[prossimo].label}</div>
              <div style={{fontSize:16,fontWeight:800,color:"#F4F7EF",lineHeight:1.25,fontFamily:"'Bricolage Grotesque',sans-serif"}}>{day[prossimo]?.nome}</div>
              <div style={{fontSize:12,color:"#9DB1A2",fontWeight:600,marginTop:5}}>{Math.round(macroFor(prossimo).kcal)} kcal</div>
            </div>
            {readOnly ? (
              <span title="Profilo di un altro membro: sola lettura" style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",width:64,height:64,borderRadius:18,background:"rgba(255,255,255,0.12)",color:"#7FA890",fontSize:22}}>🔒</span>
            ) : (
            <button onClick={()=>onToggleMeal(persona.id, dateKey, prossimo, macroFor(prossimo))}
              style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,width:64,height:64,borderRadius:18,border:"none",background:"#9DE837",color:"#10271B",cursor:"pointer",boxShadow:"0 8px 18px -6px rgba(157,232,55,0.6)"}}>
              <span style={{fontSize:20,fontWeight:900,lineHeight:1}}>✓</span>
              <span style={{fontSize:9.5,fontWeight:800}}>Mangia</span>
            </button>
            )}
          </div>
        </div>
      )}

      {/* Pasti della giornata */}
      <div style={{background:"#fff",border:"1.5px solid #E7EDE2",borderRadius:16,overflow:"hidden",marginBottom:12,boxShadow:"0 2px 12px #00000008"}}>
        <div style={{padding:"11px 16px 7px",fontSize:10,fontWeight:800,color:"#9DB1A2",letterSpacing:0.8,textTransform:"uppercase",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>I pasti di oggi</span>
          <button onClick={onGoPiano} style={{border:"none",background:"transparent",color:col,fontWeight:800,fontSize:11,cursor:"pointer",letterSpacing:0}}>Vai al piano ›</button>
        </div>
        {MEAL_KEYS.filter(mk=>day[mk]).map((mk,i)=>{
          const isCons = !!dayLog[mk]?.consumed;
          const m = macroFor(mk);
          return (
            <div key={mk} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",borderTop:i>0?"1px solid #EFF3EC":"none",opacity:isCons?0.75:1}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:"#9DB1A2"}}>{MEAL_META[mk].label}</div>
                <div style={{fontSize:13,fontWeight:700,color:"#13231A",textDecoration:isCons?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{day[mk]?.nome}</div>
              </div>
              <div style={{fontSize:11,fontWeight:800,color:"#6E8576",flexShrink:0}}>{Math.round(m.kcal)} kcal</div>
              {readOnly ? (
                <span title="Sola lettura" style={{flexShrink:0,width:32,height:32,borderRadius:"50%",background:"#EFF3EC",color:"#C2D0C6",fontWeight:900,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>{isCons?"✓":"🔒"}</span>
              ) : (
              <button onClick={()=>onToggleMeal(persona.id, dateKey, mk, m)}
                title={isCons?"Segna come non consumato":"Segna come mangiato"}
                style={{flexShrink:0,width:32,height:32,borderRadius:"50%",border:isCons?"none":"2px solid #C2D0C6",background:isCons?"#16a34a":"#fff",color:isCons?"#fff":"#C2D0C6",fontWeight:900,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",animation:isCons?"pop 0.25s ease-out":"none"}}>
                ✓
              </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Acqua */}
      <WaterTracker dayKey={dateKey} personaColor={col}/>

      {/* Nudge misure */}
      {lastMisuraGiorni > 7 && (
        <button onClick={onGoMisure} style={{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"left",background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:14,padding:"12px 16px",marginTop:12,cursor:"pointer"}}>
          <span style={{fontSize:22}}>📏</span>
          <span style={{flex:1,fontSize:12,color:"#92400e",fontWeight:600,lineHeight:1.4}}>
            {lastMisuraGiorni === Infinity
              ? "Nessuna misurazione ancora: inserisci peso e circonferenze per attivare i piani personalizzati."
              : `Ultima misurazione ${lastMisuraGiorni} giorni fa: aggiornala per tenere preciso il calcolo del fabbisogno.`}
          </span>
          <span style={{color:"#d97706",fontSize:16,fontWeight:900}}>›</span>
        </button>
      )}
    </div>
  );
}
