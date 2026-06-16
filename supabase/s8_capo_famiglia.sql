-- ============================================================
-- S8: Capo famiglia con trasferimento automatico della titolarità
-- Idempotente. Eseguire nel SQL Editor di Supabase.
-- ============================================================

-- ─── 1. Aggiungi capo_id alla tabella famiglie ───────────────
-- Inizialmente NULL; verrà popolato da una query di backfill.
-- Usiamo SET NULL on delete così se l'utente viene eliminato
-- da auth.users il riferimento non blocca.
alter table public.famiglie
  add column if not exists capo_id uuid references auth.users(id) on delete set null;

-- Backfill: il capo iniziale è sempre il creatore
update public.famiglie
  set capo_id = created_by
  where capo_id is null;

-- ─── 2. Policy RLS: il capo può modificare la propria famiglia ─
-- (created_by non cambia mai; capo_id può cambiare)
drop policy if exists famiglie_update on public.famiglie;
create policy famiglie_update on public.famiglie for update
  using (capo_id = auth.uid() or created_by = auth.uid());

-- ─── 3. RPC: esci dalla famiglia (con passaggio titolarità) ────
create or replace function public.leave_family()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_fam_id    uuid;
  v_capo_id   uuid;
  v_next_user uuid;
  v_count     int;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;

  -- Trova la famiglia di questo utente
  select famiglia_id into v_fam_id
  from profili where user_id = auth.uid();
  if v_fam_id is null then raise exception 'Non sei in una famiglia'; end if;

  -- Quanti utenti REGISTRATI rimangono in famiglia (escluso me)?
  select count(*) into v_count
  from profili
  where famiglia_id = v_fam_id
    and user_id is not null
    and user_id <> auth.uid();

  if v_count = 0 then
    -- Sono l'ultimo: elimino tutti i dati della famiglia e la famiglia stessa.
    -- CASCADE non è attivo su famiglia_dati/famiglia_spesa → pulizia esplicita.
    delete from public.famiglia_spesa  where famiglia_id = v_fam_id;
    delete from public.famiglia_dati   where famiglia_id = v_fam_id;
    -- I profili: sgancia prima (FK set null via on delete set null non basta
    -- perché la famiglia non viene cancellata automaticamente da profili)
    update public.profili set famiglia_id = null where famiglia_id = v_fam_id;
    delete from public.famiglie where id = v_fam_id;
    return;
  end if;

  -- Sono il capo? → trasferisci titolarità prima di uscire
  select capo_id into v_capo_id from famiglie where id = v_fam_id;
  if v_capo_id = auth.uid() then
    -- Il prossimo capo è il membro registrato entrato prima tra quelli rimasti,
    -- determinato da profili.created_at (ordine di entrata in famiglia).
    select user_id into v_next_user
    from profili
    where famiglia_id = v_fam_id
      and user_id is not null
      and user_id <> auth.uid()
    order by created_at asc
    limit 1;

    update public.famiglie set capo_id = v_next_user where id = v_fam_id;
  end if;

  -- Sgancia il mio profilo e quelli a mio carico dalla famiglia
  update public.profili set famiglia_id = null
  where user_id = auth.uid()
     or (user_id is null and gestito_da = auth.uid());
end $$;

-- ─── 4. RPC: rimuovi membro (solo il capo può farlo) ──────────
-- Aggiornato per usare capo_id invece di created_by
create or replace function public.remove_member(p_profilo_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_fam_id  uuid;
  v_target  profili;
begin
  select id into v_fam_id from famiglie
  where capo_id = auth.uid()          -- chiunque sia capo, non solo il creatore
    and id = public.my_famiglia_id();
  if not found then raise exception 'Solo il capo della famiglia può rimuovere membri'; end if;

  select * into v_target from profili where id = p_profilo_id and famiglia_id = v_fam_id;
  if not found then raise exception 'Profilo non trovato in questa famiglia'; end if;
  if v_target.user_id = auth.uid() then raise exception 'Per uscire usa leave_family'; end if;

  -- Sgancia il membro e i suoi profili a carico
  update profili set famiglia_id = null
  where famiglia_id = v_fam_id
    and (id = p_profilo_id
         or (user_id is null
             and v_target.user_id is not null
             and gestito_da = v_target.user_id));
end $$;

-- ─── 5. RPC helper: chi è il capo della mia famiglia? ─────────
create or replace function public.my_family_capo_id()
returns uuid language sql stable security definer set search_path = public as $$
  select f.capo_id
  from public.profili p
  join public.famiglie f on f.id = p.famiglia_id
  where p.user_id = auth.uid()
$$;

-- ─── 6. Permessi ──────────────────────────────────────────────
grant execute on function public.leave_family()       to authenticated;
grant execute on function public.remove_member(uuid)  to authenticated;
grant execute on function public.my_family_capo_id()  to authenticated;

-- ─── 7. Verifica ──────────────────────────────────────────────
select id, nome, created_by, capo_id,
       case when created_by = capo_id then 'capo = creatore'
            else 'titolarità trasferita'
       end as stato
from public.famiglie;
