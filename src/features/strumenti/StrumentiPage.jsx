import React from 'react';
const { useState, useMemo } = React;
import { ING_MAP, PESO_PEZZO, cercaIngredienti } from '@/core';

// ─── Helper puri (esportati per i test) ──────────────────────────────

// Equivalenza tra due cibi a parità di criterio (kcal | p | c | g).
// Ritorna i grammi di B che pareggiano il valore di gramsA di A, più i
// pezzi se B ha un peso-pezzo noto. errore:"zero" se B non contiene il
// criterio scelto (es. equivalenza in proteine verso un cibo senza proteine).
export function calcolaEquivalenza(ingA, gramsA, ingB, criterio) {
  const na = ingA?.nutri, nb = ingB?.nutri;
  if (!na || !nb || !gramsA) return null;
  const valore = (na[criterio] || 0) * gramsA / 100;
  const densB = (nb[criterio] || 0) / 100;
  if (densB <= 0) return { valore, errore: "zero" };
  const gramsB = valore / densB;
  const pesoPz = PESO_PEZZO[ingB.id];
  return { valore, gramsB, pezziB: pesoPz ? gramsB / pesoPz : null };
}

const UNITA_CASA = [
  { key: "cucchiaio",  label: "cucchiai",   g: 10 },
  { key: "cucchiaino", label: "cucchiaini", g: 5  },
];

const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString("it-IT");

// ─── Ricerca ingrediente riusabile ───────────────────────────────────

