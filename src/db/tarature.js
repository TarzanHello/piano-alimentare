// ── Tarature peso-pezzo ─────────────────────────────────────────────
// Il calibro (pezzi/kg) varia con la partita che compri: la taratura
// della famiglia è l'unica fonte davvero precisa per convertire pezzi
// in grammi. Stesso pattern di customIngredients:
//   Storage locale: localStorage (pa__tarature-pezzi)
//   Storage cloud:  famiglia_dati(chiave='pesi_pezzo') — condiviso
//   Registrazione:  PESO_PEZZO_TARATO (mappa mutabile in src/data)

import { PESO_PEZZO_TARATO } from '@/data';

// Dipendenze cloud caricate pigramente: questo modulo viene importato
// anche dai tool puri (Strumenti) e dai test Node senza DOM, dove
// sync/cloud non possono essere valutati a import-time.
async function deps() {
  const [{ supabase }, { getCloudMe }, { logSync }] = await Promise.all([
    import('./cloud'), import('./sync'), import('./synclog'),
  ]);
  return { supabase, getCloudMe, logSync };
}

const SK_LOCAL = "pa__tarature-pezzi";
const CHIAVE = "pesi_pezzo";

function loadLocal() {
  try { return JSON.parse(globalThis.localStorage?.getItem(SK_LOCAL) || "{}"); } catch { return {}; }
}
function saveLocal(map) {
  try { globalThis.localStorage?.setItem(SK_LOCAL, JSON.stringify(map)); } catch {}
}

function registra(map) {
  for (const k of Object.keys(PESO_PEZZO_TARATO)) delete PESO_PEZZO_TARATO[k];
  for (const [id, g] of Object.entries(map || {}))
    if (Number(g) > 0) PESO_PEZZO_TARATO[id] = Number(g);
}

// Registrazione immediata al load del modulo (offline-first)
registra(loadLocal());

export function getTarature() { return { ...loadLocal() }; }
export function contaTarature() { return Object.keys(loadLocal()).length; }

// Salva (o rimuove, con g=null) la taratura di un ingrediente.
// gTotale/nPezzi: il wizard fa pesare N pezzi e divide.
export async function salvaTaratura(ingId, gPezzo) {
  const map = loadLocal();
  if (gPezzo > 0) map[ingId] = Math.round(gPezzo * 10) / 10;
  else delete map[ingId];
  saveLocal(map);
  registra(map);
  await pushTarature(map, gPezzo, ingId);
  return map;
}

async function pushTarature(map, gPezzo, ingId) {
  const { supabase, getCloudMe, logSync } = await deps();
  if (ingId !== undefined) logSync("tarature", `Taratura ${gPezzo > 0 ? "salvata" : "rimossa"}: ${ingId}`, { g: gPezzo });
  const me = getCloudMe();
  if (!me?.famigliaId || !supabase) return;
  const { error } = await supabase.from("famiglia_dati")
    .upsert({ famiglia_id: me.famigliaId, chiave: CHIAVE, valore: map }, { onConflict: "famiglia_id,chiave" });
  if (error) logSync("error", "Push tarature: errore", { error: error.message });
  else logSync("push", "Tarature caricate sul cloud", { n: Object.keys(map).length });
}

// Pull dal cloud: merge per chiave, il cloud vince (le tarature sono
// condivise: l'ultimo che pesa in famiglia ha il dato più fresco).
export async function pullTarature() {
  const { supabase, getCloudMe, logSync } = await deps();
  const me = getCloudMe();
  if (!me?.famigliaId || !supabase) return;
  const { data, error } = await supabase.from("famiglia_dati")
    .select("valore").eq("famiglia_id", me.famigliaId).eq("chiave", CHIAVE).maybeSingle();
  if (error) { logSync("error", "Pull tarature: errore", { error: error.message }); return; }
  const cloud = data?.valore || {};
  const merged = { ...loadLocal(), ...cloud };
  if (JSON.stringify(merged) === JSON.stringify(loadLocal())) return;
  saveLocal(merged);
  registra(merged);
  logSync("pull", "Tarature aggiornate dal cloud", { n: Object.keys(merged).length });
}
