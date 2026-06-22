-- ============================================================
-- S11: Hardening sicurezza (risolve gli avvisi del linter Supabase)
-- 1. Fissa search_path su touch_updated_at
-- 2. Revoca EXECUTE alle funzioni RPC dal ruolo anon
--    (restano chiamabili solo da utenti autenticati)
-- Idempotente. Eseguire nel SQL Editor.
-- ============================================================

-- ── 1. search_path mancante su touch_updated_at ──────────────
-- La funzione trigger non aveva search_path fisso: lo impostiamo a vuoto
-- (le tabelle vengono referenziate con schema esplicito public.).
ALTER FUNCTION public.touch_updated_at() SET search_path = '';

-- ── 2. Revoca EXECUTE dal ruolo anon ─────────────────────────
-- Queste funzioni richiedono già auth.uid() internamente: un utente
-- non autenticato (anon) fallirebbe comunque, ma per ridurre la
-- superficie d'attacco revochiamo del tutto l'accesso ad anon.
-- L'app usa SEMPRE utenti autenticati (login Google), quindi nessun
-- impatto sul funzionamento.

REVOKE EXECUTE ON FUNCTION public.create_family(text)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.join_family(text)          FROM anon;
REVOKE EXECUTE ON FUNCTION public.leave_family()             FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_member(uuid)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_famiglia_id()           FROM anon;
REVOKE EXECUTE ON FUNCTION public.profilo_leggibile(uuid)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.profilo_scrivibile(uuid)   FROM anon;

-- Le funzioni helper interne (my_famiglia_id, profilo_leggibile,
-- profilo_scrivibile) sono usate dalle policy RLS, che girano nel
-- contesto del ruolo authenticated: per loro l'accesso resta garantito.

-- Garantiamo esplicitamente l'accesso al ruolo authenticated
-- (di norma già presente, ma lo rendiamo esplicito e idempotente).
GRANT EXECUTE ON FUNCTION public.create_family(text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_family(text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_family()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_famiglia_id()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.profilo_leggibile(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.profilo_scrivibile(uuid)   TO authenticated;

-- Ricarica schema PostgREST
NOTIFY pgrst, 'reload schema';
