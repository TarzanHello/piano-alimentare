// ── Layer cloud (Supabase) — Fase S1: identità e famiglie ────
// Tutte le funzioni sono no-op sicure se Supabase non è configurato:
// l'app resta perfettamente funzionante in locale.

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL as RAW_URL, SUPABASE_ANON_KEY as RAW_KEY } from './supabaseConfig';

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
  // redirectTo: torna esattamente alla pagina corrente dell'app
  // (origin + pathname: robusto su GitHub Pages in sottocartella,
  // in locale e dentro Capacitor; NON usare BASE_URL che con base
  // relativa './' produce un URL malformato)
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  return { error: error?.message || null };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
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
    color: p.color || '#2563eb',
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
  await ensureMyProfile(null);
  const { data, error } = await supabase.rpc('create_family', { p_nome: nome });
  return { data, error: error?.message || null };
}

export async function joinFamily(codice) {
  if (!supabase) return { error: 'Cloud non configurato' };
  // Garantisce che il profilo cloud di chi entra esista, altrimenti la
  // funzione non avrebbe nessuna riga da agganciare alla famiglia.
  await ensureMyProfile(null);
  const code = (codice || "").trim().toUpperCase().replace(/\s+/g, "");
  const { data, error } = await supabase.rpc('join_family', { p_code: code });
  if (error) return { error: error.message };
  // Verifica reale: il mio profilo ora ha la famiglia?
  const session = await getSession();
  const { data: mio } = await supabase.from('profili')
    .select('famiglia_id').eq('user_id', session.user.id).maybeSingle();
  if (!mio?.famiglia_id) return { error: 'Accoppiamento non riuscito, riprova' };
  return { data, error: null };
}

export async function leaveFamily() {
  if (!supabase) return { error: 'Cloud non configurato' };
  const { error } = await supabase.rpc('leave_family');
  if (error) return { error: error.message };
  // Dopo l'uscita, azzero lo stato di sync locale: il device non deve più
  // comportarsi come "in famiglia" (altrimenti il tasto sembra non funzionare).
  try {
    const { resetSyncState } = await import('./sync');
    await resetSyncState();
  } catch {}
  return { error: null };
}

export async function getMyFamily() {
  if (!supabase) return null;
  // Passo dal mio profilo → famiglia, evitando maybeSingle() su famiglie
  // (che fallisce se le RLS lasciassero intravedere più righe).
  const session = await getSession();
  if (!session) return null;
  const { data: mio } = await supabase.from('profili')
    .select('famiglia_id').eq('user_id', session.user.id).maybeSingle();
  if (!mio?.famiglia_id) return null;
  const { data } = await supabase.from('famiglie')
    .select('*').eq('id', mio.famiglia_id).limit(1);
  return (data && data[0]) || null;
}

export async function getFamilyMembers() {
  if (!supabase) return [];
  const { data } = await supabase
    .from('profili').select('*')
    .not('famiglia_id', 'is', null)
    .order('created_at');
  return data || [];
}
