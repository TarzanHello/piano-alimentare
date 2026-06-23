import React, { useEffect, useState } from 'react';
import { cloudEnabled, getSession, onAuthChange, signInWithGoogle } from '@/db/cloud';
import { PersonaForm } from '@/features/famiglia/FamigliaPage';

// ── Primo accesso ─────────────────────────────────────────────
// Schermata a tutto schermo mostrata quando l'app non ha nessuna
// persona salvata: 1) login (saltabile) → 2) compila la scheda
// utente con target calcolato live → l'utente è creato.
export function Onboarding({ onComplete }) {
  const [session, setSession] = useState(null);
  const [step, setStep]       = useState(cloudEnabled ? 1 : 2);
  const [busy, setBusy]       = useState(false);

  useEffect(() => {
    if (!cloudEnabled) return;
    getSession().then(s => { setSession(s); if (s) setStep(2); });
    return onAuthChange(s => { setSession(s); if (s) setStep(2); });
  }, []);

  const nuova = {
    id: "p" + Date.now(), nome: "", sesso: "M", eta: 30, peso: 70, altezza: 170,
    lavoro: "sedentario", allenamenti: 3, obiettivo: "mantenimento", color: "#18A957",
  };

  return (
    <div style={{minHeight:"100vh",background:"#EFF3EC",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px"}}>
      <div style={{maxWidth:560,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{fontSize:44,marginBottom:6}}>🥗</div>
          <div style={{fontSize:22,fontWeight:900,color:"#13231A"}}>Piano Alimentare Familiare</div>
          <div style={{fontSize:12,color:"#6E8576",fontWeight:600,marginTop:4}}>
            {step === 1 ? "Benvenuto! Iniziamo dal tuo account." : "Raccontami di te: calcolo subito il tuo fabbisogno."}
          </div>
        </div>

        {step === 1 ? (
          <div style={{background:"#fff",border:"1.5px solid #E7EDE2",borderRadius:18,padding:"26px 22px",boxShadow:"0 8px 30px #00000010",textAlign:"center"}}>
            <div style={{fontSize:12,color:"#6E8576",lineHeight:1.6,marginBottom:18,textAlign:"left"}}>
              Con l'account Google i tuoi dati ti seguono su ogni dispositivo e puoi condividere piano, misure e lista della spesa con la tua famiglia.
            </div>
            <button disabled={busy} onClick={async()=>{ setBusy(true); await signInWithGoogle(); setBusy(false); }}
              style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:"#13231A",color:"#fff",fontWeight:900,fontSize:14,cursor:"pointer"}}>
              🔑 Accedi con Google
            </button>
            <button onClick={()=>setStep(2)}
              style={{marginTop:12,border:"none",background:"transparent",color:"#9DB1A2",fontSize:12,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>
              Continua senza account
            </button>
          </div>
        ) : (
          <div>
            <PersonaForm persona={nuova} isNew={true}
              onSave={(p)=>onComplete(p, session)}
              onCancel={null}/>
            {cloudEnabled && !session && (
              <div style={{textAlign:"center",marginTop:10}}>
                <button onClick={()=>setStep(1)} style={{border:"none",background:"transparent",color:"#9DB1A2",fontSize:11,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>
                  ← Torna all'accesso
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
