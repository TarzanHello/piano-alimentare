import React from 'react';
const { useState, useMemo } = React;
import { ING_MAP, INGREDIENTS, PESO_PEZZO, cercaIngredienti, pesoPezzoInfo, calcTarget, indiceGrant, nutriPer100DaQuantita, LAVORI, OBIETTIVI, SESSI } from '@/core';
export { indiceGrant };
import { salvaTaratura, contaTarature } from '@/db/tarature';
import { AddIngredientModal } from '@/features/ingredienti/IngredientiPage';
import { addCustomIngredient } from '@/db/customIngredients';
import { toast } from '@/components/toast';


// ─── Helper puri (esportati per i test) ──────────────────────────────

// Equivalenza tra due cibi a parità di criterio (kcal | p | c | g).
// I pezzi sono presentazione: si risolvono in grammi via pesoPezzoInfo
// (taratura famiglia > mediana DB > mediana range). Se il calibro di B
// è incerto, `pezzi.range` fornisce l'intervallo onesto da mostrare al
// posto del decimale fasullo.
export function calcolaEquivalenza(ingA, gramsA, ingB, criterio) {
  const na = ingA?.nutri, nb = ingB?.nutri;
  if (!na || !nb || !gramsA) return null;
  const valore = (na[criterio] || 0) * gramsA / 100;
  const densB = (nb[criterio] || 0) / 100;
  if (densB <= 0) return { valore, errore: "zero" };
  const gramsB = valore / densB;
  const info = pesoPezzoInfo(ingB.id);
  let pezzi = null;
  if (info) {
    pezzi = { n: gramsB / info.g, fonte: info.fonte, incerto: info.incerto };
    if (info.incerto) pezzi.range = [gramsB / info.range[1], gramsB / info.range[0]];
  }
  return { valore, gramsB, pezzi };
}

const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString("it-IT");
// Parsing numerico tollerante alla virgola italiana ("19,7" → 19.7).
// L'unario + su stringhe con la virgola dà NaN: bug field test 13/07
// (Costituzione muta con polso 19,7).
const num = v => parseFloat(String(v).replace(",", ".")) || 0;
const MESI = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

// Testo pezzi onesto: range se incerto, decimale se tarato o stabile.
function testoPezzi(pezzi, nome) {
  if (!pezzi) return null;
  if (pezzi.incerto) return `≈ ${fmt1(pezzi.range[0])}–${fmt1(pezzi.range[1])} ${nome}`;
  return `≈ ${fmt1(pezzi.n)} ${nome}${pezzi.fonte === "taratura" ? " 🎯" : ""}`;
}

// ─── Wizard taratura (gamificato) ────────────────────────────────────

function TaraturaModal({ ing, onDone, onClose }) {
  const [nPezzi, setNPezzi] = useState(5);
  const [totale, setTotale] = useState("");
  const g = parseFloat(String(totale).replace(",", ".")) || 0;
  const perPezzo = nPezzi > 0 ? g / nPezzi : 0;
  const info = pesoPezzoInfo(ing.id);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 20, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#15251C" }}>🎯 Tara i tuoi {ing.nome.toLowerCase()}</div>
        <div style={{ fontSize: 12, color: "#6E8576", lineHeight: 1.5, margin: "6px 0 14px" }}>
          Il calibro cambia da partita a partita{info?.range ? ` (da ${info.range[0]} a ${info.range[1]}g al pezzo!)` : ""}. Pesa qualche pezzo con la bilancia da cucina e Fitsy sarà preciso al grammo con quelli che compri tu.
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8AA192", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>Quanti pezzi hai sulla bilancia?</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[3, 5, 10].map(n => (
            <button key={n} onClick={() => setNPezzi(n)}
              style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: `1.5px solid ${nPezzi === n ? "#2F6B3A" : "#E7EDE2"}`, background: nPezzi === n ? "#2F6B3A14" : "#F8FAF6", color: nPezzi === n ? "#2F6B3A" : "#6E8576", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{n}</button>
          ))}
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8AA192", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>Peso totale (g)</div>
        <input inputMode="decimal" value={totale} onChange={e => setTotale(e.target.value)} placeholder={`es. ${(info?.g || 15) * nPezzi}`}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E7EDE2", fontSize: 15, fontWeight: 700, background: "#F8FAF6", outline: "none" }}/>
        {perPezzo > 0 && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#2F6B3A", fontWeight: 700 }}>→ {fmt1(perPezzo)}g al pezzo</div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 11, border: "1.5px solid #E7EDE2", background: "#fff", color: "#6E8576", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Annulla</button>
          <button disabled={!(perPezzo > 0)} onClick={async () => {
              await salvaTaratura(ing.id, perPezzo);
              toast(`🏅 Calibro tarato! I tuoi ${ing.nome.toLowerCase()} pesano ${fmt1(perPezzo)}g l'uno`);
              onDone?.();
            }}
            style={{ flex: 1.4, padding: "11px 0", borderRadius: 11, border: "none", background: perPezzo > 0 ? "#2F6B3A" : "#C2D0C6", color: "#fff", fontWeight: 800, fontSize: 13, cursor: perPezzo > 0 ? "pointer" : "default" }}>Salva taratura</button>
        </div>
      </div>
    </div>
  );
}

