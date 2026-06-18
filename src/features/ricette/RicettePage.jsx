import React from 'react';
const { useState, useEffect, useMemo, useCallback } = React;
import { DB, INGREDIENTS, ING_MAP, cercaIngredienti, quantitaInGrammi, nutriPerGrammi } from '@/core';
import { EmptyState } from '@/components/shared';
import { caricaRicette, creaRicetta, aggiornaRicetta, eliminaRicetta,
         toggleEsclusaRicetta } from '@/db/ricetteCloud';
import { logSync } from '@/db/synclog';

const CAT = [
  { key: "colazione", label: "Colazione", icon: "🌅" },
  { key: "pranzo",    label: "Pranzo",    icon: "🍝" },
  { key: "cena",      label: "Cena",      icon: "🍽️" },
  { key: "spuntino",  label: "Spuntino",  icon: "🍎" },
];
const catMeta = k => CAT.find(c => c.key === k) || { label: k, icon: "🍴" };

const UNIT_OPTIONS = [
  { value:"g",         label:"g"      },
  { value:"ml",        label:"ml"     },
  { value:"pz",        label:"pezzi"  },
  { value:"cucchiaio", label:"cucch." },
];

const card      = { background:"#fff", borderRadius:16, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.08)", marginBottom:12 };
const btnPrimary = { padding:"12px 16px", borderRadius:12, border:"none", fontWeight:700, color:"#fff", background:"#2563eb", cursor:"pointer" };
const btnGhost   = { padding:"8px 12px", borderRadius:10, border:"1px solid #cbd5e1", background:"#fff", color:"#475569", fontWeight:600, cursor:"pointer", fontSize:12 };

// ── Calcolo macro da quantita {ing_id: {g, unit}} (batch) ────────────────
function calcolaMacro(quantita) {
  if (!quantita || typeof quantita !== 'object') return { kcal:0, p:0, c:0, g_:0 };
  let kcal=0, p=0, c=0, g_=0;
  for (const [ingId, v] of Object.entries(quantita)) {
    const grams = quantitaInGrammi(ingId, v.g ?? v.uomo ?? 0, v.unit || "g");
    const ing = ING_MAP[ingId];
    if (!ing?.nutri) continue;
    const n = ing.nutri;
    kcal += (n.kcal/100)*grams; p += (n.p/100)*grams;
    c += (n.c/100)*grams; g_ += (n.g/100)*grams;
  }
  return { kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), g_: Math.round(g_) };
}

// Normalizza una quantita da qualsiasi formato verso {g, unit} per l'editor
function normalizzaQuantita(quantita) {
  if (!quantita) return {};
  const out = {};
  for (const [ingId, v] of Object.entries(quantita)) {
    if (ingId === '_scaled') continue;
    // Supporta sia vecchio {uomo,donna,bimbo,unit} che nuovo {g,unit}
    out[ingId] = { g: v.g ?? v.uomo ?? 0, unit: v.unit || "g" };
  }
  return out;
}

// Converte verso il formato con slot per il motore (mantiene uomo=donna=bimbo=g batch)
// Il motore scala comunque per il target calorico di ogni persona.
function quantitaPerCloud(quantitaEditor) {
  const out = {};
  for (const [ingId, v] of Object.entries(quantitaEditor)) {
    out[ingId] = { g: v.g, unit: v.unit };
  }
  return out;
}

// ── IngRow — fuori da EditorRicetta per evitare lost focus ───────────────
function IngRow({ id, v, onSetG, onSetUnit, onRimuovi }) {
  const ing = ING_MAP[id];
  const grams = quantitaInGrammi(id, v.g, v.unit || "g");
  const n = ing?.nutri;
  const kcalIng = n ? Math.round((n.kcal/100)*grams) : null;

  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:"1px solid #f5f7fa" }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:600, color:"#1e293b", lineHeight:1.2 }}>{ing?.nome || id}</div>
        {kcalIng !== null && <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>{kcalIng} kcal</div>}
      </div>
      <input type="number" value={v.g} min={0} step={v.unit==="g"||v.unit==="ml"?5:0.5}
        onChange={e => onSetG(id, parseFloat(e.target.value)||0)}
        style={{ width:70, border:"1px solid #e2e8f0", borderRadius:8, padding:"5px 8px",
                 fontSize:14, textAlign:"right", fontWeight:700 }}/>
      <select value={v.unit||"g"} onChange={e => onSetUnit(id, e.target.value)}
        style={{ fontSize:12, border:"1px solid #e2e8f0", borderRadius:6, padding:"4px 6px", background:"#f8fafc" }}>
        {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
      </select>
      <button onClick={() => onRimuovi(id)}
        style={{ border:"none", background:"transparent", color:"#ef4444", cursor:"pointer", fontSize:18, lineHeight:1, padding:"0 2px" }}>×</button>
    </div>
  );
}

