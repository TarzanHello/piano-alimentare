import React, { useEffect, useRef, useState } from 'react';

// ── Pagina Diagnostica Sync ───────────────────────────────────
// Logga in tempo reale tutto ciò che il motore di sincronizzazione
// fa: pull, push, eventi Realtime, modifiche storage, errori.
// Usa: ☰ → Test Sync, fai le operazioni, copia il log e mandalo.

const DEVICE_NAME_KEY = "pf-diag-device-name";

function ts() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
}

export function SyncTestPage() {
  const [deviceName, setDeviceName] = useState(()=>localStorage.getItem(DEVICE_NAME_KEY)||"");
  const [logs, setLogs] = useState([]);
  const [active, setActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const logsRef = useRef([]);
  const cleanupRef = useRef([]);
  const endRef = useRef(null);

  const addLog = (tipo, msg, extra="") => {
    const entry = { ts: ts(), tipo, msg, extra };
    logsRef.current = [...logsRef.current, entry];
    setLogs([...logsRef.current]);
  };

  const start = () => {
    if (active) return;
    logsRef.current = [];
    setLogs([]);
    setActive(true);
    const name = deviceName || "device";

    addLog("INFO", `=== LOG AVVIATO — ${name} ===`);
    addLog("INFO", `user agent: ${navigator.userAgent.slice(0,60)}`);

    // 1. Intercetta window.storage.set
    const origSet = window.storage.set.bind(window.storage);
    window.storage.set = async (key, value) => {
      const short = typeof value === "string" ? value.slice(0,80) : JSON.stringify(value).slice(0,80);
      addLog("STORAGE SET", key, short + (value?.length > 80 ? "…" : ""));
      return origSet(key, value);
    };
    cleanupRef.current.push(() => { window.storage.set = origSet; });

    // 2. Intercetta window.storage.get
    const origGet = window.storage.get.bind(window.storage);
    window.storage.get = async (key) => {
      const r = await origGet(key);
      return r;
    };
    cleanupRef.current.push(() => { window.storage.get = origGet; });

    // 3. Ascolta eventi pf-cloud-update
    const onUpdate = (e) => {
      const k = e.detail?.key || "?";
      const extra = k === "piano" ? ` seed=${e.detail?.seed}` : k === "spesa" ? "" : "";
      addLog("CLOUD→APP", `evento: ${k}${extra}`);
    };
    window.addEventListener("pf-cloud-update", onUpdate);
    cleanupRef.current.push(() => window.removeEventListener("pf-cloud-update", onUpdate));

    // 4. Ascolta eventi pf-cloud-status
    const onStatus = (e) => {
      const s = e.detail || {};
      addLog("CLOUD STATUS", `loggedIn=${s.loggedIn} inFamily=${s.inFamily} realtime=${s.realtime||"?"}`);
    };
    window.addEventListener("pf-cloud-status", onStatus);
    cleanupRef.current.push(() => window.removeEventListener("pf-cloud-status", onStatus));

    // 5. Patch console.log e console.warn per catturare i log del sync
    const origLog = console.log;
    const origWarn = console.warn;
    console.log = (...args) => {
      origLog(...args);
      const msg = args.join(" ");
      if (msg.includes("[sync]")) addLog("SYNC", msg.replace("[sync]","").trim());
    };
    console.warn = (...args) => {
      origWarn(...args);
      const msg = args.join(" ");
      if (msg.includes("[sync]") || msg.includes("sync")) addLog("WARN", msg.slice(0,120));
    };
    cleanupRef.current.push(() => { console.log = origLog; console.warn = origWarn; });

    addLog("INFO", "monitoraggio attivo — esegui le operazioni di spesa/piano");
  };

  const stop = () => {
    setActive(false);
    cleanupRef.current.forEach(fn => { try { fn(); } catch {} });
    cleanupRef.current = [];
    addLog("INFO", "=== MONITORAGGIO FERMATO ===");
  };

  const copyLog = async () => {
    const name = deviceName || "device";
    const header = `=== LOG SYNC — ${name} — ${new Date().toLocaleString("it-IT")} ===\n`;
    const body = logsRef.current.map(l => `[${l.ts}] ${l.tipo.padEnd(14)} ${l.msg}${l.extra ? " | "+l.extra : ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(header + body);
      setCopied(true); setTimeout(()=>setCopied(false), 2000);
    } catch { alert(header + body); }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => () => { cleanupRef.current.forEach(fn => { try { fn(); } catch {} }); }, []);

  const colorFor = (tipo) => {
    if (tipo === "WARN" || tipo === "ERROR") return "#dc2626";
    if (tipo === "CLOUD→APP") return "#2563eb";
    if (tipo === "CLOUD STATUS") return "#7c3aed";
    if (tipo === "STORAGE SET") return "#d97706";
    if (tipo === "SYNC") return "#16a34a";
    return "#475569";
  };

  return (
    <div>
      <div style={{fontSize:16,fontWeight:900,color:"#1e293b",marginBottom:4}}>🔬 Diagnostica Sync</div>
      <div style={{fontSize:11,color:"#94a3b8",marginBottom:14,lineHeight:1.5}}>
        Avvia il monitoraggio, esegui le operazioni (seleziona/deseleziona spesa, cambia piano), poi fermalo e copia il log. Fai la stessa cosa sull'altro device e manda entrambi i log.
      </div>

      {/* Nome device */}
      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
        <input value={deviceName} onChange={e=>{setDeviceName(e.target.value);localStorage.setItem(DEVICE_NAME_KEY,e.target.value);}}
          placeholder="Nome device (es. PC, Telefono Aureliano…)"
          style={{flex:1,padding:"9px 12px",borderRadius:9,border:"1.5px solid #e2e8f0",fontSize:12,fontWeight:600}}/>
      </div>

      {/* Controlli */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <button onClick={start} disabled={active||!deviceName.trim()}
          style={{padding:"10px 18px",borderRadius:10,border:"none",background:active||!deviceName.trim()?"#cbd5e1":"#16a34a",color:"#fff",fontWeight:800,fontSize:12,cursor:active||!deviceName.trim()?"default":"pointer"}}>
          ▶ Avvia monitoraggio
        </button>
        <button onClick={stop} disabled={!active}
          style={{padding:"10px 18px",borderRadius:10,border:"none",background:!active?"#cbd5e1":"#dc2626",color:"#fff",fontWeight:800,fontSize:12,cursor:!active?"default":"pointer"}}>
          ■ Ferma
        </button>
        <button onClick={copyLog} disabled={logs.length===0}
          style={{padding:"10px 18px",borderRadius:10,border:"none",background:logs.length===0?"#cbd5e1":"#2563eb",color:"#fff",fontWeight:800,fontSize:12,cursor:logs.length===0?"default":"pointer"}}>
          {copied?"✓ Copiato":"📋 Copia log"}
        </button>
        <button onClick={()=>{logsRef.current=[];setLogs([]);}}
          style={{padding:"10px 18px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",fontWeight:700,fontSize:12,cursor:"pointer"}}>
          🗑 Pulisci
        </button>
      </div>

      {/* Log */}
      <div style={{background:"#0f172a",borderRadius:12,padding:"12px 14px",minHeight:300,maxHeight:"60vh",overflowY:"auto",fontFamily:"monospace",fontSize:10.5,lineHeight:1.6}}>
        {logs.length === 0 && (
          <div style={{color:"#475569",fontStyle:"italic"}}>Nessun evento ancora. Avvia il monitoraggio e poi esegui le operazioni.</div>
        )}
        {logs.map((l,i)=>(
          <div key={i} style={{color:colorFor(l.tipo),marginBottom:1}}>
            <span style={{color:"#64748b"}}>[{l.ts}]</span>{" "}
            <span style={{color:colorFor(l.tipo),fontWeight:"bold"}}>{l.tipo.padEnd(14)}</span>{" "}
            <span style={{color:l.tipo==="INFO"?"#94a3b8":"#e2e8f0"}}>{l.msg}</span>
            {l.extra && <span style={{color:"#64748b"}}> | {l.extra}</span>}
          </div>
        ))}
        <div ref={endRef}/>
      </div>

      <div style={{marginTop:10,fontSize:10,color:"#94a3b8",lineHeight:1.5}}>
        <strong>Legenda colori:</strong>{" "}
        <span style={{color:"#16a34a"}}>verde = sync interno</span> ·{" "}
        <span style={{color:"#2563eb"}}>blu = evento cloud→app</span> ·{" "}
        <span style={{color:"#d97706"}}>arancio = scrittura storage</span> ·{" "}
        <span style={{color:"#7c3aed"}}>viola = stato cloud</span> ·{" "}
        <span style={{color:"#dc2626"}}>rosso = warning/errore</span>
      </div>
    </div>
  );
}
