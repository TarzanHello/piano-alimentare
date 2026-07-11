// ── Database (sorgente unica di verità) ───────────────────────────
// I dati curati vivono come JSON. Qui li ricostruiamo nella forma
// usata dall'app, così logica e UI restano invariate.
import ingredientsJson from './ingredients.json';
import recipesJson from './recipes.json';

// INGREDIENTS: lista. Riattacca .nutri (valori per 100g) usato da ING_MAP/nutriPerGrammi
export const INGREDIENTS = ingredientsJson.map(({ nutrizione, pesoPezzoG, ...rest }) => ({
  ...rest,
  nutri: nutrizione || null,
}));

// NUTRI: { [id]: valori nutrizionali per 100g }
export const NUTRI = Object.fromEntries(
  ingredientsJson.filter(i => i.nutrizione).map(i => [i.id, i.nutrizione])
);

// PESO_PEZZO: { [id]: peso medio di 1 pezzo in g }
export const PESO_PEZZO = Object.fromEntries(
  ingredientsJson.filter(i => i.pesoPezzoG != null).map(i => [i.id, i.pesoPezzoG])
);

// PESO_PEZZO_RANGE: { [id]: [min, max] } per alimenti a calibro variabile
// (il calibro commerciale si esprime in pezzi/kg e cambia con la partita).
export const PESO_PEZZO_RANGE = Object.fromEntries(
  ingredientsJson.filter(i => Array.isArray(i.pesoPezzoRange)).map(i => [i.id, i.pesoPezzoRange])
);

// PESO_PEZZO_TARATO: { [id]: g } — tarature della famiglia (mappa mutabile,
// popolata da db/tarature.js con lo stesso pattern di ING_MAP per i custom).
// Ha priorità su PESO_PEZZO: la precisione vera viene dal calibro che compri tu.
export const PESO_PEZZO_TARATO = {};

// DB: { categoria: [ricette...] } (senza i campi categoria/quantita uniti)
export const DB = recipesJson.reduce((acc, r) => {
  const { categoria, quantita, ...recipe } = r;
  (acc[categoria] ||= []).push(recipe);
  return acc;
}, {});

// ING_QTY: { [idRicetta]: quantita } — oggetto MUTABILE (l'app lo modifica)
export const ING_QTY = Object.fromEntries(
  recipesJson.filter(r => r.quantita).map(r => [r.id, r.quantita])
);

export const ING_MAP = Object.fromEntries(INGREDIENTS.map(i => [i.id, i]));

// Registra gli ingredienti custom (localStorage) in ING_MAP al caricamento del modulo,
// così il motore li trova subito senza aspettare che IngredientiPage venga visitata.
try {
  const custom = JSON.parse(localStorage.getItem("pa__custom-ingredients") || "[]");
  for (const ing of custom) {
    if (ing && ing.id && !ING_MAP[ing.id]) {
      ING_MAP[ing.id] = { id: ing.id, nome: ing.nome, cat: ing.cat,
        deperibile: ing.deperibile ?? 7, stagioni: ing.stagioni ?? null,
        nutri: ing.nutri || null, custom: true, tags: [] };
    }
  }
} catch {}

