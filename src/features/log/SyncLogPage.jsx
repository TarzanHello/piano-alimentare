import React from 'react';
const { useState, useEffect, useMemo } = React;
import { getSyncLog, clearSyncLog, onSyncLogChange } from '@/db/synclog';
import { getCloudMe, riallineaForzato } from '@/db/sync';

const LEVEL_META = {
  // Sincronizzazione cloud
  info:            { icon: "ℹ️",  color: "#6E8576" },
  status:          { icon: "🔌",  color: "#2F6B3A" },
  update:          { icon: "📥",  color: "#7c3aed" },
  push:            { icon: "⬆️",  color: "#0891b2" },
  "push-schedule": { icon: "⏳",  color: "#9DB1A2" },
  pull:            { icon: "⬇️",  color: "#0891b2" },
  realtime:        { icon: "📡",  color: "#7c3aed" },
  // Motore nutrizionale
  calc:            { icon: "🧮",  color: "#16a34a" },
  scale:           { icon: "⚖️",  color: "#16a34a" },
  plan:            { icon: "🎲",  color: "#16a34a" },
  swap:            { icon: "🔄",  color: "#16a34a" },
  "piano-persona": { icon: "🧩",  color: "#16a34a" },
  // Azioni utente
  "nav":           { icon: "🧭",  color: "#4A6152" },  // navigazione pagine
  "persona":       { icon: "👤",  color: "#2F6B3A" },  // modifica/aggiunta/rimozione profili
  "misure":        { icon: "📏",  color: "#7c3aed" },  // inserimento misurazioni
  "pasto-log":     { icon: "✅",  color: "#16a34a" },  // segna pasto consumato
  "acqua":         { icon: "💧",  color: "#0ea5e9" },  // tracciamento acqua
  "spesa":         { icon: "🛒",  color: "#d97706" },  // lista spesa
  "ricetta":       { icon: "📖",  color: "#db2777" },  // CRUD ricette
  "esclusione":    { icon: "🚫",  color: "#dc2626" },  // ingredienti esclusi
  "gusti":         { icon: "❤️",  color: "#f43f5e" },  // preferenze/like
  "opzioni":       { icon: "⚙️",  color: "#4A6152" },  // impostazioni/notifiche
  "storage":       { icon: "💾",  color: "#9DB1A2" },  // lettura/scrittura locale
  // Famiglia
  family:          { icon: "👨‍👩‍👧", color: "#7c3aed" },
  auth:            { icon: "🔐",  color: "#2F6B3A" },  // login/logout/sessione
  // Problemi
  warn:            { icon: "⚠️",  color: "#d97706" },
  error:           { icon: "⛔",  color: "#dc2626" },
};

const FILTERS = [
  { key: "all",      label: "Tutto" },
  { key: "azioni",   label: "Azioni utente" },
  { key: "motore",   label: "Motore" },
  { key: "sync",     label: "Push / Pull" },
  { key: "family",   label: "Famiglia" },
  { key: "realtime", label: "Realtime" },
  { key: "problemi", label: "⚠️ Errori" },
];

function matchesFilter(entry, filter) {
  const l = entry.level;
  switch (filter) {
    case "azioni":   return ["nav","persona","misure","pasto-log","acqua","spesa","ricetta","esclusione","gusti","opzioni","storage","auth"].includes(l);
    case "motore":   return ["calc","scale","plan","swap","piano-persona"].includes(l);
    case "sync":     return ["push","pull","push-schedule","update","info","status"].includes(l);
    case "family":   return ["family","auth"].includes(l);
    case "realtime": return l === "realtime";
    case "problemi": return ["warn","error"].includes(l);
    default:         return true;
  }
}

