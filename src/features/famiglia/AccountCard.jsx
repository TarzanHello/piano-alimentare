import React, { useEffect, useState } from 'react';
import { cloudEnabled, createFamily, ensureMyProfile, getFamilyMembers, getMyFamily,
         getSession, joinFamily, leaveFamily, onAuthChange, removeMember } from '@/db/cloud';

// ── Card "Account e famiglia cloud" ─────────────────────────
// Capo famiglia: chi ha creato la famiglia (created_by), o chiunque
// abbia ereditato la titolarità (capo_id). Il capo può rimuovere
// altri membri e trasferisce automaticamente la titolarità a chi è
// entrato prima quando esce.
export function AccountCard({ myPersona, onGoUtente }) {
  const [session, setSession]   = useState(null);
  const [famiglia, setFamiglia] = useState(null);
  const [membri, setMembri]     = useState([]);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState("");
  const [nomeFam, setNomeFam]   = useState("");
  const [codice, setCodice]     = useState("");
  const [copiato, setCopiato]   = useState(false);
  const [diag, setDiag]         = useState(null);

  const eseguiDiagnostica = async () => {
    const out = {};
    try {
      const { supabase, SUPABASE_URL_ACTIVE } = await import('@/db/cloud');
      out.progetto = SUPABASE_URL_ACTIVE || "?";
      const s = await getSession();
      out.sessione = s ? s.user.email : "NESSUNA";
      out.userId = s?.user?.id || null;
      if (s) {
        const r1 = await supabase.from('profili').select('id,nome,famiglia_id,user_id').eq('user_id', s.user.id);
        out.mioProfilo = r1.error ? "ERR: "+r1.error.message : r1.data;
        const r2 = await supabase.from('profili').select('id,nome,famiglia_id').not('famiglia_id','is',null);
        out.profiliInFamiglia = r2.error ? "ERR: "+r2.error.message : r2.data;
        const r3 = await supabase.from('famiglie').select('id,nome,invite_code,capo_id');
        out.famiglieVisibili = r3.error ? "ERR: "+r3.error.message : r3.data;
      }
    } catch (e) { out.eccezione = e.message; }
    setDiag(out);
  };

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
    const testo = `Unisciti alla nostra famiglia su Fitsy! Codice: ${famiglia.invite_code}`;
    if (navigator.share) { try { await navigator.share({ text: testo }); } catch {} }
    else {
      try { await navigator.clipboard.writeText(famiglia.invite_code); setCopiato(true); setTimeout(()=>setCopiato(false), 1500); } catch {}
    }
  };

  const isCapo = famiglia && session && famiglia.capo_id === session.user.id;

  // Conferma uscita con messaggio contestualizzato
  const handleLeave = () => {
    const utentiRimasti = membri.filter(m => m.user_id && m.user_id !== session.user.id).length;
    let msg;
    if (utentiRimasti === 0) {
      msg = "Sei l'ultimo membro: uscendo la famiglia verrà eliminata definitivamente. Continuare?";
    } else if (isCapo) {
      const prossimo = membri.filter(m => m.user_id && m.user_id !== session.user.id)
                             .sort((a,b) => new Date(a.created_at)-new Date(b.created_at))[0];
      msg = `Sei il capo famiglia. Uscendo, la titolarità passerà a ${prossimo?.nome||"il prossimo membro"}. Continuare?`;
    } else {
      msg = "Uscire dalla famiglia? I tuoi dati personali restano tuoi; i profili a tuo carico ti seguono.";
    }
    if (window.confirm(msg)) azione(leaveFamily);
  };

  const handleRemove = async (membro) => {
    if (!window.confirm(`Rimuovere ${membro.nome} dalla famiglia?`)) return;
    setBusy(true); setErr("");
    const r = await removeMember(membro.id);
    if (r?.error) setErr(r.error);
    await ricarica();
    setBusy(false);
  };

  const S = {
    card:  {background:"#fff",border:"1.5px solid #E7EDE2",borderRadius:16,padding:"16px",marginBottom:14,boxShadow:"0 2px 12px #00000008"},
    h:     {fontSize:10,fontWeight:800,color:"#9DB1A2",letterSpacing:0.8,textTransform:"uppercase",marginBottom:10},
    btn:   (bg)=>({padding:"10px 16px",borderRadius:10,border:"none",background:bg,color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}),
    input: {flex:1,padding:"10px 12px",borderRadius:10,border:"1.5px solid #E7EDE2",fontSize:13,minWidth:0},
  };

  // Mappa user_id → ordine di entrata (posizione nella lista ordinata per created_at)
  const utentiRegistrati = membri.filter(m => m.user_id).sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
  const posizioneMap = Object.fromEntries(utentiRegistrati.map((m,i) => [m.user_id, i+1]));

  return (
    <div style={S.card}>
      <div style={S.h}>☁️ Account e famiglia</div>

      {!session ? (
        <>
          <div style={{fontSize:12,color:"#6E8576",lineHeight:1.5,marginBottom:10}}>
            Per creare una famiglia o entrare con un codice serve prima l'accesso con Google, dalla pagina Utente.
          </div>
          <button onClick={onGoUtente} style={S.btn("#15251C")}>👤 Vai alla pagina Utente</button>
        </>
      ) : !famiglia ? (
        <>
          <div style={{fontSize:12,color:"#4A6152",marginBottom:6}}>
            Connesso come <strong>{session.user.email}</strong>
          </div>
          <div style={{fontSize:12,color:"#6E8576",lineHeight:1.5,marginBottom:14}}>
            Crea un nucleo per condividere piano, spesa e misure con chi vuoi — oppure entra in quello di qualcun altro con un codice.
          </div>
          <div style={{fontSize:12,fontWeight:700,color:"#15251C",marginBottom:6}}>Crea la tua famiglia</div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input style={S.input} placeholder="Nome (es. Famiglia Rossi)" value={nomeFam} onChange={e=>setNomeFam(e.target.value)}/>
            <button disabled={busy||!nomeFam.trim()} onClick={()=>azione(()=>createFamily(nomeFam))} style={S.btn("#2F6B3A")}>Crea</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{flex:1,height:1,background:"#EFF3EC"}}/>
            <span style={{fontSize:10,fontWeight:700,color:"#C2D0C6",textTransform:"uppercase",letterSpacing:0.6}}>oppure</span>
            <div style={{flex:1,height:1,background:"#EFF3EC"}}/>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:"#15251C",marginBottom:6}}>Entra con un codice</div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input style={{...S.input,textTransform:"uppercase",fontFamily:"monospace"}} placeholder="ES. PASTA-1234" value={codice} onChange={e=>setCodice(e.target.value)}/>
            <button disabled={busy||!codice.trim()} onClick={()=>azione(()=>joinFamily(codice))} style={S.btn("#16a34a")}>Unisciti</button>
          </div>
          <div style={{background:"#EEF7F0",border:"1px solid #A9DDB8",borderRadius:10,padding:"10px 14px",fontSize:11,color:"#1F6B4A",lineHeight:1.5}}>
            💡 Finché non crei o entri in una famiglia, l'app funziona in locale su questo dispositivo: i tuoi dati restano salvati e verranno collegati quando ti unirai a un nucleo.
          </div>
        </>
      ) : (
        <>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:800,color:"#15251C"}}>👨‍👩‍👧 {famiglia.nome}</div>
              <div style={{fontSize:11,color:"#9DB1A2",fontWeight:600}}>
                {utentiRegistrati.length} {utentiRegistrati.length===1?"membro":"membri"} · {session.user.email}
              </div>
            </div>
            {isCapo && (
              <div style={{flexShrink:0,background:"#fef9c3",border:"1.5px solid #fde047",borderRadius:8,padding:"4px 10px",fontSize:10,fontWeight:800,color:"#854d0e"}}>
                👑 Capo
              </div>
            )}
          </div>

          {/* Codice invito */}
          <div style={{display:"flex",alignItems:"center",gap:8,background:"#F5F8F1",border:"1.5px dashed #C2D0C6",borderRadius:10,padding:"10px 14px",marginBottom:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:9,fontWeight:800,color:"#9DB1A2",letterSpacing:0.6,textTransform:"uppercase"}}>Codice invito</div>
              <div style={{fontSize:17,fontWeight:900,fontFamily:"monospace",color:"#15251C",letterSpacing:1}}>{famiglia.invite_code}</div>
            </div>
            <button onClick={condividi} style={S.btn("#0ea5e9")}>{copiato ? "✓ Copiato" : "📤 Condividi"}</button>
          </div>

          {/* Lista membri con badge priorità */}
          {utentiRegistrati.length > 0 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:9,fontWeight:800,color:"#9DB1A2",textTransform:"uppercase",letterSpacing:0.6,marginBottom:6}}>
                Membri · ordine di priorità
              </div>
              {utentiRegistrati.map((m, i) => {
                const isMe = m.user_id === session.user.id;
                const isMembroCapo = m.user_id === famiglia.capo_id;
                const profiliACarico = membri.filter(x => !x.user_id && x.gestito_da === m.user_id);
                return (
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:10,
                      background: isMe ? "#EEF7F0" : "#fafafa",
                      border: `1.5px solid ${isMe ? "#A9DDB8" : "#EFF3EC"}`,
                      marginBottom:6}}>
                    {/* Numero priorità */}
                    <div style={{width:22,height:22,borderRadius:"50%",background:isMembroCapo?"#fde047":"#E7EDE2",
                        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                        fontSize:10,fontWeight:900,color:isMembroCapo?"#854d0e":"#6E8576"}}>
                      {isMembroCapo ? "👑" : i+1}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:12,color:"#15251C",display:"flex",alignItems:"center",gap:5}}>
                        {m.nome}
                        {isMe && <span style={{fontSize:8,background:"#2F6B3A",color:"#fff",borderRadius:4,padding:"1px 5px",fontWeight:900}}>IO</span>}
                        {isMembroCapo && !isMe && <span style={{fontSize:8,background:"#f59e0b",color:"#fff",borderRadius:4,padding:"1px 5px",fontWeight:900}}>CAPO</span>}
                      </div>
                      {profiliACarico.length > 0 && (
                        <div style={{fontSize:10,color:"#9DB1A2",marginTop:1}}>
                          + {profiliACarico.map(x=>x.nome).join(", ")}
                        </div>
                      )}
                    </div>
                    {/* Pulsante rimuovi: solo il capo, solo per gli altri */}
                    {isCapo && !isMe && (
                      <button disabled={busy} onClick={()=>handleRemove(m)}
                        style={{padding:"3px 8px",border:"1.5px solid #fecaca",background:"#fff",color:"#dc2626",
                          borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
              {/* Profili a carico senza utente registrato */}
              {membri.filter(m => !m.user_id && !utentiRegistrati.some(u => u.user_id === m.gestito_da)).map(m => (
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,
                    background:"#fafafa",border:"1px solid #EFF3EC",marginBottom:4}}>
                  <span style={{fontSize:13}}>🧒</span>
                  <span style={{fontSize:11,color:"#6E8576",fontWeight:600}}>{m.nome}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{fontSize:11,color:"#9DB1A2",lineHeight:1.5,marginBottom:12}}>
            Profili, misure, piano, gusti e spesa sono sincronizzati con la famiglia.
            {isCapo && " Come capo puoi rimuovere altri membri (✕) e la titolarità si trasferirà automaticamente se esci."}
          </div>

          <button disabled={busy} onClick={handleLeave}
            style={{border:"1.5px solid #fecaca",background:"#fff",color:"#dc2626",borderRadius:10,padding:"8px 14px",fontWeight:800,fontSize:11,cursor:"pointer"}}>
            {utentiRegistrati.filter(m=>m.user_id!==session.user.id).length===0
              ? "🗑️ Esci e chiudi la famiglia"
              : "🚪 Esci dalla famiglia"}
          </button>
        </>
      )}

      {err && <div style={{marginTop:10,background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#b91c1c",fontWeight:600}}>⚠️ {err}</div>}

      <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid #EFF3EC"}}>
        <button onClick={eseguiDiagnostica} style={{border:"none",background:"transparent",color:"#9DB1A2",fontSize:10,fontWeight:700,cursor:"pointer",padding:0,textDecoration:"underline"}}>🔍 Diagnostica</button>
        {diag && (
          <pre style={{marginTop:8,background:"#0f172a",color:"#a5f3fc",fontSize:10,lineHeight:1.5,padding:"10px 12px",borderRadius:8,overflowX:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all"}}>
{JSON.stringify(diag, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