// CTA compatta "tara questo alimento", mostrata quando i pezzi sono incerti
function TaraCta({ ing, onTara }) {
  return (
    <button onClick={() => onTara(ing)}
      style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 9, border: "1.5px dashed #2F6B3A70", background: "#fff", color: "#2F6B3A", fontWeight: 800, fontSize: 11, cursor: "pointer" }}>
      🎯 Tara i tuoi {ing.nome.toLowerCase()} → precisione al grammo
    </button>
  );
}

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

function EquivalenzeTool({ onTara, taraTick }) {
  const [ingA, setIngA] = useState(null);
  const [ingB, setIngB] = useState(null);
  const [qta, setQta]   = useState("");
  const [unitA, setUnitA] = useState("g");
  const [criterio, setCriterio] = useState("kcal");

  const infoA = ingA ? pesoPezzoInfo(ingA.id) : null;     // taraTick forza il ricalcolo dopo una taratura
  const unitEff = infoA ? unitA : "g";
  const nQta = parseFloat(String(qta).replace(",", ".")) || 0;
  const gramsA = nQta * (unitEff === "pz" ? (infoA?.g || 0) : 1);
  const res = useMemo(() => (ingA && ingB && gramsA > 0) ? calcolaEquivalenza(ingA, gramsA, ingB, criterio) : null,
    [ingA, ingB, gramsA, criterio, taraTick]);
  const crit = CRITERI.find(c => c.key === criterio);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <IngPicker label="Da" value={ingA} onPick={i => { setIngA(i); setUnitA(i && pesoPezzoInfo(i.id) ? "pz" : "g"); }}/>
      {ingA && (
        <div>
          <div style={{ display: "flex", gap: 8 }}>
            <input inputMode="decimal" value={qta} onChange={e => setQta(e.target.value)} placeholder="Quantità"
              style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E7EDE2", fontSize: 14, fontWeight: 700, background: "#F8FAF6", outline: "none" }}/>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setUnitA("g")}
                style={{ padding: "0 14px", borderRadius: 10, border: `1.5px solid ${unitEff === "g" ? "#2F6B3A" : "#E7EDE2"}`, background: unitEff === "g" ? "#2F6B3A14" : "#F8FAF6", color: unitEff === "g" ? "#2F6B3A" : "#6E8576", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>g</button>
              {infoA && (
                <button onClick={() => setUnitA("pz")}
                  style={{ padding: "0 12px", borderRadius: 10, border: `1.5px solid ${unitEff === "pz" ? "#2F6B3A" : "#E7EDE2"}`, background: unitEff === "pz" ? "#2F6B3A14" : "#F8FAF6", color: unitEff === "pz" ? "#2F6B3A" : "#6E8576", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>pezzi</button>
              )}
            </div>
          </div>
          {unitEff === "pz" && infoA && (
            <div style={{ marginTop: 5, fontSize: 10.5, color: "#8AA192" }}>
              1 pezzo = {fmt1(infoA.g)}g {infoA.fonte === "taratura" ? "(tarato 🎯)" : infoA.incerto ? `(mediana: il calibro varia ${infoA.range[0]}–${infoA.range[1]}g)` : ""}
            </div>
          )}
          {unitEff === "pz" && infoA?.incerto && <TaraCta ing={ingA} onTara={onTara}/>}
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
                {unitEff === "pz" ? `${fmt1(nQta)} pz (${fmt1(gramsA)}g)` : `${fmt1(gramsA)}g`} di <b>{ingA.nome}</b> = {fmt1(res.valore)} {crit.unita} di {crit.label.toLowerCase()}
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#15251C", lineHeight: 1.35 }}>
                ≈ {fmt1(res.gramsB)}g di {ingB.nome}
                {res.pezzi && <span style={{ color: "#2F6B3A" }}> · {testoPezzi(res.pezzi, "pezzi")}</span>}
              </div>
              {res.pezzi?.incerto && <TaraCta ing={ingB} onTara={onTara}/>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tool: misure casalinghe ─────────────────────────────────────────

const UNITA_CASA = [
  { key: "cucchiaio",  label: "cucchiai",   g: 10 },
  { key: "cucchiaino", label: "cucchiaini", g: 5  },
];

function CasalingheTool({ onTara, taraTick }) {
  const [ing, setIng]   = useState(null);
  const [grammi, setGrammi] = useState("");
  const g = parseFloat(String(grammi).replace(",", ".")) || 0;
  const info = ing ? pesoPezzoInfo(ing.id) : null;
  void taraTick;

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
            {info && <div>🍽 {testoPezzi({ n: g / info.g, fonte: info.fonte, incerto: info.incerto, range: info.incerto ? [g / info.range[1], g / info.range[0]] : null }, `pezzi di ${ing.nome.toLowerCase()}`)}</div>}
          </div>
          {info?.incerto && <TaraCta ing={ing} onTara={onTara}/>}
          <div style={{ fontSize: 10.5, color: "#8AA192", marginTop: 6 }}>Cucchiaio ≈ 10g · cucchiaino ≈ 5g (stesse convenzioni del piano)</div>
        </div>
      )}
    </div>
  );
}

// ─── Tool: stagionalità ──────────────────────────────────────────────

function StagionalitaTool() {
  const [mese, setMese] = useState(new Date().getMonth() + 1);
  const diStagione = useMemo(() =>
    INGREDIENTS.filter(i => Array.isArray(i.stagioni) && i.stagioni.includes(mese)), [mese]);
  const gruppi = useMemo(() => {
    const g = {};
    for (const i of diStagione) (g[i.cat] = g[i.cat] || []).push(i);
    return Object.entries(g).sort();
  }, [diStagione]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4, marginBottom: 14 }}>
        {MESI.map((m, i) => (
          <button key={m} onClick={() => setMese(i + 1)}
            style={{ padding: "7px 0", borderRadius: 8, border: `1.5px solid ${mese === i + 1 ? "#2F6B3A" : "#E7EDE2"}`, background: mese === i + 1 ? "#2F6B3A14" : "#F8FAF6", color: mese === i + 1 ? "#2F6B3A" : "#6E8576", fontWeight: 800, fontSize: 10.5, cursor: "pointer" }}>{m}</button>
        ))}
      </div>
      {gruppi.length === 0 && <div style={{ fontSize: 12.5, color: "#9DB1A2" }}>Nessun dato di stagionalità per questo mese.</div>}
      {gruppi.map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#8AA192", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{cat}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {items.map(i => (
              <span key={i.id} style={{ fontSize: 12, fontWeight: 700, color: "#15251C", background: "#EDF7EF", border: "1px solid #2F6B3A25", borderRadius: 9, padding: "5px 10px" }}>{i.nome}</span>
            ))}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 10.5, color: "#8AA192", marginTop: 4 }}>Il piano privilegia già gli ingredienti di stagione: qui li vedi in anticipo per la spesa.</div>
    </div>
  );
}

