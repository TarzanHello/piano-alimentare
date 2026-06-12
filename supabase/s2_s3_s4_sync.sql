-- ============================================================
-- PIANO ALIMENTARE — Fasi S2+S3+S4: sincronizzazione dati
-- Eseguire UNA VOLTA nel SQL Editor di Supabase, DOPO lo script
-- s1_identita_famiglie.sql. Idempotente.
-- ============================================================

-- ─── S2: misurazioni (una riga per profilo+data) ────────────
create table if not exists public.misure (
  profilo_id  uuid not null references public.profili(id) on delete cascade,
  data        date not null,
  valori      jsonb not null default '{}'::jsonb,   -- record completo (peso, vita, …)
  updated_at  timestamptz not null default now(),
  primary key (profilo_id, data)
);

-- ─── S3: dati personali per profilo (log pasti, …) ──────────
create table if not exists public.profilo_dati (
  profilo_id  uuid not null references public.profili(id) on delete cascade,
  chiave      text not null,                         -- es. 'meals_log'
  valore      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (profilo_id, chiave)
);

-- ─── S3: dati condivisi della famiglia (piano, gusti, …) ────
create table if not exists public.famiglia_dati (
  famiglia_id uuid not null references public.famiglie(id) on delete cascade,
  chiave      text not null,                         -- 'piano' | 'gusti' | 'esclusioni'
  valore      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (famiglia_id, chiave)
);

-- ─── S4: spunte della lista spesa (una riga per articolo) ───
-- Riga-per-articolo: due persone possono spuntare articoli diversi
-- nello stesso momento senza perdersi a vicenda.
create table if not exists public.famiglia_spesa (
  famiglia_id uuid not null references public.famiglie(id) on delete cascade,
  settimana   text not null,                         -- seed del piano corrente
  item_id     text not null,
  checked     boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (famiglia_id, settimana, item_id)
);

-- ─── updated_at automatico ──────────────────────────────────
drop trigger if exists misure_touch on public.misure;
create trigger misure_touch before update on public.misure
  for each row execute function public.touch_updated_at();
drop trigger if exists profilo_dati_touch on public.profilo_dati;
create trigger profilo_dati_touch before update on public.profilo_dati
  for each row execute function public.touch_updated_at();
drop trigger if exists famiglia_dati_touch on public.famiglia_dati;
create trigger famiglia_dati_touch before update on public.famiglia_dati
  for each row execute function public.touch_updated_at();
drop trigger if exists famiglia_spesa_touch on public.famiglia_spesa;
create trigger famiglia_spesa_touch before update on public.famiglia_spesa
  for each row execute function public.touch_updated_at();

-- ─── Helper: il profilo è leggibile / scrivibile da me? ─────
create or replace function public.profilo_leggibile(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profili p
    where p.id = p_id
      and (p.user_id = auth.uid()
           or p.gestito_da = auth.uid()
           or (p.famiglia_id is not null and p.famiglia_id = public.my_famiglia_id()))
  )
$$;

create or replace function public.profilo_scrivibile(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profili p
    where p.id = p_id
      and (p.user_id = auth.uid()
           or (p.user_id is null and (
                p.gestito_da = auth.uid()
                or (p.famiglia_id is not null and p.famiglia_id = public.my_famiglia_id()))))
  )
$$;

-- ─── Row Level Security ─────────────────────────────────────
alter table public.misure         enable row level security;
alter table public.profilo_dati   enable row level security;
alter table public.famiglia_dati  enable row level security;
alter table public.famiglia_spesa enable row level security;

-- MISURE: la famiglia le vede; le scrive solo il proprietario
-- (o gli adulti, per i profili a carico)
drop policy if exists misure_select on public.misure;
create policy misure_select on public.misure for select
  using (public.profilo_leggibile(profilo_id));
drop policy if exists misure_write on public.misure;
create policy misure_write on public.misure for all
  using (public.profilo_scrivibile(profilo_id))
  with check (public.profilo_scrivibile(profilo_id));

-- PROFILO_DATI: stessa logica delle misure
drop policy if exists profilo_dati_select on public.profilo_dati;
create policy profilo_dati_select on public.profilo_dati for select
  using (public.profilo_leggibile(profilo_id));
drop policy if exists profilo_dati_write on public.profilo_dati;
create policy profilo_dati_write on public.profilo_dati for all
  using (public.profilo_scrivibile(profilo_id))
  with check (public.profilo_scrivibile(profilo_id));

-- FAMIGLIA_DATI e FAMIGLIA_SPESA: tutti i membri leggono e scrivono
drop policy if exists famiglia_dati_all on public.famiglia_dati;
create policy famiglia_dati_all on public.famiglia_dati for all
  using (famiglia_id = public.my_famiglia_id())
  with check (famiglia_id = public.my_famiglia_id());
drop policy if exists famiglia_spesa_all on public.famiglia_spesa;
create policy famiglia_spesa_all on public.famiglia_spesa for all
  using (famiglia_id = public.my_famiglia_id())
  with check (famiglia_id = public.my_famiglia_id());

-- ─── Realtime: pubblica i cambiamenti delle tabelle sync ────
-- (idempotente: ignora l'errore se la tabella è già pubblicata)
do $$ begin
  alter publication supabase_realtime add table public.profili;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.misure;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.profilo_dati;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.famiglia_dati;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.famiglia_spesa;
exception when duplicate_object then null; end $$;
