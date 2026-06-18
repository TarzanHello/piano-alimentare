-- ============================================================
-- S9: Ricettario unificato — formato ingredienti per slot
-- Idempotente. Eseguire nel SQL Editor di Supabase.
-- ============================================================

-- Nuovi campi su ricette_utente
ALTER TABLE public.ricette_utente
  ADD COLUMN IF NOT EXISTS prep     int,          -- tempo preparazione in minuti
  ADD COLUMN IF NOT EXISTS quantita jsonb,        -- {ing_id:{uomo,donna,bimbo,unit}} — nuovo formato
  ADD COLUMN IF NOT EXISTS esclusa  boolean NOT NULL DEFAULT false; -- escludi dal sorteggio piano

-- Il vecchio campo `ingredienti` resta per retrocompatibilità (ricette già create).
-- Le nuove ricette scrivono solo `quantita`; il client legge preferenzialmente `quantita`.

-- Indice per il filtraggio rapido delle ricette non escluse
CREATE INDEX IF NOT EXISTS idx_ricette_utente_esclusa
  ON public.ricette_utente (famiglia_id, esclusa)
  WHERE esclusa = false;

-- Aggiorna notifica schema PostgREST
NOTIFY pgrst, 'reload schema';

-- Verifica
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'ricette_utente'
  AND column_name  IN ('prep','quantita','esclusa')
ORDER BY column_name;