function IngPicker({ label, value, onPick, accent = "#2F6B3A" }) {
  const [q, setQ] = useState("");
  const risultati = useMemo(() => {
    if (!q.trim()) return [];
    return cercaIngredienti(q, Object.values(ING_MAP), value ? [value.id] : []).slice(0, 6);
  }, [q, value]);

  if (value) return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8AA192", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: accent + "10", border: `1.5px solid ${accent}40`, borderRadius: 10, padding: "9px 12px" }}>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "#15251C" }}>{value.nome}</span>
        <span style={{ fontSize: 10.5, color: "#8AA192", whiteSpace: "nowrap" }}>{value.nutri?.kcal ?? "?"} kcal/100g</span>
        <button onClick={() => { onPick(null); setQ(""); }}
          style={{ border: "none", background: "none", color: accent, fontWeight: 800, fontSize: 14, cursor: "pointer", padding: "0 2px" }}>✕</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8AA192", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>{label}</div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca un alimento…"
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E7EDE2", fontSize: 13.5, background: "#F8FAF6", outline: "none" }}/>
      {risultati.length > 0 && (
        <div style={{ marginTop: 4, border: "1px solid #E7EDE2", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          {risultati.map(i => (
            <button key={i.id} onClick={() => { onPick(i); setQ(""); }}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "9px 12px", border: "none", borderBottom: "1px solid #F2F5EF", background: "none", cursor: "pointer", textAlign: "left" }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#15251C" }}>{i.nome}</span>
              <span style={{ fontSize: 10.5, color: "#9DB1A2" }}>{i.nutri?.kcal ?? "?"} kcal</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tool: equivalenze tra cibi ──────────────────────────────────────

const CRITERI = [
  { key: "kcal", label: "Calorie",     unita: "kcal" },
  { key: "c",    label: "Carboidrati", unita: "g"    },
  { key: "p",    label: "Proteine",    unita: "g"    },
  { key: "g",    label: "Grassi",      unita: "g"    },
];

function EquivalenzeTool() {
  const [ingA, setIngA] = useState(null);
  const [ingB, setIngB] = useState(null);
  const [qta, setQta]   = useState("");
  const [unitA, setUnitA] = useState("g");
  const [criterio, setCriterio] = useState("kcal");

  const pesoPzA = ingA ? PESO_PEZZO[ingA.id] : null;
  // se l'ingrediente A cambia e non ha peso-pezzo, forza i grammi
  const unitEff = pesoPzA ? unitA : "g";
  const gramsA = (parseFloat(String(qta).replace(",", ".")) || 0) * (unitEff === "pz" ? pesoPzA : 1);
  const res = useMemo(() => (ingA && ingB && gramsA > 0) ? calcolaEquivalenza(ingA, gramsA, ingB, criterio) : null,
    [ingA, ingB, gramsA, criterio]);
  const crit = CRITERI.find(c => c.key === criterio);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <IngPicker label="Da" value={ingA} onPick={i => { setIngA(i); setUnitA(PESO_PEZZO[i?.id] ? "pz" : "g"); }}/>
      {ingA && (
        <div style={{ display: "flex", gap: 8 }}>
          <input inputMode="decimal" value={qta} onChange={e => setQta(e.target.value)} placeholder="Quantità"
            style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E7EDE2", fontSize: 14, fontWeight: 700, background: "#F8FAF6", outline: "none" }}/>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setUnitA("g")}
              style={{ padding: "0 14px", borderRadius: 10, border: `1.5px solid ${unitEff === "g" ? "#2F6B3A" : "#E7EDE2"}`, background: unitEff === "g" ? "#2F6B3A14" : "#F8FAF6", color: unitEff === "g" ? "#2F6B3A" : "#6E8576", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>g</button>
            {pesoPzA && (
              <button onClick={() => setUnitA("pz")}
                style={{ padding: "0 12px", borderRadius: 10, border: `1.5px solid ${unitEff === "pz" ? "#2F6B3A" : "#E7EDE2"}`, background: unitEff === "pz" ? "#2F6B3A14" : "#F8FAF6", color: unitEff === "pz" ? "#2F6B3A" : "#6E8576", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>pezzi</button>
            )}
          </div>
        </div>
      )}
      <IngPicker label="A" value={ingB} onPick={setIngB} accent="#7c3aed"/>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8AA192", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>A parità di</div>
        <div style={{ display: "flex", gap: 5 }}>
          {CRITERI.map(c => (
            <button key={c.key} onClick={() => setCriterio(c.key)}
              style={{ flex: 1, padding: "8px 2px", borderRadius: 9, border: `1.5px solid ${criterio === c.key ? "#2F6B3A" : "#E7EDE2"}`, background: criterio === c.key ? "#2F6B3A14" : "#F8FAF6", color: criterio === c.key ? "#2F6B3A" : "#6E8576", fontWeight: 800, fontSize: 11, cursor: "pointer" }}>{c.label}</button>
          ))}
        </div>
      </div>

      {res && (
        <div style={{ background: "#EDF7EF", border: "1.5px solid #2F6B3A30", borderRadius: 12, padding: "14px 16px" }}>
          {res.errore === "zero" ? (
            <div style={{ fontSize: 13, color: "#4A6152", lineHeight: 1.5 }}>
              ⚠️ <b>{ingB.nome}</b> non contiene {crit.label.toLowerCase()}: l'equivalenza con questo criterio non è calcolabile. Prova con le calorie.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "#4A6152", marginBottom: 6 }}>
                {unitEff === "pz" ? `${fmt1(parseFloat(String(qta).replace(",", ".")) || 0)} pz` : `${fmt1(gramsA)}g`} di <b>{ingA.nome}</b> = {fmt1(res.valore)} {crit.unita} di {crit.label.toLowerCase()}
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#15251C", lineHeight: 1.35 }}>
                ≈ {fmt1(res.gramsB)}g di {ingB.nome}
                {res.pezziB != null && <span style={{ color: "#2F6B3A" }}> · {fmt1(res.pezziB)} pezzi</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tool: misure casalinghe ─────────────────────────────────────────

function CasalingheTool() {
  const [ing, setIng]   = useState(null);
  const [grammi, setGrammi] = useState("");
  const g = parseFloat(String(grammi).replace(",", ".")) || 0;
  const pesoPz = ing ? PESO_PEZZO[ing.id] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8AA192", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>Grammi</div>
        <input inputMode="decimal" value={grammi} onChange={e => setGrammi(e.target.value)} placeholder="es. 80"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E7EDE2", fontSize: 14, fontWeight: 700, background: "#F8FAF6", outline: "none" }}/>
      </div>
      <IngPicker label="Alimento (facoltativo, serve per i pezzi)" value={ing} onPick={setIng}/>
      {g > 0 && (
        <div style={{ background: "#EDF7EF", border: "1.5px solid #2F6B3A30", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "#4A6152", marginBottom: 6 }}>{fmt1(g)}g equivalgono a circa:</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#15251C", lineHeight: 1.7 }}>
            {UNITA_CASA.map(u => <div key={u.key}>🥄 {fmt1(g / u.g)} {u.label}</div>)}
            {pesoPz && <div>🍽 {fmt1(g / pesoPz)} pezzi di {ing.nome.toLowerCase()}</div>}
          </div>
          <div style={{ fontSize: 10.5, color: "#8AA192", marginTop: 6 }}>Cucchiaio ≈ 10g · cucchiaino ≈ 5g (stesse convenzioni del piano)</div>
        </div>
      )}
    </div>
  );
}

// ─── Hub ─────────────────────────────────────────────────────────────

const card = { background: "#fff", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };

export function StrumentiPage({ onGo }) {
  const [vista, setVista] = useState("hub");

  const TOOLS = [
    { id: "equivalenze", icon: "🔄", t: "Equivalenze cibi",   d: "A quante pesche corrisponde una banana e ½", badge: "nuovo" },
    { id: "casalinghe",  icon: "🥄", t: "Misure casalinghe",  d: "Cucchiai, cucchiaini e pezzi in grammi",     badge: "nuovo" },
    { go: "ricette",     icon: "📖", t: "Editor ricette",     d: "Crea, duplica e trasforma in ingredienti" },
    { go: "misure",      icon: "⚖️", t: "Peso forma & BMI",   d: "Obiettivo, % grasso e progressi" },
    { go: "spesa",       icon: "🛒", t: "Lista spesa smart",  d: "Consumo-aware, extra e spunta condivisa" },
    { go: "oggi",        icon: "💧", t: "Tracker acqua",      d: "I bicchieri di oggi, per persona" },
    { soon: true,        icon: "🧮", t: "Fabbisogno energetico", d: "BMR, TDEE e macro spiegati" },
    { soon: true,        icon: "⌚", t: "Costituzione (polso)",  d: "Affina il peso forma con l'indice di Grant" },
    { soon: true,        icon: "📊", t: "Analizzatore ricetta",  d: "Macro di qualsiasi preparazione" },
    { soon: true,        icon: "🍑", t: "Stagionalità",          d: "Frutta e verdura del mese" },
  ];

  if (vista !== "hub") {
    const tool = TOOLS.find(t => t.id === vista);
    return (
      <div style={{ padding: "16px 14px 90px" }}>
        <button onClick={() => setVista("hub")}
          style={{ border: "none", background: "none", color: "#2F6B3A", fontWeight: 800, fontSize: 13, cursor: "pointer", padding: "0 0 12px", display: "flex", alignItems: "center", gap: 5 }}>
          ‹ Strumenti
        </button>
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#15251C", marginBottom: 3 }}>{tool.icon} {tool.t}</div>
          <div style={{ fontSize: 12, color: "#9DB1A2", marginBottom: 16 }}>{tool.d}</div>
          {vista === "equivalenze" && <EquivalenzeTool/>}
          {vista === "casalinghe"  && <CasalingheTool/>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 14px 90px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#15251C", marginBottom: 2 }}>🧰 Strumenti</div>
      <div style={{ fontSize: 12.5, color: "#6E8576", marginBottom: 16, lineHeight: 1.5 }}>
        Convertitori e calcolatori di Fitsy: usali al volo, anche fuori dal piano.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {TOOLS.map((t, i) => (
          <button key={i} disabled={!!t.soon}
            onClick={() => t.soon ? null : t.id ? setVista(t.id) : onGo?.(t.go)}
            style={{ ...card, position: "relative", padding: "14px 12px", border: "1px solid #E7EDE2", textAlign: "left",
                     cursor: t.soon ? "default" : "pointer", opacity: t.soon ? 0.55 : 1, display: "flex",
                     flexDirection: "column", gap: 6, minHeight: 96 }}>
            {t.badge && <span style={{ position: "absolute", top: 8, right: 8, fontSize: 8.5, fontWeight: 900, background: "#2F6B3A", color: "#fff", borderRadius: 5, padding: "2px 5px", letterSpacing: 0.5 }}>NUOVO</span>}
            {t.soon  && <span style={{ position: "absolute", top: 8, right: 8, fontSize: 8.5, fontWeight: 900, background: "#EFF3EC", color: "#8AA192", borderRadius: 5, padding: "2px 5px", letterSpacing: 0.5 }}>IN ARRIVO</span>}
            <span style={{ fontSize: 24, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#15251C", lineHeight: 1.25 }}>{t.t}</span>
            <span style={{ fontSize: 10.5, color: "#9DB1A2", lineHeight: 1.35 }}>{t.d}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
