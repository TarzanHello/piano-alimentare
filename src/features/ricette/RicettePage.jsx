import React from 'react';
const { useState, useEffect, useMemo, useCallback } = React;
import { DB, INGREDIENTS, ING_MAP, calcMacroEditor, cercaIngredienti, nutriPerGrammi } from '@/core';
import { EmptyState } from '@/components/shared';
import { caricaRicette, creaRicetta, aggiornaRicetta, eliminaRicetta, cambiaScopeRicetta } from '@/db/ricetteCloud';

const CAT = [
  { key: "colazione", label: "Colazione", icon: "🌅" },
  { key: "pranzo",    label: "Pranzo",    icon: "🍝" },
  { key: "cena",      label: "Cena",      icon: "🍽️" },
  { key: "spuntino",  label: "Spuntino",  icon: "🍎" },
];
const catMeta = k => CAT.find(c => c.key === k) || { label: k, icon: "🍴" };

const card = { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12 };
const btnPrimary = { padding: "12px 16px", borderRadius: 12, border: "none", fontWeight: 700, color: "#fff", background: "#2563eb", cursor: "pointer" };
const btnGhost = { padding: "8px 12px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", color: "#475569", fontWeight: 600, cursor: "pointer" };

// ── Editor di creazione/modifica ricetta (combinazione pesata) ──────
function EditorRicetta({ iniziale, onSalva, onAnnullaTutto }) {
  const [titolo, setTitolo]   = useState(iniziale?.titolo || "");
  const [descr, setDescr]     = useState(iniziale?.descrizione || "");
  const [categoria, setCat]   = useState(iniziale?.categoria || "pranzo");
  const [scope, setScope]     = useState(iniziale?.scope === "pubblica" ? "famiglia" : (iniziale?.scope || "famiglia"));
  // ings: { [ingId]: { valore, unit } } — la combinazione pesata
  const [ings, setIngs]       = useState(() => {
    const o = {};
    (iniziale?.ingredienti || []).forEach(it => { o[it.ing] = { valore: it.g, unit: "g" }; });
    return o;
  });
  const [query, setQuery]     = useState("");
  const [errore, setErrore]   = useState("");

  // Ricerca per tag/sottostringa, escludendo quelli già aggiunti
  const risultati = useMemo(() => {
    if (!query.trim()) return [];
    return cercaIngredienti(query, INGREDIENTS, Object.keys(ings)).slice(0, 12);
  }, [query, ings]);

  const macro = useMemo(() => calcMacroEditor(ings), [ings]);

  const aggiungi = (ing) => { setIngs(p => ({ ...p, [ing.id]: { valore: 100, unit: "g" } })); setQuery(""); };
  const rimuovi  = (id) => setIngs(p => { const n = { ...p }; delete n[id]; return n; });
  const setGr    = (id, v) => setIngs(p => ({ ...p, [id]: { ...p[id], valore: Math.max(0, parseInt(v) || 0) } }));

  const salva = () => {
    const t = titolo.trim();
    if (t.length < 2) { setErrore("Dai un titolo alla ricetta (min 2 caratteri)."); return; }
    const lista = Object.entries(ings).map(([ing, q]) => ({ ing, g: q.valore }));
    if (lista.length === 0) { setErrore("Aggiungi almeno un ingrediente."); return; }
    if (lista.some(x => !x.g)) { setErrore("Ogni ingrediente deve avere una quantità in grammi."); return; }
    onSalva({
      id: iniziale?.id,
      titolo: t, descrizione: descr.trim(), categoria, scope,
      ingredienti: lista,
      kcal: macro.kcal, p: macro.p, c: macro.c, g: macro.g,
    });
  };

  return (
    <div style={{ padding: "8px 16px 100px", maxWidth: 600, margin: "0 auto" }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: "6px 0 12px" }}>
        {iniziale?.id ? "Modifica ricetta" : "Nuova ricetta"}
      </h2>

      <div style={card}>
        <input value={titolo} onChange={e => setTitolo(e.target.value)} placeholder="Titolo della ricetta"
               maxLength={80} style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", fontSize: 15, marginBottom: 10 }} />
        <textarea value={descr} onChange={e => setDescr(e.target.value)} placeholder="Descrizione (facoltativa)"
                  maxLength={500} rows={2} style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", fontSize: 14, resize: "vertical", marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CAT.map(c => (
            <button key={c.key} onClick={() => setCat(c.key)}
              style={{ ...btnGhost, background: categoria === c.key ? "#dbeafe" : "#fff", borderColor: categoria === c.key ? "#2563eb" : "#cbd5e1" }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ricerca ingredienti per tag */}
      <div style={card}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Ingredienti</div>
        <input value={query} onChange={e => setQuery(e.target.value)}
               placeholder="Cerca ingrediente (es. soia, pollo, avena)…"
               style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", fontSize: 14 }} />
        {risultati.length > 0 && (
          <div style={{ marginTop: 8, border: "1px solid #eef2f7", borderRadius: 10, overflow: "hidden" }}>
            {risultati.map(ing => (
              <button key={ing.id} onClick={() => aggiungi(ing)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: "1px solid #f1f5f9", background: "#fff", cursor: "pointer", fontSize: 14 }}>
                {ing.nome} <span style={{ color: "#94a3b8", fontSize: 12 }}>· {ing.cat}</span>
              </button>
            ))}
          </div>
        )}

        {/* Combinazione pesata corrente */}
        {Object.keys(ings).length > 0 && (
          <div style={{ marginTop: 12 }}>
            {Object.entries(ings).map(([id, q]) => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f5f7fa" }}>
                <span style={{ flex: 1, fontSize: 14 }}>{ING_MAP[id]?.nome || id}</span>
                <input type="number" value={q.valore} onChange={e => setGr(id, e.target.value)} min={0}
                       style={{ width: 70, border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 8px", fontSize: 14, textAlign: "right" }} />
                <span style={{ fontSize: 13, color: "#64748b", width: 18 }}>g</span>
                <button onClick={() => rimuovi(id)} style={{ border: "none", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Macro live */}
      <div style={{ ...card, display: "flex", justifyContent: "space-around", textAlign: "center" }}>
        {[["kcal", macro.kcal, "#1e293b"], ["Proteine", macro.p + " g", "#2563eb"], ["Carbo", macro.c + " g", "#f59e0b"], ["Grassi", macro.g + " g", "#10b981"]].map(([l, v, col]) => (
          <div key={l}><div style={{ fontSize: 18, fontWeight: 700, color: col }}>{v}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>{l}</div></div>
        ))}
      </div>

      {/* Condivisione */}
      <div style={card}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Condivisione</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setScope("privata")} style={{ ...btnGhost, flex: 1, background: scope === "privata" ? "#dbeafe" : "#fff", borderColor: scope === "privata" ? "#2563eb" : "#cbd5e1" }}>🔒 Privata</button>
          <button onClick={() => setScope("famiglia")} style={{ ...btnGhost, flex: 1, background: scope === "famiglia" ? "#dbeafe" : "#fff", borderColor: scope === "famiglia" ? "#2563eb" : "#cbd5e1" }}>👨‍👩‍👧 Famiglia</button>
          <button disabled title="Disponibile in futuro" style={{ ...btnGhost, flex: 1, opacity: 0.45, cursor: "not-allowed" }}>🌍 Pubblica</button>
        </div>
      </div>

      {errore && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>{errore}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={salva} style={{ ...btnPrimary, flex: 1 }}>{iniziale?.id ? "Salva modifiche" : "Crea ricetta"}</button>
        <button onClick={onAnnullaTutto} style={btnGhost}>Annulla</button>
      </div>
    </div>
  );
}

// ── Scheda riepilogo ricetta ────────────────────────────────────────
function CardRicetta({ r, mine, onEdit, onDelete, onToggleScope }) {
  const m = catMeta(r.categoria);
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{m.icon} {r.titolo}</div>
          {r.descrizione ? <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{r.descrizione}</div> : null}
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
            {Math.round(r.kcal)} kcal · P {Math.round(r.p)} · C {Math.round(r.c)} · G {Math.round(r.g)}
          </div>
        </div>
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: r.scope === "privata" ? "#f1f5f9" : "#dbeafe", color: r.scope === "privata" ? "#64748b" : "#1d4ed8" }}>
          {r.scope === "privata" ? "🔒 Privata" : "👨‍👩‍👧 Famiglia"}
        </span>
      </div>
      {mine && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={onEdit} style={{ ...btnGhost, fontSize: 13, padding: "6px 10px" }}>Modifica</button>
          <button onClick={onToggleScope} style={{ ...btnGhost, fontSize: 13, padding: "6px 10px" }}>
            {r.scope === "privata" ? "Condividi in famiglia" : "Rendi privata"}
          </button>
          <button onClick={onDelete} style={{ ...btnGhost, fontSize: 13, padding: "6px 10px", color: "#ef4444", borderColor: "#fecaca" }}>Elimina</button>
        </div>
      )}
    </div>
  );
}

// ── Scheda ricetta del catalogo preimpostato (CRA-NUT) ──────────────
// Mostra il tempo di preparazione ben in vista, come nel Ricettario
// aperto dal cambio pasto. Macro di riferimento: taglia "uomo".
function CardCatalogo({ r }) {
  const m = r.uomo || { kcal: 0, p: 0, c: 0, g: 0 };
  const prep = r.prep;
  const prepColor = prep == null ? "#94a3b8" : prep <= 15 ? "#16a34a" : prep <= 30 ? "#d97706" : "#dc2626";
  const prepBg    = prep == null ? "#f8fafc"  : prep <= 15 ? "#f0fdf4" : prep <= 30 ? "#fffbeb" : "#fef2f2";
  const prepLabel = prep == null ? "—" : prep >= 60 ? `${prep / 60}h` : `${prep}'`;
  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 7 }}>
      <div style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 9, background: prepBg, border: `1.5px solid ${prepColor}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: prepColor }}>⏱{prepLabel}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{r.nome}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
          {Math.round(m.kcal)} kcal · P {Math.round(m.p)} · C {Math.round(m.c)} · G {Math.round(m.g)}
        </div>
      </div>
    </div>
  );
}


export function RicettePage({ cloudStatus, overrides }) {
  const [vista, setVista]   = useState("lista");   // "lista" | "editor"
  const [tab, setTab]       = useState("mie");     // "mie" | "catalogo"
  const [catAperte, setCatAperte] = useState({});  // { [categoria]: bool }
  const [editing, setEditing] = useState(null);
  const [ricette, setRicette] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore]   = useState("");

  const collegato = cloudStatus?.loggedIn;

  const ricarica = useCallback(async () => {
    if (!collegato) { setRicette([]); setLoading(false); return; }
    setLoading(true);
    try { setRicette(await caricaRicette()); setErrore(""); }
    catch (e) { setErrore("Impossibile caricare le ricette dal cloud."); }
    setLoading(false);
  }, [collegato]);

  useEffect(() => { ricarica(); }, [ricarica]);

  const mie = ricette.filter(r => r.isMine);
  const diFamiglia = ricette.filter(r => !r.isMine);

  // Personalizzazioni del piano: override che contengono una ricetta custom
  const personalizzazioni = useMemo(() => {
    const out = [];
    for (const [chiave, ric] of Object.entries(overrides || {})) {
      if (ric && (ric.isCustom || ric.baseId)) {
        out.push({ chiave, nome: ric.nome, macro: ric.uomo || {} });
      }
    }
    return out;
  }, [overrides]);

  const salva = async (dati) => {
    try {
      if (dati.id) await aggiornaRicetta(dati.id, dati);
      else await creaRicetta(dati);
      setVista("lista"); setEditing(null);
      await ricarica();
    } catch (e) { setErrore(e.message || "Errore nel salvataggio."); }
  };

  if (vista === "editor") {
    return <EditorRicetta iniziale={editing} onSalva={salva} onAnnullaTutto={() => { setVista("lista"); setEditing(null); }} />;
  }

  return (
    <div style={{ padding: "16px 16px 100px", maxWidth: 600, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>📖 Ricette</h2>
        {collegato && tab === "mie" && <button onClick={() => { setEditing(null); setVista("editor"); }} style={btnPrimary}>+ Nuova</button>}
      </div>

      {/* ── Switcher: Le mie ricette / Catalogo ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setTab("mie")}
          style={{ ...btnGhost, flex: 1, background: tab === "mie" ? "#dbeafe" : "#fff", borderColor: tab === "mie" ? "#2563eb" : "#cbd5e1", color: tab === "mie" ? "#1d4ed8" : "#475569" }}>
          👤 Le mie ricette
        </button>
        <button onClick={() => setTab("catalogo")}
          style={{ ...btnGhost, flex: 1, background: tab === "catalogo" ? "#dbeafe" : "#fff", borderColor: tab === "catalogo" ? "#2563eb" : "#cbd5e1", color: tab === "catalogo" ? "#1d4ed8" : "#475569" }}>
          📚 Catalogo
        </button>
      </div>

      {tab === "mie" && (
        <>
          {!collegato && (
            <EmptyState emoji="☁️" title="Collegati per le ricette"
              text="Le ricette sono salvate sul cloud e condivise con la tua famiglia. Accedi col tuo account per crearle e vederle." />
          )}

          {collegato && (
            <>
              {errore && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>{errore}</div>}
              {loading && <div style={{ color: "#94a3b8", fontSize: 14, padding: 20, textAlign: "center" }}>Caricamento…</div>}

              {!loading && (
                <>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#475569", margin: "8px 0" }}>Le mie ricette</h3>
                  {mie.length === 0
                    ? <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 14 }}>Nessuna ricetta tua. Tocca “+ Nuova” per crearne una come combinazione di ingredienti.</div>
                    : mie.map(r => (
                        <CardRicetta key={r.id} r={r} mine
                          onEdit={() => { setEditing(r); setVista("editor"); }}
                          onDelete={async () => { if (confirm("Eliminare questa ricetta?")) { await eliminaRicetta(r.id); ricarica(); } }}
                          onToggleScope={async () => { await cambiaScopeRicetta(r.id, r.scope === "privata" ? "famiglia" : "privata"); ricarica(); }} />
                      ))}

                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#475569", margin: "16px 0 8px" }}>Ricette di famiglia</h3>
                  {diFamiglia.length === 0
                    ? <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 14 }}>Nessuna ricetta condivisa dagli altri membri.</div>
                    : diFamiglia.map(r => <CardRicetta key={r.id} r={r} />)}

                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#475569", margin: "16px 0 8px" }}>Personalizzazioni del piano</h3>
                  {personalizzazioni.length === 0
                    ? <div style={{ fontSize: 13, color: "#94a3b8" }}>Quando personalizzi un pasto nel piano, lo ritrovi qui.</div>
                    : personalizzazioni.map((p, i) => (
                        <div key={p.chiave + i} style={card}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>✏️ {p.nome}</div>
                          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                            {Math.round(p.macro.kcal || 0)} kcal · P {Math.round(p.macro.p || 0)} · C {Math.round(p.macro.c || 0)} · G {Math.round(p.macro.g || 0)}
                          </div>
                        </div>
                      ))}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── Catalogo preimpostato (CRA-NUT), diviso per pasto ── */}
      {tab === "catalogo" && (
        <>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
            Tutte le ricette del catalogo, divise per pasto. Macro di riferimento per la taglia "uomo"; nel piano vengono adattate al profilo di ciascuno.
          </div>
          {CAT.map(c => {
            const ricette = DB[c.key] || [];
            const aperta = catAperte[c.key] ?? false;
            return (
              <div key={c.key} style={{ marginBottom: 10 }}>
                <button onClick={() => setCatAperte(p => ({ ...p, [c.key]: !aperta }))}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14, color: "#1e293b" }}>
                  <span>{c.icon} {c.label} <span style={{ color: "#94a3b8", fontWeight: 600, fontSize: 12 }}>· {ricette.length} ricette</span></span>
                  <span style={{ color: "#cbd5e1", fontSize: 11 }}>{aperta ? "▲" : "▼"}</span>
                </button>
                {aperta && (
                  <div style={{ marginTop: 8 }}>
                    {ricette.map(r => <CardCatalogo key={r.id} r={r} />)}
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
