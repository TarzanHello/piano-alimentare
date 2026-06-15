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
