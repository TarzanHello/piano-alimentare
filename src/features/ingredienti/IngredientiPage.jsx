import React from 'react';
const { useState, useEffect, useMemo } = React;
import { DB, INGREDIENTS, depColor, meseCorrente } from '@/core';
import { getCustomIngredients, addCustomIngredient, deleteCustomIngredient, pullCustomIngredients } from '@/db/customIngredients';
import { cloudEnabled } from '@/db/cloud';

const CATEGORIE = [
  "🌾 Cereali","🫘 Legumi","🥦 Verdure","🍎 Frutta","🥜 Frutta secca",
  "🍖 Carni","🥓 Salumi","🫀 Frattaglie","🐟 Pesce","🥛 Latticini",
  "🍳 Uova","🫒 Oli e grassi","🍰 Dolci","🥫 Varie","🧂 Dispensa","🛒 Altro","🥩 Proteine",
];

const MESI_LABEL = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

const FORM_EMPTY = {
  nome: "",
  cat: "🌾 Cereali",
  deperibile: 7,
  tuttoAnno: true,
  stagioni: [],
  kcal: "", p: "", c: "", g: "", z: "", f: "",
};

// ─── Modale aggiunta ingrediente ──────────────────────────────────

function AddIngredientModal({ onSave, onClose }) {
  const [form, setForm] = useState(FORM_EMPTY);
  const [errors, setErrors] = useState({});

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }));
    setErrors(e => ({ ...e, [field]: undefined }));
  }

  function toggleMese(idx) {
    const m = idx + 1;
    set("stagioni", form.stagioni.includes(m)
      ? form.stagioni.filter(x => x !== m)
      : [...form.stagioni, m].sort((a, b) => a - b));
  }

  // Macro essenziali per il motore: kcal, p (proteine), c (carboidrati), g (grassi)
  const macroMancanti = ["kcal", "p", "c", "g"].some(f => form[f] === "");

  function validate() {
    const e = {};
    if (!form.nome.trim()) e.nome = "Il nome è obbligatorio";
    // kcal è richiesto per calcolo macro del piano
    if (form.kcal === "") e.kcal = "Necessario per il calcolo calorico";
    if (form.p   === "") e.p   = "Necessario";
    if (form.c   === "") e.c   = "Necessario";
    if (form.g   === "") e.g   = "Necessario";
    return e;
  }

  function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const nutri = {
      kcal: parseFloat(form.kcal) || 0,
      p:    parseFloat(form.p)    || 0,
      c:    parseFloat(form.c)    || 0,
      g:    parseFloat(form.g)    || 0,
    };
    if (form.z !== "") nutri.z = parseFloat(form.z) || 0;
    if (form.f !== "") nutri.f = parseFloat(form.f) || 0;
    onSave({
      nome:      form.nome.trim(),
      cat:       form.cat,
      deperibile: Number(form.deperibile) || 7,
      stagioni:  form.tuttoAnno ? null : (form.stagioni.length ? form.stagioni : null),
      nutri,
    });
  }

  const numField = (field, label, required = false) => (
    <div>
      <label style={{ fontSize: 10, fontWeight: 700, color: errors[field] ? "#dc2626" : "#6E8576", display: "block", marginBottom: 2 }}>
        {label}{required && <span style={{ color: "#dc2626" }}>*</span>}
      </label>
      <input
        type="number" min="0" step="0.1"
        value={form[field]}
        onChange={e => set(field, e.target.value)}
        placeholder="—"
        style={{
          width: "100%", padding: "6px 8px",
          border: `1.5px solid ${errors[field] ? "#dc2626" : "#E7EDE2"}`,
          borderRadius: 7, fontSize: 12, background: "#fff", boxSizing: "border-box",
        }}
      />
      {errors[field] && <div style={{ fontSize: 9, color: "#dc2626", marginTop: 1 }}>{errors[field]}</div>}
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0007", zIndex: 1000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: "16px 16px 0 0", padding: "20px 18px 32px",
        width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>

        <div style={{ width: 36, height: 4, background: "#E7EDE2", borderRadius: 2, margin: "0 auto 16px" }} />

        <div style={{ fontSize: 15, fontWeight: 800, color: "#13231A", marginBottom: 16 }}>
          ➕ Nuovo ingrediente
        </div>

        {/* Nome */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#6E8576", display: "block", marginBottom: 3 }}>
            Nome <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <input
            type="text" value={form.nome} onChange={e => set("nome", e.target.value)}
            placeholder="es. Tempeh"
            style={{
              width: "100%", padding: "8px 10px",
              border: `1.5px solid ${errors.nome ? "#dc2626" : "#E7EDE2"}`,
              borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#F9FBF7",
            }}
          />
          {errors.nome && <div style={{ fontSize: 10, color: "#dc2626", marginTop: 2 }}>{errors.nome}</div>}
        </div>

        {/* Categoria */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#6E8576", display: "block", marginBottom: 3 }}>Categoria</label>
          <select value={form.cat} onChange={e => set("cat", e.target.value)}
            style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #E7EDE2", borderRadius: 8, fontSize: 13, background: "#F9FBF7" }}>
            {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Deperibilità */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#6E8576", display: "block", marginBottom: 3 }}>
            Deperibilità — 365+ = stabile
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[1, 3, 7, 14, 30, 90, 180, 365].map(d => (
              <button key={d} onClick={() => set("deperibile", d)} style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: `1.5px solid ${form.deperibile === d ? "#18A957" : "#E7EDE2"}`,
                background: form.deperibile === d ? "#18A957" : "#F5F8F1",
                color: form.deperibile === d ? "#fff" : "#6E8576",
              }}>
                {d >= 365 ? "Stabile" : `${d}g`}
              </button>
            ))}
          </div>
        </div>

        {/* Stagionalità */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6E8576" }}>Stagionalità</label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
              <input type="checkbox" checked={form.tuttoAnno} onChange={e => set("tuttoAnno", e.target.checked)} />
              Tutto l'anno
            </label>
          </div>
          {!form.tuttoAnno && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {MESI_LABEL.map((m, idx) => {
                const active = form.stagioni.includes(idx + 1);
                return (
                  <button key={m} onClick={() => toggleMese(idx)} style={{
                    padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                    border: `1.5px solid ${active ? "#18A957" : "#E7EDE2"}`,
                    background: active ? "#18A957" : "#F5F8F1",
                    color: active ? "#fff" : "#6E8576",
                  }}>{m}</button>
                );
              })}
            </div>
          )}
        </div>

        {/* Valori nutrizionali */}
        <div style={{ background: "#F5F8F1", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#13231A", marginBottom: 4 }}>
            Valori nutrizionali per 100g
          </div>
          <div style={{ fontSize: 10, color: "#f97316", fontWeight: 600, marginBottom: 10 }}>
            ⚠ I campi con * sono necessari per il calcolo delle calorie nel piano
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {numField("kcal", "Calorie (kcal)", true)}
            {numField("p",    "Proteine (g)",   true)}
            {numField("c",    "Carboidrati (g)", true)}
            {numField("g",    "Grassi (g)",      true)}
            {numField("z",    "Zuccheri (g)")}
            {numField("f",    "Fibre (g)")}
          </div>
        </div>

        {cloudEnabled && (
          <div style={{ fontSize: 10, color: "#16a34a", background: "#EEF7F0", border: "1px solid #A9DDB8", borderRadius: 7, padding: "6px 10px", marginBottom: 14 }}>
            ☁ L'ingrediente verrà condiviso con la tua famiglia
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #E7EDE2",
            background: "#F5F8F1", fontSize: 13, fontWeight: 700, color: "#6E8576", cursor: "pointer",
          }}>Annulla</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "11px", borderRadius: 10, border: "none",
            background: "#18A957", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer",
          }}>Salva ingrediente</button>
        </div>
      </div>
    </div>
  );
}

