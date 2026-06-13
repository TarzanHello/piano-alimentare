-- ============================================================
-- FIX ACCOPPIAMENTO (eseguire nel SQL Editor di Supabase)
-- Ridefinisce join_family in modo che:
--  - pretenda l'esistenza del profilo di chi entra (messaggio chiaro)
--  - confermi che almeno una riga sia stata agganciata
-- Sicuro da rieseguire.
-- ============================================================

create or replace function public.join_family(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_fam famiglie;
  v_count int;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if not exists (select 1 from profili where user_id = auth.uid()) then
    raise exception 'Profilo mancante: completa la tua scheda nella pagina Utente prima di entrare in famiglia';
  end if;
  if exists (select 1 from profili where user_id = auth.uid() and famiglia_id is not null) then
    raise exception 'Fai gia'' parte di una famiglia';
  end if;

  select * into v_fam from famiglie where invite_code = upper(trim(p_code));
  if not found then raise exception 'Codice non valido'; end if;

  update profili set famiglia_id = v_fam.id
  where user_id = auth.uid()
     or (user_id is null and gestito_da = auth.uid() and famiglia_id is null);
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Nessun profilo da agganciare'; end if;

  return json_build_object('id', v_fam.id, 'nome', v_fam.nome, 'invite_code', v_fam.invite_code);
end $$;

grant execute on function public.join_family(text) to authenticated;

-- Diagnostica: elenco famiglie e codici (eseguibile da te come owner)
-- select id, nome, invite_code, created_at from public.famiglie order by created_at;
