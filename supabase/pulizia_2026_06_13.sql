-- ============================================================
-- PULIZIA UNA-TANTUM dopo l'incidente migrazione (13/06/2026)
-- Eseguire nel SQL Editor di Supabase. Controlla gli UUID con la
-- tabella profili prima di lanciare: devono combaciare col tuo caso.
-- ============================================================

-- 1. Riaggancia il profilo di Aureliano alla famiglia
update public.profili
set famiglia_id = '96aec40b-b47b-4459-9c63-a300'  -- ⚠️ COMPLETA: copia l'UUID intero della famiglia dalla colonna famiglia_id (riga "Bimbo" e41c8ef4) o dalla tabella famiglie
where id = '65cb06bd-d25b-46bd-8c2d-836d2024ca35'; -- profilo "aureliano"

-- 2. Elimina i profili a carico duplicati/fantasma ("Uomo" creati
--    dai vecchi profili precompilati, e il "Bimbo" rimasto fuori famiglia).
--    Tengo: aureliano (65cb06bd…) e il Bimbo in famiglia (e41c8ef4…).
delete from public.profili where id in (
  '14ede8f0-db8a-42a3-ac87-e7af925b5965',  -- Uomo, fuori famiglia
  '1c53c15b-96c1-4353-abf3-127277ffba2a',  -- Uomo, in famiglia (duplicato)
  '6df499cf-f245-484a-9c06-3ef8dac319c5',  -- Uomo, fuori famiglia
  'c0327c70-0d76-4603-8598-4b9a534ff328',  -- Bimbo, fuori famiglia (duplicato)
  'fdbeb408-f815-47cd-9d64-3f3c9afddbd4'   -- Uomo, in famiglia (duplicato)
);

-- 3. Verifica finale: devono restare il tuo profilo (in famiglia),
--    il Bimbo (in famiglia) e, quando si registrerà, tua moglie.
select id, nome, user_id is not null as registrato, famiglia_id is not null as in_famiglia
from public.profili order by created_at;