// ─── Pagina principale ────────────────────────────────────────────

export function IngredientiPage({ excluded, onToggle }) {
  const [search, setSearch]             = useState("");
  const [filterCat, setFilterCat]       = useState("Tutte");
  const [customList, setCustomList]     = useState(() => getCustomIngredients());
  const [showModal, setShowModal]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [syncing, setSyncing]           = useState(false);

  // Pull dal cloud al mount (se famiglia connessa)
  useEffect(() => {
    let active = true;
    async function sync() {
      setSyncing(true);
      try {
        const lista = await pullCustomIngredients();
        if (active && lista !== null) setCustomList(lista);
      } finally {
        if (active) setSyncing(false);
      }
    }
    sync();
    return () => { active = false; };
  }, []);

  const allIngredients = useMemo(() => [...INGREDIENTS, ...customList], [customList]);
  const cats = useMemo(() =>
    ["Tutte", ...Array.from(new Set(allIngredients.map(i => i.cat)))],
    [allIngredients]
  );

  const visible = allIngredients.filter(ing => {
    const matchCat = filterCat === "Tutte" || ing.cat === filterCat;
    const matchSearch = ing.nome.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const nExcluded = excluded.length;

  async function handleSave(data) {
    await addCustomIngredient(data);
    setCustomList(getCustomIngredients());
    setShowModal(false);
  }

  async function handleDelete(id) {
    await deleteCustomIngredient(id);
    setCustomList(getCustomIngredients());
    setConfirmDelete(null);
    if (excluded.includes(id)) onToggle(id);
  }

  return (
    <div>
      {/* Banner esclusi */}
      <div style={{
        background: nExcluded > 0 ? "#fef2f2" : "#f0fdf4",
        border: `1px solid ${nExcluded > 0 ? "#fecaca" : "#bbf7d0"}`,
        borderRadius: 10, padding: "10px 14px", marginBottom: 12,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: nExcluded > 0 ? "#dc2626" : "#16a34a" }}>
            {nExcluded > 0
              ? `⚠️ ${nExcluded} ingredient${nExcluded === 1 ? "e" : "i"} esclus${nExcluded === 1 ? "o" : "i"}`
              : "✅ Nessun ingrediente escluso"}
          </div>
          <div style={{ fontSize: 10, color: "#6E8576", marginTop: 2 }}>Le ricette con ingredienti esclusi non verranno proposte</div>
        </div>
        {nExcluded > 0 && (
          <button onClick={() => excluded.forEach(id => onToggle(id))}
            style={{ fontSize: 10, color: "#dc2626", background: "none", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontWeight: 700 }}>
            Riabilita tutti
          </button>
        )}
      </div>

      {/* Ricerca + bottone */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1.5px solid #E7EDE2", padding: "10px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cerca ingrediente..."
            style={{ flex: 1, padding: "7px 10px", border: "1.5px solid #E7EDE2", borderRadius: 8, fontSize: 13, outline: "none" }} />
          <button onClick={() => setShowModal(true)}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#18A957", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
            {syncing ? "↻" : "+ Aggiungi"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {cats.map(c => (
            <button key={c} onClick={() => setFilterCat(c)} style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              border: `1.5px solid ${filterCat === c ? "#18A957" : "#E7EDE2"}`,
              background: filterCat === c ? "#18A957" : "#F5F8F1",
              color: filterCat === c ? "#fff" : "#6E8576",
            }}>
              {c === "Tutte" ? "Tutte" : c.split(" ").slice(1).join(" ")}
            </button>
          ))}
        </div>
      </div>

      {/* Badge custom */}
      {customList.length > 0 && (
        <div style={{ background: "#EEF7F0", border: "1px solid #A9DDB8", borderRadius: 8, padding: "7px 12px", marginBottom: 10, fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
          ✨ {customList.length} ingredient{customList.length === 1 ? "e" : "i"} personalizzat{customList.length === 1 ? "o" : "i"} nel database{cloudEnabled ? " · sincronizzati con la famiglia" : ""}
        </div>
      )}

      {/* Lista raggruppata */}
      {(() => {
        const grouped = {};
        visible.forEach(ing => { (grouped[ing.cat] ||= []).push(ing); });
        return Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E7EDE2", marginBottom: 10, overflow: "hidden" }}>
            <div style={{ background: "#F5F8F1", borderBottom: "1px solid #EFF3EC", padding: "9px 14px", fontWeight: 800, fontSize: 12, color: "#13231A", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>{cat}</span>
              <span style={{ fontSize: 10, color: "#9DB1A2" }}>
                {items.filter(i => excluded.includes(i.id)).length > 0
                  ? `${items.filter(i => excluded.includes(i.id)).length} esclus${items.filter(i => excluded.includes(i.id)).length === 1 ? "o" : "i"}`
                  : ""}
              </span>
            </div>
            <div style={{ padding: "4px 14px" }}>
              {items.map((ing, i) => {
                const isExcl = excluded.includes(ing.id);
                const dc = depColor(ing.deperibile);
                const recCount = Object.values(DB).flat().filter(r => r.ingredients.includes(ing.id)).length;
                return (
                  <div key={ing.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < items.length - 1 ? "1px solid #F5F8F1" : "none" }}>
                    {/* Toggle */}
                    <div onClick={() => onToggle(ing.id)} style={{
                      width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                      background: isExcl ? "#E7EDE2" : "#22c55e",
                      position: "relative", transition: "background 0.2s",
                      cursor: "pointer", opacity: isExcl ? 0.6 : 1,
                    }}>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: isExcl ? 2 : 18, transition: "left 0.2s", boxShadow: "0 1px 3px #0003" }} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, opacity: isExcl ? 0.45 : 1, transition: "opacity 0.2s" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isExcl ? "#9DB1A2" : "#13231A", textDecoration: isExcl ? "line-through" : "none", display: "flex", alignItems: "center", gap: 5 }}>
                        {ing.nome}
                        {ing.custom && (
                          <span style={{ fontSize: 9, background: "#EEF7F0", color: "#16a34a", border: "1px solid #A9DDB8", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>custom</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "#9DB1A2", marginTop: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span>{recCount} ricett{recCount === 1 ? "a" : "e"}</span>
                        <span style={{ color: dc, fontWeight: 700 }}>{ing.deperibile >= 365 ? "stabile" : `${ing.deperibile}g`}</span>
                        {ing.nutri?.kcal
                          ? <span style={{ color: "#18A957", fontWeight: 600 }}>{Math.round(ing.nutri.kcal)} kcal · {Math.round(ing.nutri.p ?? 0)}p/{Math.round(ing.nutri.c ?? 0)}c/{Math.round(ing.nutri.g ?? 0)}g</span>
                          : ing.custom
                            ? <span style={{ color: "#f97316", fontWeight: 700 }}>⚠ macro mancanti</span>
                            : null
                        }
                        {ing.stagioni ? (() => {
                          const m = meseCorrente();
                          const nomiMesi = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
                          const inStag = ing.stagioni.includes(m);
                          return (
                            <span style={{ color: inStag ? "#16a34a" : "#f97316", fontWeight: 700 }}>
                              {inStag ? "✓ stagione" : "⚠ fuori stagione"} · {ing.stagioni.map(x => nomiMesi[x]).join(" ")}
                            </span>
                          );
                        })() : <span>tutto l'anno</span>}
                      </div>
                    </div>

                    {/* Azioni */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {isExcl && (
                        <span style={{ fontSize: 10, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 5, padding: "2px 6px", fontWeight: 700 }}>Escluso</span>
                      )}
                      {ing.custom && (
                        <button onClick={() => setConfirmDelete(ing.id)}
                          style={{ fontSize: 14, background: "none", border: "none", color: "#dc2626", cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}
                          title="Elimina">🗑</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ));
      })()}

      {/* Modale aggiunta */}
      {showModal && <AddIngredientModal onSave={handleSave} onClose={() => setShowModal(false)} />}

      {/* Conferma eliminazione */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "#0007", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "22px 20px", maxWidth: 320, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#13231A", marginBottom: 8 }}>Elimina ingrediente</div>
            <div style={{ fontSize: 13, color: "#6E8576", marginBottom: 20 }}>
              L'ingrediente verrà rimosso dal database personale{cloudEnabled ? " e dalla famiglia" : ""}. Non è reversibile.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: 10, borderRadius: 9, border: "1.5px solid #E7EDE2", background: "#F5F8F1", fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#6E8576" }}>
                Annulla
              </button>
              <button onClick={() => handleDelete(confirmDelete)}
                style={{ flex: 1, padding: 10, borderRadius: 9, border: "none", background: "#dc2626", fontSize: 13, fontWeight: 800, cursor: "pointer", color: "#fff" }}>
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
