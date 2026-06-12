import React, { useEffect, useState } from 'react';
import { emojiBySesso } from '@/core';
import { cloudEnabled, getMyFamily, getSession, onAuthChange, signInWithGoogle, signOut } from '@/db/cloud';

// ── Pagina Utente ─────────────────────────────────────────────
// Tutto il lato account: accesso, disconnessione, stato della
// sincronizzazione e identità ("chi sono io" tra le persone).
// La pagina Famiglia resta dedicata a creare e gestire la famiglia.
export function UtentePage({ personas, myPersonaId, onSetMyPersona, onGoFamiglia }) {
  const [session, setSession]   = useState(null);
  const [famiglia, setFamiglia] = useState(null);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState("");

  const ricarica = async () => {
    const s = await getSession();
    setSession(s);
    setFamiglia(s ? await getMyFamily() : null);
  };
  useEffect(() => {
    if (!cloudEnabled) return;
    ricarica();
    return onAuthChange(() => ricarica());
  }, []);

  const S = {
    card: {background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:16,padding:"16px",marginBottom:14,boxShadow:"0 2px 12px #00000008"},
    h:    {fontSize:10,fontWeight:800,color:"#94a3b8",letterSpacing:0.8,textTransform:"uppercase",marginBottom:10},
    btn:  (bg)=>({padding:"11px 18px",borderRadius:10,border:"none",background:bg,color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}),
    riga: {display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#475569",marginBottom:6},
  };
  const dot = (on)=><span style={{width:8,height:8,borderRadius:"50%",background:on?"#16a34a":"#cbd5e1",display:"inline-block",flexShrink:0}}/>;

  const azione = async (fn) => {
    setBusy(true); setErr("");
    const r = await fn();
    if (r?.error) setErr(r.error);
    await ricarica(); setBusy(false);
  };

  const myPersona = personas.find(p=>p.id===myPersonaId);

  return (
    <div>
      {/* ── Account ── */}
      <div style={S.card}>
        <div style={S.h}>👤 Account</div>
        {!cloudEnabled ? (
          <div style={{fontSize:12,color:"#64748b",lineHeight:1.5}}>
            La sincronizzazione cloud non è configurata: l'app funziona in locale su questo dispositivo. Tutti i dati restano salvati qui.
          </div>
        ) : !session ? (
          <>
            <div style={{fontSize:12,color:"#64748b",lineHeight:1.6,marginBottom:12}}>
              Accedi con il tuo account Google per sincronizzare profilo, misure, piano e spesa su tutti i tuoi dispositivi e con la tua famiglia. <strong>I dati già presenti su questo dispositivo non si perdono</strong>: vengono collegati al tuo account.
            </div>
            <button disabled={busy} onClick={()=>azione(signInWithGoogle)} style={S.btn("#1e293b")}>🔑 Accedi con Google</button>
          </>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{width:42,height:42,borderRadius:"50%",background:"#2563eb18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                {session.user.user_metadata?.avatar_url
                  ? <img src={session.user.user_metadata.avatar_url} alt="" style={{width:42,height:42,borderRadius:"50%"}}/>
                  : "👤"}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:800,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.user.user_metadata?.name || "Connesso"}</div>
                <div style={{fontSize:11,color:"#94a3b8",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.user.email}</div>
              </div>
            </div>
            <button disabled={busy} onClick={()=>{ if(window.confirm("Disconnettersi? I dati restano sul dispositivo e nel cloud; al prossimo accesso ritroverai tutto.")) azione(signOut); }}
              style={{border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",borderRadius:10,padding:"9px 16px",fontWeight:800,fontSize:12,cursor:"pointer"}}>
              Esci dall'account
            </button>
          </>
        )}
        {err && <div style={{marginTop:10,background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#b91c1c",fontWeight:600}}>⚠️ {err}</div>}
      </div>

      {/* ── Stato sincronizzazione ── */}
      {cloudEnabled && (
        <div style={S.card}>
          <div style={S.h}>☁️ Sincronizzazione</div>
          <div style={S.riga}>{dot(!!session)} Account {session ? "connesso" : "non connesso"}</div>
          <div style={S.riga}>{dot(!!famiglia)} {famiglia ? <>Famiglia: <strong>{famiglia.nome}</strong></> : "Nessuna famiglia"}</div>
          <div style={{fontSize:11,color:"#94a3b8",lineHeight:1.5,marginTop:8}}>
            {session && famiglia
              ? "Profili, misure, piano, gusti e lista della spesa si aggiornano in tempo reale su tutti i dispositivi della famiglia."
              : session
                ? "Per condividere piano e spesa, crea una famiglia o entra con un codice nella pagina Famiglia."
                : "Accedi per attivare la sincronizzazione."}
          </div>
          {session && !famiglia && (
            <button onClick={onGoFamiglia} style={{...S.btn("#2563eb"),marginTop:12,fontSize:12,padding:"9px 16px"}}>👨‍👩‍👧 Vai alla pagina Famiglia</button>
          )}
        </div>
      )}

      {/* ── Chi sono io ── */}
      <div style={S.card}>
        <div style={S.h}>🪪 Io sono</div>
        <div style={{fontSize:11,color:"#94a3b8",lineHeight:1.5,marginBottom:10}}>
          La persona predefinita su questo dispositivo: home Oggi, notifiche e log pasti partono da qui.
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {personas.map(p=>(
            <button key={p.id} onClick={()=>onSetMyPersona(p.id)} style={{padding:"8px 13px",borderRadius:10,border:"2px solid",borderColor:myPersonaId===p.id?p.color:"#e2e8f0",background:myPersonaId===p.id?p.color+"14":"#fff",color:myPersonaId===p.id?p.color:"#64748b",fontWeight:700,fontSize:12,cursor:"pointer"}}>
              {emojiBySesso(p)} {p.nome}{myPersonaId===p.id?" ✓":""}
            </button>
          ))}
        </div>
        {myPersona && <div style={{fontSize:11,color:"#94a3b8",marginTop:8}}>I dati anagrafici si modificano nella pagina <button onClick={onGoFamiglia} style={{border:"none",background:"none",color:"#2563eb",fontWeight:700,cursor:"pointer",padding:0,fontSize:11}}>Famiglia</button>.</div>}
      </div>
    </div>
  );
}
