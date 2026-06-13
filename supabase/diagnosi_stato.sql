-- ============================================================
-- DIAGNOSI STATO (eseguire nel SQL Editor, una query alla volta
-- o tutte insieme: l'ultima SELECT di ciascun blocco mostra il
-- risultato). NON modifica nulla.
-- ============================================================

-- 1. Tutti i profili: chi è registrato, chi è a carico, in quale famiglia
select
  p.id,
  p.nome,
  case when p.user_id is not null then 'registrato' else 'a carico' end as tipo,
  p.user_id,
  p.gestito_da,
  p.famiglia_id,
  f.nome  as famiglia_nome,
  f.invite_code,
  p.created_at
from public.profili p
left join public.famiglie f on f.id = p.famiglia_id
order by p.created_at;

-- 2. Tutte le famiglie esistenti (per scoprire eventuali doppioni)
select id, nome, invite_code, created_by, created_at
from public.famiglie
order by created_at;

-- 3. Quanti profili REGISTRATI ha ciascun utente (dovrebbe essere 1)
select user_id, count(*) as n_profili
from public.profili
where user_id is not null
group by user_id
order by n_profili desc;

-- 4. Utenti in auth (per incrociare gli user_id con le email)
select id, email, created_at
from auth.users
order by created_at;
