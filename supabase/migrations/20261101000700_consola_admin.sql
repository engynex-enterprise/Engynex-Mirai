-- Consola de administración: planes configurables, integraciones globales, cupones, comunicados, auditoría y notas.
-- Aditiva: la versión publicada no usa estas tablas; los cambios de funciones mantienen el mismo resultado para
-- los planes existentes (gratis/premium).

-- ── Planes configurables ────────────────────────────────────────────────────────────────────────────────────────
alter table public.plans drop constraint if exists plans_id_check;
alter table public.plans add constraint plans_id_formato check (id ~ '^[a-z0-9-]{2,30}$');
alter table public.plans add column if not exists descripcion text not null default '';
alter table public.plans add column if not exists funciones text[] not null default '{}';   -- ia, banco, impuestos, familia
alter table public.plans add column if not exists anuncios boolean not null default true;
alter table public.plans add column if not exists activo boolean not null default true;     -- se puede comprar
alter table public.plans add column if not exists publico boolean not null default true;    -- aparece en /planes
alter table public.plans add column if not exists destacado boolean not null default false;
alter table public.plans add column if not exists orden int not null default 0;
update public.plans set funciones = '{ia,banco,impuestos,familia}', anuncios = false, destacado = true, orden = 2,
  descripcion = 'Todo Mirai para toda tu familia, sin anuncios.' where id = 'premium' and funciones = '{}';
update public.plans set anuncios = true, orden = 1, descripcion = 'Lo básico para ordenar tu plata, gratis para siempre.' where id = 'gratis' and descripcion = '';
drop policy if exists "crear planes" on public.plans;
create policy "crear planes" on public.plans for insert to authenticated with check (public.is_platform_admin());
drop policy if exists "borrar planes" on public.plans;
create policy "borrar planes" on public.plans for delete to authenticated using (public.is_platform_admin() and id not in ('gratis', 'premium'));

alter table public.plan_payments add column if not exists plan text references public.plans(id);
alter table public.plan_payments add column if not exists cupon text;
alter table public.plan_payments add column if not exists nota text;

-- Plan vigente del hogar: el de la suscripción vigente que vence más tarde; los hogares de administradores, premium.
create or replace function public.household_plan(h uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.plan from public.plan_subscriptions s
      where s.household_id = h and s.estado in ('activa', 'cancelada', 'cortesia') and s.vence_at + interval '3 days' > now()
      order by s.vence_at desc limit 1),
    (select 'premium' from public.household_members m join public.platform_admins a on a.user_id = m.user_id
      where m.household_id = h and m.role = 'owner' limit 1),
    'gratis')
$$;

-- Límites en la base: los del plan del hogar (vacío = sin límite). Solo si el administrador los activa.
create or replace function public.enforce_free_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lim jsonb;
  n int;
begin
  if not (select limites_db from public.platform_settings where id) then return new; end if;
  select limites into lim from public.plans where id = public.household_plan(new.household_id);
  if lim is null or lim = '{}'::jsonb then return new; end if;
  if tg_table_name = 'books' then
    if new.nombre like 'Ejemplo%' or lim->>'libros' is null then return new; end if;
    select count(*) into n from public.books where household_id = new.household_id and deleted_at is null;
    if n >= (lim->>'libros')::int then raise exception 'Tu plan incluye % libro(s) de cuentas. Cambia de plan para crear más.', lim->>'libros'; end if;
  elsif tg_table_name = 'household_members' then
    if lim->>'personas' is null then return new; end if;
    select count(*) into n from public.household_members where household_id = new.household_id;
    if n >= (lim->>'personas')::int then raise exception 'Tu plan permite % personas por hogar. Cambia de plan para invitar a más.', lim->>'personas'; end if;
  end if;
  return new;
end $$;

-- ── Ajustes de la plataforma ────────────────────────────────────────────────────────────────────────────────────
alter table public.platform_settings add column if not exists aviso_global text not null default '';       -- banner para todos
alter table public.platform_settings add column if not exists aviso_tono text not null default 'info' check (aviso_tono in ('info', 'warn', 'ok'));
alter table public.platform_settings add column if not exists registro_abierto boolean not null default true;

-- ── Integraciones globales (las pone la plataforma para todos) ───────────────────────────────────────────────────
-- modo: apagada · opcional (cada hogar decide si la usa) · por_defecto (activa salvo que el hogar la apague) · obligatoria
create table if not exists public.platform_integrations (
  kind text primary key,
  modo text not null default 'apagada' check (modo in ('apagada', 'opcional', 'por_defecto', 'obligatoria')),
  planes text[] not null default '{}',             -- vacío = todos los planes
  config jsonb not null default '{}',
  secrets_enc text,
  meta jsonb not null default '{}',                -- máscaras de secretos y última prueba
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.platform_integrations enable row level security;
drop policy if exists "admin integraciones globales" on public.platform_integrations;
create policy "admin integraciones globales" on public.platform_integrations for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
-- Vista sin secretos para los hogares (Ajustes › Integraciones).
create or replace view public.platform_integrations_public with (security_invoker = false) as
  select kind, modo, planes, config, meta - 'lastMsg' as meta from public.platform_integrations where modo <> 'apagada';
grant select on public.platform_integrations_public to authenticated;

-- ── Cupones ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.coupons (
  codigo text primary key check (codigo ~ '^[A-Z0-9_-]{3,30}$'),
  descripcion text not null default '',
  tipo text not null check (tipo in ('porcentaje', 'valor')),
  valor integer not null check (valor > 0),
  planes text[] not null default '{}',              -- vacío = todos
  periodos text[] not null default '{mes,anio}',
  desde date,
  hasta date,
  max_usos integer,
  usos integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;
drop policy if exists "admin cupones" on public.coupons;
create policy "admin cupones" on public.coupons for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ── Comunicados (avisos masivos) ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(titulo) between 2 and 120),
  cuerpo text not null default '' check (length(cuerpo) <= 1000),
  href text,
  segmento text not null default 'todos',           -- todos · plan:<id> · admins
  enviados integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.broadcasts enable row level security;
drop policy if exists "admin comunicados" on public.broadcasts;
create policy "admin comunicados" on public.broadcasts for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ── Auditoría de la consola y notas internas sobre clientes ─────────────────────────────────────────────────────
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  accion text not null,
  objetivo text,
  detalle jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_fecha_idx on public.admin_audit (created_at desc);
alter table public.admin_audit enable row level security;
drop policy if exists "admin ver auditoria" on public.admin_audit;
create policy "admin ver auditoria" on public.admin_audit for select to authenticated using (public.is_platform_admin());

create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  texto text not null check (length(texto) between 1 and 2000),
  autor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_notes enable row level security;
drop policy if exists "admin notas" on public.admin_notes;
create policy "admin notas" on public.admin_notes for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Migraciones aplicadas (para Sistema).
create or replace function public.admin_migrations() returns table (name text, applied_at timestamptz)
language sql stable security definer set search_path = public as $$ select name, applied_at from public._mirai_migrations order by name $$;
revoke all on function public.admin_migrations() from public, anon, authenticated;
grant execute on function public.admin_migrations() to service_role;
