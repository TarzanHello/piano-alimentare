import React from 'react';
const { useState, useEffect, useMemo, useCallback } = React;
import { DB, INGREDIENTS, ING_MAP, calcMacroEditor, cercaIngredienti,
         quantitaInGrammi } from '@/core';
import { EmptyState } from '@/components/shared';
import { caricaRicette, creaRicetta, aggiornaRicetta, eliminaRicetta,
         toggleEsclusaRicetta } from '@/db/ricetteCloud';

const CAT = [
  { key: "colazione", label: "Colazione", icon: "🌅" },
  { key: "pranzo",    label: "Pranzo",    icon: "🍝" },
  { key: "cena",      label: "Cena",      icon: "🍽️" },
  { key: "spuntino",  label: "Spuntino",  icon: "🍎" },
];
const catMeta = k => CAT.find(c => c.key === k) || { label: k, icon: "🍴" };

const UNIT_OPTIONS = [
  { value: "g",         label: "g" },
  { value: "ml",        label: "ml" },
  { value: "pz",        label: "pz" },
  { value: "cucchiaio", label: "cucch." },
];

const card   = { background:"#fff", borderRadius:16, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.08)", marginBottom:12 };
const btnPrimary = { padding:"12px 16px", borderRadius:12, border:"none", fontWeight:700, color:"#fff", background:"#2563eb", cursor:"pointer" };
const btnGhost   = { padding:"8px 12px", borderRadius:10, border:"1px solid #cbd5e1", background:"#fff", color:"#475569", fontWeight:600, cursor:"pointer" };

// Ratio medi catalogo per inferire slot donna/bimbo
const RATIO_DONNA = 0.74;
const RATIO_BIMBO = 0.41;

function arrotondaSlot(v, unit) {
  if (unit === "g" || unit === "ml") return Math.max(5, Math.round(v / 5) * 5);
  return Math.round(v * 2) / 2;
}

// Calcola macro da quantita {ing_id:{uomo,donna,bimbo,unit}} per uno slot
function macroSlot(quantita, persona) {
  if (!quantita || typeof quantita !== 'object') return { kcal:0, p:0, c:0, g:0 };
  const tot = { kcal:0, p:0, c:0, g:0 };
  for (const [ingId, v] of Object.entries(quantita)) {
    const q = v[persona] ?? v.uomo ?? 0;
    const grams = quantitaInGrammi(ingId, q, v.unit || "g");
    const ing = ING_MAP[ingId];
    if (!ing?.nutri) continue;  // ingrediente sconosciuto → skip (no crash)
    const n = ing.nutri;
    tot.kcal += (n.kcal/100)*grams; tot.p += (n.p/100)*grams;
    tot.c += (n.c/100)*grams; tot.g += (n.g/100)*grams;
  }
  return { kcal:Math.round(tot.kcal), p:Math.round(tot.p),
           c:Math.round(tot.c), g:Math.round(tot.g) };
}

