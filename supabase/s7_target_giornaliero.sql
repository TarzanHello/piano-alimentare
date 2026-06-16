-- Migrazione s7: target giornaliero pushato dall'owner su profilo_dati
-- Non richiede ALTER TABLE: profilo_dati accetta già qualsiasi chiave.
-- Aggiunge un indice parziale per velocizzare le query per chiave.
-- Idempotente: eseguibile più volte senza errori.

CREATE INDEX IF NOT EXISTS idx_profilo_dati_target
  ON public.profilo_dati (profilo_id)
  WHERE chiave = 'target_giornaliero';

-- Le policy RLS esistenti su profilo_dati coprono già questa chiave:
-- - SELECT: i membri della stessa famiglia possono leggere tutti i dati
-- - INSERT/UPDATE: solo il profilo owner può scrivere i propri dati
-- Non è necessaria alcuna policy aggiuntiva.

-- Verifica: conta le righe esistenti per questa chiave (0 al primo deploy)
SELECT COUNT(*) AS target_rows_esistenti
FROM public.profilo_dati
WHERE chiave = 'target_giornaliero';
