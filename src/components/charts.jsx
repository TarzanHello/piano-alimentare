import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { calcPesoObiettivo, localDateKey } from '@/core';
import { MisurePage } from '@/features/misure/MisurePage';

export function LineChart({ records, field, color, unit, label }) {
  // records ordinati dal più vecchio al più recente
  const pts = records.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
  if (pts.length < 2) return null;

  const W = 320, H = 90, PAD = { t:10, r:12, b:24, l:36 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const mn = Math.min(...pts), mx = Math.max(...pts);
  const range = mx - mn || 1;

  // coordinate punti
  const coords = pts.map((v, i) => ({
    x: PAD.l + (i / (pts.length - 1)) * innerW,
    y: PAD.t + (1 - (v - mn) / range) * innerH,
    v
  }));

  // polyline path
  const polyline = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  // area fill path
  const area = polyline + ` L${coords[coords.length-1].x.toFixed(1)},${(PAD.t+innerH).toFixed(1)} L${coords[0].x.toFixed(1)},${(PAD.t+innerH).toFixed(1)} Z`;

  // delta totale
  const deltaTotal = (pts[pts.length-1] - pts[0]).toFixed(1);
  const deltaPos = parseFloat(deltaTotal) > 0;
  const deltaNeu = parseFloat(deltaTotal) === 0;

  // label date primo e ultimo
  const dateFirst = records.filter(r => !isNaN(parseFloat(r[field])))[0]?.date || "";
  const dateLast  = records.filter(r => !isNaN(parseFloat(r[field]))).at(-1)?.date || "";

  // tick Y (min e max)
  const yLabelMn = PAD.t + innerH;
  const yLabelMx = PAD.t;

  return (
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <span style={{fontSize:12,fontWeight:700,color}}>{label}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,fontFamily:"monospace",fontWeight:800,color:"#13231A"}}>{pts[pts.length-1]} {unit}</span>
          <span style={{fontSize:11,fontWeight:700,color:deltaNeu?"#9DB1A2":deltaPos?"#ef4444":"#16a34a",background:deltaNeu?"#EFF3EC":deltaPos?"#fef2f2":"#f0fdf4",borderRadius:6,padding:"2px 7px"}}>
            {deltaNeu?"—":deltaPos?`▲ +${deltaTotal}`:`▼ ${deltaTotal}`}
          </span>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible",display:"block"}}>
        <defs>
          <linearGradient id={`grad-${field}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.01"/>
          </linearGradient>
        </defs>
        {/* Griglia orizzontale */}
        {[0, 0.5, 1].map(t => (
          <line key={t} x1={PAD.l} y1={PAD.t + t*innerH} x2={PAD.l+innerW} y2={PAD.t + t*innerH}
            stroke="#EFF3EC" strokeWidth="1"/>
        ))}
        {/* Y labels */}
        <text x={PAD.l-4} y={yLabelMx+4} textAnchor="end" fontSize="8" fill="#9DB1A2">{mx}</text>
        <text x={PAD.l-4} y={yLabelMn}   textAnchor="end" fontSize="8" fill="#9DB1A2">{mn}</text>
        {/* Area fill */}
        <path d={area} fill={`url(#grad-${field})`}/>
        {/* Linea */}
        <path d={polyline} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
        {/* Punti */}
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i===coords.length-1?4:2.5}
            fill={i===coords.length-1?color:"#fff"} stroke={color} strokeWidth="1.8"/>
        ))}
        {/* X labels: prima e ultima data */}
        <text x={coords[0].x} y={H-2} textAnchor="middle" fontSize="8" fill="#9DB1A2">{dateFirst}</text>
        <text x={coords[coords.length-1].x} y={H-2} textAnchor="middle" fontSize="8" fill="#9DB1A2">{dateLast}</text>
      </svg>
    </div>
  );
}

// ─── calcPesoObiettivo ────────────────────────────────────────────────

