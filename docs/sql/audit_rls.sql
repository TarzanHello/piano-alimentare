-- ═══════════════════════════════════════════════════════════════════
-- AUDIT RLS — da eseguire nel SQL Editor di Supabase (Frankfurt)
-- Copre: helper functions flaggate, policy per tabella, chiave
-- pesi_pezzo su famiglia_dati (tarature), delete_account.
-- Solo SELECT: non modifica nulla. Gli hardening suggeriti sono in
-- coda, COMMENTATI: valutali e applicali a mano.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Helper functions: definizione, SECURITY, search_path ─────────
-- ATTESO: my_famiglia_id / profilo_leggibile / profilo_scrivibile con
-- prosecdef=true (SECURITY DEFINER) e search_path FISSATO (proconfig
-- contiene 'search_path=public'). Un search_path non fissato su una
-- SECURITY DEFINER è una vulnerabilità di privilege escalation.
SELECT p.proname,
       p.prosecdef                                  AS security_definer,
       p.proconfig                                  AS config_search_path,
       pg_get_functiondef(p.oid)                    AS definizione
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('my_famiglia_id','profilo_leggibile','profilo_scrivibile','delete_account');

-- ── 2) RLS attiva su tutte le tabelle applicative ────────────────────
-- ATTESO: rowsecurity = true per profili, famiglie, famiglia_dati,
-- misure, ricette e ogni altra tabella dati. false = buco.
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ── 3) Tutte le policy, con qual e with_check ────────────────────────
-- CONTROLLA: ogni policy di INSERT/UPDATE deve avere WITH CHECK sul
-- famiglia_id (hardening già fatto per profili_insert/update e
-- ricette_update: verificare che non ci siano regressioni e che anche
-- famiglia_dati lo abbia).
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ── 4) famiglia_dati: copertura della chiave 'pesi_pezzo' ───────────
-- Le tarature peso-pezzo (v2026-07) scrivono in famiglia_dati con
-- chiave='pesi_pezzo'. Le policy di famiglia_dati sono per-riga su
-- famiglia_id, quindi la nuova chiave è coperta SE E SOLO SE:
--   a) esiste policy SELECT con qual  famiglia_id = my_famiglia_id()
--   b) esiste policy INSERT/UPDATE con WITH CHECK famiglia_id = my_famiglia_id()
--   c) NESSUNA policy filtra per chiave in whitelist (in quel caso
--      'pesi_pezzo' va aggiunta!).
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='famiglia_dati';

-- Test funzionale (da utente autenticato, via client o impersonation):
--   insert into famiglia_dati(famiglia_id, chiave, valore)
--   values (my_famiglia_id(), 'pesi_pezzo', '{"db_datteri":12}'::jsonb)
--   on conflict (famiglia_id, chiave) do update set valore = excluded.valore;
-- ATTESO: ok con la propria famiglia, errore RLS con un famiglia_id altrui.

-- ── 5) delete_account: cascata completa ──────────────────────────────
-- Verifica che la SECURITY DEFINER delete_account() copra ANCHE la
-- riga famiglia_dati chiave='pesi_pezzo' quando l'ultimo membro esce
-- (la cascata su famiglia_id la copre già se cancella tutte le chiavi:
-- confermare leggendo la definizione estratta al punto 1).

-- ═══════════════════════════════════════════════════════════════════
-- HARDENING SUGGERITI (commentati: applicare dopo verifica)
-- ═══════════════════════════════════════════════════════════════════

-- Se una helper NON ha il search_path fissato:
-- ALTER FUNCTION public.my_famiglia_id() SET search_path = public;
-- ALTER FUNCTION public.profilo_leggibile(uuid) SET search_path = public;
-- ALTER FUNCTION public.profilo_scrivibile(uuid) SET search_path = public;

-- Se famiglia_dati manca del WITH CHECK sull'upsert:
-- DROP POLICY IF EXISTS famiglia_dati_upsert ON public.famiglia_dati;
-- CREATE POLICY famiglia_dati_upsert ON public.famiglia_dati
--   FOR ALL TO authenticated
--   USING (famiglia_id = public.my_famiglia_id())
--   WITH CHECK (famiglia_id = public.my_famiglia_id());

-- Ricorda dopo ogni modifica: NOTIFY pgrst, 'reload schema';
