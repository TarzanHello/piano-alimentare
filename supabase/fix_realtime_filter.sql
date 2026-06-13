-- ============================================================
-- FILTRI REALTIME PER FAMIGLIA (eseguire nel SQL Editor)
-- Abilita il filtraggio per famiglia_id nelle notifiche Realtime:
-- senza questo, ogni device riceve i cambiamenti di TUTTE le famiglie
-- e deve filtrare lato client (inefficiente e fonte di bug).
-- ============================================================

-- 1. REPLICA IDENTITY FULL: necessario per filtrare su colonne non-PK.
--    famiglia_dati e famiglia_spesa hanno PK composita (famiglia_id + altro),
--    quindi il filtro Realtime già funziona su di esse, ma FULL è più sicuro.
alter table public.famiglia_dati  replica identity full;
alter table public.famiglia_spesa replica identity full;
alter table public.profili        replica identity full;
alter table public.misure         replica identity full;
alter table public.profilo_dati   replica identity full;

-- 2. Verifica che le tabelle siano in Realtime con FULL identity
select
  c.relname as tabella,
  case c.relreplident
    when 'd' then 'DEFAULT (solo PK)'
    when 'f' then 'FULL ✓'
    when 'i' then 'INDEX'
    when 'n' then 'NOTHING'
  end as replica_identity,
  exists (
    select 1 from pg_publication_tables pt
    where pt.pubname = 'supabase_realtime' and pt.tablename = c.relname
  ) as in_realtime
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profili','misure','profilo_dati','famiglia_dati','famiglia_spesa')
order by c.relname;
