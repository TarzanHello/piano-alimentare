// ── Layer cloud (Supabase) — Fase S1: identità e famiglie ────
// Tutte le funzioni sono no-op sicure se Supabase non è configurato:
// l'app resta perfettamente funzionante in locale.

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL as RAW_URL, SUPABASE_ANON_KEY as RAW_KEY } from './supabaseConfig';
import { logSync } from './synclog';

// Pulizia difensiva dei valori incollati a mano: spazi, a-capo,
// barre finali o percorsi extra dopo il dominio non rompono più nulla.
const SUPABASE_URL = (RAW_URL || "")
  .trim()
  .replace(/\/+$/, "")
  .replace(/^(https:\/\/[^/]+).*$/, "$1");
const SUPABASE_ANON_KEY = (RAW_KEY || "").trim().replace(/\s+/g, "");

export const cloudEnabled = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
export const SUPABASE_URL_ACTIVE = SUPABASE_URL;

export const supabase = cloudEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ─── Autenticazione ──────────────────────────────────────────

export async function signInWithGoogle() {
  if (!supabase) return { error: 'Cloud non configurato' };
  logSync("auth", "Login Google avviato");
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) logSync("error", `Login Google: errore`, { error: error.message });
  return { error: error?.message || null };
}

export async function signOut() {
  if (!supabase) return;
  logSync("auth", "Logout in corso");
  await supabase.auth.signOut();
  logSync("auth", "Logout completato");
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_evt, session) => callback(session));
  return () => data?.subscription?.unsubscribe();
}

// ─── Profilo dell'utente ─────────────────────────────────────

// Converte l'età locale in una data di nascita approssimata (1 gennaio).
// La S2 permetterà di correggerla con la data esatta.
export function etaToDataNascita(eta) {
  const anno = new Date().getFullYear() - (parseInt(eta) || 30);
  return `${anno}-01-01`;
}

export function dataNascitaToEta(dataNascita) {
  if (!dataNascita) return null;
  const dn = new Date(dataNascita), oggi = new Date();
  let eta = oggi.getFullYear() - dn.getFullYear();
  const m = oggi.getMonth() - dn.getMonth();
  if (m < 0 || (m === 0 && oggi.getDate() < dn.getDate())) eta--;
  return eta;
}

// Garantisce che il profilo cloud dell'utente esista; alla prima
// esecuzione lo crea COPIANDO i dati della persona locale ("io"),
// così nulla di inserito in precedenza va perso.
export async function ensureMyProfile(personaLocale) {
  if (!supabase) return null;
  const session = await getSession();
  if (!session) return null;

  const { data: esistente } = await supabase
    .from('profili').select('*').eq('user_id', session.user.id).maybeSingle();
  if (esistente) return esistente;

  const p = personaLocale || {};
  const nuovo = {
    user_id: session.user.id,
    nome: p.nome || session.user.user_metadata?.name?.split(' ')[0] || 'Io',
    sesso: p.sesso === 'F' ? 'F' : 'M',
    data_nascita: etaToDataNascita(p.eta),
    peso: p.peso ?? null,
    altezza: p.altezza ?? null,
    lavoro: p.lavoro || 'sedentario',
    allenamenti: p.allenamenti ?? 3,
    obiettivo: p.obiettivo || 'mantenimento',
    color: p.color || '#2F6B3A',
  };
  const { data, error } = await supabase.from('profili').insert(nuovo).select().single();
  if (error) { console.warn('ensureMyProfile:', error.message); return null; }
  return data;
}

// Crea un profilo a carico (bambino/a): nessuna registrazione,
// viaggia col genitore al momento dell'accoppiamento.
export async function addManagedProfile(campi) {
  if (!supabase) return { error: 'Cloud non configurato' };
  const session = await getSession();
  if (!session) return { error: 'Non autenticato' };
  const { data: mio } = await supabase
    .from('profili').select('famiglia_id').eq('user_id', session.user.id).maybeSingle();
  const { data, error } = await supabase.from('profili').insert({
    user_id: null,
    gestito_da: session.user.id,
    famiglia_id: mio?.famiglia_id ?? null,
    ...campi,
  }).select().single();
  return { data, error: error?.message || null };
}

