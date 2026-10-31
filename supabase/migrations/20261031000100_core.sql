-- Mirai 5.0 · Esquema base
-- Hogares → libros → datos. Seguridad con RLS por membresía del hogar.
-- Convenciones: uuid PK, book_id en todo dato, numeric(18,2) + currency, date (America/Bogota),
-- created_by / created_at / updated_at / deleted_at (borrado lógico para "Deshacer").

create extension if not exists pgcrypto;

-- ───────────────────────── Utilidades ─────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.role_rank(r text) returns int
language sql immutable as $$
  select case r when 'owner' then 3 when 'editor' then 2 when 'viewer' then 1 else 0 end
$$;

-- ───────────────────────── Cuentas ─────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  nombre        text not null default '',
  avatar_url    text,
  ciudad        text not null default '',
  ocupacion     text not null default '',
  doc_tipo      text not null default 'CC' check (doc_tipo in ('CC','CE','PA','TI','NIT','PPT')),
  doc           text not null default '',
  digitos       text not null default '' check (digitos ~ '^[0-9]{0,2}$'),
  riesgo        text not null default 'moderado' check (riesgo in ('conservador','moderado','arriesgado')),
  direccion     jsonb not null default '{}',
  telefono      text not null default '',
  last_book_id  uuid,
  deletion_requested_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  document    text not null check (document in ('terminos','privacidad','datos_menores','marketing')),
  version     text not null,
  accepted_at timestamptz not null default now(),
  user_agent  text
);
create index if not exists consents_user_idx on public.consents(user_id);

