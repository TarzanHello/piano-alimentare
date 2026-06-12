import React, { useEffect, useState } from 'react';
import { emojiBySesso } from '@/core';
import { addManagedProfile, etaToDataNascita, getFamilyMembers, supabase } from '@/db/cloud';
import { finishMigration, getCloudMe } from '@/db/sync';

// ── Wizard one-time: collega le persone locali ai profili cloud ──
// Appare la prima volta che il dispositivo entra in una famiglia.
// 1) "Chi sei tu?" → la persona scelta diventa il TUO profilo cloud
// 2) Le altre: associale a un membro / creale come profilo a carico / lasciale fuori
export function MigrationWizard({ personas, onDone }) {
  const [membri, setMembri]   = useState(null);
  const [ioId, setIoId]       = useState(null);
  const [scelte, setScelte]   = useState({});   // localId → {type, profiloId?}
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState("");
  const me = getCloudMe();

  useEffect(() => { getFamilyMembers().then(setMembri); }, []);
  if (!membri) return null;

  const altri = personas.filter(p => p.id !== ioId);
  const membriAltrui = membri.filter(m => m.user_id && m.user_id !== me?.userId);
  const pronto = ioId && altri.every(p => scelte[p.id]);

  const completa = async () => {
    setBusy(true); setErr("");
    try {
      const mapping = [];
      // 1. il mio profilo cloud prende i dati della persona scelta
      const io = personas.find(p => p.id === ioId);
      await supabase.from("profili").update({
        nome: io.nome, sesso: io.sesso === "F" ? "F" : "M",
        data_nascita: io.dataNascita || etaToDataNascita(io.eta),
        peso: io.peso ?? null, altezza: io.altezza ?? null,
        lavoro: io.lavoro || "sedentario", allenamenti: io.allenamenti ?? 3,
        obiettivo: io.obiettivo || "mantenimento", color: io.color || "#2563eb",
      }).eq("id", me.profiloId);
      mapping.push({ localId: io.id, cloudId: me.profiloId });

      // 2. le altre persone
      for (const p of altri) {
        const s = scelte[p.id];
        if (s.type === "member") {
          mapping.push({ localId: p.id, cloudId: s.profiloId });
        } else if (s.type === "child") {
          const { data, error } = await addManagedProfile({
            nome: p.nome, sesso: p.sesso === "F" ? "F" : "M",
            data_nascita: p.dataNascita || etaToDataNascita(p.eta),
            peso: p.peso ?? null, altezza: p.altezza ?? null,
            lavoro: "sedentario", allenamenti: p.allenamenti ?? 2,
            obiettivo: p.obiettivo || "mantenimento", color: p.color || "#16a34a",
          });
          if (error) throw new Error(error);
          mapping.push({ localId: p.id, cloudId: data.id });
        }
        // "skip": i dati restano solo su questo dispositivo
      }
      const skipped = altri.filter(p => scelte[p.id]?.type === "skip").map(p => p.id);
      await window.storage.set("pf-local-only", JSON.stringify(skipped));
      await finishMigration(mapping);
      onDone();
    } catch (e) {
      setErr(e.message || "Errore di sincronizzazione"); setBusy(false);
    }
  };

  const S = {
    chip: (sel,color)=>({padding:"8px 13px",borderRadius:10,border:"2px solid",borderColor:sel?color:"#e2e8f0",background:sel?color+"14":"#fff",color:sel?color:"#64748b",fontWeight:700,fontSize:12,cursor:"pointer"}),
    sel:  {padding:"7px 10px",borderRadius:8,border:"1.5px solid #e2e8f0",fontSize:12,fontWeight:600,color:"#1e293b",background:"#fff"},
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#0f172acc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:18,padding:"22px 20px",maxWidth:520,width:"100%",maxHeight:"88vh",overflowY:"auto",boxShadow:"0 24px 60px #00000040"}}>
        <div style={{fontSize:17,fontWeight:900,color:"#1e293b",marginBottom:4}}>☁️ Colleghiamo i profili</div>
        <div style={{fontSize:12,color:"#64748b",lineHeight:1.5,marginBottom:16}}>
          Un solo passaggio, una volta sola: dimmi chi sei e cosa fare delle altre persone salvate su questo dispositivo. Misure e dati non si perdono.
        </div>

        <div style={{fontSize:11,fontWeight:800,color:"#94a3b8",letterSpacing:0.7,textTransform:"uppercase",marginBottom:8}}>1 · Chi sei tu?</div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:18}}>
          {personas.map(p=>(
            <button key={p.id} onClick={()=>{setIoId(p.id); const s={...scelte}; delete s[p.id]; setScelte(s);}} style={S.chip(ioId===p.id,p.color)}>
              {emojiBySesso(p)} {p.nome}
            </button>
          ))}
        </div>

        {ioId && altri.length > 0 && (
          <>
            <div style={{fontSize:11,fontWeight:800,color:"#94a3b8",letterSpacing:0.7,textTransform:"uppercase",marginBottom:8}}>2 · E le altre persone?</div>
            {altri.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #f1f5f9"}}>
                <div style={{flex:1,fontSize:13,fontWeight:700,color:"#1e293b"}}>{emojiBySesso(p)} {p.nome} <span style={{color:"#94a3b8",fontWeight:600,fontSize:11}}>· {p.eta} anni</span></div>
                <select style={S.sel} value={JSON.stringify(scelte[p.id]||"")} onChange={e=>setScelte({...scelte,[p.id]:JSON.parse(e.target.value)})}>
                  <option value='""' disabled>Scegli…</option>
                  {membriAltrui.map(m=>(
                    <option key={m.id} value={JSON.stringify({type:"member",profiloId:m.id})}>È {m.nome} (già in famiglia)</option>
                  ))}
                  <option value={JSON.stringify({type:"child"})}>Crea come profilo a carico 🧒</option>
                  <option value={JSON.stringify({type:"skip"})}>Lascia solo su questo dispositivo</option>
                </select>
              </div>
            ))}
            <div style={{fontSize:10,color:"#94a3b8",lineHeight:1.5,marginTop:8}}>
              Suggerimento: se {altri.length===1?"questa persona":"una di queste persone"} si registrerà con un proprio account Google, scegli "Lascia su questo dispositivo": al suo ingresso in famiglia comparirà col suo profilo.
            </div>
          </>
        )}

        {err && <div style={{marginTop:12,background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#b91c1c",fontWeight:600}}>⚠️ {err}</div>}

        <button disabled={!pronto||busy} onClick={completa}
          style={{marginTop:16,width:"100%",padding:"13px",borderRadius:12,border:"none",background:pronto&&!busy?"#2563eb":"#cbd5e1",color:"#fff",fontWeight:900,fontSize:14,cursor:pronto&&!busy?"pointer":"default"}}>
          {busy ? "Sincronizzazione…" : "Collega e sincronizza"}
        </button>
      </div>
    </div>
  );
}
