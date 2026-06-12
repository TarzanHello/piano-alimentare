-- ============================================================
-- PIANO ALIMENTARE FAMILIARE — Fase S1: identità e famiglie
-- Eseguire UNA VOLTA nel SQL Editor di Supabase (Dashboard →
-- SQL Editor → New query → incolla tutto → Run).
-- Idempotente: rieseguirlo non fa danni.
-- ============================================================

-- ─── Tabella famiglie ───────────────────────────────────────
create table if not exists public.famiglie (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  invite_code  text not null unique,
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now()
);

-- ─── Tabella profili ────────────────────────────────────────
-- user_id valorizzato  → profilo di un utente registrato (univoco)
-- user_id NULL         → profilo gestito (bambino "a carico")
create table if not exists public.profili (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete cascade,
  gestito_da    uuid references auth.users(id),          -- chi ha creato il profilo a carico
  famiglia_id   uuid references public.famiglie(id) on delete set null,
  nome          text not null,
  sesso         text not null default 'M' check (sesso in ('M','F')),
  data_nascita  date,
  peso          numeric,
  altezza       numeric,
  lavoro        text default 'sedentario',
  allenamenti   int  default 3 check (allenamenti between 0 and 7),
  obiettivo     text default 'mantenimento',
  color         text default '#2563eb',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- o è un utente registrato, o è un profilo a carico con un tutore
  check (user_id is not null or gestito_da is not null)
);

create index if not exists profili_famiglia_idx on public.profili(famiglia_id);
create index if not exists profili_gestito_idx  on public.profili(gestito_da);

-- ─── updated_at automatico ──────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists profili_touch on public.profili;
create trigger profili_touch before update on public.profili
  for each row execute function public.touch_updated_at();

-- ─── Helper: famiglia dell'utente corrente ──────────────────
-- SECURITY DEFINER: bypassa RLS per evitare ricorsione nelle policy.
create or replace function public.my_famiglia_id()
returns uuid language sql stable security definer set search_path = public as $$
  select famiglia_id from public.profili where user_id = auth.uid()
$$;

-- ─── Row Level Security ─────────────────────────────────────
alter table public.famiglie enable row level security;
alter table public.profili  enable row level security;

-- FAMIGLIE: vedo solo la mia (o quella che ho creato)
drop policy if exists famiglie_select on public.famiglie;
create policy famiglie_select on public.famiglie for select
  using (id = public.my_famiglia_id() or created_by = auth.uid());
-- insert/update/delete SOLO tramite le funzioni RPC qui sotto

-- PROFILI
-- Lettura: il mio, quelli a mio carico, e tutti quelli della mia famiglia
drop policy if exists profili_select on public.profili;
create policy profili_select on public.profili for select
  using (
    user_id = auth.uid()
    or gestito_da = auth.uid()
    or (famiglia_id is not null and famiglia_id = public.my_famiglia_id())
  );

-- Inserimento: il mio profilo, oppure un profilo a carico creato da me
drop policy if exists profili_insert on public.profili;
create policy profili_insert on public.profili for insert
  with check (
    (user_id = auth.uid())
    or (user_id is null and gestito_da = auth.uid())
  );

-- Modifica: SOLO il mio profilo; i profili a carico li modifica il
-- tutore oppure, una volta in famiglia, qualunque adulto della famiglia.
-- I profili degli ALTRI utenti registrati NON sono modificabili: questo
-- vincolo è imposto qui, dal database, non dall'interfaccia.
drop policy if exists profili_update on public.profili;
create policy profili_update on public.profili for update
  using (
    user_id = auth.uid()
    or (user_id is null and (
      gestito_da = auth.uid()
      or (famiglia_id is not null and famiglia_id = public.my_famiglia_id())
    ))
  );

-- Cancellazione: il mio profilo, o un profilo a carico (tutore o famiglia)
drop policy if exists profili_delete on public.profili;
create policy profili_delete on public.profili for delete
  using (
    user_id = auth.uid()
    or (user_id is null and (
      gestito_da = auth.uid()
      or (famiglia_id is not null and famiglia_id = public.my_famiglia_id())
    ))
  );

