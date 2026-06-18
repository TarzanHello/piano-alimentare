-- ============================================================
-- S10: Creazione tabella ricette_utente (se non esiste)
-- + applicazione di tutti gli ALTER della s9
-- Idempotente. Eseguire PRIMA di s9 se la tabella non esiste.
-- ============================================================

-- Crea la tabella se non esiste già
CREATE TABLE IF NOT EXISTS public.ricette_utente (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autore_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  famiglia_id  uuid REFERENCES public.famiglie(id) ON DELETE SET NULL,
  titolo       text NOT NULL CHECK (length(titolo) >= 2 AND length(titolo) <= 200),
  descrizione  text,
  categoria    text NOT NULL CHECK (categoria IN ('colazione','pranzo','cena','spuntino')),
  ingredienti  jsonb,          -- vecchio formato [{ing, g}] — retrocompatibilità
  kcal         numeric,
  p            numeric,
  c            numeric,
  g            numeric,
  scope        text NOT NULL DEFAULT 'famiglia' CHECK (scope IN ('privata','famiglia')),
  stato        text,
  like_count   int  NOT NULL DEFAULT 0,
  dislike_count int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Nuovi campi (idempotenti grazie a IF NOT EXISTS)
ALTER TABLE public.ricette_utente
  ADD COLUMN IF NOT EXISTS prep       int,
  ADD COLUMN IF NOT EXISTS quantita   jsonb,
  ADD COLUMN IF NOT EXISTS esclusa    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stagioni   jsonb,
  ADD COLUMN IF NOT EXISTS tags       jsonb;

-- Indici
CREATE INDEX IF NOT EXISTS idx_ricette_utente_famiglia
  ON public.ricette_utente (famiglia_id);

CREATE INDEX IF NOT EXISTS idx_ricette_utente_autore
  ON public.ricette_utente (autore_id);

CREATE INDEX IF NOT EXISTS idx_ricette_utente_esclusa
  ON public.ricette_utente (famiglia_id, esclusa)
  WHERE esclusa = false;

-- RLS
ALTER TABLE public.ricette_utente ENABLE ROW LEVEL SECURITY;

-- Lettura: tutti i membri della famiglia vedono le ricette famiglia + le proprie private
DROP POLICY IF EXISTS ricette_select ON public.ricette_utente;
CREATE POLICY ricette_select ON public.ricette_utente
  FOR SELECT USING (
    autore_id = auth.uid()
    OR (
      scope = 'famiglia'
      AND famiglia_id IN (
        SELECT famiglia_id FROM public.profili
        WHERE user_id = auth.uid() AND famiglia_id IS NOT NULL
      )
    )
  );

-- Inserimento: solo per sé stessi, solo nella propria famiglia
DROP POLICY IF EXISTS ricette_insert ON public.ricette_utente;
CREATE POLICY ricette_insert ON public.ricette_utente
  FOR INSERT WITH CHECK (
    autore_id = auth.uid()
    AND (
      famiglia_id IS NULL
      OR famiglia_id IN (
        SELECT famiglia_id FROM public.profili
        WHERE user_id = auth.uid() AND famiglia_id IS NOT NULL
      )
    )
  );

-- Modifica/eliminazione: solo le proprie ricette
DROP POLICY IF EXISTS ricette_update ON public.ricette_utente;
CREATE POLICY ricette_update ON public.ricette_utente
  FOR UPDATE USING (autore_id = auth.uid());

DROP POLICY IF EXISTS ricette_delete ON public.ricette_utente;
CREATE POLICY ricette_delete ON public.ricette_utente
  FOR DELETE USING (autore_id = auth.uid());

-- Permetti al Realtime di leggere le ricette famiglia
ALTER PUBLICATION supabase_realtime ADD TABLE public.ricette_utente;

-- Ricarica schema PostgREST
NOTIFY pgrst, 'reload schema';

-- Verifica
SELECT
  table_name,
  (SELECT count(*) FROM public.ricette_utente) AS righe_esistenti
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'ricette_utente';