// ─── Famiglia ────────────────────────────────────────────────

export async function createFamily(nome) {
  if (!supabase) return { error: 'Cloud non configurato' };
  logSync("family", `Creazione famiglia: "${nome}"`);
  await ensureMyProfile(null);
  const { data, error } = await supabase.rpc('create_family', { p_nome: nome });
  if (error) logSync("error", `Creazione famiglia fallita`, { error: error.message });
  else logSync("family", `Famiglia creata con successo: "${nome}"`);
  return { data, error: error?.message || null };
}

export async function joinFamily(codice) {
  if (!supabase) return { error: 'Cloud non configurato' };
  const code = (codice || "").trim().toUpperCase().replace(/\s+/g, "");
  logSync("family", `Tentativo accesso famiglia con codice: ${code}`);
  await ensureMyProfile(null);
  const { data, error } = await supabase.rpc('join_family', { p_code: code });
  if (error) { logSync("error", `Accesso famiglia fallito`, { error: error.message }); return { error: error.message }; }
  const session = await getSession();
  const { data: mio } = await supabase.from('profili')
    .select('famiglia_id').eq('user_id', session.user.id).maybeSingle();
  if (!mio?.famiglia_id) {
    logSync("error", `Accoppiamento famiglia non riuscito`, { code });
    return { error: 'Accoppiamento non riuscito, riprova' };
  }
  logSync("family", `Entrato nella famiglia con codice: ${code}`, { famigliaId: mio.famiglia_id });
  return { data, error: null };
}

export async function removeMember(profiloId) {
  if (!supabase) return { error: 'Cloud non configurato' };
  logSync("family", `Rimozione membro dalla famiglia`, { profiloId: profiloId?.slice(0,8) });
  const { error } = await supabase.rpc('remove_member', { p_profilo_id: profiloId });
  if (error) { logSync("error", `Rimozione membro fallita`, { error: error.message }); return { error: error.message }; }
  logSync("family", `Membro rimosso con successo`, { profiloId: profiloId?.slice(0,8) });
  return { error: null };
}

export async function leaveFamily() {
  if (!supabase) return { error: 'Cloud non configurato' };
  logSync("family", "Uscita dalla famiglia richiesta");
  const { error } = await supabase.rpc('leave_family');
  if (error) { logSync("error", `Uscita dalla famiglia fallita`, { error: error.message }); return { error: error.message }; }
  logSync("family", "Uscita dalla famiglia completata — reset motore sync");
  try {
    const { resetSyncState, startSync } = await import('./sync');
    await resetSyncState();
    await startSync();
  } catch {}
  return { error: null };
}

// ─── Cancellazione account (GDPR art. 17) ────────────────────
// Cancellazione totale e irreversibile: rimuove sul cloud tutti i dati
// dell'utente (profili propri + a carico, misure, profilo_dati, ricette,
// e la famiglia se resta vuota) tramite la RPC delete_account, poi azzera
// la copia locale sul dispositivo e chiude la sessione. La retention
// concordata richiede che nessun dato personale sopravviva, nemmeno in locale.
export async function deleteAccount() {
  if (!supabase) return { error: 'Cloud non configurato' };
  logSync("auth", "Cancellazione account richiesta");

  // 1) Cancellazione lato server (transazione unica tutto-o-niente)
  const { error } = await supabase.rpc('delete_account');
  if (error) {
    logSync("error", "Cancellazione account fallita", { error: error.message });
    return { error: error.message };
  }

  // 2) Azzeramento della copia locale: elimino tutte le chiavi dello storage
  try {
    const { keys } = await window.storage.list("");
    for (const k of keys) {
      try { await window.storage.delete(k); } catch {}
    }
  } catch (e) {
    console.warn("Pulizia storage locale:", e?.message);
  }

  // 3) Chiusura della sessione (l'utente di autenticazione non esiste più)
  try { await supabase.auth.signOut(); } catch {}

  logSync("auth", "Account e dati cancellati definitivamente");
  return { error: null };
}

