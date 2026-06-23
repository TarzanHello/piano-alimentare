import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { formattaPorzione, macroDaQuantita } from '@/core';
import { RecipeEditorModal } from '@/components/modals';

export function SwipeContainer({ onSwipeLeft, onSwipeRight, children, style }) {
  const stato = React.useRef({ x:0, y:0, t:0, attivo:false });
  const onTouchStart = (e) => {
    const t = e.touches[0];
    stato.current = { x:t.clientX, y:t.clientY, t:Date.now(), attivo:true };
  };
  const onTouchMove = () => { /* lasciamo lo scroll libero */ };
  const onTouchEnd = (e) => {
    if (!stato.current.attivo) return;
    stato.current.attivo = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - stato.current.x;
    const dy = t.clientY - stato.current.y;
    const dt = Date.now() - stato.current.t;
    // gesto valido: orizzontale prevalente, >50px, <600ms
    if (dt > 600) return;
    if (Math.abs(dx) < 50) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.4) return;  // verticale: ignora
    if (dx < 0 && onSwipeLeft)  onSwipeLeft();
    if (dx > 0 && onSwipeRight) onSwipeRight();
  };
  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={style}>
      {children}
    </div>
  );
}

export function MacroBadge({ label, value, color }) {
  return (
    <span style={{ display:"inline-flex",alignItems:"baseline",gap:4,background:color+"1f",borderRadius:8,padding:"5px 10px",fontSize:11.5,fontWeight:700 }}>
      <span style={{color,fontWeight:800,fontSize:10.5}}>{label}</span>
      <span style={{color:"#13231A"}}>{value}g</span>
    </span>
  );
}

export function ProgressBar({ value, max, color }) {
  return (
    <div style={{background:"#EFF3EC",borderRadius:99,height:7,overflow:"hidden",flex:1}}>
      <div style={{width:`${Math.min(100,Math.round(value/max*100))}%`,height:"100%",background:value>max?"#ef4444":color,borderRadius:99,transition:"width 0.5s"}}/>
    </div>
  );
}

// ─── RecipeEditorModal ───────────────────────────────────────────────
// Popup per modificare una ricetta: nome, ingredienti, quantità.
// Calcola i macro live e salva come ricetta custom.
//
// La struttura ingredienti interna usa { ingId: { valore, unit } }
// compatibile con macroDaQuantita() e formattaPorzione().


// Stato vuoto curato e riusabile, con call-to-action opzionale
export function EmptyState({ emoji, title, text, ctaLabel, onCta }) {
  return (
    <div style={{textAlign:"center",padding:"44px 24px",background:"#fff",border:"1.5px dashed #E7EDE2",borderRadius:16}}>
      <div style={{fontSize:40,marginBottom:10}}>{emoji}</div>
      <div style={{fontSize:15,fontWeight:800,color:"#13231A",marginBottom:4}}>{title}</div>
      <div style={{fontSize:12,color:"#9DB1A2",lineHeight:1.5,maxWidth:300,margin:"0 auto"}}>{text}</div>
      {ctaLabel && onCta && (
        <button onClick={onCta} style={{marginTop:14,padding:"9px 18px",borderRadius:10,border:"none",background:"#18A957",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>{ctaLabel}</button>
      )}
    </div>
  );
}
