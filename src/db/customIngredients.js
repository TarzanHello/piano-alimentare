// ── Ingredienti personalizzati ─────────────────────────────────────
// Storage locale: localStorage (pa__custom-ingredients)
// Storage cloud:  famiglia_dati(chiave='ingredienti_custom') — condiviso in famiglia
// Registrazione engine: ING_MAP mutabile (src/data/index.js)

import { ING_MAP } from '@/data';
import { supabase } from './cloud';
import { getCloudMe } from './sync';
import { logSync } from './synclog';

const SK_LOCAL = "pa__custom-ingredients";

// ─── localStorage ─────────────────────────────────────────────────

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(SK_LOCAL) || "[]"); } catch { return []; }
}

function saveLocal(list) {
  try { localStorage.setItem(SK_LOCAL, JSON.stringify(list)); } catch {}
}

// ─── ING_MAP registration ─────────────────────────────────────────
// Inietta (o aggiorna) ogni ingrediente custom nel motore.
// Sicuro da chiamare più volte: sovrascrive solo le entry custom.

export function registerInING_MAP(list) {
  for (const ing of (list || [])) {
    if (!ing?.id) continue;
    ING_MAP[ing.id] = {
      id:         ing.id,
      nome:       ing.nome,
      cat:        ing.cat,
      deperibile: ing.deperibile ?? 7,
      stagioni:   ing.stagioni ?? null,
      nutri:      ing.nutri   || null,
      custom:     true,
      tags:       [],
    };
  }
}

// ─── Cloud push/pull ──────────────────────────────────────────────

async function pushCloud(list) {
  if (!supabase) return;
  const me = getCloudMe();
  if (!me?.famigliaId) return;
  try {
    const { error } = await supabase.from("famiglia_dati").upsert(
      { famiglia_id: me.famigliaId, chiave: "ingredienti_custom", valore: { list } },
      { onConflict: "famiglia_id,chiave" }
    );
    if (error) logSync("error", "Ingredienti custom: errore push", { error: error.message });
    else logSync("push", "Ingredienti custom caricati sul cloud", { n: list.length });
  } catch (e) {
    logSync("error", "Ingredienti custom: push eccezione", { error: e.message });
  }
}

export async function pullCustomIngredients() {
  if (!supabase) return null;
  const me = getCloudMe();
  if (!me?.famigliaId) return null;
  try {
    const { data, error } = await supabase
      .from("famiglia_dati")
      .select("valore")
      .eq("famiglia_id", me.famigliaId)
      .eq("chiave", "ingredienti_custom")
      .maybeSingle();
    if (error) { logSync("error", "Ingredienti custom: errore pull", { error: error.message }); return null; }
    if (!data?.valore?.list) return null;
    const lista = data.valore.list;
    // Merge: gli ingredienti cloud sostituiscono quelli locali (cloud is truth)
    saveLocal(lista);
    registerInING_MAP(lista);
    logSync("pull", "Ingredienti custom aggiornati dal cloud", { n: lista.length });
    return lista;
  } catch (e) {
    logSync("error", "Ingredienti custom: pull eccezione", { error: e.message });
    return null;
  }
}

// ─── API pubblica ──────────────────────────────────────────────────

export function getCustomIngredients() {
  return loadLocal();
}

export async function addCustomIngredient(ing) {
  const list = loadLocal();
  const id = "custom_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  const entry = { ...ing, id, custom: true };
  list.push(entry);
  saveLocal(list);
  registerInING_MAP([entry]);
  await pushCloud(list);
  return entry;
}

export async function deleteCustomIngredient(id) {
  const list = loadLocal().filter(i => i.id !== id);
  saveLocal(list);
  // Rimuovi da ING_MAP
  delete ING_MAP[id];
  await pushCloud(list);
}

export async function updateCustomIngredient(id, updates) {
  const list = loadLocal().map(i => i.id === id ? { ...i, ...updates } : i);
  saveLocal(list);
  registerInING_MAP(list.filter(i => i.id === id));
  await pushCloud(list);
}