// ── Editor ricetta ────────────────────────────────────────────────────────
function EditorRicetta({ iniziale, onSalva, onAnnulla }) {
  const [titolo, setTitolo]   = useState(iniziale?.titolo || "");
  const [descr, setDescr]     = useState(iniziale?.descrizione || "");
  const [categoria, setCat]   = useState(iniziale?.categoria || "pranzo");
  const [prep, setPrep]       = useState(iniziale?.prep ?? "");
  const [scope, setScope]     = useState(iniziale?.scope || "famiglia");
  const [query, setQuery]     = useState("");
  const [errore, setErrore]   = useState("");

  // Ingredienti: { [ingId]: { g: numero, unit: "g"|"ml"|"pz"|"cucchiaio" } }
  const [ings, setIngs] = useState(() => {
    if (iniziale?.quantita) return normalizzaQuantita(iniziale.quantita);
    if (iniziale?.ingredienti) {
      const o = {};
      (iniziale.ingredienti).forEach(it => {
        if (it?.ing) o[it.ing] = { g: it.g || 0, unit: it.unit || "g" };
      });
      return o;
    }
    return {};
  });

  const risultatiRicerca = useMemo(() => {
    if (!query.trim()) return [];
    return cercaIngredienti(query, INGREDIENTS, Object.keys(ings)).slice(0, 10);
  }, [query, ings]);

  const macro = useMemo(() => calcolaMacro(ings), [ings]);

  const aggiungi = (ing) => {
    const unit = ing.pesoPezzoG ? "pz" : "g";
    const g = ing.pesoPezzoG ? 1 : 100;
    setIngs(p => ({ ...p, [ing.id]: { g, unit } }));
    setQuery("");
  };

  const setG = (id, val) => setIngs(p => ({ ...p, [id]: { ...p[id], g: Math.max(0, val) } }));

  const setUnit = (id, unit) => {
    setIngs(p => {
      const prev = p[id];
      const ing = ING_MAP[id];
      let g = prev.g;
      if (prev.unit === "g" && unit === "pz" && ing?.pesoPezzoG)
        g = Math.max(0.5, Math.round((g / ing.pesoPezzoG) * 2) / 2);
      else if (prev.unit === "pz" && unit === "g" && ing?.pesoPezzoG)
        g = Math.max(5, Math.round((g * ing.pesoPezzoG) / 5) * 5);
      return { ...p, [id]: { g, unit } };
    });
  };

  const rimuovi = (id) => setIngs(p => { const n = {...p}; delete n[id]; return n; });

  const salva = () => {
    if (titolo.trim().length < 2) { setErrore("Titolo troppo corto (min 2 caratteri)."); return; }
    if (Object.keys(ings).length === 0) { setErrore("Aggiungi almeno un ingrediente."); return; }
    if (!categoria) { setErrore("Seleziona una categoria."); return; }
    setErrore("");
    const quantita = quantitaPerCloud(ings);
    const ingredienti = Object.entries(ings).map(([ing, v]) => ({ ing, g: v.g, unit: v.unit }));
    onSalva({
      id: iniziale?.id,
      titolo: titolo.trim(),
      descrizione: descr.trim(),
      categoria,
      prep: prep !== "" ? parseInt(prep) || null : null,
      scope,
      quantita,
      ingredienti,
      kcal: macro.kcal, p: macro.p, c: macro.c, g: macro.g_,
    });
  };

  const ingRowProps = useMemo(() => ({ onSetG: setG, onSetUnit: setUnit, onRimuovi: rimuovi }), []);

  return (
    <div style={{ padding:"8px 16px 100px", maxWidth:600, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
        <button onClick={onAnnulla} style={{ ...btnGhost, padding:"8px 10px" }}>← Indietro</button>
        <h2 style={{ fontSize:18, fontWeight:800, margin:0, flex:1 }}>
          {iniziale?.id ? "Modifica ricetta" : "Nuova ricetta"}
        </h2>
      </div>

      <div style={card}>
        <input value={titolo} onChange={e => setTitolo(e.target.value)} placeholder="Titolo ricetta *"
          maxLength={80} style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 12px",
                                  fontSize:15, marginBottom:8, boxSizing:"border-box" }}/>
        <textarea value={descr} onChange={e => setDescr(e.target.value)} placeholder="Descrizione (facoltativa)"
          maxLength={300} rows={2} style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:10,
                                            padding:"10px 12px", fontSize:13, resize:"vertical", marginBottom:10,
                                            boxSizing:"border-box" }}/>
        {/* Categoria */}
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
          {CAT.map(c => (
            <button key={c.key} onClick={() => setCat(c.key)}
              style={{ padding:"6px 11px", borderRadius:8, border:"2px solid",
                       borderColor: categoria===c.key ? "#2563eb" : "#e2e8f0",
                       background:  categoria===c.key ? "#2563eb" : "#fff",
                       color:       categoria===c.key ? "#fff"    : "#64748b",
                       fontWeight:700, fontSize:12, cursor:"pointer" }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        {/* Prep + Scope */}
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:13, color:"#64748b" }}>⏱</span>
            <input type="number" value={prep} onChange={e => setPrep(e.target.value)} min={1} max={180}
              placeholder="—" style={{ width:56, border:"1px solid #e2e8f0", borderRadius:8,
                                       padding:"5px 8px", fontSize:13, textAlign:"right" }}/>
            <span style={{ fontSize:12, color:"#94a3b8" }}>min</span>
          </div>
          <div style={{ display:"flex", gap:5, marginLeft:"auto" }}>
            <button onClick={() => setScope("privata")}
              style={{ ...btnGhost, fontSize:11, padding:"5px 10px",
                       background: scope==="privata" ? "#fef9c3" : "#fff",
                       borderColor: scope==="privata" ? "#eab308" : "#cbd5e1",
                       color: scope==="privata" ? "#854d0e" : "#475569" }}>
              🔒 Privata
            </button>
            <button onClick={() => setScope("famiglia")}
              style={{ ...btnGhost, fontSize:11, padding:"5px 10px",
                       background: scope==="famiglia" ? "#dbeafe" : "#fff",
                       borderColor: scope==="famiglia" ? "#2563eb" : "#cbd5e1",
                       color: scope==="famiglia" ? "#1d4ed8" : "#475569" }}>
              👨‍👩‍👧 Famiglia
            </button>
          </div>
        </div>
      </div>

      {/* Ingredienti */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:8 }}>Ingredienti</div>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Cerca ingrediente…"
          style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:10, padding:"9px 12px",
                   fontSize:14, boxSizing:"border-box" }}/>
        {risultatiRicerca.length > 0 && (
          <div style={{ marginTop:6, border:"1px solid #eef2f7", borderRadius:10, overflow:"hidden" }}>
            {risultatiRicerca.map(ing => (
              <button key={ing.id} onClick={() => aggiungi(ing)}
                style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 12px",
                         border:"none", borderBottom:"1px solid #f1f5f9", background:"#fff",
                         cursor:"pointer", fontSize:13 }}>
                {ing.nome} <span style={{ color:"#94a3b8", fontSize:11 }}>· {ing.cat}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop:8 }}>
          {Object.entries(ings).map(([id, v]) => (
            <IngRow key={id} id={id} v={v} {...ingRowProps}/>
          ))}
        </div>
        {Object.keys(ings).length === 0 && (
          <div style={{ textAlign:"center", color:"#94a3b8", fontSize:13, padding:"16px 0" }}>
            Cerca e aggiungi ingredienti
          </div>
        )}
      </div>

      {/* Macro batch */}
      {Object.keys(ings).length > 0 && (
        <div style={{ ...card, background:"#f0fdf4", border:"1px solid #bbf7d0" }}>
          <div style={{ fontSize:11, fontWeight:800, color:"#16a34a", textTransform:"uppercase",
                        letterSpacing:0.6, marginBottom:6 }}>
            Totale batch (porzione di riferimento)
          </div>
          <div style={{ display:"flex", gap:16, alignItems:"baseline" }}>
            <span style={{ fontSize:22, fontWeight:900, color:"#15803d", fontFamily:"monospace" }}>
              {macro.kcal} kcal
            </span>
            <span style={{ fontSize:13, color:"#64748b" }}>
              P {macro.p}g · C {macro.c}g · G {macro.g_}g
            </span>
          </div>
          <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>
            Il sistema scala automaticamente le quantità per il fabbisogno di ciascun membro della famiglia.
          </div>
        </div>
      )}

      {errore && <div style={{ color:"#dc2626", fontSize:13, marginBottom:10 }}>{errore}</div>}
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={salva} style={{ ...btnPrimary, flex:1 }}>
          {iniziale?.id ? "Salva modifiche" : "Crea ricetta"}
        </button>
        <button onClick={onAnnulla} style={btnGhost}>Annulla</button>
      </div>
    </div>
  );
}

