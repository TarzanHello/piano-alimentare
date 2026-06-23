// ── Ingredienti personalizzati (localStorage) ──────────────────────
// Gli ingredienti custom si affiancano al database statico.
// Struttura di ogni voce: { id, nome, cat, deperibile, stagioni, nutri }
// dove nutri = { p, c, z, g, f, kcal } (valori per 100g), tutti opzionali.

const SK = "pa__custom-ingredients";

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(SK) || "[]");
  } catch {
    return [];
  }
}

function saveAll(list) {
  try {
    localStorage.setItem(SK, JSON.stringify(list));
  } catch (e) {
    console.warn("Impossibile salvare ingredienti custom:", e);
  }
}

export function getCustomIngredients() {
  return loadAll();
}

export function addCustomIngredient(ing) {
  const list = loadAll();
  const id = "custom_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  const entry = { ...ing, id, custom: true };
  list.push(entry);
  saveAll(list);
  return entry;
}

export function deleteCustomIngredient(id) {
  const list = loadAll().filter(i => i.id !== id);
  saveAll(list);
}

export function updateCustomIngredient(id, updates) {
  const list = loadAll().map(i => i.id === id ? { ...i, ...updates } : i);
  saveAll(list);
}
