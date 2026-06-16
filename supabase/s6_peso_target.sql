-- Migrazione s6: aggiunge peso_target a profili
-- Idempotente: eseguibile più volte senza errori.

ALTER TABLE public.profili
  ADD COLUMN IF NOT EXISTS peso_target numeric
    CHECK (peso_target IS NULL OR (peso_target >= 30 AND peso_target <= 200));

-- Aggiorna cache schema PostgREST (necessario dopo ALTER TABLE)
NOTIFY pgrst, 'reload schema';

-- Verifica
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'profili'
  AND column_name  = 'peso_target';
