import React from 'react';
const { useState, useMemo, useEffect } = React;
import { calcTargetAdattivo, normalizzaMacroSplit, ridistribuisciMacro } from '@/core';
import { EmptyState } from '@/components/shared';

// Colori macro coerenti con il resto dell'app
const COL = { p: "#2563eb", c: "#f59e0b", g: "#10b981" };
const LABEL = { p: "Proteine", c: "Carboidrati", g: "Grassi" };
const KCAL_PER_G = { p: 4, c: 4, g: 9 };

// Genera il path SVG di una fetta di torta (donut) tra due angoli.
function arcPath(cx, cy, rOut, rIn, a0, a1) {
  const pol = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  const [x0o, y0o] = pol(rOut, a0), [x1o, y1o] = pol(rOut, a1);
  const [x1i, y1i] = pol(rIn, a1),  [x0i, y0i] = pol(rIn, a0);
  return `M ${x0o} ${y0o} A ${rOut} ${rOut} 0 ${large} 1 ${x1o} ${y1o} `
       + `L ${x1i} ${y1i} A ${rIn} ${rIn} 0 ${large} 0 ${x0i} ${y0i} Z`;
}

function Torta({ split }) {
  const W = 200, cx = 100, cy = 100, rOut = 90, rIn = 52;
  const ordine = ["p", "c", "g"];
  let ang = -Math.PI / 2; // parte dall'alto
  const fette = ordine.map(k => {
    const frac = split[k] / 100;
    const a0 = ang, a1 = ang + frac * Math.PI * 2;
    ang = a1;
    return { k, a0, a1, frac };
  });
  return (
    <svg viewBox={`0 0 ${W} ${W}`} style={{ width: "100%", maxWidth: 240, display: "block", margin: "0 auto" }}>
      {fette.map(f => (
        f.frac > 0.001 && (
          <path key={f.k} d={arcPath(cx, cy, rOut, rIn, f.a0, f.a1)}
                fill={COL[f.k]} stroke="#fff" strokeWidth="2" />
        )
      ))}
    </svg>
  );
}

export function DietaPage({ persona, misure, onUpdatePersona }) {
  if (!persona) {
    return <div style={{ padding: 20 }}><EmptyState emoji="🥧" title="Nessun profilo"
      text="Seleziona o crea un profilo per impostare la ripartizione della dieta." /></div>;
  }

  // Target attuale (per le calorie e la ripartizione di partenza)
  const target = useMemo(() => calcTargetAdattivo(persona, misure || []), [persona, misure]);

  // Split di partenza: quello salvato sul profilo, oppure quello "di fatto"
  // calcolato dai grammi attuali (così l'utente parte dall'equilibrio reale).
  const splitIniziale = useMemo(() => {
    if (persona.macroSplit) return normalizzaMacroSplit(persona.macroSplit);
    const kP = target.p * 4, kC = target.c * 4, kG = target.g * 9;
    const tot = kP + kC + kG;
    if (tot <= 0) return { p: 30, c: 45, g: 25 };
    return normalizzaMacroSplit({ p: kP / tot * 100, c: kC / tot * 100, g: kG / tot * 100 });
  }, [persona.macroSplit, target.p, target.c, target.g]);

  const [split, setSplit] = useState(splitIniziale);
  const [dirty, setDirty] = useState(false);

  // Se cambia il profilo selezionato, riallinea
  useEffect(() => { setSplit(splitIniziale); setDirty(false); }, [persona.id]);

  const personalizzata = !!persona.macroSplit;

  // Calorie fisse: la torta ridistribuisce, non cambia il totale.
  const kcal = target.kcal;
  const grammi = {
    p: Math.round((kcal * split.p / 100) / KCAL_PER_G.p),
    c: Math.round((kcal * split.c / 100) / KCAL_PER_G.c),
    g: Math.round((kcal * split.g / 100) / KCAL_PER_G.g),
  };

  // Avviso minimo proteico (riusa la soglia calcolata dal motore)
  const pMin = target.pMinSano || 0;
  const sottoMinimo = grammi.p < pMin;

  // Cambia una fetta: le altre due si spartiscono il resto in proporzione.
  const cambia = (k, nuovoValore) => {
    const v = Math.max(0, Math.min(100, Math.round(nuovoValore)));
    const altre = ["p", "c", "g"].filter(x => x !== k);
    const { a, b } = ridistribuisciMacro(v, split[altre[0]], split[altre[1]]);
    const next = normalizzaMacroSplit({ [k]: v, [altre[0]]: a, [altre[1]]: b });
    setSplit(next);
    setDirty(true);
  };

  const salva = () => {
    onUpdatePersona({ ...persona, macroSplit: split });
    setDirty(false);
  };

  const ripristina = () => {
    const { macroSplit, ...senza } = persona;
    onUpdatePersona(senza);
    setDirty(false);
  };

  const card = { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 14 };

  return (
    <div style={{ padding: "16px 16px 90px", maxWidth: 560, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 4px" }}>🥧 Dieta</h2>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>
        Sposta le percentuali per sbilanciare la dieta a favore di un macronutriente.
        Le calorie totali restano invariate ({kcal} kcal): cambia solo come vengono distribuite,
        e il piano ricalcola ingredienti e quantità di conseguenza.
      </p>

      <div style={card}>
        <Torta split={split} />
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          {["p", "c", "g"].map(k => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: COL[k], display: "inline-block" }} />
              <strong>{LABEL[k]}</strong> {split[k]}% · {grammi[k]} g
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        {["p", "c", "g"].map(k => (
          <div key={k} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: COL[k] }}>{LABEL[k]}</span>
              <span style={{ color: "#475569" }}>{split[k]}% — {grammi[k]} g</span>
            </div>
            <input type="range" min="0" max="100" value={split[k]}
              onChange={e => cambia(k, +e.target.value)}
              style={{ width: "100%", accentColor: COL[k] }} />
          </div>
        ))}
      </div>

      {sottoMinimo && (
        <div style={{ ...card, background: "#fffbeb", border: "1px solid #fde68a" }}>
          <div style={{ fontSize: 13, color: "#92400e", lineHeight: 1.5 }}>
            ⚠️ Con questa ripartizione le proteine ({grammi.p} g) scendono sotto il minimo
            consigliato di <strong>{pMin} g</strong> (circa 1,6 g per kg). Va bene per brevi
            periodi, ma a lungo non è ideale per preservare la massa muscolare.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={salva} disabled={!dirty}
          style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", fontWeight: 600,
                   color: "#fff", background: dirty ? "#2563eb" : "#cbd5e1",
                   cursor: dirty ? "pointer" : "default" }}>
          {personalizzata && !dirty ? "Salvato ✓" : "Applica al piano"}
        </button>
        {personalizzata && (
          <button onClick={ripristina}
            style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #cbd5e1",
                     background: "#fff", color: "#475569", fontWeight: 600, cursor: "pointer" }}>
            Equilibrio consigliato
          </button>
        )}
      </div>

      {!personalizzata && !dirty && (
        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10, textAlign: "center" }}>
          Stai usando la ripartizione consigliata in base al tuo profilo e alle tue misure.
        </p>
      )}
    </div>
  );
}