function fmtTime(t) {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function entryToLine(e) {
  let line = `[${fmtTime(e.t)}] ${(e.level || "info").toUpperCase()} — ${e.msg}`;
  if (e.data !== undefined) {
    try { line += " " + JSON.stringify(e.data); } catch {}
  }
  return line;
}

export function SyncLogPage({ cloudStatus }) {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const me = getCloudMe();

  const reload = async () => { const l = await getSyncLog(); setLogs(l); };

  useEffect(() => {
    reload();
    return onSyncLogChange(reload);
  }, []);

  const filtered = useMemo(() => logs.filter(e => matchesFilter(e, filter)), [logs, filter]);
  const ordered = useMemo(() => [...filtered].reverse(), [filtered]); // più recenti in alto

  const fullText = useMemo(() => {
    const header = [
      "Fitsy — Log sincronizzazione",
      `Generato: ${new Date().toLocaleString("it-IT")}`,
      `Stato: collegato=${cloudStatus?.loggedIn ? "sì" : "no"}  in famiglia=${cloudStatus?.inFamily ? "sì" : "no"}`,
      me ? `Profilo: ${me.profiloId}` : null,
      me ? `Famiglia: ${me.famigliaId}` : null,
      "─".repeat(48),
    ].filter(Boolean).join("\n");
    const body = logs.length ? logs.map(entryToLine).join("\n") : "(nessun evento registrato)";
    return header + "\n" + body;
  }, [logs, cloudStatus, me]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setMsg("✓ Copiato negli appunti");
    } catch {
      try {
        const ta = document.getElementById("pf-synclog-textarea");
        ta.focus(); ta.select();
        if (ta.setSelectionRange) ta.setSelectionRange(0, ta.value.length);
        document.execCommand("copy");
        setMsg("✓ Copiato negli appunti");
      } catch {
        setMsg("✗ Copia automatica non riuscita: seleziona il testo qui sotto e copia manualmente");
      }
    }
    setTimeout(() => setMsg(""), 2500);
  };

  const onClear = async () => {
    await clearSyncLog();
    setMsg("Registro svuotato");
    setTimeout(() => setMsg(""), 1500);
  };

  const onRiallinea = async () => {
    setBusy(true);
    try { await riallineaForzato(); } catch {}
    setBusy(false);
  };

  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E7EDE2", padding: "16px", marginBottom: 14, boxShadow: "0 2px 10px #0000000a" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#15251C", marginBottom: 4 }}>📡 Log sincronizzazione</div>
        <div style={{ fontSize: 11, color: "#6E8576", lineHeight: 1.6, marginBottom: 10 }}>
          Traccia in tempo reale cosa fanno la sincronizzazione cloud (login, push, pull, eventi realtime) e il motore (calcolo calorie 🧮 e scaling ingredienti ⚖️).
          Utile per confrontare due dispositivi: apri questa pagina su entrambi e osserva cosa succede quando
          modifichi qualcosa su uno dei due.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11, fontWeight: 700 }}>
          <span style={{ padding: "4px 9px", borderRadius: 7, background: cloudStatus?.loggedIn ? "#f0fdf4" : "#fef2f2", color: cloudStatus?.loggedIn ? "#16a34a" : "#dc2626" }}>
            {cloudStatus?.loggedIn ? "✓ Collegato" : "✗ Non collegato"}
          </span>
          <span style={{ padding: "4px 9px", borderRadius: 7, background: cloudStatus?.inFamily ? "#f0fdf4" : "#EFF3EC", color: cloudStatus?.inFamily ? "#16a34a" : "#9DB1A2" }}>
            {cloudStatus?.inFamily ? "✓ In famiglia" : "Nessuna famiglia"}
          </span>
          {me && <span style={{ padding: "4px 9px", borderRadius: 7, background: "#EDF7EF", color: "#2F6B3A", fontFamily: "monospace" }}>profilo {String(me.profiloId).slice(0, 8)}…</span>}
          {me && <span style={{ padding: "4px 9px", borderRadius: 7, background: "#EDF7EF", color: "#2F6B3A", fontFamily: "monospace" }}>famiglia {String(me.famigliaId).slice(0, 8)}…</span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={copyAll} style={{ flex: "1 1 auto", padding: "10px 14px", borderRadius: 10, border: "none", background: "#2F6B3A", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
          📋 Copia tutto
        </button>
        <button onClick={onRiallinea} disabled={busy || !cloudStatus?.inFamily}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid #B7E0C4", background: "#EDF7EF", color: "#2F6B3A", fontWeight: 800, fontSize: 12, cursor: "pointer", opacity: (busy || !cloudStatus?.inFamily) ? 0.5 : 1 }}>
          {busy ? "⏳ …" : "🔄 Riallinea ora"}
        </button>
        <button onClick={onClear} style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid #fed7aa", background: "#fff7ed", color: "#c2410c", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
          🗑️ Svuota
        </button>
      </div>
      {msg && <div style={{ fontSize: 11, fontWeight: 700, color: msg.startsWith("✓") ? "#16a34a" : "#b91c1c", marginBottom: 10 }}>{msg}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: "5px 11px", borderRadius: 20, border: "1.5px solid " + (filter === f.key ? "#2F6B3A" : "#E7EDE2"), background: filter === f.key ? "#EDF7EF" : "#fff", color: filter === f.key ? "#2F6B3A" : "#6E8576", fontWeight: 700, fontSize: 10.5, cursor: "pointer" }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E7EDE2", overflow: "hidden", marginBottom: 14 }}>
        {ordered.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", fontSize: 12, color: "#9DB1A2" }}>Nessun evento registrato finora.</div>
        ) : ordered.map((e, i) => {
          const meta = LEVEL_META[e.level] || { icon: "•", color: "#9DB1A2" };
          return (
            <div key={i} style={{ padding: "9px 14px", borderBottom: i < ordered.length - 1 ? "1px solid #EFF3EC" : "none",
              borderLeft: `3px solid ${meta.color}20` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{meta.icon}</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "#9DB1A2", flexShrink: 0 }}>{fmtTime(e.t)}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: meta.color, flexShrink: 0,
                  textTransform: "uppercase", letterSpacing: 0.4 }}>{e.level}</span>
                <span style={{ fontSize: 11.5, color: "#15251C", fontWeight: 600, flex: 1, minWidth: 0 }}>{e.msg}</span>
              </div>
              {e.data !== undefined && (
                <pre style={{ margin: "4px 0 0 30px", fontSize: 10, color: "#6E8576", background: "#F5F8F1",
                  borderRadius: 6, padding: "6px 8px", overflowX: "auto", fontFamily: "monospace" }}>
                  {JSON.stringify(e.data, null, 1)}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: "#9DB1A2", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
        Testo completo (per copia manuale)
      </div>
      <textarea id="pf-synclog-textarea" readOnly value={fullText} onFocus={e => e.target.select()}
        style={{ width: "100%", minHeight: 160, padding: "10px", borderRadius: 10, border: "1.5px solid #E7EDE2", fontFamily: "monospace", fontSize: 10.5, color: "#4A6152", resize: "vertical", boxSizing: "border-box" }} />
    </div>
  );
}
