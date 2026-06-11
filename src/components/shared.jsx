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
    <span style={{ display:"inline-flex",alignItems:"center",gap:3,background:color+"18",color,border:`1px solid ${color}38`,borderRadius:6,padding:"2px 7px",fontSize:11,fontWeight:700,fontFamily:"monospace" }}>
      {label} <span style={{fontWeight:400}}>{value}g</span>
    </span>
  );
}

export function ProgressBar({ value, max, color }) {
  return (
    <div style={{background:"#f1f5f9",borderRadius:99,height:7,overflow:"hidden",flex:1}}>
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