// ── Card ricetta utente ───────────────────────────────────────────────────
function CardRicetta({ r, mine, onEdit, onDelete, onDuplica, onToggleEsclusa }) {
  const [espanso, setEspanso] = useState(false);
  const macro = calcolaMacro(r.quantita || normalizzaQuantita({}));
  const prep = r.prep;
  const prepLabel = !prep ? null : prep>=60 ? `${Math.round(prep/60)}h` : `${prep}'`;
  const m = catMeta(r.categoria);

  return (
    <div style={{ ...card, opacity: r.esclusa ? 0.6 : 1,
                  borderLeft: `4px solid ${r.scope==="privata" ? "#eab308" : "#2563eb"}` }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:2 }}>
            <span style={{ fontWeight:700, fontSize:15 }}>{m.icon} {r.titolo}</span>
            {prepLabel && <span style={{ fontSize:11, color:"#64748b", background:"#f1f5f9",
                                         borderRadius:6, padding:"1px 6px" }}>⏱{prepLabel}</span>}
            <span style={{ fontSize:10, padding:"1px 7px", borderRadius:6, fontWeight:700,
                           background: r.scope==="privata" ? "#fef9c3" : "#dbeafe",
                           color:      r.scope==="privata" ? "#854d0e" : "#1d4ed8" }}>
              {r.scope==="privata" ? "🔒 Privata" : "👨‍👩‍👧 Famiglia"}
            </span>
            {r.esclusa && <span style={{ fontSize:10, background:"#fef2f2", color:"#dc2626",
                                          borderRadius:6, padding:"1px 6px", fontWeight:700 }}>🚫 esclusa</span>}
          </div>
          {r.descrizione && <div style={{ fontSize:12, color:"#64748b", marginBottom:3 }}>{r.descrizione}</div>}
          <div style={{ fontSize:12, color:"#94a3b8" }}>
            <span style={{ fontWeight:700, color:"#1e293b" }}>{macro.kcal} kcal</span>
            {" · "}P {macro.p} C {macro.c} G {macro.g_}
          </div>
        </div>
        <button onClick={() => setEspanso(!espanso)}
          style={{ border:"none", background:"transparent", color:"#94a3b8",
                   fontSize:16, cursor:"pointer", padding:"2px 4px", flexShrink:0 }}>
          {espanso ? "▲" : "▼"}
        </button>
      </div>

      {espanso && r.quantita && (
        <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid #f1f5f9" }}>
          {Object.entries(r.quantita).map(([id, v]) => {
            const ing = ING_MAP[id];
            const qty = v.g ?? v.uomo ?? 0;
            const unit = v.unit || "g";
            const qStr = unit==="g"||unit==="ml" ? `${Math.round(qty)}${unit}` :
                         unit==="pz" ? `${qty===0.5?"½":qty} pz` : `${qty} ${unit}`;
            return (
              <div key={id} style={{ fontSize:12, color:"#475569", lineHeight:1.8 }}>
                <span style={{ fontWeight:700 }}>{qStr}</span> {ing?.nome?.toLowerCase() || id}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
        {mine && <button onClick={onEdit} style={btnGhost}>✏️ Modifica</button>}
        <button onClick={onDuplica} style={btnGhost}>📋 Duplica</button>
        <button onClick={onToggleEsclusa}
          style={{ ...btnGhost,
                   background:   r.esclusa ? "#f0fdf4" : "#fff",
                   borderColor:  r.esclusa ? "#86efac" : "#cbd5e1",
                   color:        r.esclusa ? "#16a34a" : "#475569" }}>
          {r.esclusa ? "✅ Nel piano" : "🚫 Escludi piano"}
        </button>
        {mine && (
          <button onClick={onDelete}
            style={{ ...btnGhost, color:"#ef4444", borderColor:"#fecaca", marginLeft:"auto" }}>
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}

// ── Card ricetta catalogo ─────────────────────────────────────────────────
function CardCatalogo({ r, catKey, esclusa, onDuplica, onToggleEsclusa }) {
  const [espanso, setEspanso] = useState(false);
  // Macro del batch (slot uomo = quantità di riferimento)
  const quantitaBatch = useMemo(() => {
    const out = {};
    for (const [id, v] of Object.entries(r.quantita || {})) {
      if (id === '_scaled') continue;
      out[id] = { g: v.uomo ?? v.g ?? 0, unit: v.unit || "g" };
    }
    return out;
  }, [r]);
  const macro = useMemo(() => calcolaMacro(quantitaBatch), [quantitaBatch]);
  const prep = r.prep;
  const prepColor = !prep ? "#94a3b8" : prep<=15 ? "#16a34a" : prep<=30 ? "#d97706" : "#dc2626";
  const prepBg    = !prep ? "#f8fafc" : prep<=15 ? "#f0fdf4" : prep<=30 ? "#fffbeb" : "#fef2f2";
  const prepLabel = !prep ? "—" : prep>=60 ? `${prep/60}h` : `${prep}'`;

  return (
    <div style={{ ...card, padding:"10px 12px", marginBottom:7, opacity: esclusa ? 0.6 : 1 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ flexShrink:0, width:40, height:40, borderRadius:9, background:prepBg,
                      border:`1.5px solid ${prepColor}30`, display:"flex", alignItems:"center",
                      justifyContent:"center" }}>
          <span style={{ fontSize:10, fontWeight:800, color:prepColor }}>⏱{prepLabel}</span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:13, lineHeight:1.3, marginBottom:1 }}>
            {r.nome}
            {esclusa && <span style={{ marginLeft:6, fontSize:10, background:"#fef2f2",
                                        color:"#dc2626", borderRadius:5, padding:"1px 5px" }}>🚫</span>}
          </div>
          <div style={{ fontSize:11, color:"#94a3b8" }}>
            <span style={{ fontWeight:700, color:"#1e293b" }}>{macro.kcal} kcal</span>
            {" · "}P {macro.p} C {macro.c} G {macro.g_}
            <span style={{ marginLeft:6, fontSize:10 }}>(batch di riferimento)</span>
          </div>
        </div>
        <button onClick={() => setEspanso(!espanso)}
          style={{ border:"none", background:"transparent", color:"#94a3b8", fontSize:14, cursor:"pointer" }}>
          {espanso ? "▲" : "▼"}
        </button>
      </div>

      {/* Lista ingredienti espansa */}
      {espanso && (
        <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid #f1f5f9" }}>
          {Object.entries(r.quantita || {}).filter(([id]) => id !== '_scaled').map(([id, v]) => {
            const ing = ING_MAP[id];
            const qty = v.uomo ?? v.g ?? 0;
            const unit = v.unit || "g";
            const qStr = unit==="g"||unit==="ml" ? `${Math.round(qty)}${unit}` :
                         unit==="pz" ? `${qty===0.5?"½":qty} pz` : `${qty} ${unit}`;
            return (
              <div key={id} style={{ fontSize:12, color:"#475569", lineHeight:1.8 }}>
                <span style={{ fontWeight:700 }}>{qStr}</span> {ing?.nome?.toLowerCase() || id}
              </div>
            );
          })}
        </div>
      )}

      {/* Azioni */}
      <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
        <button onClick={onDuplica} style={btnGhost}>📋 Duplica e personalizza</button>
        <button onClick={onToggleEsclusa}
          style={{ ...btnGhost,
                   background:  esclusa ? "#f0fdf4" : "#fff",
                   borderColor: esclusa ? "#86efac" : "#cbd5e1",
                   color:       esclusa ? "#16a34a" : "#475569" }}>
          {esclusa ? "✅ Nel piano" : "🚫 Escludi piano"}
        </button>
      </div>
    </div>
  );
}

// ── Pagina principale ────────────────────────────────────────────────────
export function RicettePage({ cloudStatus, onRicetteChange }) {
  const [vista, setVista]     = useState("lista");
  const [tab, setTab]         = useState("mie");
  const [catAperte, setCatAperte] = useState({});
  // escluse catalogo: Set di id (memorizzato in localStorage in futuro, per ora in stato)
  const [escluseCatalogo, setEscluseCatalogo] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("cat-escluse")||"[]")); } catch { return new Set(); }
  });
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

  // Quando si arriva dalla pagina Piano (pulsante "Salva come ricetta"),
  // apri direttamente l'editor con la ricetta pre-compilata.
  useEffect(() => {
    if (window.__ricetteDaAprire) {
      setEditing(window.__ricetteDaAprire);
      setVista("editor");
      delete window.__ricetteDaAprire;
    }
  }, []);

  // Suddivisione: mie (isMine) vs famiglia (scope=famiglia e !isMine)
  const mie        = ricette.filter(r => r.isMine);
  const diFamiglia = ricette.filter(r => !r.isMine);

  const toggleEsclusaCatalogo = (id) => {
    setEscluseCatalogo(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("cat-escluse", JSON.stringify([...next])); } catch {}
      logSync("esclusione", `Catalogo: ricetta ${next.has(id)?"esclusa":"inclusa"}: ${id}`, { id });
      return next;
    });
  };

  const salva = async (dati) => {
    try {
      if (dati.id) await aggiornaRicetta(dati.id, dati);
      else await creaRicetta(dati);
      setVista("lista"); setEditing(null);
      await ricarica(); onRicetteChange?.();
    } catch (e) { setErrore(e.message || "Errore nel salvataggio."); }
  };

  const duplica = async (r, catKey) => {
    // r può essere una ricetta utente o una del catalogo
    const quantita = r.quantita
      ? normalizzaQuantita(r.quantita)
      : {};
    const base = {
      titolo:      (r.titolo || r.nome || "") + " (copia)",
      descrizione: r.descrizione || "",
      categoria:   r.categoria || catKey || "pranzo",
      prep:        r.prep || null,
      scope:       "famiglia",
      quantita,
      ingredienti: Object.entries(quantita).map(([ing, v]) => ({ ing, g: v.g, unit: v.unit })),
    };
    // Apre direttamente l'editor con la ricetta pre-compilata
    setEditing(base);
    setVista("editor");
  };

  const toggleEsclusa = async (r) => {
    try { await toggleEsclusaRicetta(r.id, !r.esclusa); await ricarica(); onRicetteChange?.(); }
    catch (e) { setErrore(e.message || "Errore."); }
  };

  if (vista === "editor") {
    return <EditorRicetta iniziale={editing} onSalva={salva}
             onAnnulla={() => { setVista("lista"); setEditing(null); }}/>;
  }

  return (
    <div style={{ padding:"16px 16px 100px", maxWidth:600, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <h2 style={{ fontSize:20, fontWeight:700, margin:0 }}>📖 Ricette</h2>
        {collegato && <button onClick={() => { setEditing(null); setVista("editor"); }} style={btnPrimary}>+ Nuova</button>}
      </div>

      {/* Tab switcher */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        {[["mie","👤 Mie"],["famiglia","👨‍👩‍👧 Famiglia"],["catalogo","📚 Catalogo"]].map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ ...btnGhost, flex:1, padding:"8px 4px", textAlign:"center",
                     background:   tab===key ? "#dbeafe" : "#fff",
                     borderColor:  tab===key ? "#2563eb" : "#cbd5e1",
                     color:        tab===key ? "#1d4ed8" : "#475569",
                     fontWeight:   tab===key ? 800 : 600 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Le mie ── */}
      {tab === "mie" && (
        !collegato
          ? <EmptyState emoji="☁️" title="Collegati per le ricette"
              text="Le ricette personali sono salvate sul cloud. Accedi per crearle."/>
          : loading
            ? <div style={{ textAlign:"center", color:"#94a3b8", padding:20 }}>Caricamento…</div>
            : <>
                {errore && <div style={{ color:"#dc2626", fontSize:13, marginBottom:10 }}>{errore}</div>}
                {mie.length === 0
                  ? <EmptyState emoji="🍴" title="Nessuna ricetta tua"
                      text="Tocca + Nuova per creare la tua prima ricetta. Puoi anche duplicare una ricetta dal Catalogo per personalizzarla."/>
                  : mie.map(r => (
                      <CardRicetta key={r.id} r={r} mine
                        onEdit={() => { setEditing(r); setVista("editor"); }}
                        onDelete={async () => {
                          if (confirm(`Eliminare "${r.titolo}"?`)) { await eliminaRicetta(r.id); ricarica(); onRicetteChange?.(); }
                        }}
                        onDuplica={() => duplica(r)}
                        onToggleEsclusa={() => toggleEsclusa(r)}/>
                    ))}
              </>
      )}

      {/* ── Famiglia ── */}
      {tab === "famiglia" && (
        !collegato
          ? <EmptyState emoji="☁️" title="Collegati per vedere le ricette di famiglia"
              text="Le ricette condivise dai tuoi familiari sono visibili solo quando sei connesso."/>
          : loading
            ? <div style={{ textAlign:"center", color:"#94a3b8", padding:20 }}>Caricamento…</div>
            : <>
                {errore && <div style={{ color:"#dc2626", fontSize:13, marginBottom:10 }}>{errore}</div>}
                {diFamiglia.length === 0
                  ? <EmptyState emoji="👨‍👩‍👧" title="Nessuna ricetta condivisa"
                      text="Quando un membro della famiglia crea una ricetta con scope Famiglia, appare qui."/>
                  : diFamiglia.map(r => (
                      <CardRicetta key={r.id} r={r}
                        onDuplica={() => duplica(r)}
                        onToggleEsclusa={() => toggleEsclusa(r)}/>
                    ))}
              </>
      )}

      {/* ── Catalogo ── */}
      {tab === "catalogo" && (
        <>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:12, lineHeight:1.5 }}>
            166 ricette CRA-NUT. Le quantità mostrate sono il batch di riferimento — il piano
            le scala automaticamente per il fabbisogno di ciascun membro.
            Duplica una ricetta per personalizzarla e aggiungerla al tuo piano con priorità.
          </div>
          {CAT.map(c => {
            const rs = DB[c.key] || [];
            const aperta = catAperte[c.key] ?? false;
            return (
              <div key={c.key} style={{ marginBottom:10 }}>
                <button onClick={() => setCatAperte(p => ({ ...p, [c.key]: !aperta }))}
                  style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
                           padding:"12px 14px", borderRadius:12, border:"1px solid #e2e8f0",
                           background:"#fff", cursor:"pointer", fontWeight:700, fontSize:14, color:"#1e293b" }}>
                  <span>{c.icon} {c.label}
                    <span style={{ color:"#94a3b8", fontWeight:600, fontSize:12 }}> · {rs.length} ricette</span>
                    {[...escluseCatalogo].some(id => rs.some(r => r.id===id)) &&
                      <span style={{ marginLeft:6, fontSize:11, color:"#dc2626" }}>
                        ({[...escluseCatalogo].filter(id => rs.some(r => r.id===id)).length} escluse)
                      </span>}
                  </span>
                  <span style={{ color:"#cbd5e1", fontSize:11 }}>{aperta ? "▲" : "▼"}</span>
                </button>
                {aperta && (
                  <div style={{ marginTop:8 }}>
                    {rs.map(r => (
                      <CardCatalogo key={r.id} r={r} catKey={c.key}
                        esclusa={escluseCatalogo.has(r.id)}
                        onDuplica={() => duplica(r, c.key)}
                        onToggleEsclusa={() => toggleEsclusaCatalogo(r.id)}/>
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
