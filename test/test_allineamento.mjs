// Test: allineamento ricette ↔ ingredienti (audit del 11/07 reso permanente).
//
// Origine: pra_11 "Wrap integrale + pollo" prometteva "2 wrap" e "hummus" in
// porzione, ma gli ingredienti erano proxy (pane, ceci) → in spesa i wrap non
// comparivano mai. Questo test impedisce la regressione su tre fronti:
//   1. integrità referenziale (ID ingredienti esistenti, quantita coerenti)
//   2. porzioni = solo quantità (niente istruzioni di cottura: quelle vanno
//      nel campo `preparazione`)
//   3. copertura semantica: i prodotti citati nel testo porzione devono
//      essere rappresentati da un ingrediente della ricetta.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ings = JSON.parse(readFileSync(join(root, 'src/data/ingredients.json'), 'utf8'));
const recs = JSON.parse(readFileSync(join(root, 'src/data/recipes.json'), 'utf8'));

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };

const ids = new Set(ings.map(i => i.id));
const nomeById = Object.fromEntries(ings.map(i => [i.id, i.nome]));
const tagsById = Object.fromEntries(ings.map(i => [i.id, i.tags || []]));

// ── 1) Integrità referenziale ───────────────────────────────────────
const orfani = [];
const qtyFuoriLista = [];
for (const r of recs) {
  const refs = new Set([...(r.ingredients || []), ...Object.keys(r.quantita || {})]);
  for (const id of refs) if (!ids.has(id)) orfani.push(`${r.id}:${id}`);
  for (const id of Object.keys(r.quantita || {}))
    if (!(r.ingredients || []).includes(id)) qtyFuoriLista.push(`${r.id}:${id}`);
}
ok(orfani.length === 0, `nessun ID orfano nelle ricette (trovati: ${orfani.join(', ') || '0'})`);
ok(qtyFuoriLista.length === 0, `ogni chiave di quantita è in ingredients[] (fuori: ${qtyFuoriLista.join(', ') || '0'})`);
ok(recs.every(r => r.quantita && Object.keys(r.quantita).length > 0), 'tutte le ricette hanno quantita');

// ── 2) Porzioni = solo quantità (le istruzioni vanno in `preparazione`) ──
const VERBI_COTTURA = /\b(cuoci|soffriggi|frulla|immergi|bolli|scalda|aggiungi|mescola|copri|metti|rosola|salta in|porta a bollore|lascia|spegni|taglia|servi|impila|appoggia|griglia|prep il giorno|ammollo)\b/i;
const conIstruzioni = [];
for (const r of recs)
  for (const [pk, txt] of Object.entries(r.porzioni || {}))
    if (VERBI_COTTURA.test(txt)) conIstruzioni.push(`${r.id}/${pk}`);
ok(conIstruzioni.length === 0, `nessuna istruzione di cottura nelle porzioni (trovate: ${conIstruzioni.join(', ') || '0'})`);

// ── 3) Copertura semantica porzione → ingredienti ───────────────────
// Normalizza, tronca la vocale finale (mela≈mele, uovo≈uova) e confronta
// per prefisso. PROXY_OK: termini collettivi o resi legittimamente da
// ingredienti con nome diverso.
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const stem = w => (w.length > 3 && 'aeiou'.includes(w.at(-1))) ? w.slice(0, -1) : w;
const STOP = new Set(`g ml l di e con al alla del della in da per su a o qb q.b
cucchiaio cucchiai cucchiaino cucchiaini fetta fette pezzo pezzi vasetto gambi gambo
bicchiere tazza manciata spicchio spicchi foglia foglie porzione piccolo piccola filo
grande medio media intero intera pugno pizzico spolverata scaglie cubetti dadini
fettine meta schiacciata schiacciati schiacciato matura tritato tritata tritate tritati
grattugiato grattugiata cotto cotta cotte crudo cruda crude integrale integrali light
fresco fresca fresche freschi leggero leggera abbondante caramellate solo senza per frullata grigliate grigliato grigliata grandi bollito bollita bollite`.split(/\s+/));
const PROXY_OK = new Set(`insalata verdure verdura frutta frutto mista misto crostini
grana zuppa minestrone vellutata smoothie condimento cumino curcuma cannella pancake
pancakes bowl mix novelle datterini evo bio`.split(/\s+/));

const scoperti = [];
for (const r of recs) {
  const ingStems = new Set();
  for (const iid of r.ingredients || []) {
    const fonte = [nomeById[iid] || '', ...(tagsById[iid] || [])].join(' ');
    for (const w of norm(fonte).match(/[a-z]+/g) || [])
      if (w.length >= 3) ingStems.add(stem(w));
  }
  const copre = t => {
    const st = stem(t);
    for (const iw of ingStems)
      if (st === iw || (st.length >= 4 && iw.length >= 4 && (st.startsWith(iw.slice(0, 4)) || iw.startsWith(st.slice(0, 4))))) return true;
    return false;
  };
  for (const txt of Object.values(r.porzioni || {}))
    for (const t of (norm(txt).replace(/'/g, ' ').match(/[a-z]+/g) || []))
      if (t.length >= 3 && !STOP.has(t) && !PROXY_OK.has(t) && !copre(t))
        scoperti.push(`${r.id}:"${t}"`);
}
const uniq = [...new Set(scoperti)];
ok(uniq.length === 0, `ogni prodotto citato in porzione è coperto da un ingrediente (scoperti: ${uniq.slice(0, 12).join(', ') || '0'}${uniq.length > 12 ? ` +${uniq.length - 12}` : ''})`);

// ── 4) Regressione specifica del bug segnalato ──────────────────────
const pra11 = recs.find(r => r.id === 'pra_11');
ok(pra11.ingredients.includes('db_piadina_integrale'), 'pra_11 contiene la piadina/wrap come ingrediente reale');
ok(pra11.ingredients.includes('db_hummus_di_ceci'), 'pra_11 contiene hummus come ingrediente reale');
ok(ids.has('db_salsa_teriyaki') && recs.find(r => r.id === 'cen_08').ingredients.includes('db_salsa_teriyaki'), 'cen_08 ha la salsa teriyaki');

console.log(fail === 0 ? 'ALLINEAMENTO: TUTTO OK' : `ALLINEAMENTO: ${fail} FALLIMENTI`);
process.exit(fail === 0 ? 0 : 1);