-- ─── Generazione codice invito (es. PASTA-7392) ─────────────
create or replace function public.genera_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  parole text[] := array['PASTA','PIZZA','RISO','PANE','MELA','PERA','UVA','KIWI',
                         'LIMONE','BASILICO','TIMO','SALVIA','FARRO','ORZO','MIELE','NOCE'];
  codice text;
begin
  loop
    codice := parole[1 + floor(random()*array_length(parole,1))::int]
              || '-' || lpad(floor(random()*10000)::text, 4, '0');
    exit when not exists (select 1 from famiglie where invite_code = codice);
  end loop;
  return codice;
end $$;

-- ─── RPC: crea famiglia ─────────────────────────────────────
-- Crea la famiglia, vi aggancia il profilo del chiamante e
-- TRASPORTA i suoi profili a carico (i bambini seguono il genitore).
create or replace function public.create_family(p_nome text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_fam famiglie;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if exists (select 1 from profili where user_id = auth.uid() and famiglia_id is not null) then
    raise exception 'Fai già parte di una famiglia';
  end if;
  if not exists (select 1 from profili where user_id = auth.uid()) then
    raise exception 'Profilo mancante';
  end if;

  insert into famiglie (nome, invite_code, created_by)
  values (trim(p_nome), genera_invite_code(), auth.uid())
  returning * into v_fam;

  update profili set famiglia_id = v_fam.id
  where user_id = auth.uid()
     or (user_id is null and gestito_da = auth.uid() and famiglia_id is null);

  return json_build_object('id', v_fam.id, 'nome', v_fam.nome, 'invite_code', v_fam.invite_code);
end $$;

-- ─── RPC: entra in famiglia con un codice ───────────────────
create or replace function public.join_family(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_fam famiglie;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if exists (select 1 from profili where user_id = auth.uid() and famiglia_id is not null) then
    raise exception 'Fai già parte di una famiglia';
  end if;

  select * into v_fam from famiglie
  where invite_code = upper(trim(p_code));
  if not found then raise exception 'Codice non valido'; end if;

  update profili set famiglia_id = v_fam.id
  where user_id = auth.uid()
     or (user_id is null and gestito_da = auth.uid() and famiglia_id is null);

  return json_build_object('id', v_fam.id, 'nome', v_fam.nome, 'invite_code', v_fam.invite_code);
end $$;

-- ─── RPC: esci dalla famiglia ───────────────────────────────
-- Il membro esce da solo; i suoi profili a carico lo seguono.
create or replace function public.leave_family()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  update profili set famiglia_id = null
  where user_id = auth.uid()
     or (user_id is null and gestito_da = auth.uid());
end $$;

-- ─── RPC: il creatore rimuove un membro ─────────────────────
create or replace function public.remove_member(p_profilo_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_fam_id uuid;
  v_target profili;
begin
  select id into v_fam_id from famiglie
  where created_by = auth.uid()
    and id = public.my_famiglia_id();
  if not found then raise exception 'Solo il creatore della famiglia può rimuovere membri'; end if;

  select * into v_target from profili where id = p_profilo_id and famiglia_id = v_fam_id;
  if not found then raise exception 'Profilo non trovato in questa famiglia'; end if;
  if v_target.user_id = auth.uid() then raise exception 'Per uscire usa leave_family'; end if;

  -- il membro rimosso porta con sé i suoi profili a carico
  update profili set famiglia_id = null
  where famiglia_id = v_fam_id
    and (id = p_profilo_id
         or (user_id is null and v_target.user_id is not null and gestito_da = v_target.user_id));
end $$;

-- ─── Permessi di esecuzione RPC ──────────────────────────────
grant execute on function public.create_family(text) to authenticated;
grant execute on function public.join_family(text)   to authenticated;
grant execute on function public.leave_family()      to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
revoke execute on function public.genera_invite_code() from public, anon, authenticated;
