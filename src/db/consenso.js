// ── Persistenza del consenso privacy ─────────────────────────────────
// Il record di consenso {versione, ts, salute, minori, revocatoTs?} viaggia
// su profilo_dati (chiave "consenso"): nessuna migrazione SQL, RLS già
// coperta (ogni utente scrive solo i propri profilo_dati). Lo specchio
// locale (pa__consenso) è gestito da App per il check istantaneo al boot;
// il cloud è la fonte di verità cross-device e la prova del consenso.
import { supabase } from './cloud';
import { getCloudMe } from './sync';
import { logSync } from './synclog';

export async function leggiConsensoCloud() {
  if (!supabase) return null;
  const me = getCloudMe();
  if (!me?.profiloId) return null;
  const { data, error } = await supabase
    .from("profilo_dati")
    .select("valore")
    .eq("profilo_id", me.profiloId)
    .eq("chiave", "consenso")
    .maybeSingle();
  if (error) { logSync("error", "Consenso: errore lettura", { error: error.message }); return null; }
  return data?.valore || null;
}

export async function salvaConsensoCloud(record) {
  if (!supabase || !record) return false;
  const me = getCloudMe();
  if (!me?.profiloId) return false;
  const { error } = await supabase
    .from("profilo_dati")
    .upsert({ profilo_id: me.profiloId, chiave: "consenso", valore: record },
            { onConflict: "profilo_id,chiave" });
  if (error) { logSync("error", "Consenso: errore salvataggio", { error: error.message }); return false; }
  logSync("info", record.revocatoTs ? "Consenso REVOCATO e registrato sul cloud"
                                    : "Consenso registrato sul cloud", { versione: record.versione });
  return true;
}
