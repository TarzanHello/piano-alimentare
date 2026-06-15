// ── Ricette utente su Supabase (cloud authoritative) ──────────────
// Legge/scrive la tabella `ricette_utente`. Il cloud è la verità: la
// condivisione è il campo `scope` (privata | famiglia | pubblica).
// "pubblica" è predisposto ma l'interfaccia non lo espone ancora.
import { supabase } from './cloud';
import { getCloudMe } from './sync';
import { logSync } from './synclog';

// Log dedicato alla famiglia/ricette: categoria "family".
function logFamily(msg, data) { logSync("family", msg, data); }

// Converte una riga del cloud nella forma usata dall'app.
function rowToRicetta(r) {
  return {
    id: r.id,
    titolo: r.titolo,
    nome: r.titolo,                 // alias per compatibilità con la UI ricette
    descrizione: r.descrizione || "",
    categoria: r.categoria,
    ingredienti: Array.isArray(r.ingredienti) ? r.ingredienti : [],
    kcal: Number(r.kcal) || 0,
    p: Number(r.p) || 0,
    c: Number(r.c) || 0,
    g: Number(r.g) || 0,
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
export async function caricaRicette() {
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
  if (!supabase) throw new Error("Cloud non configurato");
  const me = getCloudMe();
  if (!me) throw new Error("Devi essere collegato per creare ricette");
  const scope = ricetta.scope === "pubblica" ? "famiglia" : (ricetta.scope || "famiglia"); // "pubblica" disabilitata
  const payload = {
    autore_id: me.userId,
    famiglia_id: me.famigliaId || null,
    titolo: (ricetta.titolo || "").trim(),
    descrizione: ricetta.descrizione || null,
    categoria: ricetta.categoria,
    ingredienti: ricetta.ingredienti || [],
    kcal: Math.round(ricetta.kcal || 0),
    p: Math.round(ricetta.p || 0),
    c: Math.round(ricetta.c || 0),
    g: Math.round(ricetta.g || 0),
    scope,
  };
  const { data, error } = await supabase.from("ricette_utente").insert(payload).select().single();
  if (error) { logFamily("Ricetta: errore creazione", { titolo: payload.titolo, error: error.message }); throw new Error(error.message); }
  logFamily("Ricetta creata", { id: data.id, titolo: data.titolo, scope: data.scope, categoria: data.categoria });
  return rowToRicetta(data);
}

// Aggiorna una ricetta esistente (solo l'autore, garantito da RLS).
export async function aggiornaRicetta(id, patch) {
  if (!supabase) throw new Error("Cloud non configurato");
  const upd = { ...patch };
  if (upd.scope === "pubblica") upd.scope = "famiglia";   // "pubblica" disabilitata
  if (upd.titolo) upd.titolo = upd.titolo.trim();
  ["kcal","p","c","g"].forEach(k => { if (upd[k] != null) upd[k] = Math.round(upd[k]); });
  const { data, error } = await supabase.from("ricette_utente").update(upd).eq("id", id).select().single();
  if (error) { logFamily("Ricetta: errore aggiornamento", { id, error: error.message }); throw new Error(error.message); }
  logFamily("Ricetta aggiornata", { id, modifiche: Object.keys(patch) });
  return rowToRicetta(data);
}

// Cambia la condivisione (privata <-> famiglia).
export async function cambiaScopeRicetta(id, scope) {
  const s = scope === "pubblica" ? "famiglia" : scope;   // "pubblica" disabilitata
  logFamily("Ricetta: cambio condivisione", { id, scope: s });
  return aggiornaRicetta(id, { scope: s });
}

// Elimina una ricetta (solo l'autore).
export async function eliminaRicetta(id) {
  if (!supabase) throw new Error("Cloud non configurato");
  const { error } = await supabase.from("ricette_utente").delete().eq("id", id);
  if (error) { logFamily("Ricetta: errore eliminazione", { id, error: error.message }); throw new Error(error.message); }
  logFamily("Ricetta eliminata", { id });
}