// IngRow è definito QUI, fuori da EditorRicetta, per evitare che React
// lo ricrei ad ogni render del padre (causando perdita del focus sull'input).
function IngRow({ id, v, onSetQta, onSetUnit, onRimuovi }) {
  const ing = ING_MAP[id];
  const [espanso, setEspanso] = React.useState(false);
  return (
    <div style={{ borderBottom:"1px solid #f5f7fa", paddingBottom:8, marginBottom:8 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0" }}>
        <span style={{ flex:1, fontSize:14, fontWeight:600 }}>{ing?.nome || id}</span>
        <select value={v.unit} onChange={e => onSetUnit(id, e.target.value)}
          style={{ fontSize:12, border:"1px solid #e2e8f0", borderRadius:6, padding:"4px 6px", background:"#f8fafc" }}>
          {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
        <button onClick={() => onRimuovi(id)}
          style={{ border:"none", background:"transparent", color:"#ef4444", cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
        <span style={{ fontSize:11, color:"#64748b", width:46 }}>👤 uomo</span>
        <input type="number" value={v.uomo} min={0} step={v.unit==="g"||v.unit==="ml"?5:0.5}
          onChange={e => onSetQta(id, "uomo", e.target.value)}
          style={{ width:72, border:"1px solid #e2e8f0", borderRadius:8, padding:"5px 8px", fontSize:14, textAlign:"right" }}/>
        <span style={{ fontSize:12, color:"#94a3b8" }}>{v.unit}</span>
        <button onClick={() => setEspanso(!espanso)}
          style={{ marginLeft:"auto", border:"none", background:"transparent", color:"#94a3b8", fontSize:11, cursor:"pointer" }}>
          {espanso ? "▲ slot" : "▼ slot"}
        </button>
      </div>
      {espanso && (
        <div style={{ paddingLeft:8, borderLeft:"2px solid #f1f5f9" }}>
          {[["donna","👩"],["bimbo","🧒"]].map(([p, emoji]) => (
            <div key={p} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
              <span style={{ fontSize:11, color:"#64748b", width:46 }}>{emoji} {p}</span>
              <input type="number" value={v[p]} min={0} step={v.unit==="g"||v.unit==="ml"?5:0.5}
                onChange={e => onSetQta(id, p, e.target.value)}
                style={{ width:72, border:"1px solid #e2e8f0", borderRadius:8, padding:"4px 8px", fontSize:13, textAlign:"right" }}/>
              <span style={{ fontSize:12, color:"#94a3b8" }}>{v.unit}</span>
              <span style={{ fontSize:10, color:"#cbd5e1", marginLeft:4 }}>
                ({macroSlot({[id]: {...v, uomo: v[p]}}, "uomo").kcal} kcal)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Editor ricetta unificato ──────────────────────────────────────────
function EditorRicetta({ iniziale, onSalva, onAnnullaTutto }) {
  const [titolo, setTitolo]   = useState(iniziale?.titolo || "");
  const [descr, setDescr]     = useState(iniziale?.descrizione || "");
  const [categoria, setCat]   = useState(iniziale?.categoria || "pranzo");
  const [prep, setPrep]       = useState(iniziale?.prep ?? "");
  const [query, setQuery]     = useState("");
  const [errore, setErrore]   = useState("");

  // Ingredienti nel formato nuovo: { [ingId]: { uomo, donna, bimbo, unit } }
  const [ings, setIngs] = useState(() => {
    // Carica da quantita (nuovo) o ingredienti (vecchio) se in modifica
    if (iniziale?.quantita && Object.keys(iniziale.quantita).length > 0) {
      return { ...iniziale.quantita };
    }
    const o = {};
    (iniziale?.ingredienti || []).forEach(it => {
      if (!it?.ing) return;
      const unit = it.unit || "g";
      const uomo = Number(it.g) || 0;
      o[it.ing] = {
        uomo,
        donna: arrotondaSlot(uomo * RATIO_DONNA, unit),
        bimbo: arrotondaSlot(uomo * RATIO_BIMBO, unit),
        unit,
      };
    });
    return o;
  });

  const risultatiRicerca = useMemo(() => {
    if (!query.trim()) return [];
    return cercaIngredienti(query, INGREDIENTS, Object.keys(ings)).slice(0, 12);
  }, [query, ings]);

  const macroUomo  = useMemo(() => macroSlot(ings, "uomo"),  [ings]);
  const macroDonna = useMemo(() => macroSlot(ings, "donna"), [ings]);
  const macroBimbo = useMemo(() => macroSlot(ings, "bimbo"), [ings]);

  const aggiungi = (ing) => {
    const unit = ing.pesoPezzoG ? "pz" : "g";
    const uomo = ing.pesoPezzoG ? 1 : 100;
    setIngs(p => ({ ...p, [ing.id]: {
      uomo,
      donna: arrotondaSlot(uomo * RATIO_DONNA, unit),
      bimbo: arrotondaSlot(uomo * RATIO_BIMBO, unit),
      unit,
    }}));
    setQuery("");
  };

  const rimuovi = (id) => setIngs(p => { const n = {...p}; delete n[id]; return n; });

  const setQta = (id, persona, val) => {
    const v = parseFloat(val) || 0;
    setIngs(p => {
      const entry = { ...p[id], [persona]: Math.max(0, v) };
      // Se si modifica uomo, ricalcola donna/bimbo proporzionalmente
      if (persona === "uomo" && p[id].uomo > 0) {
        const ratio = v / p[id].uomo;
        entry.donna = arrotondaSlot(p[id].donna * ratio, p[id].unit);
        entry.bimbo = arrotondaSlot(p[id].bimbo * ratio, p[id].unit);
      }
      return { ...p, [id]: entry };
    });
  };

  const setUnit = (id, unit) => {
    setIngs(p => {
      // Converte la quantità uomo quando cambia unità
      const prev = p[id];
      let uomo = prev.uomo;
      // g ↔ pz: converti tramite pesoPezzoG
      const ing = ING_MAP[id];
      if (prev.unit === "g" && unit === "pz" && ing?.pesoPezzoG) {
        uomo = Math.max(0.5, Math.round((uomo / ing.pesoPezzoG) * 2) / 2);
      } else if (prev.unit === "pz" && unit === "g" && ing?.pesoPezzoG) {
        uomo = Math.max(5, Math.round((uomo * ing.pesoPezzoG) / 5) * 5);
      }
      return { ...p, [id]: {
        uomo,
        donna: arrotondaSlot(uomo * RATIO_DONNA, unit),
        bimbo: arrotondaSlot(uomo * RATIO_BIMBO, unit),
        unit,
      }};
    });
  };

  const salva = () => {
    const t = titolo.trim();
    if (t.length < 2) { setErrore("Dai un titolo alla ricetta (min 2 caratteri)."); return; }
    if (Object.keys(ings).length === 0) { setErrore("Aggiungi almeno un ingrediente."); return; }
    if (!categoria) { setErrore("Seleziona una categoria."); return; }
    // Costruisci anche il vecchio formato ingredienti per retrocompatibilità
    const ingredienti = Object.entries(ings).map(([ing, v]) => ({ ing, g: v.uomo, unit: v.unit }));
    onSalva({
      id: iniziale?.id,
      titolo: t,
      descrizione: descr.trim(),
      categoria,
      prep: prep !== "" ? parseInt(prep) || null : null,
      quantita: ings,      // formato nuovo
      ingredienti,         // retrocompatibilità
      kcal: macroUomo.kcal,
      p: macroUomo.p,
      c: macroUomo.c,
      g: macroUomo.g,
    });
  };

  const IngRowProps = { onSetQta: setQta, onSetUnit: setUnit, onRimuovi: rimuovi };

  return (
    <div style={{ padding:"8px 16px 100px", maxWidth:600, margin:"0 auto" }}>
      <h2 style={{ fontSize:19, fontWeight:700, margin:"6px 0 12px" }}>
        {iniziale?.id ? "Modifica ricetta" : "Nuova ricetta"}
      </h2>

      <div style={card}>
        <input value={titolo} onChange={e => setTitolo(e.target.value)} placeholder="Titolo della ricetta"
          maxLength={80} style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 12px", fontSize:15, marginBottom:10, boxSizing:"border-box" }}/>
        <textarea value={descr} onChange={e => setDescr(e.target.value)} placeholder="Descrizione (facoltativa)"
          maxLength={500} rows={2} style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 12px", fontSize:14, resize:"vertical", marginBottom:10, boxSizing:"border-box" }}/>

        {/* Categoria */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
          {CAT.map(c => (
            <button key={c.key} onClick={() => setCat(c.key)}
              style={{ ...btnGhost, fontSize:12, padding:"6px 10px",
                background: categoria===c.key ? "#dbeafe" : "#fff",
                borderColor: categoria===c.key ? "#2563eb" : "#cbd5e1",
                color: categoria===c.key ? "#1d4ed8" : "#475569" }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        {/* Tempo preparazione */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:13, color:"#64748b" }}>⏱ Preparazione</span>
          <input type="number" value={prep} onChange={e => setPrep(e.target.value)} min={1} max={180}
            placeholder="—" style={{ width:64, border:"1px solid #e2e8f0", borderRadius:8, padding:"6px 8px", fontSize:14, textAlign:"right" }}/>
          <span style={{ fontSize:12, color:"#94a3b8" }}>minuti</span>
        </div>
      </div>

      {/* Ingredienti */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:8 }}>Ingredienti</div>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Cerca ingrediente (es. pollo, avena, uova)…"
          style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 12px", fontSize:14, boxSizing:"border-box" }}/>
        {risultatiRicerca.length > 0 && (
          <div style={{ marginTop:8, border:"1px solid #eef2f7", borderRadius:10, overflow:"hidden" }}>
            {risultatiRicerca.map(ing => (
              <button key={ing.id} onClick={() => aggiungi(ing)}
                style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 12px", border:"none", borderBottom:"1px solid #f1f5f9", background:"#fff", cursor:"pointer", fontSize:14 }}>
                {ing.nome} <span style={{ color:"#94a3b8", fontSize:12 }}>· {ing.cat}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop:12 }}>
          {Object.entries(ings).map(([id, v]) => <IngRow key={id} id={id} v={v} {...IngRowProps}/>)}
        </div>
      </div>

      {/* Macro live per slot */}
      {Object.keys(ings).length > 0 && (
        <div style={card}>
          <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:0.6, marginBottom:8 }}>Macro calcolati</div>
          {[["👤 Uomo", macroUomo, "#2563eb"], ["👩 Donna", macroDonna, "#7c3aed"], ["🧒 Bimbo", macroBimbo, "#059669"]].map(([label, m, col]) => (
            <div key={label} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <span style={{ fontSize:12, color:"#64748b", width:72 }}>{label}</span>
              <span style={{ fontWeight:800, color:col, fontSize:14, width:60, fontFamily:"monospace" }}>{m.kcal} kcal</span>
              <span style={{ fontSize:12, color:"#94a3b8" }}>P{m.p} C{m.c} G{m.g}</span>
            </div>
          ))}
        </div>
      )}

      {errore && <div style={{ color:"#dc2626", fontSize:13, marginBottom:10 }}>{errore}</div>}

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={salva} style={{ ...btnPrimary, flex:1 }}>
          {iniziale?.id ? "Salva modifiche" : "Crea ricetta"}
        </button>
        <button onClick={onAnnullaTutto} style={btnGhost}>Annulla</button>
      </div>
    </div>
  );
}

// ── Card ricetta utente ───────────────────────────────────────────────
function CardRicetta({ r, mine, onEdit, onDelete, onDuplica, onToggleEsclusa }) {
  const [espanso, setEspanso] = useState(false);
  const m = catMeta(r.categoria);
  const macroUomo = r.quantita ? macroSlot(r.quantita, "uomo")
    : { kcal: Math.round(r.kcal||0), p: Math.round(r.p||0), c: Math.round(r.c||0), g: Math.round(r.g||0) };
  const prep = r.prep;
  const prepLabel = !prep ? null : prep >= 60 ? `${Math.round(prep/60)}h` : `${prep}'`;
  return (
    <div style={{ ...card, opacity: r.esclusa ? 0.65 : 1 }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
            <span style={{ fontWeight:700, fontSize:15 }}>{m.icon} {r.titolo}</span>
            {prepLabel && <span style={{ fontSize:11, color:"#64748b", background:"#f1f5f9", borderRadius:6, padding:"1px 6px" }}>⏱{prepLabel}</span>}
            {r.esclusa && <span style={{ fontSize:10, background:"#fef2f2", color:"#dc2626", borderRadius:6, padding:"1px 6px", fontWeight:700 }}>🚫 esclusa</span>}
          </div>
          {r.descrizione && <div style={{ fontSize:13, color:"#64748b", marginBottom:4 }}>{r.descrizione}</div>}
          <div style={{ fontSize:12, color:"#94a3b8" }}>
            {macroUomo.kcal} kcal · P{macroUomo.p} C{macroUomo.c} G{macroUomo.g}
            <span style={{ marginLeft:6, fontSize:10 }}>(taglia uomo)</span>
          </div>
        </div>
        <button onClick={() => setEspanso(!espanso)}
          style={{ border:"none", background:"transparent", color:"#94a3b8", fontSize:18, cursor:"pointer", padding:"2px 4px" }}>
          {espanso ? "▲" : "▼"}
        </button>
      </div>

      {/* Ingredienti espansi */}
      {espanso && r.quantita && (
        <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid #f1f5f9", fontSize:12, color:"#64748b", lineHeight:1.8 }}>
          {Object.entries(r.quantita).map(([id, v]) => {
            const ing = ING_MAP[id];
            const nomeLow = ing ? ing.nome.toLowerCase() : id;
            const unit = v.unit || "g";
            const qty = unit==="g"||unit==="ml" ? Math.round(v.uomo)+unit : (v.uomo===0.5?"½":v.uomo)+" "+unit;
            return <div key={id}>{qty} {nomeLow}</div>;
          })}
        </div>
      )}

      {/* Azioni */}
      <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
        {mine && <button onClick={onEdit} style={{ ...btnGhost, fontSize:12, padding:"5px 9px" }}>✏️ Modifica</button>}
        <button onClick={onDuplica} style={{ ...btnGhost, fontSize:12, padding:"5px 9px" }}>📋 Duplica</button>
        <button onClick={onToggleEsclusa}
          style={{ ...btnGhost, fontSize:12, padding:"5px 9px",
            background: r.esclusa ? "#f0fdf4" : "#fff",
            borderColor: r.esclusa ? "#86efac" : "#cbd5e1",
            color: r.esclusa ? "#16a34a" : "#475569" }}>
          {r.esclusa ? "✅ Nel piano" : "🚫 Escludi piano"}
        </button>
        {mine && <button onClick={onDelete}
          style={{ ...btnGhost, fontSize:12, padding:"5px 9px", color:"#ef4444", borderColor:"#fecaca" }}>
          🗑️
        </button>}
      </div>
    </div>
  );
}

// ── Card ricetta catalogo ─────────────────────────────────────────────
function CardCatalogo({ r, onEscludi, esclusa }) {
  const [espanso, setEspanso] = useState(false);
  const m = r.uomo || { kcal:0, p:0, c:0, g:0 };
  const prep = r.prep;
  const prepColor = !prep ? "#94a3b8" : prep<=15 ? "#16a34a" : prep<=30 ? "#d97706" : "#dc2626";
  const prepBg    = !prep ? "#f8fafc"  : prep<=15 ? "#f0fdf4" : prep<=30 ? "#fffbeb" : "#fef2f2";
  const prepLabel = !prep ? "—" : prep>=60 ? `${prep/60}h` : `${prep}'`;
  return (
    <div style={{ ...card, padding:"10px 12px", marginBottom:7, opacity: esclusa ? 0.6 : 1 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ flexShrink:0, width:40, height:40, borderRadius:9, background:prepBg, border:`1.5px solid ${prepColor}30`, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:11, fontWeight:800, color:prepColor }}>⏱{prepLabel}</span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:13, lineHeight:1.3 }}>
            {r.nome}
            {esclusa && <span style={{ marginLeft:6, fontSize:10, background:"#fef2f2", color:"#dc2626", borderRadius:5, padding:"1px 5px" }}>esclusa</span>}
          </div>
          <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>
            {Math.round(m.kcal)} kcal · P{Math.round(m.p)} C{Math.round(m.c)} G{Math.round(m.g)}
          </div>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          <button onClick={() => setEspanso(!espanso)}
            style={{ border:"none", background:"transparent", color:"#94a3b8", fontSize:14, cursor:"pointer" }}>
            {espanso ? "▲" : "▼"}
          </button>
        </div>
      </div>
      {espanso && r.quantita && (
        <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid #f1f5f9", fontSize:12, color:"#64748b", lineHeight:1.8 }}>
          {Object.entries(r.quantita).map(([id, v]) => {
            const ing = ING_MAP[id];
            const nomeLow = ing ? ing.nome.toLowerCase() : id;
            const unit = v.unit || "g";
            const qty = unit==="g"||unit==="ml" ? Math.round(v.uomo)+unit : (v.uomo===0.5?"½":v.uomo)+" "+unit;
            return <div key={id}>{qty} {nomeLow}</div>;
          })}
        </div>
      )}
    </div>
  );
}

// ── Pagina principale ────────────────────────────────────────────────
export function RicettePage({ cloudStatus, onRicetteChange }) {
  const [vista, setVista]     = useState("lista");   // "lista" | "editor"
  const [tab, setTab]         = useState("mie");     // "mie" | "famiglia" | "catalogo"
  const [catAperte, setCatAperte] = useState({});
  const [editing, setEditing] = useState(null);
  const [ricette, setRicette] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore]   = useState("");

  const collegato = cloudStatus?.loggedIn;

  const ricarica = useCallback(async () => {
    if (!collegato) { setRicette([]); setLoading(false); return; }
    setLoading(true);
    try { setRicette(await caricaRicette()); setErrore(""); }
    catch { setErrore("Impossibile caricare le ricette dal cloud."); }
    setLoading(false);
  }, [collegato]);

  useEffect(() => { ricarica(); }, [ricarica]);

  const mie       = ricette.filter(r => r.isMine);
  const diFamiglia = ricette.filter(r => !r.isMine);

  const salva = async (dati) => {
    try {
      if (dati.id) await aggiornaRicetta(dati.id, dati);
      else await creaRicetta(dati);
      setVista("lista"); setEditing(null);
      await ricarica();
      onRicetteChange?.();  // notifica App.jsx: il pool del piano deve aggiornarsi
    } catch (e) { setErrore(e.message || "Errore nel salvataggio."); }
  };

  const duplica = async (r) => {
    try {
      await creaRicetta({ ...r, titolo: r.titolo + " (copia)", id: undefined });
      await ricarica();
      onRicetteChange?.();
    } catch (e) { setErrore(e.message || "Errore nella duplicazione."); }
  };

  const toggleEsclusa = async (r) => {
    try {
      await toggleEsclusaRicetta(r.id, !r.esclusa);
      await ricarica();
      onRicetteChange?.();
    } catch (e) { setErrore(e.message || "Errore."); }
  };

  if (vista === "editor") {
    return <EditorRicetta iniziale={editing} onSalva={salva}
      onAnnullaTutto={() => { setVista("lista"); setEditing(null); }}/>;
  }

  return (
    <div style={{ padding:"16px 16px 100px", maxWidth:600, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <h2 style={{ fontSize:20, fontWeight:700, margin:0 }}>📖 Ricette</h2>
        {collegato && (tab==="mie"||tab==="famiglia") &&
          <button onClick={() => { setEditing(null); setVista("editor"); }} style={btnPrimary}>+ Nuova</button>}
      </div>

      {/* Tab switcher */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        {[["mie","👤 Mie"],["famiglia","👨‍👩‍👧 Famiglia"],["catalogo","📚 Catalogo"]].map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ ...btnGhost, flex:1, fontSize:12,
              background: tab===key ? "#dbeafe" : "#fff",
              borderColor: tab===key ? "#2563eb" : "#cbd5e1",
              color: tab===key ? "#1d4ed8" : "#475569" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Le mie ricette ── */}
      {tab === "mie" && (
        <>
          {!collegato
            ? <EmptyState emoji="☁️" title="Collegati per le ricette"
                text="Le ricette personali sono salvate sul cloud. Accedi col tuo account per crearle."/>
            : loading
              ? <div style={{ color:"#94a3b8", fontSize:14, padding:20, textAlign:"center" }}>Caricamento…</div>
              : <>
                  {errore && <div style={{ color:"#dc2626", fontSize:13, marginBottom:10 }}>{errore}</div>}
                  {mie.length === 0
                    ? <EmptyState emoji="🍴" title="Nessuna ricetta tua"
                        text="Tocca + Nuova per creare la tua prima ricetta come combinazione di ingredienti. Entrerà automaticamente nel piano."/>
                    : mie.map(r => (
                        <CardRicetta key={r.id} r={r} mine
                          onEdit={() => { setEditing(r); setVista("editor"); }}
                          onDelete={async () => {
                            if (confirm("Eliminare questa ricetta?")) {
                              await eliminaRicetta(r.id); ricarica();
                            }
                          }}
                          onDuplica={() => duplica(r)}
                          onToggleEsclusa={() => toggleEsclusa(r)}/>
                      ))}
                </>
          }
        </>
      )}

      {/* ── Tab: Famiglia ── */}
      {tab === "famiglia" && (
        <>
          {!collegato
            ? <EmptyState emoji="☁️" title="Collegati per vedere le ricette di famiglia"
                text="Le ricette dei tuoi familiari sono visibili solo quando sei connesso."/>
            : loading
              ? <div style={{ color:"#94a3b8", fontSize:14, padding:20, textAlign:"center" }}>Caricamento…</div>
              : <>
                  {errore && <div style={{ color:"#dc2626", fontSize:13, marginBottom:10 }}>{errore}</div>}
                  {diFamiglia.length === 0
                    ? <EmptyState emoji="👨‍👩‍👧" title="Nessuna ricetta di famiglia"
                        text="Quando un membro della famiglia crea una ricetta, la trovi qui."/>
                    : diFamiglia.map(r => (
                        <CardRicetta key={r.id} r={r}
                          onDuplica={() => duplica(r)}
                          onToggleEsclusa={() => toggleEsclusa(r)}/>
                      ))}
                </>
          }
        </>
      )}

      {/* ── Tab: Catalogo CRA-NUT ── */}
      {tab === "catalogo" && (
        <>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:12, lineHeight:1.5 }}>
            166 ricette del catalogo CRA-NUT, organizzate per pasto.
            Le macro si adattano al profilo di ciascun membro della famiglia.
            Puoi duplicare una ricetta per personalizzarla.
          </div>
          {CAT.map(c => {
            const ricetteCat = DB[c.key] || [];
            const aperta = catAperte[c.key] ?? false;
            return (
              <div key={c.key} style={{ marginBottom:10 }}>
                <button onClick={() => setCatAperte(p => ({ ...p, [c.key]: !aperta }))}
                  style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"12px 14px", borderRadius:12, border:"1px solid #e2e8f0",
                    background:"#fff", cursor:"pointer", fontWeight:700, fontSize:14, color:"#1e293b" }}>
                  <span>{c.icon} {c.label} <span style={{ color:"#94a3b8", fontWeight:600, fontSize:12 }}>· {ricetteCat.length} ricette</span></span>
                  <span style={{ color:"#cbd5e1", fontSize:11 }}>{aperta ? "▲" : "▼"}</span>
                </button>
                {aperta && (
                  <div style={{ marginTop:8 }}>
                    {ricetteCat.map(r => (
                      <CardCatalogo key={r.id} r={r}
                        onDuplica={() => duplica({
                          titolo: r.nome,
                          categoria: r.categoria || c.key,
                          prep: r.prep,
                          quantita: r.quantita,
                          ingredienti: [],
                          kcal: r.uomo?.kcal||0, p: r.uomo?.p||0,
                          c: r.uomo?.c||0, g: r.uomo?.g||0,
                        })}/>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
