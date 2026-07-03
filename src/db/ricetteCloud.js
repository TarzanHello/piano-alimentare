// ── Ricette utente su Supabase (cloud authoritative) ──────────────
// Legge/scrive la tabella `ricette_utente`. Il cloud è la verità: la
// condivisione è il campo `scope` (privata | famiglia | pubblica).
// "pubblica" è predisposto ma l'interfaccia non lo espone ancora.
import { supabase } from './cloud';
import { getCloudMe } from './sync';
import { logSync } from './synclog';

// Log dedicato alla famiglia/ricette: categoria "family".
function logFamily(msg, data) { logSync("ricetta", msg, data); }

// Converte una riga del cloud nella forma usata dall'app.
function rowToRicetta(r) {
  return {
    id: r.id,
    titolo: r.titolo,
    nome: r.titolo,
    descrizione: r.descrizione || "",
    categoria: r.categoria,
    prep: r.prep ?? null,
    // Formato nuovo (quantita) ha la precedenza sul vecchio (ingredienti flat)
    quantita: r.quantita || null,
    ingredienti: Array.isArray(r.ingredienti) ? r.ingredienti : [],
    kcal: Number(r.kcal) || 0,
    p: Number(r.p) || 0,
    c: Number(r.c) || 0,
    g: Number(r.g) || 0,
    esclusa: r.esclusa || false,
    scope: r.scope,
    stato: r.stato,
    autoreId: r.autore_id,
    famigliaId: r.famiglia_id,
    likeCount: r.like_count || 0,
    dislikeCount: r.dislike_count || 0,
    isMine: getCloudMe()?.userId === r.autore_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Carica tutte le ricette visibili: le mie (qualsiasi scope) + quelle di
// famiglia. Le RLS sul cloud garantiscono che non arrivi altro.
// ── Coalescing dei caricamenti ───────────────────────────────────────
// Al boot le ricette venivano caricate fino a 6 volte nello stesso secondo
// (riconciliazione + SUBSCRIBED + listener multipli): le chiamate ravvicinate
// ora condividono la stessa richiesta, con una finestra di riuso di 800ms.
// Le mutazioni (crea/aggiorna/elimina) invalidano subito la finestra, così
// il ricaricamento dopo un salvataggio vede sempre i dati freschi.
let caricaInFlight = null;
function invalidaCacheRicette() { caricaInFlight = null; }

export function caricaRicette() {
  if (caricaInFlight) return caricaInFlight;
  const p = caricaRicetteRaw();
  caricaInFlight = p;
  p.catch(() => {}).then(() => {
    setTimeout(() => { if (caricaInFlight === p) caricaInFlight = null; }, 800);
  });
  return p;
}

async function caricaRicetteRaw() {
  if (!supabase) { logFamily("Ricette: cloud non configurato"); return []; }
  const me = getCloudMe();
  if (!me) { logFamily("Ricette: utente non collegato, nessuna ricetta cloud"); return []; }
  const { data, error } = await supabase
    .from("ricette_utente")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) { logFamily("Ricette: errore caricamento", { error: error.message }); return []; }
  const ricette = (data || []).map(rowToRicetta);
  const mie = ricette.filter(r => r.isMine).length;
  logFamily("Ricette caricate dal cloud", { totali: ricette.length, mie, diFamiglia: ricette.length - mie });
  return ricette;
}

// Crea una nuova ricetta. `ricetta` = {titolo, descrizione, categoria,
// ingredienti:[{ing,g}], kcal,p,c,g, scope}. autore e famiglia presi da me.
export async function creaRicetta(ricetta) {
  invalidaCacheRicette();
  if (!supabase) throw new Error("Cloud non configurato");
  const me = getCloudMe();
  if (!me) throw new Error("Devi essere collegato per creare ricette");
  // Privacy sempre "famiglia" — la scelta è nascosta all'utente per ora
  const payload = {
    autore_id: me.userId,
    famiglia_id: me.famigliaId || null,
    titolo: (ricetta.titolo || "").trim(),
    descrizione: ricetta.descrizione || null,
    categoria: ricetta.categoria,
    prep: ricetta.prep ?? null,
    quantita: ricetta.quantita || null,
    ingredienti: ricetta.ingredienti || [],
    kcal: Math.round(ricetta.kcal || 0),
    p: Math.round(ricetta.p || 0),
    c: Math.round(ricetta.c || 0),
    g: Math.round(ricetta.g || 0),
    esclusa: false,
    // Tutte le ricette sono condivise in famiglia (scope non più selezionabile)
    scope: "famiglia",
  };
  const { data, error } = await supabase.from("ricette_utente").insert(payload).select().single();
  if (error) { logFamily("Ricetta: errore creazione", { titolo: payload.titolo, error: error.message }); throw new Error(error.message); }
  logFamily("Ricetta creata", { id: data.id, titolo: data.titolo, categoria: data.categoria });
  return rowToRicetta(data);
}

// Aggiorna una ricetta esistente (solo l'autore, garantito da RLS).
export async function aggiornaRicetta(id, patch) {
  invalidaCacheRicette();
  if (!supabase) throw new Error("Cloud non configurato");
  const upd = { ...patch };
  // Tutte le ricette sono di famiglia
  upd.scope = "famiglia";
  if (upd.titolo) upd.titolo = upd.titolo.trim();
  ["kcal","p","c","g"].forEach(k => { if (upd[k] != null) upd[k] = Math.round(upd[k]); });
  const { data, error } = await supabase.from("ricette_utente").update(upd).eq("id", id).select().single();
  if (error) { logFamily("Ricetta: errore aggiornamento", { id, error: error.message }); throw new Error(error.message); }
  logFamily("Ricetta aggiornata", { id, modifiche: Object.keys(patch) });
  return rowToRicetta(data);
}

// Toggle escludi/includi la ricetta nel sorteggio del piano.
export async function toggleEsclusaRicetta(id, esclusa) {
  if (!supabase) throw new Error("Cloud non configurato");
  const { data, error } = await supabase.from("ricette_utente")
    .update({ esclusa: Boolean(esclusa) }).eq("id", id).select().single();
  if (error) { logFamily("Ricetta: errore toggle esclusa", { id, error: error.message }); throw new Error(error.message); }
  logFamily(esclusa ? "Ricetta esclusa dal piano" : "Ricetta inclusa nel piano", { id });
  return rowToRicetta(data);
}

// Elimina una ricetta (solo l'autore).
export async function eliminaRicetta(id) {
  invalidaCacheRicette();
  if (!supabase) throw new Error("Cloud non configurato");
  const { error } = await supabase.from("ricette_utente").delete().eq("id", id);
  if (error) { logFamily("Ricetta: errore eliminazione", { id, error: error.message }); throw new Error(error.message); }
  logFamily("Ricetta eliminata", { id });
}