// ─── Tool: fabbisogno energetico ─────────────────────────────────────
// Riusa calcTarget del motore (LARN/SINU per adulti, Mifflin per minori):
// gli stessi numeri del piano, spiegati passo per passo. Modalità ospite:
// nessun dato viene salvato.

const stileInput = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E7EDE2", fontSize: 14, fontWeight: 700, background: "#F8FAF6", outline: "none" };
const stileLabel = { fontSize: 10.5, fontWeight: 800, color: "#8AA192", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 };
const chip = (attivo, colore = "#2F6B3A") => ({ flex: 1, padding: "8px 2px", borderRadius: 9, border: `1.5px solid ${attivo ? colore : "#E7EDE2"}`, background: attivo ? colore + "14" : "#F8FAF6", color: attivo ? colore : "#6E8576", fontWeight: 800, fontSize: 11, cursor: "pointer" });

function FabbisognoTool() {
  const [f, setF] = useState({ sesso: "M", eta: "", peso: "", altezza: "", lavoro: "attivo", allenamenti: 2, obiettivo: "mantenimento" });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const pronto = num(f.eta) > 0 && num(f.peso) > 0 && num(f.altezza) > 0;
  const res = useMemo(() => {
    if (!pronto) return null;
    try {
      return calcTarget({ sesso: f.sesso, eta: num(f.eta), peso: num(f.peso), altezza: num(f.altezza), lavoro: f.lavoro, allenamenti: +f.allenamenti, obiettivo: f.obiettivo });
    } catch { return null; }
  }, [f, pronto]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <div style={{ display: "flex", gap: 5 }}>
        {SESSI.map(s => <button key={s.key} onClick={() => set("sesso", s.key)} style={chip(f.sesso === s.key)}>{s.label}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[["eta", "Età"], ["peso", "Peso (kg)"], ["altezza", "Altezza (cm)"]].map(([k, l]) => (
          <div key={k}>
            <div style={stileLabel}>{l}</div>
            <input inputMode="decimal" value={f[k]} onChange={e => set(k, e.target.value)} style={stileInput}/>
          </div>
        ))}
      </div>
      <div>
        <div style={stileLabel}>Lavoro</div>
        <div style={{ display: "flex", gap: 5 }}>
          {LAVORI.map(l => <button key={l.key} onClick={() => set("lavoro", l.key)} style={chip(f.lavoro === l.key)}>{l.label}</button>)}
        </div>
      </div>
      <div>
        <div style={stileLabel}>Allenamenti a settimana: {f.allenamenti}</div>
        <input type="range" min="0" max="7" value={f.allenamenti} onChange={e => set("allenamenti", e.target.value)} style={{ width: "100%" }}/>
      </div>
      <div>
        <div style={stileLabel}>Obiettivo</div>
        <div style={{ display: "flex", gap: 5 }}>
          {OBIETTIVI.map(o => <button key={o.key} onClick={() => set("obiettivo", o.key)} style={chip(f.obiettivo === o.key)}>{o.label}</button>)}
        </div>
      </div>

      {res && (
        <div style={{ background: "#EDF7EF", border: "1.5px solid #2F6B3A30", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "#4A6152", lineHeight: 1.7 }}>
            {res.larnInfo
              ? <>Metabolismo basale (LARN/SINU): <b>{Math.round(res.larnInfo.mb)} kcal</b><br/>× LAF {res.larnInfo.laf} (lavoro + sport) → fabbisogno <b>{Math.round(res.tdeeMifflin)} kcal</b></>
              : <>Fabbisogno stimato (Mifflin-St Jeor × stile): <b>{Math.round(res.tdeeMifflin)} kcal</b></>}
            {res.noteObiettivo ? <><br/>{res.noteObiettivo}</> : null}
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#15251C", margin: "8px 0 6px" }}>🎯 {res.kcal} kcal/giorno</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["P", res.p, "#1FA2D8"], ["C", res.c, "#F2A93B"], ["G", res.g, "#8E7BE8"]].map(([l, v, c]) => (
              <div key={l} style={{ flex: 1, textAlign: "center", background: c + "12", borderRadius: 8, padding: "6px 4px" }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: c }}>{l} </span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "#15251C" }}>{v}g</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "#8AA192", marginTop: 8 }}>
            Proteine: {(res.p / num(f.peso)).toFixed(1)} g/kg di peso. Stessi metodi del piano Fitsy; qui non viene salvato nulla.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tool: costituzione (indice di Grant, polso) ─────────────────────