create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'editor' check (role in ('owner','editor','viewer')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists household_members_user_idx on public.household_members(user_id);

create table if not exists public.household_invitations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email        text not null,
  role         text not null default 'editor' check (role in ('editor','viewer')),
  token_hash   text not null unique,
  invited_by   uuid references auth.users(id) on delete set null,
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.books (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  nombre       text not null,
  tipo         text not null default 'personal' check (tipo in ('personal','negocio','otro')),
  icon         text not null default 'house',
  is_default   boolean not null default false,
  sample       boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists books_household_idx on public.books(household_id);

-- ───────────────────────── Autorización ─────────────────────────
create or replace function public.is_household_member(hh uuid, min_role text default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hh and m.user_id = auth.uid()
      and public.role_rank(m.role) >= public.role_rank(min_role)
  )
$$;

create or replace function public.is_book_member(bk uuid, min_role text default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.books b
    join public.household_members m on m.household_id = b.household_id
    where b.id = bk and m.user_id = auth.uid()
      and public.role_rank(m.role) >= public.role_rank(min_role)
  )
$$;

create or replace function public.book_household(bk uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.books where id = bk
$$;

-- ───────────────────────── Familia y ajustes ─────────────────────────
create table if not exists public.family_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  nombre       text not null,
  rol          text not null default 'Titular',          -- parentesco (23 opciones en la UI)
  cupo         numeric(18,2) not null default 0,         -- presupuesto mensual personal
  color        text not null default 'c0',
  es_titular   boolean not null default false,
  -- Datos para la DIAN (dependientes)
  nacimiento   date,
  doc          text not null default '',
  dep_de       uuid references public.family_members(id) on delete set null,
  dep_rel      text check (dep_rel in ('hijo','conyuge','padre','hermano','otro')),
  estudia      boolean not null default false,
  sin_ingresos boolean not null default true,
  discapacidad boolean not null default false,
  sort         int not null default 0,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists family_members_household_idx on public.family_members(household_id);

create table if not exists public.book_settings (
  book_id      uuid primary key references public.books(id) on delete cascade,
  meta         text not null default '',                  -- meta financiera principal
  umbral       numeric(18,2) not null default 25000,      -- valor máximo de un gasto hormiga
  limite       numeric(18,2) not null default 250000,     -- límite mensual de hormiga
  trm          jsonb not null default '{"USD":4100,"EUR":4450}',
  trm_auto     boolean not null default true,             -- usar TRM de la integración
  pct          jsonb not null default '{"n":50,"g":30,"a":20}',
  emerg_meta   int not null default 6,
  anticipo     int not null default 5,
  usura        numeric(8,4) not null default 26,
  usura_auto   boolean not null default true,
  corte_q      int not null default 15 check (corte_q between 1 and 27),
  alerta_pres  int not null default 100,
  estricto     text not null default 'equilibrado' check (estricto in ('prudente','equilibrado','flexible')),
  defaults     jsonb not null default '{"cat":"","medio":"","quien":"familia","sistema":"frances","frec":"mensual","plazo":12}',
  notif        jsonb not null default '{"pagos":true,"cobros":true,"hormiga":true,"presupuesto":true,"inversiones":true,"metas":true,"popup":true}',
  ia           jsonb not null default '{"autocat":true,"hormiga":true}',
  relaciones   text[] not null default array['Familiar','Amigo','Compañero de trabajo','Cliente','Vecino','Proveedor','Otro'],
  apps         jsonb not null default '[]',
  setup        jsonb not null default '{"skip":{},"dismissed":false}',
  uvt          jsonb not null default '{}',               -- sobrescrituras por año
  smmlv        jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  theme         text not null default 'system' check (theme in ('light','dark','system')),
  font_scale    text not null default 'm' check (font_scale in ('m','l','xl')),
  dense         boolean not null default false,
  reduce_motion boolean not null default false,
  sidebar_collapsed boolean not null default false,
  home_view     text not null default 'inicio',
  privacy_mode  boolean not null default false,
  privacy_blur_on_leave boolean not null default false,
  lock_minutes  int not null default 0,                   -- bloqueo por inactividad (0 = apagado)
  nav_open      jsonb not null default '{}',
  chat_pos      jsonb,
  calendar_prefs jsonb not null default '{}',
  tour_done     boolean not null default false,
  seen_release  text,
  extra         jsonb not null default '{}',
  updated_at    timestamptz not null default now()
);

-- ───────────────────────── Catálogos del libro ─────────────────────────
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null,
  grupo text not null default 'g' check (grupo in ('n','g','a')),   -- necesidades / gustos / ahorro
  icon text not null default 'tag',
  tope numeric(18,2) not null default 0,
  sort int not null default 0,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.income_categories (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null, icon text not null default 'coins', sort int not null default 0,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'Banco' check (tipo in ('Banco','Cooperativa','Fintech','Billetera','Fondo','Otro')),
  nit text not null default '', logo_path text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null, icon text not null default 'banknote', sort int not null default 0,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.keyword_rules (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  keyword text not null,
  category_id uuid references public.categories(id) on delete cascade,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- ───────────────────────── Movimientos ─────────────────────────
create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  concepto text not null,
  category_id uuid references public.income_categories(id) on delete set null,
  valor numeric(18,2) not null default 0,               -- valor por pago (neto)
  frec text not null default 'mensual' check (frec in ('mensual','quincenal','semanal','anual')),
  dia int not null default 30 check (dia between 1 and 31),
  member_id uuid references public.family_members(id) on delete set null,   -- null = familia
  currency text not null default 'COP',
  bruto numeric(18,2),                                   -- salario bruto (nómina)
  deducciones jsonb,                                     -- config de descuentos de nómina (m_nomina)
  activo boolean not null default true,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.extra_incomes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  fecha date not null default current_date,
  descripcion text not null default '',
  valor numeric(18,2) not null default 0,
  currency text not null default 'COP',
  member_id uuid references public.family_members(id) on delete set null,
  category_id uuid references public.income_categories(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null,
  category_id uuid references public.categories(id) on delete set null,
  valor numeric(18,2) not null default 0,                -- promedio si es variable
  currency text not null default 'COP',
  frec text not null default 'mensual' check (frec in ('mensual','quincenal','bimestral','trimestral','semestral','anual','unico')),
  dia int not null default 1 check (dia between 1 and 31),
  dia2 int check (dia2 between 1 and 31),
  mes int check (mes between 1 and 12),
  fecha_unica date,
  inicio date,
  variable boolean not null default false,
  vmin numeric(18,2), vmax numeric(18,2),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  proveedor text not null default '',
  desde text not null default to_char(now() at time zone 'America/Bogota','YYYY-MM'),
  link_type text check (link_type in ('meta','fondo')),  -- aporte programado
  link_id uuid,
  logo_path text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  fecha date not null default current_date,
  descripcion text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  valor numeric(18,2) not null default 0,
  currency text not null default 'COP',
  member_id uuid references public.family_members(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  fixed_expense_id uuid references public.fixed_expenses(id) on delete cascade,
  periodo text,                                          -- YYYY-MM | YYYY-MM-Q1/Q2 | YYYY | U
  hormiga boolean not null default false,
  hormiga_src text check (hormiga_src in ('ia','manual','regla')),
  hormiga_razon text,
  fondo_valor numeric(18,2) not null default 0,          -- parte pagada con el fondo de emergencia
  origen text not null default 'manual' check (origen in ('manual','importar','correo','ocr','voz','tarjeta','compartido','aporte','prestamo')),
  external_id text,                                      -- id de correo / fila importada (evita duplicados)
  nota text not null default '',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists expenses_book_fecha_idx on public.expenses(book_id, fecha desc) where deleted_at is null;
create unique index if not exists expenses_external_uidx on public.expenses(book_id, external_id) where external_id is not null and deleted_at is null;

create table if not exists public.fixed_expense_payments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  periodo text not null,
  fecha date not null default current_date,
  valor numeric(18,2) not null default 0,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index if not exists fixed_payments_uidx on public.fixed_expense_payments(fixed_expense_id, periodo) where deleted_at is null;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null,
  valor numeric(18,2) not null default 0,
  currency text not null default 'COP',
  ciclo text not null default 'mensual' check (ciclo in ('mensual','anual')),
  proximo date,
  comparte int not null default 1 check (comparte >= 1),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  logo_path text,
  activa boolean not null default true,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null,
  entity_id uuid references public.entities(id) on delete set null,
  cupo numeric(18,2) not null default 0,
  corte int not null default 25 check (corte between 1 and 31),
  pago int not null default 10 check (pago between 1 and 31),
  tasa numeric(8,4) not null default 0,                  -- % mensual
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.card_purchases (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  fecha date not null default current_date,
  descripcion text not null default '',
  valor numeric(18,2) not null default 0,
  cuotas int not null default 1 check (cuotas >= 1),
  category_id uuid references public.categories(id) on delete set null,
  pagada boolean not null default false,
  expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- ───────────────────────── Deudas y patrimonio ─────────────────────────
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  tipo text not null default 'persona' check (tipo in ('persona','empresa')),
  nombre text not null,
  doc_tipo text not null default 'CC',
  doc text not null default '',
  telefono text not null default '',
  email text not null default '',
  direccion jsonb not null default '{}',
  ciudad text not null default '',
  relacion text not null default '',
  notas text not null default '',
  avatar_path text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  kind text not null check (kind in ('cobrar','pagar')),  -- me deben / le debo
  contact_id uuid references public.contacts(id) on delete set null,
  entity_id uuid references public.entities(id) on delete set null,
  concepto text not null default '',
  monto numeric(18,2) not null default 0,
  currency text not null default 'COP',
  sistema text not null default 'frances' check (sistema in ('frances','aleman','simple','sin','americano','diario')),
  tasa numeric(10,6) not null default 0,                 -- % por mes (igual que v4)
  frec text not null default 'mensual' check (frec in ('mensual','quincenal','semanal','diario')),
  plazo int not null default 12 check (plazo >= 1),
  inicio date not null default current_date,
  extra numeric(18,2) not null default 0,                -- seguros / cargos fijos por cuota
  prenda jsonb,                                          -- empeño: {obj, valor, limite, ref}
  nota text not null default '',
  cerrado_at date,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  fecha date not null default current_date,
  tipo text not null default 'cuota' check (tipo in ('cuota','abono')),
  valor numeric(18,2) not null default 0,                -- 0 en cuotas: lo calcula el motor
  modo text check (modo in ('cuota','plazo')),           -- abono: bajar cuota o terminar antes
  nota text not null default '',
  expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  cod text not null default '1995',                      -- PUC: 1105, 1110, 1516, 1540, 1995
  nombre text not null,
  valor numeric(18,2) not null default 0,
  currency text not null default 'COP',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.liabilities (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  cod text not null default '2895',                      -- PUC: 2380, 2381, 2408, 2895
  nombre text not null,
  valor numeric(18,2) not null default 0,
  currency text not null default 'COP',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  tipo text not null default 'ahorro' check (tipo in ('cdt','ahorro','fondo','acciones','cripto','otro')),
  nombre text not null,
  entity_id uuid references public.entities(id) on delete set null,
  capital numeric(18,2) not null default 0,
  tasa numeric(10,4) not null default 0,                 -- % E.A.
  inicio date not null default current_date,
  dias int,                                              -- plazo CDT
  ret numeric(6,2) not null default 0,                   -- % retención
  currency text not null default 'COP',
  actual numeric(18,2),                                  -- valor hoy (fondo/acciones/cripto/otro)
  symbol text,                                           -- ticker o id de cripto (integraciones)
  cantidad numeric(28,10),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null,
  objetivo numeric(18,2) not null default 0,
  ahorrado numeric(18,2) not null default 0,
  fecha date,
  icon text not null default 'target',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.emergency_funds (
  book_id uuid primary key references public.books(id) on delete cascade,
  activo boolean not null default false,
  saldo numeric(18,2) not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.fund_movements (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  tipo text not null check (tipo in ('guardar','usar')),
  valor numeric(18,2) not null default 0,
  fecha date not null default current_date,
  nota text not null default '',
  expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  titulo text not null,
  fecha date not null,
  tipo text not null default 'egreso' check (tipo in ('ingreso','egreso')),
  monto numeric(18,2) not null default 0,
  nota text not null default '',
  anual boolean not null default true,                   -- se repite cada año (mes y día)
  template_key text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.shared_groups (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null,
  personas text[] not null default '{}',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.shared_group_expenses (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  group_id uuid not null references public.shared_groups(id) on delete cascade,
  descripcion text not null default '',
  valor numeric(18,2) not null default 0,
  paga text not null,
  entre text[] not null default '{}',
  fecha date not null default current_date,
  expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.allowances (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  mesada numeric(18,2) not null default 20000,
  frec text not null default 'semanal' check (frec in ('semanal','quincenal','mensual')),
  meta_nombre text not null default '',
  meta_valor numeric(18,2) not null default 0,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (book_id, member_id)
);
create table if not exists public.allowance_movements (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  allowance_id uuid not null references public.allowances(id) on delete cascade,
  fecha date not null default current_date,
  descripcion text not null default '',
  valor numeric(18,2) not null default 0,               -- + mesada / − gasto
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.savings_challenges (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  k text not null,                                       -- plantilla RETOS_T
  tipo text not null,
  category_id uuid references public.categories(id) on delete set null,
  dias int,
  base numeric(18,2) not null default 0,
  n int,
  inicio date not null default current_date,
  marcas jsonb not null default '[]',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- ───────────────────────── DIAN ─────────────────────────
create table if not exists public.tax_years (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  year int not null,
  member_id uuid not null references public.family_members(id) on delete cascade,
  docs jsonb not null default '{}',
  consig numeric(18,2) not null default 0,
  consumos numeric(18,2) not null default 0,
  ing jsonb not null default '{}',
  ded jsonb not null default '{}',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (book_id, year, member_id)
);
create table if not exists public.tax_assets (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  tipo text not null default 'otro' check (tipo in ('inmueble','vehiculo','cuenta','inversion','cripto','exterior','cobrar','otro')),
  nombre text not null,
  ident text not null default '',
  entidad text not null default '',
  costo numeric(18,2) not null default 0,
  avaluo numeric(18,2) not null default 0,
  valor31 numeric(18,2) not null default 0,
  fecha_adq date,
  member_id uuid references public.family_members(id) on delete set null,
  pct numeric(5,2) not null default 100 check (pct between 1 and 100),
  predial numeric(18,2),
  imp_veh numeric(18,2),
  soat numeric(18,2),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  ref_table text,
  ref_id uuid,
  doc_key text,                                          -- clave RDOCS (certificados DIAN)
  year int,
  path text not null,                                    -- storage: attachments/{book_id}/…
  nombre text not null,
  mime text not null default 'application/octet-stream',
  size bigint not null default 0,
  visible_contador boolean not null default true,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.accountant_shares (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  label text not null,
  email text not null default '',
  perms text not null default 'renta' check (perms in ('renta','todo')),
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  views int not null default 0,
  last_access timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.accountant_notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  share_id uuid not null references public.accountant_shares(id) on delete cascade,
  autor text not null check (autor in ('titular','contador')),
  texto text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ───────────────────────── IA ─────────────────────────
create table if not exists public.advisor_consultations (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  fecha date not null default current_date,
  tipo text not null,
  descripcion text not null default '',
  valor numeric(18,2) not null default 0,
  contact_id uuid references public.contacts(id) on delete set null,
  veredicto text not null check (veredicto in ('si','cuidado','no')),
  payload jsonb not null default '{}',                   -- datos, razones, métricas, respuesta IA
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  titulo text not null default 'Nueva conversación',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null default '',
  meta jsonb not null default '{}',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  mes text not null,                                     -- YYYY-MM
  contenido jsonb not null default '{}',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (book_id, mes)
);

-- ───────────────────────── Gamificación ─────────────────────────
create table if not exists public.gami_state (
  book_id uuid primary key references public.books(id) on delete cascade,
  max_level int not null default 1,
  init_date date,
  updated_at timestamptz not null default now()
);
create table if not exists public.gami_points_ledger (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  fuente text not null,
  puntos int not null,
  ref text,                                              -- evita sumar dos veces lo mismo
  created_at timestamptz not null default now(),
  unique (book_id, fuente, ref)
);
create table if not exists public.gami_badges (
  book_id uuid not null references public.books(id) on delete cascade,
  badge text not null,
  unlocked_at date not null default current_date,
  primary key (book_id, badge)
);
create table if not exists public.gami_missions (
  book_id uuid not null references public.books(id) on delete cascade,
  semana date not null,                                  -- lunes ISO
  mision text not null,
  done_at timestamptz not null default now(),
  primary key (book_id, semana, mision)
);
create table if not exists public.gami_visits (
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  primary key (book_id, user_id, dia)
);

-- ───────────────────────── Avisos e integraciones ─────────────────────────
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null,                                    -- ver lib/integrations/registry.ts
  enabled boolean not null default false,
  config jsonb not null default '{}',                    -- datos no secretos
  secrets_enc text,                                      -- AES-256-GCM (ENCRYPTION_KEY), solo servidor
  meta jsonb not null default '{}',                      -- máscaras (••••1234), última prueba
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, kind)
);
create table if not exists public.google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  scopes text[] not null default '{}',
  tokens_enc text,                                       -- cifrado, solo servidor
  updated_at timestamptz not null default now()
);
create table if not exists public.notification_rules (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  matriz jsonb not null default '{}',                    -- {aviso: {app, email, whatsapp, telegram, push}}
  hora int not null default 7 check (hora between 0 and 23),
  frecuencia text not null default 'diario' check (frecuencia in ('diario','semanal','nunca')),
  silencio jsonb not null default '{"on":false,"desde":22,"hasta":7}',
  ocultar_montos boolean not null default false,
  email_to text,
  whatsapp_to text,
  timezone text not null default 'America/Bogota',
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  kind text not null,
  titulo text not null,
  cuerpo text not null default '',
  href text,
  dedupe text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe)
);
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','telegram','push')),
  kind text not null,
  payload jsonb not null default '{}',
  status text not null default 'pendiente' check (status in ('pendiente','enviado','error')),
  attempts int not null default 0,
  error text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create table if not exists public.telegram_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id text,
  link_code text unique,
  linked_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  tipo text not null default 'auto' check (tipo in ('auto','manual','antes_restaurar','importado')),
  path text not null,
  size bigint not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  book_id uuid references public.books(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  tabla text not null,
  row_id uuid,
  accion text not null check (accion in ('crear','editar','borrar','restaurar')),
  actor uuid,
  resumen text,
  cambios jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_book_idx on public.audit_log(book_id, created_at desc);

-- ───────────────────────── Referencia (global, solo lectura) ─────────────────────────
create table if not exists public.ref_uvt (year int primary key, valor numeric(18,2) not null, fuente text);
create table if not exists public.ref_smmlv (year int primary key, valor numeric(18,2) not null, fuente text);
create table if not exists public.ref_renta_calendar (
  year int not null,                                     -- año en que se declara
  digitos text not null check (digitos ~ '^[0-9]{2}$'),  -- últimos dos dígitos del NIT/cédula
  fecha date not null,
  primary key (year, digitos)
);
create table if not exists public.ref_fiscal_templates (
  key text primary key,
  data jsonb not null
);
create table if not exists public.ref_municipalities (
  code text primary key,                                 -- DIVIPOLA
  nombre text not null,
  departamento text not null,
  dept_code text not null,
  aliases text[] not null default '{}',
  barrios text[] not null default '{}'
);
create table if not exists public.ref_holidays (fecha date primary key, nombre text not null);
create table if not exists public.ref_trm (fecha date primary key, valor numeric(18,4) not null);
create table if not exists public.ref_usury_rate (
  desde date not null,
  hasta date not null,
  modalidad text not null default 'consumo',
  tasa_ea numeric(8,4) not null,
  primary key (desde, modalidad)
);
create table if not exists public.ref_rates (
  base text not null, quote text not null, fecha date not null, valor numeric(28,10) not null,
  primary key (base, quote, fecha)
);
