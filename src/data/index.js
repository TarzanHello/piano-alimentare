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