function CostituzioneTool() {
  const [f, setF] = useState({ sesso: "M", altezza: "", polso: "", peso: "" });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const res = useMemo(() => indiceGrant(f.sesso, num(f.altezza), num(f.polso)), [f.sesso, f.altezza, f.polso]);
  const ETICHETTE = { esile: ["🪶 Esile", "ossatura leggera: peso forma più basso del riferimento"],
                      normale: ["⚖️ Normale", "ossatura media: peso forma in linea col riferimento"],
                      robusta: ["🪨 Robusta", "ossatura importante: peso forma più alto del riferimento"] };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <div style={{ display: "flex", gap: 5 }}>
        {SESSI.map(s => <button key={s.key} onClick={() => set("sesso", s.key)} style={chip(f.sesso === s.key)}>{s.label}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[["altezza", "Altezza (cm)"], ["polso", "Polso (cm)"], ["peso", "Peso (opz.)"]].map(([k, l]) => (
          <div key={k}>
            <div style={stileLabel}>{l}</div>
            <input inputMode="decimal" value={f[k]} onChange={e => set(k, e.target.value)} style={stileInput}/>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: "#8AA192", lineHeight: 1.4 }}>
        📏 Misura la circonferenza del polso della mano dominante, sotto l'osso sporgente, con un metro da sarta.
      </div>

      {res && (
        <div style={{ background: "#EDF7EF", border: "1.5px solid #2F6B3A30", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "#4A6152" }}>Indice di Grant: <b>{res.indice}</b> (altezza ÷ polso)</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#15251C", margin: "6px 0 2px" }}>{ETICHETTE[res.tipo][0]}</div>
          <div style={{ fontSize: 11.5, color: "#4A6152", lineHeight: 1.5 }}>Costituzione {res.tipo}: {ETICHETTE[res.tipo][1]}.</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#2F6B3A", marginTop: 8 }}>
            Peso forma indicativo: {fmt1(res.pesoForma[0])}–{fmt1(res.pesoForma[1])} kg
          </div>
          {num(f.peso) > 0 && (
            <div style={{ fontSize: 11.5, color: "#4A6152", marginTop: 4 }}>
              {num(f.peso) < res.pesoForma[0] ? `Sei ${fmt1(res.pesoForma[0] - num(f.peso))} kg sotto il range.`
               : num(f.peso) > res.pesoForma[1] ? `Sei ${fmt1(num(f.peso) - res.pesoForma[1])} kg sopra il range.`
               : "✓ Sei dentro il range per la tua costituzione."}
            </div>
          )}
          <div style={{ fontSize: 10.5, color: "#8AA192", marginTop: 8, lineHeight: 1.4 }}>
            Metodo: riferimento BMI 22 corretto ±7,5% per la costituzione ossea. È un'indicazione orientativa, non un giudizio clinico: il peso forma del piano usa anche composizione corporea e obiettivo.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tool: analizzatore ricetta ──────────────────────────────────────
// Componi una preparazione libera → macro totali, per porzione e per
// 100g. Da qui la puoi salvare come ingrediente custom (🧪), stessa
// strada della card ricetta.

function AnalizzatoreTool() {
  const [righe, setRighe] = useState([]);           // [{ing, qta, unit}]
  const [porzioni, setPorzioni] = useState(4);
  const [salva, setSalva] = useState(false);

  const quantita = useMemo(() => {
    const q = {};
    for (const r of righe) {
      const n = parseFloat(String(r.qta).replace(",", ".")) || 0;
      if (r.ing && n > 0) q[r.ing.id] = { g: n, unit: r.unit };
    }
    return q;
  }, [righe]);
  const res = useMemo(() => Object.keys(quantita).length ? nutriPer100DaQuantita(quantita) : null, [quantita]);
  const tot = res ? Object.fromEntries(Object.entries(res.per100).map(([k, v]) => [k, v * res.pesoTotale / 100])) : null;

  const setRiga = (i, patch) => setRighe(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {righe.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {r.ing
              ? <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#2F6B3A10", border: "1.5px solid #2F6B3A40", borderRadius: 10, padding: "9px 10px" }}>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "#15251C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ing.nome}</span>
                </div>
              : <IngPicker label={`Ingrediente ${i + 1}`} value={null} onPick={ing => setRiga(i, { ing, unit: "g" })}/>}
          </div>
          {r.ing && <>
            <input inputMode="decimal" value={r.qta} onChange={e => setRiga(i, { qta: e.target.value })} placeholder="q.tà"
              style={{ width: 62, padding: "10px 8px", borderRadius: 10, border: "1.5px solid #E7EDE2", fontSize: 13, fontWeight: 700, background: "#F8FAF6", outline: "none", textAlign: "center" }}/>
            <select value={r.unit} onChange={e => setRiga(i, { unit: e.target.value })}
              style={{ padding: "10px 4px", borderRadius: 10, border: "1.5px solid #E7EDE2", fontSize: 12, fontWeight: 700, background: "#F8FAF6", color: "#4A6152" }}>
              <option value="g">g</option><option value="ml">ml</option>
              <option value="cucchiaio">cucch.</option><option value="cucchiaino">cucch.no</option>
              {pesoPezzoInfo(r.ing.id) && <option value="pz">pz</option>}
            </select>
          </>}
          <button onClick={() => setRighe(rs => rs.filter((_, j) => j !== i))}
            style={{ border: "none", background: "none", color: "#dc2626", fontWeight: 800, fontSize: 15, cursor: "pointer", padding: "10px 2px" }}>✕</button>
        </div>
      ))}
      <button onClick={() => setRighe(rs => [...rs, { ing: null, qta: "", unit: "g" }])}
        style={{ padding: "10px 0", borderRadius: 10, border: "1.5px dashed #2F6B3A70", background: "#fff", color: "#2F6B3A", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>＋ Aggiungi ingrediente</button>

      {res && tot && (
        <div style={{ background: "#EDF7EF", border: "1.5px solid #2F6B3A30", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "#4A6152", marginBottom: 6 }}>Batch: <b>{res.pesoTotale}g</b> · {Math.round(tot.kcal)} kcal totali</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#4A6152" }}>Porzioni:</span>
            {[1, 2, 4, 6, 8].map(n => (
              <button key={n} onClick={() => setPorzioni(n)} style={{ ...chip(porzioni === n), flex: "none", padding: "5px 11px" }}>{n}</button>
            ))}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#15251C" }}>
            {Math.round(tot.kcal / porzioni)} kcal a porzione
            <span style={{ fontSize: 12, fontWeight: 700, color: "#4A6152" }}> · P {fmt1(tot.p / porzioni)}g · C {fmt1(tot.c / porzioni)}g · G {fmt1(tot.g / porzioni)}g</span>
          </div>
          <div style={{ fontSize: 11, color: "#8AA192", marginTop: 4 }}>
            Per 100g: {res.per100.kcal} kcal · P {res.per100.p} · C {res.per100.c} · G {res.per100.g} (peso a crudo)
          </div>
          <button onClick={() => setSalva(true)}
            style={{ marginTop: 10, padding: "9px 14px", borderRadius: 10, border: "1.5px solid #7c3aed", background: "#f5f3ff", color: "#7c3aed", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
            🧪 Salva come ingrediente
          </button>
        </div>
      )}

      {salva && res && (
        <AddIngredientModal
          initial={{ nome: "", cat: "🥫 Varie", deperibile: 5, stagioni: null, nutri: res.per100 }}
          sorgente="questa preparazione"
          onSave={async (data) => {
            try {
              await addCustomIngredient(data);
              toast("✓ Ingrediente creato: lo trovi in ricerca, ricette e spesa");
              setSalva(false);
            } catch (e) { toast(e?.message || "Errore nella creazione", "err"); }
          }}
          onClose={() => setSalva(false)}
        />
      )}
    </div>
  );
}

// ─── Tool: fabbisogno idrico ─────────────────────────────────────────
// 30–35 ml/kg/die (EFSA-compatibile) + ~500 ml per giorno di allenamento,
// spalmati sulla settimana. Alimenta mentalmente il tracker acqua di Oggi.

function IdricoTool() {
  const [peso, setPeso] = useState("");
  const [allen, setAllen] = useState(2);
  const kg = parseFloat(String(peso).replace(",", ".")) || 0;
  const ml = kg > 0 ? Math.round((kg * 32 + (allen * 500) / 7) / 50) * 50 : 0;
  const bicchieri = ml ? Math.round(ml / 240) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div style={stileLabel}>Peso (kg)</div>
          <input inputMode="decimal" value={peso} onChange={e => setPeso(e.target.value)} style={stileInput}/>
        </div>
        <div>
          <div style={stileLabel}>Allenamenti/sett.: {allen}</div>
          <input type="range" min="0" max="7" value={allen} onChange={e => setAllen(+e.target.value)} style={{ width: "100%", marginTop: 12 }}/>
        </div>
      </div>
      {ml > 0 && (
        <div style={{ background: "#EDF7EF", border: "1.5px solid #2F6B3A30", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#15251C" }}>💧 ≈ {(ml / 1000).toLocaleString("it-IT")} L al giorno</div>
          <div style={{ fontSize: 12.5, color: "#4A6152", marginTop: 3 }}>circa {bicchieri} bicchieri da 240 ml</div>
          <div style={{ fontSize: 10.5, color: "#8AA192", marginTop: 8, lineHeight: 1.4 }}>
            Stima: 32 ml/kg + quota allenamenti. Aumenta con caldo intenso, febbre o sudorazione abbondante. L'acqua degli alimenti conta: frutta e verdura aiutano.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pagina: flusso verticale, tutti i tool aperti ───────────────────
// Niente click per aprire: si scorre. Una chip-nav sticky evidenzia la
// sezione visibile e al tap ci salta con uno scroll morbido.

const { useRef, useEffect } = React;

const card = { background: "#fff", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };

const TOOLS = [
  { id: "equivalenze",  icon: "🔄", t: "Equivalenze cibi",      d: "A quante pesche corrisponde una banana e ½", nav: "Equivalenze",  col: "#2F6B3A" },
  { id: "casalinghe",   icon: "🥄", t: "Misure casalinghe",     d: "Cucchiai, cucchiaini e pezzi in grammi",     nav: "Casalinghe",   col: "#C77D1F" },
  { id: "stagionalita", icon: "🍑", t: "Stagionalità",          d: "Frutta e verdura del mese, mese per mese",   nav: "Stagioni",     col: "#E8792B" },
  { id: "fabbisogno",   icon: "🧮", t: "Fabbisogno energetico", d: "MB, LAF e macro spiegati, anche per ospiti", nav: "Fabbisogno",   col: "#1FA2D8" },
  { id: "costituzione", icon: "⌚", t: "Costituzione (polso)",  d: "Indice di Grant e peso forma per ossatura",  nav: "Costituzione", col: "#7c3aed" },
  { id: "analizzatore", icon: "📊", t: "Analizzatore ricetta",  d: "Macro di qualsiasi preparazione",            nav: "Analizzatore", col: "#0F766E" },
  { id: "idrico",       icon: "💧", t: "Fabbisogno idrico",     d: "Quanta acqua al giorno, in litri e bicchieri", nav: "Acqua",       col: "#0284c7" },
];

// Boundary per-sezione: un tool rotto (es. bundle misto dopo un deploy
// parziale, come da field test 12/07 sul tool Costituzione) degrada in
// una card d'errore locale invece di far crashare l'intero flusso.
class ToolBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.error("Strumenti/" + this.props.toolId + ":", err); } catch {} }
  render() {
    if (this.state.err) return (
      <div style={{ padding: "14px 4px", fontSize: 12.5, color: "#9a3412", lineHeight: 1.5 }}>
        ⚠️ Questo strumento ha avuto un problema e non può essere mostrato.
        Riavvia l'app (o aggiorna la pagina): se persiste, manda il log
        di sincronizzazione dal Menu.
        <div style={{ fontSize: 10, color: "#c2410c", marginTop: 6, fontFamily: "monospace" }}>{String(this.state.err?.message || this.state.err).slice(0, 120)}</div>
      </div>
    );
    return this.props.children;
  }
}

export function StrumentiPage() {
  const [taraIng, setTaraIng] = useState(null);   // ingrediente nel wizard taratura
  const [taraTick, setTaraTick] = useState(0);    // bump dopo ogni taratura → ricalcola i tool
  const [attivo, setAttivo] = useState("equivalenze");
  const refs = useRef({});
  const nTarati = contaTarature() + (taraTick && 0);

  // Evidenzia nella chip-nav la sezione più vicina alla cima del viewport
  useEffect(() => {
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => (fn(), null);
    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      raf(() => {
        pending = false;
        let best = TOOLS[0].id, bestY = -Infinity;
        for (const t of TOOLS) {
          const el = refs.current[t.id];
          if (!el) continue;
          const y = el.getBoundingClientRect().top;
          if (y <= 130 && y > bestY) { bestY = y; best = t.id; }
        }
        setAttivo(a => a === best ? a : best);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const vaiA = (id) => {
    setAttivo(id);
    refs.current[id]?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const corpo = (t) => {
    switch (t.id) {
      case "equivalenze":  return <EquivalenzeTool onTara={setTaraIng} taraTick={taraTick}/>;
      case "casalinghe":   return <CasalingheTool  onTara={setTaraIng} taraTick={taraTick}/>;
      case "stagionalita": return <StagionalitaTool/>;
      case "fabbisogno":   return <FabbisognoTool/>;
      case "costituzione": return <CostituzioneTool/>;
      case "analizzatore": return <AnalizzatoreTool/>;
      case "idrico":       return <IdricoTool/>;
      default: return null;
    }
  };

  return (
    <div style={{ padding: "16px 14px 90px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#15251C", flex: 1 }}>🧰 Strumenti</div>
        {nTarati > 0 && (
          <span title="Alimenti con calibro tarato dalla tua famiglia"
            style={{ fontSize: 10.5, fontWeight: 900, color: "#2F6B3A", background: "#EDF7EF", border: "1px solid #2F6B3A30", borderRadius: 9, padding: "4px 9px" }}>🎯 {nTarati} tarati</span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "#6E8576", marginBottom: 10, lineHeight: 1.5 }}>
        Sette utility pronte all'uso: scorri, sono tutte già aperte.
      </div>

      {/* Chip-nav sticky */}
      <div style={{ position: "sticky", top: 6, zIndex: 20, margin: "0 -14px 14px", padding: "6px 14px",
                    background: "linear-gradient(#F3F7F0 75%, #F3F7F000)", overflowX: "auto",
                    WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        <div style={{ display: "flex", gap: 6, width: "max-content" }}>
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => vaiA(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", borderRadius: 99,
                       border: `1.5px solid ${attivo === t.id ? t.col : "#E7EDE2"}`,
                       background: attivo === t.id ? t.col : "#fff",
                       color: attivo === t.id ? "#fff" : "#4A6152",
                       fontWeight: 800, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
                       boxShadow: "0 1px 3px rgba(0,0,0,0.07)", transition: "all 0.2s" }}>
              <span style={{ fontSize: 13 }}>{t.icon}</span>{t.nav}
            </button>
          ))}
        </div>
      </div>

      {/* Sezioni: tutti i tool aperti in flusso */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {TOOLS.map(t => (
          <section key={t.id} ref={el => { refs.current[t.id] = el; }} style={{ scrollMarginTop: 58 }}>
            <div style={{ ...card, overflow: "hidden", border: "1px solid #E7EDE2" }}>
              {/* banda d'accento */}
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px",
                            background: `linear-gradient(105deg, ${t.col}1E, ${t.col}08)`,
                            borderBottom: `2px solid ${t.col}30` }}>
                <span style={{ width: 38, height: 38, borderRadius: 12, background: "#fff",
                               boxShadow: `0 2px 8px ${t.col}30`, display: "flex", alignItems: "center",
                               justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{t.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#15251C", lineHeight: 1.2 }}>{t.t}</div>
                  <div style={{ fontSize: 11, color: "#6E8576", marginTop: 1 }}>{t.d}</div>
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <ToolBoundary toolId={t.id}>{corpo(t)}</ToolBoundary>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: "#9DB1A2", marginTop: 22 }}>
        🧰 Fine degli strumenti — altri in lavorazione
      </div>

      {taraIng && (
        <TaraturaModal ing={taraIng}
          onDone={() => { setTaraIng(null); setTaraTick(t => t + 1); }}
          onClose={() => setTaraIng(null)}/>
      )}
    </div>
  );
}