export function WeightProgressChart({ records, persona }) {
  const pesoRecs = records.filter(r => !isNaN(parseFloat(r.peso)));
  if (pesoRecs.length < 1) return null;
  const toTs = d => { try { const [g,m,a]=d.split("/"); return new Date(+a,+m-1,+g).getTime(); } catch { return 0; } };
  const realPts = pesoRecs.map(r=>({ts:toTs(r.date),v:parseFloat(r.peso),date:r.date})).filter(p=>p.ts>0).sort((a,b)=>a.ts-b.ts);
  if (realPts.length < 1) return null;
  const pesoAttuale = realPts[realPts.length-1].v;
  const lastMisura = records.length>0?records[records.length-1]:null;
  const obResult = calcPesoObiettivo(persona, lastMisura, persona.pesoTarget ?? null);
  const pesoObiettivo = obResult.peso;
  const metodoLabel = obResult.metodo;
  const needsProjection = persona.obiettivo !== "mantenimento" && Math.abs(pesoObiettivo-pesoAttuale)>0.3;
  let velMedia=null, slope=0;
  if (realPts.length>=2) {
    const msSpan=realPts[realPts.length-1].ts-realPts[0].ts, kgSpan=realPts[realPts.length-1].v-realPts[0].v;
    const settimane=msSpan/(7*24*3600*1000);
    if (settimane>=0.3) {
      velMedia=(kgSpan/settimane).toFixed(2);
      const n=realPts.length,sx=realPts.reduce((s,p)=>s+p.ts,0),sy=realPts.reduce((s,p)=>s+p.v,0);
      const sxy=realPts.reduce((s,p)=>s+p.ts*p.v,0),sxx=realPts.reduce((s,p)=>s+p.ts*p.ts,0),den=n*sxx-sx*sx;
      if (den!==0) slope=(n*sxy-sx*sy)/den;
    }
  }
  const lastReal=realPts[realPts.length-1], intercept=lastReal.v-slope*lastReal.ts;
  let dataGoalStr=null, settimaneRim=null, tsGoal=null;
  const slopeOk=needsProjection&&slope!==0&&((pesoObiettivo<pesoAttuale&&slope<0)||(pesoObiettivo>pesoAttuale&&slope>0));
  if (slopeOk) {
    const tsCand=(pesoObiettivo-intercept)/slope, nowTs=Date.now();
    if (tsCand>nowTs&&tsCand<nowTs+3*365*24*3600*1000) {
      tsGoal=tsCand; settimaneRim=Math.max(1,Math.round((tsGoal-nowTs)/(7*24*3600*1000)));
      const dt=new Date(tsGoal), mm=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"][dt.getMonth()];
      dataGoalStr=`${dt.getDate()} ${mm} ${dt.getFullYear()}`;
    }
  }
  const W=320,H=160,PAD={t:16,r:16,b:30,l:38},innerW=W-PAD.l-PAD.r,innerH=H-PAD.t-PAD.b;
  const tsMin=realPts[0].ts,tsMax=realPts[realPts.length-1].ts,spanMs=Math.max(tsMax-tsMin,30*24*3600*1000);
  const tsEnd=(tsGoal&&tsGoal>tsMax)?Math.min(tsGoal+spanMs*0.05,tsMax+spanMs*1.5):tsMax+spanMs*0.2;
  const yVals=realPts.map(p=>p.v);
  if (needsProjection) yVals.push(pesoObiettivo);
  if (slope!==0&&needsProjection) yVals.push(Math.min(Math.max(intercept+slope*tsEnd,pesoAttuale-8),pesoAttuale+8));
  const rawMin=Math.min(...yVals),rawMax=Math.max(...yVals),yPad=Math.max(1,(rawMax-rawMin)*0.15);
  const yMin=rawMin-yPad,yMax=rawMax+yPad,yRange=yMax-yMin;
  const tx=ts=>PAD.l+((ts-tsMin)/(tsEnd-tsMin))*innerW;
  const ty=v=>PAD.t+(1-(v-yMin)/yRange)*innerH;
  const clampX=x=>Math.max(PAD.l,Math.min(W-PAD.r,x));
  const clampY=y=>Math.max(PAD.t,Math.min(PAD.t+innerH,y));
  const txc=ts=>clampX(tx(ts)),tyc=v=>clampY(ty(v));
  const realPath=realPts.map((p,i)=>`${i===0?"M":"L"}${txc(p.ts).toFixed(1)},${tyc(p.v).toFixed(1)}`).join(" ");
  const areaPath=realPts.length>=2?realPath+` L${txc(realPts[realPts.length-1].ts).toFixed(1)},${(PAD.t+innerH).toFixed(1)} L${txc(realPts[0].ts).toFixed(1)},${(PAD.t+innerH).toFixed(1)} Z`:"";
  const showProj=slopeOk&&realPts.length>=2;
  const projEndTs=tsGoal&&tsGoal<=tsEnd?tsGoal:tsEnd;
  const projPath=showProj?`M${txc(lastReal.ts).toFixed(1)},${tyc(lastReal.v).toFixed(1)} L${txc(projEndTs).toFixed(1)},${tyc(intercept+slope*projEndTs).toFixed(1)}`:"";
  const roughStep=(yMax-yMin)/4,niceStep=roughStep<0.6?0.5:roughStep<1.2?1:roughStep<2.5?2:roughStep<6?5:10;
  const yTicks=[]; for (let v=Math.ceil(yMin/niceStep)*niceStep;v<=yMax+0.01;v+=niceStep) yTicks.push(Math.round(v*10)/10);
  const totalDays=(tsEnd-tsMin)/(24*3600*1000),dStep=totalDays<=30?7:totalDays<=60?14:totalDays<=120?30:60;
  const xTicks=[]; for (let ts=tsMin;ts<=tsEnd+1;ts+=dStep*24*3600*1000){const d=new Date(ts);xTicks.push({ts,label:`${d.getDate()}/${d.getMonth()+1}`});}
  const xTicksSliced=xTicks.length>5?xTicks.filter((_,i)=>i%Math.ceil(xTicks.length/5)===0):xTicks;
  const mainColor=persona.obiettivo==="perdita"?"#18A957":persona.obiettivo==="aumento"?"#16a34a":"#4A6152";
  const goalColor="#f59e0b",deltaKg=pesoAttuale-realPts[0].v;
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        <div style={{background:"#fff",borderRadius:14,padding:"11px 9px",textAlign:"center",boxShadow:"0 8px 22px -16px rgba(15,58,41,0.3)"}}>
          <div style={{fontSize:9,color:"#9DB1A2",textTransform:"uppercase",fontWeight:700,marginBottom:3,letterSpacing:0.3}}>Variazione</div>
          <div style={{fontSize:18,fontWeight:800,fontFamily:"'Bricolage Grotesque',sans-serif",lineHeight:1,color:Math.abs(deltaKg)<0.05?"#9DB1A2":deltaKg>0?"#ef4444":"#16a34a"}}>{Math.abs(deltaKg)<0.05?"±0":(deltaKg>0?"+":"")+deltaKg.toFixed(1)}</div>
          <div style={{fontSize:9,color:"#9DB1A2",marginTop:3}}>kg totali</div>
        </div>
        <div style={{background:"#fff",borderRadius:14,padding:"11px 9px",textAlign:"center",boxShadow:"0 8px 22px -16px rgba(15,58,41,0.3)"}}>
          <div style={{fontSize:9,color:"#9DB1A2",textTransform:"uppercase",fontWeight:700,marginBottom:3,letterSpacing:0.3}}>Ritmo</div>
          <div style={{fontSize:18,fontWeight:800,fontFamily:"'Bricolage Grotesque',sans-serif",lineHeight:1,color:mainColor}}>{velMedia!==null?(parseFloat(velMedia)>0?"+":"")+velMedia:"—"}</div>
          <div style={{fontSize:9,color:"#9DB1A2",marginTop:3}}>kg/sett.</div>
        </div>
        <div style={{background:dataGoalStr?goalColor+"12":"#fff",borderRadius:14,padding:"11px 9px",textAlign:"center",boxShadow:"0 8px 22px -16px rgba(15,58,41,0.3)"}}>
          <div style={{fontSize:9,color:"#9DB1A2",textTransform:"uppercase",fontWeight:700,marginBottom:3,letterSpacing:0.3}}>Traguardo</div>
          <div style={{fontSize:dataGoalStr?11:16,fontWeight:800,lineHeight:1.2,fontFamily:"'Bricolage Grotesque',sans-serif",color:dataGoalStr?goalColor:needsProjection?"#9DB1A2":"#16a34a"}}>{dataGoalStr||(needsProjection?"n/d":"✓")}</div>
          <div style={{fontSize:9,color:"#9DB1A2",marginTop:3}}>{dataGoalStr?`≈${settimaneRim} sett.`:needsProjection?"misurare ancora":"raggiunto"}</div>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block",overflow:"hidden"}}>
        <defs>
          <linearGradient id="wpc-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={mainColor} stopOpacity="0.15"/><stop offset="100%" stopColor={mainColor} stopOpacity="0.01"/></linearGradient>
          <clipPath id="wpc-clip"><rect x={PAD.l} y={PAD.t} width={innerW} height={innerH}/></clipPath>
        </defs>
        {yTicks.map(v=><g key={v}><line x1={PAD.l} x2={W-PAD.r} y1={tyc(v)} y2={tyc(v)} stroke="#EFF3EC" strokeWidth="1"/><text x={PAD.l-4} y={tyc(v)+4} textAnchor="end" fontSize="8" fill="#9DB1A2">{v}</text></g>)}
        <line x1={PAD.l} x2={W-PAD.r} y1={PAD.t+innerH} y2={PAD.t+innerH} stroke="#E7EDE2" strokeWidth="1"/>
        {needsProjection&&<g><line x1={PAD.l} x2={W-PAD.r} y1={tyc(pesoObiettivo)} y2={tyc(pesoObiettivo)} stroke={goalColor} strokeWidth="1.5" strokeDasharray="4,3" opacity="0.8"/><text x={W-PAD.r-2} y={tyc(pesoObiettivo)-3} textAnchor="end" fontSize="8" fill={goalColor} fontWeight="700">{pesoObiettivo} kg</text></g>}
        <g clipPath="url(#wpc-clip)">
          {areaPath&&<path d={areaPath} fill="url(#wpc-area)"/>}
          {projPath&&<path d={projPath} fill="none" stroke={mainColor} strokeWidth="1.6" strokeDasharray="5,4" opacity="0.45" strokeLinecap="round"/>}
          {realPts.length>=2&&<path d={realPath} fill="none" stroke={mainColor} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>}
        </g>
        {realPts.map((p,i)=>{const isLast=i===realPts.length-1;return(<g key={i}><circle cx={txc(p.ts)} cy={tyc(p.v)} r={isLast?4.5:2.5} fill={isLast?mainColor:"#fff"} stroke={mainColor} strokeWidth={isLast?0:1.8}/>{isLast&&<text x={txc(p.ts)} y={tyc(p.v)-8} textAnchor="middle" fontSize="9" fill={mainColor} fontWeight="800">{p.v} kg</text>}</g>);})}
        {tsGoal&&tsGoal<=tsEnd&&<circle cx={txc(tsGoal)} cy={tyc(pesoObiettivo)} r="5" fill={goalColor} stroke="#fff" strokeWidth="2"/>}
        {xTicksSliced.map((t,i)=><g key={i}><line x1={txc(t.ts)} x2={txc(t.ts)} y1={PAD.t+innerH} y2={PAD.t+innerH+3} stroke="#C2D0C6" strokeWidth="1"/><text x={txc(t.ts)} y={H-3} textAnchor="middle" fontSize="7" fill="#9DB1A2">{t.label}</text></g>)}
      </svg>
      <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:4,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#6E8576"}}><svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke={mainColor} strokeWidth="2.2"/></svg>Peso misurato</div>
        {showProj&&<div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#6E8576"}}><svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke={mainColor} strokeWidth="1.6" strokeDasharray="4,3" opacity="0.5"/></svg>Proiezione</div>}
        {needsProjection&&<div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#6E8576"}}><svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke={goalColor} strokeWidth="1.5" strokeDasharray="4,3"/></svg>Obiettivo {pesoObiettivo} kg ({metodoLabel})</div>}
      </div>
    </div>
  );
}

// ─── CalorieChart ─────────────────────────────────────────────────────

export function CalorieChart({ personaId, mealsLog, target }) {
  const today=new Date();
  const days=Array.from({length:7},(_,i)=>{const d=new Date(today);d.setDate(today.getDate()-(6-i));const key=localDateKey(d);const dow=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][d.getDay()];const dayLog=(mealsLog[personaId]||{})[key]||{};const kcal=Object.values(dayLog).reduce((s,m)=>m.consumed?s+(m.kcal||0):s,0);return{key,label:dow,kcal,isToday:i===6};});
  const maxKcal=Math.max(target||2000,...days.map(d=>d.kcal),100);
  const W=320,H=130,PAD={t:10,r:12,b:28,l:36},innerW=W-PAD.l-PAD.r,innerH=H-PAD.t-PAD.b;
  const barW=Math.floor(innerW/7)-4,barGap=Math.floor(innerW/7);
  const targetY=PAD.t+innerH-((target||0)/maxKcal)*innerH;
  return (
    <div><svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:W,display:"block",margin:"0 auto"}}>
      {[0.25,0.5,0.75,1].map(f=><line key={f} x1={PAD.l} x2={W-PAD.r} y1={PAD.t+innerH*(1-f)} y2={PAD.t+innerH*(1-f)} stroke="#E7EDE2" strokeWidth="1"/>)}
      {[0,0.5,1].map(f=><text key={f} x={PAD.l-4} y={PAD.t+innerH*(1-f)+4} textAnchor="end" fontSize="8" fill="#9DB1A2">{Math.round(maxKcal*f)}</text>)}
      {target>0&&<line x1={PAD.l} x2={W-PAD.r} y1={targetY} y2={targetY} stroke="#18A957" strokeWidth="1.5" strokeDasharray="4,3"/>}
      {days.map((day,i)=>{const x=PAD.l+i*barGap+(barGap-barW)/2;if(day.kcal===0)return <g key={day.key}><rect x={x} y={PAD.t} width={barW} height={innerH} fill={day.isToday?"#EDF7EF":"#F5F8F1"} rx="3"/><text x={x+barW/2} y={H-PAD.b+10} textAnchor="middle" fontSize="8" fill={day.isToday?"#18A957":"#9DB1A2"} fontWeight={day.isToday?"700":"400"}>{day.label}</text></g>;const barH=Math.max(2,(day.kcal/maxKcal)*innerH),barY=PAD.t+innerH-barH;const pct=Math.round(day.kcal/(target||day.kcal)*100);const col=pct>=100?"#16a34a":pct>=70?"#18A957":pct>=40?"#d97706":"#9DB1A2";return <g key={day.key}><rect x={x} y={PAD.t} width={barW} height={innerH} fill={day.isToday?"#EDF7EF":"#F5F8F1"} rx="3"/><rect x={x} y={barY} width={barW} height={barH} fill={col} rx="3" opacity={day.isToday?1:0.8}/><text x={x+barW/2} y={barY-2} textAnchor="middle" fontSize="7" fill={col} fontWeight="700">{day.kcal}</text><text x={x+barW/2} y={H-PAD.b+10} textAnchor="middle" fontSize="8" fill={day.isToday?"#18A957":"#6E8576"} fontWeight={day.isToday?"700":"400"}>{day.label}</text></g>;})}
    </svg></div>
  );
}

// ─── MisurePage ────────────────────────────────────────────────────

