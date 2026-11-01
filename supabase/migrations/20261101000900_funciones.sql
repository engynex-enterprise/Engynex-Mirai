-- Funciones nuevas: lista de deseos (regla de 30 días), patrimonio mes a mes y programa de referidos. Aditiva.

-- ── Lista de deseos ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.wishlist (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null check (length(nombre) between 1 and 120),
  precio numeric(14,2) not null default 0 check (precio >= 0),
  url text,
  prioridad smallint not null default 2 check (prioridad between 1 and 3),
  esperar_hasta date not null default (current_date + 30),
  estado text not null default 'esperando' check (estado in ('esperando', 'comprado', 'descartado')),
  nota text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── Patrimonio mes a mes ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  activos numeric(16,2) not null default 0,
  deudas numeric(16,2) not null default 0,
  patrimonio numeric(16,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (book_id, mes)
);

do $$
declare t text;
begin
  foreach t in array array['wishlist', 'net_worth_snapshots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "leer %1$s" on public.%1$I', t);
    execute format('create policy "leer %1$s" on public.%1$I for select to authenticated using (public.is_book_member(book_id, ''viewer''))', t);
    execute format('drop policy if exists "crear %1$s" on public.%1$I', t);
    execute format('create policy "crear %1$s" on public.%1$I for insert to authenticated with check (public.is_book_member(book_id, ''editor''))', t);
    execute format('drop policy if exists "editar %1$s" on public.%1$I', t);
    execute format('create policy "editar %1$s" on public.%1$I for update to authenticated using (public.is_book_member(book_id, ''editor'')) with check (public.is_book_member(book_id, ''editor''))', t);
    execute format('drop policy if exists "borrar %1$s" on public.%1$I', t);
    execute format('create policy "borrar %1$s" on public.%1$I for delete to authenticated using (public.is_book_member(book_id, ''editor''))', t);
    execute format('create index if not exists %1$s_book_idx on public.%1$I(book_id)', t);
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.touch_updated_at()', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
drop trigger if exists trg_audit on public.wishlist;
create trigger trg_audit after insert or update or delete on public.wishlist for each row execute function public.audit_row();

-- ── Programa de referidos ───────────────────────────────────────────────────────────────────────────────────────
-- Cada persona tiene un código. Cuando alguien se registra con él y crea su hogar, los dos hogares reciben
-- un mes del plan de recompensa (cortesía). Máximo 12 recompensas por persona.
create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[A-Z0-9]{6,12}$'),
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
drop policy if exists "ver mi codigo" on public.referral_codes;
create policy "ver mi codigo" on public.referral_codes for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer uuid not null references auth.users(id) on delete cascade,
  referred uuid not null unique references auth.users(id) on delete cascade,
  codigo text not null,
  estado text not null default 'registrado' check (estado in ('registrado', 'recompensado', 'sin_recompensa')),
  rewarded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.referrals enable row level security;
drop policy if exists "ver mis referidos" on public.referrals;
create policy "ver mis referidos" on public.referrals for select to authenticated using (referrer = auth.uid() or referred = auth.uid() or public.is_platform_admin());

alter table public.platform_settings add column if not exists referidos_activo boolean not null default true;
alter table public.platform_settings add column if not exists referidos_plan text not null default 'premium';
alter table public.platform_settings add column if not exists referidos_dias integer not null default 30 check (referidos_dias between 1 and 365);
