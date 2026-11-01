-- Freemium: planes, suscripciones por hogar y pagos (Mercado Pago y Wompi).
-- Solo agrega tablas y funciones. Los límites del plan gratis en la base (triggers) quedan APAGADOS hasta que el
-- administrador active platform_settings.limites_db desde el panel: producción no cambia de comportamiento al migrar.

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  limites_db boolean not null default false,       -- triggers que impiden pasar los límites del plan gratis
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true) on conflict do nothing;
alter table public.platform_settings enable row level security;
drop policy if exists "leer ajustes plataforma" on public.platform_settings;
create policy "leer ajustes plataforma" on public.platform_settings for select to authenticated using (true);
drop policy if exists "editar ajustes plataforma" on public.platform_settings;
create policy "editar ajustes plataforma" on public.platform_settings for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.plans (
  id text primary key check (id in ('gratis', 'premium')),
  nombre text not null,
  precio_mes integer not null default 0 check (precio_mes >= 0),
  precio_anio integer not null default 0 check (precio_anio >= 0),
  limites jsonb not null default '{}',               -- {"libros": 1, "personas": 2}
  updated_at timestamptz not null default now()
);
insert into public.plans (id, nombre, precio_mes, precio_anio, limites) values
  ('gratis', 'Gratis', 0, 0, '{"libros": 1, "personas": 2}'),
  ('premium', 'Premium', 14900, 149000, '{}')
on conflict (id) do nothing;
alter table public.plans enable row level security;
drop policy if exists "ver planes" on public.plans;
create policy "ver planes" on public.plans for select to anon, authenticated using (true);
drop policy if exists "editar planes" on public.plans;
create policy "editar planes" on public.plans for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.plan_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  plan text not null default 'premium' references public.plans(id),
  periodo text not null default 'mes' check (periodo in ('mes', 'anio')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'activa', 'cancelada', 'vencida', 'cortesia')),
  proveedor text not null check (proveedor in ('mercadopago', 'wompi', 'manual')),
  proveedor_ref text,                                 -- id de la suscripción (preapproval) en Mercado Pago
  vence_at timestamptz,
  nota text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_subs_household_idx on public.plan_subscriptions (household_id, vence_at desc);
create unique index if not exists plan_subs_ref_uq on public.plan_subscriptions (proveedor, proveedor_ref) where proveedor_ref is not null;
alter table public.plan_subscriptions enable row level security;
drop policy if exists "ver plan del hogar" on public.plan_subscriptions;
create policy "ver plan del hogar" on public.plan_subscriptions for select to authenticated using (public.is_household_member(household_id, 'viewer') or public.is_platform_admin());
drop policy if exists "admin planes hogar" on public.plan_subscriptions;
create policy "admin planes hogar" on public.plan_subscriptions for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.plan_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete set null,
  subscription_id uuid references public.plan_subscriptions(id) on delete set null,
  proveedor text not null check (proveedor in ('mercadopago', 'wompi', 'manual')),
  referencia text not null,                           -- referencia de Mirai (Wompi) o id del pago (Mercado Pago)
  periodo text check (periodo in ('mes', 'anio')),
  monto integer not null check (monto >= 0),          -- pesos colombianos
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado', 'reembolsado', 'anulado')),
  metodo text,
  pagador text,
  factura_ref text,                                   -- factura electrónica DIAN (proveedor externo)
  raw jsonb not null default '{}',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proveedor, referencia)
);
create index if not exists plan_payments_household_idx on public.plan_payments (household_id, created_at desc);
alter table public.plan_payments enable row level security;
drop policy if exists "ver pagos del plan" on public.plan_payments;
create policy "ver pagos del plan" on public.plan_payments for select to authenticated using (public.is_household_member(household_id, 'owner') or public.is_platform_admin());

-- Plan vigente del hogar. Premium si hay suscripción activa, cancelada (hasta que venza) o de cortesía con
-- 3 días de gracia; los hogares de los administradores de la plataforma siempre son Premium.
create or replace function public.household_plan(h uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when exists (
      select 1 from public.plan_subscriptions s
      where s.household_id = h and s.estado in ('activa', 'cancelada', 'cortesia') and s.vence_at + interval '3 days' > now()
    ) or exists (
      select 1 from public.household_members m join public.platform_admins a on a.user_id = m.user_id
      where m.household_id = h and m.role = 'owner'
    ) then 'premium' else 'gratis' end
$$;
revoke all on function public.household_plan(uuid) from public, anon;
grant execute on function public.household_plan(uuid) to authenticated, service_role;

-- Suscripción vigente del hogar (la que vence más tarde), para "Mi plan".
create or replace function public.household_subscription(h uuid)
returns table (id uuid, plan text, periodo text, estado text, proveedor text, vence_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.plan, s.periodo, s.estado, s.proveedor, s.vence_at from public.plan_subscriptions s
  where s.household_id = h and public.is_household_member(h, 'viewer') and s.estado <> 'pendiente'
  order by s.vence_at desc nulls last limit 1
$$;
revoke all on function public.household_subscription(uuid) from public, anon;
grant execute on function public.household_subscription(uuid) to authenticated;

-- Límites del plan gratis en la base (solo si el administrador los activa).
create or replace function public.enforce_free_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lim jsonb;
  n int;
begin
  if not (select limites_db from public.platform_settings where id) then return new; end if;
  if public.household_plan(new.household_id) = 'premium' then return new; end if;
  select limites into lim from public.plans where id = 'gratis';
  if tg_table_name = 'books' then
    if new.nombre like 'Ejemplo%' then return new; end if;  -- el libro de ejemplo de la puesta en marcha no cuenta
    select count(*) into n from public.books where household_id = new.household_id and deleted_at is null;
    if n >= coalesce((lim->>'libros')::int, 1) then raise exception 'El plan gratis incluye % libro(s) de cuentas. Pásate a Premium para crear más.', coalesce((lim->>'libros')::int, 1); end if;
  elsif tg_table_name = 'household_members' then
    select count(*) into n from public.household_members where household_id = new.household_id;
    if n >= coalesce((lim->>'personas')::int, 2) then raise exception 'El plan gratis permite % personas por hogar. Pásate a Premium para invitar a más.', coalesce((lim->>'personas')::int, 2); end if;
  end if;
  return new;
end $$;
drop trigger if exists books_free_limit on public.books;
create trigger books_free_limit before insert on public.books for each row execute function public.enforce_free_limits();
drop trigger if exists members_free_limit on public.household_members;
create trigger members_free_limit before insert on public.household_members for each row execute function public.enforce_free_limits();

-- touch_updated_at() ya existe (core): solo se conectan los triggers.
drop trigger if exists plan_subs_touch on public.plan_subscriptions;
create trigger plan_subs_touch before update on public.plan_subscriptions for each row execute function public.touch_updated_at();
drop trigger if exists plan_payments_touch on public.plan_payments;
create trigger plan_payments_touch before update on public.plan_payments for each row execute function public.touch_updated_at();
drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();