// ─── Esportazione dati (GDPR art. 20 — portabilità) ──────────
// Raccoglie tutti i dati dell'utente in un unico oggetto JSON: la parte
// cloud (profili propri e a carico, misure, profilo_dati, ricette, e i dati
// della famiglia di cui fa parte) più un dump integrale dello storage locale
// del dispositivo, così l'esportazione è completa anche per i dati non ancora
// sincronizzati o puramente locali (idratazione, log pasti, preferenze…).
export async function exportMyData() {
  if (!supabase) return { error: 'Cloud non configurato' };
  const session = await getSession();
  if (!session) return { error: 'Non autenticato' };
  const uid = session.user.id;
  try {
    // Profili: il mio + quelli a carico
    const { data: profili } = await supabase.from('profili').select('*')
      .or(`user_id.eq.${uid},gestito_da.eq.${uid}`);
    const ids = (profili || []).map(p => p.id);

    let misure = [], profiloDati = [];
    if (ids.length) {
      const { data: m }  = await supabase.from('misure').select('*').in('profilo_id', ids);
      const { data: pd } = await supabase.from('profilo_dati').select('*').in('profilo_id', ids);
      misure = m || []; profiloDati = pd || [];
    }

    const { data: ricette } = await supabase.from('ricette_utente').select('*').eq('autore_id', uid);

    // Dati della famiglia (condivisi con gli altri membri)
    const mio = (profili || []).find(p => p.user_id === uid);
    let famiglia = null, famigliaDati = [], famigliaSpesa = [];
    if (mio?.famiglia_id) {
      const { data: f }  = await supabase.from('famiglie').select('*').eq('id', mio.famiglia_id).maybeSingle();
      const { data: fd } = await supabase.from('famiglia_dati').select('*').eq('famiglia_id', mio.famiglia_id);
      const { data: fs } = await supabase.from('famiglia_spesa').select('*').eq('famiglia_id', mio.famiglia_id);
      famiglia = f || null; famigliaDati = fd || []; famigliaSpesa = fs || [];
    }

    // Dump integrale dello storage locale
    const dispositivo = {};
    try {
      const { keys } = await window.storage.list("");
      for (const k of keys) {
        try {
          const r = await window.storage.get(k);
          try { dispositivo[k] = JSON.parse(r.value); } catch { dispositivo[k] = r.value; }
        } catch {}
      }
    } catch {}

    const dump = {
      _meta: {
        app: 'Fitsy / piano-alimentare',
        descrizione: 'Esportazione dati personali (GDPR art. 20)',
        esportato_il: new Date().toISOString(),
        utente: { id: uid, email: session.user.email || null },
        formato: 1,
      },
      cloud: {
        profili: profili || [],
        misure,
        profilo_dati: profiloDati,
        ricette_utente: ricette || [],
        famiglia,
        famiglia_dati: famigliaDati,
        famiglia_spesa: famigliaSpesa,
      },
      dispositivo,
    };
    logSync("info", "Esportazione dati completata", { profili: ids.length, misure: misure.length });
    return { data: dump, error: null };
  } catch (e) {
    logSync("error", "Esportazione dati fallita", { error: e?.message });
    return { error: e?.message || 'Errore esportazione' };
  }
}

export async function getMyFamily() {
  if (!supabase) return null;
  const session = await getSession();
  if (!session) return null;
  const { data: mio } = await supabase.from('profili')
    .select('famiglia_id').eq('user_id', session.user.id).maybeSingle();
  if (!mio?.famiglia_id) return null;
  // NB: la colonna 'capo_id' non esiste sulla tabella famiglie — selezionarla
  // faceva fallire l'intera query (PostgREST), e siccome qui si leggeva solo
  // 'data' ignorando 'error', getMyFamily restituiva sempre null in silenzio.
  // Il capofamiglia si deriva da 'created_by'.
  const { data, error } = await supabase.from('famiglie')
    .select('id, nome, invite_code, created_by, created_at').eq('id', mio.famiglia_id).limit(1);
  if (error) { logSync("error", "Lettura famiglia: errore", { error: error.message }); return null; }
  return (data && data[0]) || null;
}

export async function getFamilyMembers() {
  if (!supabase) return [];
  const { data } = await supabase
    .from('profili').select('*')
    .not('famiglia_id', 'is', null)
    .order('created_at');  // ordine di entrata in famiglia
  return data || [];
}
