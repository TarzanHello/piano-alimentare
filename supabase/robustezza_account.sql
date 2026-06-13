-- ============================================================
-- ROBUSTEZZA ACCOUNT — vincoli anti-doppione (eseguire una volta)
-- Impediscono A LIVELLO DI DATABASE gli stati che ci hanno fatto
-- penare: due profili per lo stesso utente, ecc.
-- ============================================================

-- 1. Un utente registrato = AL MASSIMO un profilo.
--    (user_id già UNIQUE in s1, ma lo ribadiamo in modo esplicito e
--     ripuliamo eventuali doppioni residui tenendo il più vecchio.)
do $$
begin
  -- elimina profili registrati duplicati, tiene il più vecchio per utente
  delete from public.profili p
  using (
    select user_id, min(created_at) as keep
    from public.profili
    where user_id is not null
    group by user_id
    having count(*) > 1
  ) d
  where p.user_id = d.user_id and p.created_at <> d.keep;
end $$;

-- 2. Indice unico esplicito su user_id (ridondante ma autodocumentante)
create unique index if not exists profili_user_unico
  on public.profili (user_id) where user_id is not null;

-- 3. create_family: blocca se l'utente ha GIÀ una famiglia (anti-FEDEAU)
create or replace function public.create_family(p_nome text)
returns json language plpgsql security definer set search_path = public as $$
declare v_fam famiglie;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if not exists (select 1 from profili where user_id = auth.uid()) then
    raise exception 'Profilo mancante: completa la tua scheda prima';
  end if;
  if exists (select 1 from profili where user_id = auth.uid() and famiglia_id is not null) then
    raise exception 'Fai gia'' parte di una famiglia: esci prima di crearne una nuova';
  end if;
  insert into famiglie (nome, invite_code, created_by)
  values (trim(p_nome), genera_invite_code(), auth.uid())
  returning * into v_fam;
  update profili set famiglia_id = v_fam.id
  where user_id = auth.uid()
     or (user_id is null and gestito_da = auth.uid() and famiglia_id is null);
  return json_build_object('id', v_fam.id, 'nome', v_fam.nome, 'invite_code', v_fam.invite_code);
end $$;

-- 4. Pulizia famiglie orfane (senza alcun membro): le elimina
delete from public.famiglie f
where not exists (select 1 from public.profili p where p.famiglia_id = f.id);

-- 5. Verifica
select
  (select count(*) from public.profili where user_id is not null) as utenti_con_profilo,
  (select count(*) from public.famiglie) as famiglie_totali,
  (select count(*) from public.famiglie f
     where not exists (select 1 from public.profili p where p.famiglia_id=f.id)) as famiglie_orfane;
