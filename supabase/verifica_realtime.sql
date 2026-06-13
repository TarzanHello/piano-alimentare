-- ============================================================
-- VERIFICA E ATTIVAZIONE REALTIME (eseguire nel SQL Editor)
-- Il sintomo "i dati restano ma non si propagano tra device" è
-- tipico di tabelle NON pubblicate in Realtime.
-- ============================================================

-- 1. VERIFICA: quali tabelle sono già pubblicate in Realtime?
--    Devono comparire tutte e 5: profili, misure, profilo_dati,
--    famiglia_dati, famiglia_spesa.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- 2. ATTIVAZIONE (idempotente): aggiunge le tabelle mancanti.
do $$ begin alter publication supabase_realtime add table public.profili;        exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.misure;         exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.profilo_dati;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.famiglia_dati;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.famiglia_spesa; exception when duplicate_object then null; end $$;

-- 3. RE-VERIFICA: ora devono esserci tutte e 5.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
