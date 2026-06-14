import React, { useEffect, useState } from 'react';
import { SK_MISURE, emojiBySesso } from '@/core';

// ── 🛟 Recupero dati ──────────────────────────────────────────
// Scansiona lo storage locale alla ricerca di serie di misurazioni
// "orfane" (salvate sotto ID persona che non esistono più dopo le
// migrazioni) e permette di riassegnarle a una persona attuale.
// La riassegnazione scrive in locale: la sincronizzazione le carica
// poi sul cloud da sola (il push non cancella mai, solo aggiunge).
export function RecuperoDati({ personas }) {
  const [serie, setSerie] = useState(null);   // [{key, count, prima, ultima, orfana}]
  const [target, setTarget] = useState({});
  const [fatto, setFatto] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const scan = async () => {
    try {
      const r = await window.storage.get(SK_MISURE);
      const m = JSON.parse(r.value) || {};
      const ids = new Set(personas.map(p => p.id));
      const s = Object.entries(m)
        .filter(([, recs]) => Array.isArray(recs) && recs.length > 0)
        .map(([key, recs]) => ({
          key, count: recs.length,
          prima: recs[0]?.date || "?", ultima: recs[recs.length - 1]?.date || "?",
          orfana: !ids.has(key),
        }));
      setSerie(s);
    } catch { setSerie([]); }
  };
  useEffect(() => { scan(); }, [personas]);

  const riassegna = async (key) => {
    const dest = target[key];
    if (!dest) return;
    try {
      const r = await window.storage.get(SK_MISURE);
      const m = JSON.parse(r.value) || {};
      const orfane = m[key] || [];
      const attuali = m[dest] || [];
      // unione senza duplicati (per data)
      const date = new Set(attuali.map(x => x.date));
      const unite = [...attuali, ...orfane.filter(x => !date.has(x.date))];
      unite.sort((a, b) => {
        const k = s => { const p = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s?.date||""); return p ? `${p[3]}-${p[2].padStart(2,"0")}-${p[1].padStart(2,"0")}` : ""; };
        return k(a).localeCompare(k(b));
      });
      m[dest] = unite;
      delete m[key];
      await window.storage.set(SK_MISURE, JSON.stringify(m));
      window.dispatchEvent(new window.CustomEvent("pf-cloud-update", { detail: { key: "misure" } }));
      setFatto(`✓ ${orfane.length} misurazioni riassegnate`);
      setTimeout(() => setFatto(""), 2500);
      scan();
    } catch (e) { setFatto("⚠️ " + (e?.message || "errore")); }
  };

  if (!serie) return null;
  const orfane = serie.filter(s => s.orfana);

  return (
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:"16px",marginBottom:14,boxShadow:"0 2px 10px #0000000a"}}>
      <div style={{fontSize:13,fontWeight:800,color:"#1e293b",marginBottom:4}}>🛟 Recupero misurazioni</div>
      <div style={{fontSize:11,color:"#64748b",lineHeight:1.5,marginBottom:12}}>
        Serie di misurazioni presenti su questo dispositivo. Quelle "orfane" appartengono a profili che non esistono più dopo una migrazione: riassegnale alla persona giusta e verranno sincronizzate.
      </div>
      {serie.length === 0 && <div style={{fontSize:12,color:"#94a3b8"}}>Nessuna misurazione salvata su questo dispositivo.</div>}
      {serie.map(s => {
        const p = personas.find(x => x.id === s.key);
        return (
          <div key={s.key} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #f1f5f9",flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:160}}>
              <div style={{fontSize:12,fontWeight:800,color:s.orfana?"#d97706":"#1e293b"}}>
                {s.orfana ? "⚠️ Serie orfana" : `${emojiBySesso(p)} ${p.nome}`}
                <span style={{fontWeight:600,color:"#94a3b8"}}> · {s.count} misurazioni</span>
              </div>
              <div style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>dal {s.prima} al {s.ultima} · chiave {s.key.slice(0,12)}…</div>
            </div>
            {s.orfana && (
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <select value={target[s.key]||""} onChange={e=>setTarget({...target,[s.key]:e.target.value})}
                  style={{padding:"7px 9px",borderRadius:8,border:"1.5px solid #e2e8f0",fontSize:11,fontWeight:600}}>
                  <option value="" disabled>Assegna a…</option>
                  {personas.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <button disabled={!target[s.key]} onClick={()=>riassegna(s.key)}
                  style={{padding:"7px 12px",borderRadius:8,border:"none",background:target[s.key]?"#16a34a":"#cbd5e1",color:"#fff",fontWeight:800,fontSize:11,cursor:target[s.key]?"pointer":"default"}}>
                  Recupera
                </button>
              </div>
            )}
          </div>
        );
      })}
      {orfane.length === 0 && serie.length > 0 && <div style={{fontSize:11,color:"#16a34a",fontWeight:700,marginTop:8}}>✓ Nessuna serie orfana: tutto assegnato correttamente.</div>}
      {fatto && <div style={{marginTop:10,fontSize:12,fontWeight:700,color:fatto.startsWith("✓")?"#16a34a":"#b91c1c"}}>{fatto}</div>}

      <div style={{marginTop:16,paddingTop:14,borderTop:"1px solid #f1f5f9"}}>
        <div style={{fontSize:11,fontWeight:800,color:"#475569",marginBottom:4}}>🔄 Sincronizzazione famiglia</div>
        <div style={{fontSize:10.5,color:"#94a3b8",lineHeight:1.5,marginBottom:10}}>
          Se i dati tra i tuoi dispositivi non coincidono, premi <strong>Riallinea dal cloud</strong>: scarica la versione più aggiornata dal server senza perdere nulla. Usa <strong>Scollega</strong> solo se l'accesso è bloccato.
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={async()=>{
            setBusy(true); setErr("");
            try {
              const { riallineaForzato } = await import('@/db/sync');
              const r = await riallineaForzato();
              if (r?.error) setErr(r.error); else { setFatto("✓ Riallineato dal cloud"); setTimeout(()=>setFatto(""),2500); }
            } catch(e){ setErr(e?.message||"errore"); }
            setBusy(false);
          }} disabled={busy} style={{padding:"9px 14px",borderRadius:9,border:"none",background:"#2563eb",color:"#fff",fontWeight:800,fontSize:11,cursor:"pointer"}}>
            🔄 Riallinea dal cloud
          </button>
          <button onClick={async()=>{
            if(!window.confirm("Scollegare questo dispositivo? Dovrai riaccedere. I dati locali restano intatti.")) return;
            try {
              for (const k of ["pf-cloud-migrated","pf-cloud-me","pf-local-only"]) { try{ await window.storage.delete(k); }catch{} }
              const { signOut } = await import('@/db/cloud');
              await signOut();
            } catch {}
            window.location.reload();
          }} style={{padding:"9px 14px",borderRadius:9,border:"1.5px solid #fed7aa",background:"#fff7ed",color:"#c2410c",fontWeight:800,fontSize:11,cursor:"pointer"}}>
            Scollega e reimposta
          </button>
        </div>
      </div>
    </div>
  );
}
