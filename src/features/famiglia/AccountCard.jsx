import React, { useEffect, useState } from 'react';
import { cloudEnabled, createFamily, ensureMyProfile, getFamilyMembers, getMyFamily, getSession, joinFamily, leaveFamily, onAuthChange } from '@/db/cloud';

// ── Card "Account e famiglia cloud" (Fase S1) ────────────────
// Vive in cima alla pagina Famiglia. Se Supabase non è configurato
// non viene renderizzata: l'app resta locale al 100%.
export function AccountCard({ myPersona, onGoUtente }) {
  const [session, setSession]   = useState(null);
  const [famiglia, setFamiglia] = useState(null);
  const [membri, setMembri]     = useState([]);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState("");
  const [nomeFam, setNomeFam]   = useState("");
  const [codice, setCodice]     = useState("");
  const [copiato, setCopiato]   = useState(false);

  const ricarica = async () => {
    const s = await getSession();
    setSession(s);
    if (s) {
      await ensureMyProfile(myPersona);
      setFamiglia(await getMyFamily());
      setMembri(await getFamilyMembers());
    } else {
      setFamiglia(null); setMembri([]);
    }
  };

  useEffect(() => {
    if (!cloudEnabled) return;
    ricarica();
    const off = onAuthChange(() => ricarica());
    return off;
  }, []);

  if (!cloudEnabled) return null;

  const azione = async (fn) => {
    setBusy(true); setErr("");
    const r = await fn();
    if (r?.error) setErr(r.error);
    await ricarica();
    setBusy(false);
  };

  const condividi = async () => {
    const testo = `Unisciti alla nostra famiglia su Piano Alimentare! Codice: ${famiglia.invite_code}`;
    if (navigator.share) { try { await navigator.share({ text: testo }); } catch {} }
    else {
      try { await navigator.clipboard.writeText(famiglia.invite_code); setCopiato(true); setTimeout(()=>setCopiato(false), 1500); } catch {}
    }
  };

  const S = {
    card:  {background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:16,padding:"16px",marginBottom:14,boxShadow:"0 2px 12px #00000008"},
    h:     {fontSize:10,fontWeight:800,color:"#94a3b8",letterSpacing:0.8,textTransform:"uppercase",marginBottom:10},
    btn:   (bg)=>({padding:"10px 16px",borderRadius:10,border:"none",background:bg,color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}),
    input: {flex:1,padding:"10px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,minWidth:0},
  };

  return (
    <div style={S.card}>
      <div style={S.h}>☁️ Account e famiglia</div>

      {!session ? (
        <>
          <div style={{fontSize:12,color:"#64748b",lineHeight:1.5,marginBottom:10}}>
            Per creare una famiglia o entrare con un codice serve prima l'accesso con Google, dalla pagina Utente.
          </div>
          <button onClick={onGoUtente} style={S.btn("#1e293b")}>👤 Vai alla pagina Utente</button>
        </>
      ) : !famiglia ? (
        <>
          <div style={{fontSize:12,color:"#475569",marginBottom:12}}>
            Connesso come <strong>{session.user.email}</strong>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:6}}>Crea la tua famiglia</div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input style={S.input} placeholder="Nome (es. Famiglia Rossi)" value={nomeFam} onChange={e=>setNomeFam(e.target.value)}/>
            <button disabled={busy||!nomeFam.trim()} onClick={()=>azione(()=>createFamily(nomeFam))} style={S.btn("#2563eb")}>Crea</button>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:6}}>Oppure entra con un codice</div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <input style={{...S.input,textTransform:"uppercase",fontFamily:"monospace"}} placeholder="ES. PASTA-1234" value={codice} onChange={e=>setCodice(e.target.value)}/>
            <button disabled={busy||!codice.trim()} onClick={()=>azione(()=>joinFamily(codice))} style={S.btn("#16a34a")}>Unisciti</button>
          </div>
        </>
      ) : (
        <>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:800,color:"#1e293b"}}>👨‍👩‍👧 {famiglia.nome}</div>
              <div style={{fontSize:11,color:"#94a3b8",fontWeight:600}}>{membri.length} {membri.length===1?"membro":"membri"} · {session.user.email}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:10,padding:"10px 14px",marginBottom:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:9,fontWeight:800,color:"#94a3b8",letterSpacing:0.6,textTransform:"uppercase"}}>Codice invito</div>
              <div style={{fontSize:17,fontWeight:900,fontFamily:"monospace",color:"#1e293b",letterSpacing:1}}>{famiglia.invite_code}</div>
            </div>
            <button onClick={condividi} style={S.btn("#0ea5e9")}>{copiato ? "✓ Copiato" : "📤 Condividi"}</button>
          </div>
          {membri.length > 0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
              {membri.map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:5,background:m.color+"14",border:`1.5px solid ${m.color}40`,borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,color:m.color}}>
                  {m.nome}{m.user_id===session.user.id&&<span style={{fontSize:8,background:m.color,color:"#fff",borderRadius:4,padding:"1px 4px",fontWeight:900}}>IO</span>}{!m.user_id&&<span title="Profilo a carico" style={{fontSize:10}}>🧒</span>}
                </div>
              ))}
            </div>
          )}
          <div style={{fontSize:11,color:"#94a3b8",lineHeight:1.5,marginBottom:10}}>
            Profili, misure, piano, gusti e spesa sono sincronizzati con la famiglia: le modifiche compaiono su tutti i dispositivi.
          </div>
          <button disabled={busy} onClick={()=>{ if(window.confirm("Uscire dalla famiglia? I tuoi dati personali restano tuoi; i profili a tuo carico ti seguono.")) azione(leaveFamily); }}
            style={{border:"1.5px solid #fecaca",background:"#fff",color:"#dc2626",borderRadius:10,padding:"8px 14px",fontWeight:800,fontSize:11,cursor:"pointer"}}>
            Esci dalla famiglia
          </button>
        </>
      )}

      {err && <div style={{marginTop:10,background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#b91c1c",fontWeight:600}}>⚠️ {err}</div>}
    </div>
  );
}
