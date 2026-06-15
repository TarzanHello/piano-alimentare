-- ============================================================
-- PIANO ALIMENTARE FAMILIARE — Fase S5: sync intensità dieta
-- Eseguire UNA VOLTA nel SQL Editor di Supabase (Dashboard →
-- SQL Editor → New query → incolla tutto → Run).
-- Idempotente: rieseguirlo non fa danni.
-- ============================================================

-- L'impostazione "Intensità dieta" (slider 0-100, usata da
-- calcTargetAdattivo per calcolare l'offset calorico extra
-- rispetto al TDEE adattivo) era memorizzata SOLO localmente
-- su ciascun profilo e non veniva sincronizzata sul cloud:
-- ogni dispositivo della famiglia vedeva quindi un valore
-- diverso (o assente) per lo stesso profilo, con calorie/piano
-- calcolati in modo incoerente tra i dispositivi.
--
-- Questa colonna permette di salvare il valore sul profilo
-- cloud, così che ogni membro della famiglia veda l'intensità
-- impostata dal titolare del profilo (o dal tutore, per i
-- profili a carico).

alter table public.profili
  add column if not exists dieta_intensita int
  check (dieta_intensita is null or (dieta_intensita between 0 and 100));

-- PostgREST mantiene una cache dello schema in memoria: dopo un ALTER
-- TABLE la nuova colonna non è visibile alle query (select("*") la omette,
-- update con quella colonna viene ignorato silenziosamente) finché la
-- cache non viene ricaricata. Su Supabase questo di norma avviene da solo
-- in pochi secondi/minuti, ma forziamo il reload immediato per evitare
-- l'inconsistenza osservata (un device scrive dieta_intensita, l'altro
-- continua a leggere null indefinitamente).
notify pgrst, 'reload schema';

-- Verifica: la colonna deve apparire qui. Se questa query non la mostra,
-- il reload non è ancora avvenuto: attendere un minuto e ri-eseguire la
-- sola query di verifica (il NOTIFY sopra non va ripetuto se la colonna
-- esiste già).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'profili'
order by ordinal_position;
