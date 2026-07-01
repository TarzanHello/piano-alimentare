import React from 'react';
const { useState, useEffect } = React;

// ─── Toast globale ───────────────────────────────────────────────────
// Feedback leggero e uniforme per le azioni (salvataggi, eliminazioni…).
// Uso: import { toast } from '@/components/toast';  toast("✓ Salvato");
// Il tipo "err" usa lo sfondo rosso per gli errori.
// <ToastHost/> va montato una volta sola, alla radice dell'app.

export function toast(msg, tipo = "ok") {
  try { window.dispatchEvent(new CustomEvent("pf-toast", { detail: { msg, tipo } })); } catch {}
}

export function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const on = (e) => {
      const id = Date.now() + Math.random();
      const it = { id, msg: e.detail?.msg || "", tipo: e.detail?.tipo || "ok" };
      // massimo 3 toast visibili contemporaneamente
      setItems(prev => [...prev.slice(-2), it]);
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== id)), 2400);
    };
    window.addEventListener("pf-toast", on);
    return () => window.removeEventListener("pf-toast", on);
  }, []);

  if (!items.length) return null;
  return (
    <div style={{position:"fixed",left:0,right:0,bottom:"calc(76px + env(safe-area-inset-bottom,0px))",zIndex:400,display:"flex",flexDirection:"column",alignItems:"center",gap:6,pointerEvents:"none"}}>
      {items.map(it => (
        <div key={it.id}
          style={{background:it.tipo==="err"?"#7f1d1d":"#15251C",color:"#F4F7EF",borderRadius:99,padding:"9px 18px",fontSize:12.5,fontWeight:700,boxShadow:"0 10px 26px -8px rgba(0,0,0,0.45)",animation:"pfToastIn 0.2s ease-out",maxWidth:"88%",textAlign:"center"}}>
          {it.msg}
        </div>
      ))}
      <style>{`@keyframes pfToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
