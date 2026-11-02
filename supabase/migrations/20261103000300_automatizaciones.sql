-- Automatizaciones: flujos por libro (grafo de nodos y conexiones), registro de ejecuciones y cola de eventos.
-- Aditiva e idempotente (pruebas y producción comparten base): no cambia nada de lo que ya existe.

-- ── Automatizaciones ────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null check (length(nombre) between 1 and 80),
  descripcion text not null default '',
  icon text not null default 'workflow',
  activo boolean not null default false,
  disparador text not null default 'gasto',                 -- tipo del nodo disparador (copia para filtrar rápido)
  grafo jsonb not null default '{"nodes": [], "edges": []}', -- { nodes: [{id,type,kind,data,position}], edges: [{id,source,target,sourceHandle}] }
  plantilla text,                                           -- clave de la automatización por defecto (siembra idempotente)
  ultima_ejecucion timestamptz,
  ultimo_estado text check (ultimo_estado in ('ok', 'error', 'omitida', 'esperando')),
  ejecuciones integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (book_id, plantilla)
);
create index if not exists automations_activas_idx on public.automations(book_id, disparador) where activo and deleted_at is null;

-- ── Ejecuciones (historial) ─────────────────────────────────────────────────────────────────────────────────────
-- `clave` evita ejecuciones duplicadas: una por automatización y evento (o por día/periodo en las programadas).
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  clave text not null check (length(clave) between 1 and 200),
  disparador text not null default '',
  evento jsonb not null default '{}',
  estado text not null default 'ok' check (estado in ('ok', 'error', 'omitida', 'esperando')),
  pasos jsonb not null default '[]',
  error text,
  reanudar_at timestamptz,                                  -- "Esperar N días": cuándo seguir
  pendientes jsonb,                                         -- nodos donde sigue el recorrido
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (automation_id, clave)
);
create index if not exists automation_runs_auto_idx on public.automation_runs(automation_id, created_at desc);
create index if not exists automation_runs_wait_idx on public.automation_runs(reanudar_at) where estado = 'esperando';

-- ── Cola de eventos ─────────────────────────────────────────────────────────────────────────────────────────────
-- La llenan triggers al registrar un gasto, un ingreso o el pago de un gasto fijo (venga de donde venga: la app,
-- el correo del banco, un extracto o Telegram). La procesa el servidor (al instante desde la app y cada hora por cron).
create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  tipo text not null check (tipo in ('gasto', 'ingreso', 'pago_fijo')),
  tabla text not null,
  row_id uuid,
  datos jsonb not null default '{}',
  procesado_at timestamptz,
  intentos integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists automation_events_pend_idx on public.automation_events(book_id, created_at) where procesado_at is null;

-- ── Seguridad (RLS) ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.automations enable row level security;
drop policy if exists "leer automations" on public.automations;
create policy "leer automations" on public.automations for select to authenticated using (public.is_book_member(book_id, 'viewer'));
drop policy if exists "crear automations" on public.automations;
create policy "crear automations" on public.automations for insert to authenticated with check (public.is_book_member(book_id, 'editor'));
drop policy if exists "editar automations" on public.automations;
create policy "editar automations" on public.automations for update to authenticated using (public.is_book_member(book_id, 'editor')) with check (public.is_book_member(book_id, 'editor'));
drop policy if exists "borrar automations" on public.automations;
create policy "borrar automations" on public.automations for delete to authenticated using (public.is_book_member(book_id, 'editor'));

-- El historial lo escribe el servidor; la familia lo lee y un editor puede limpiarlo (borrado lógico).
alter table public.automation_runs enable row level security;
drop policy if exists "leer automation_runs" on public.automation_runs;
create policy "leer automation_runs" on public.automation_runs for select to authenticated using (public.is_book_member(book_id, 'viewer'));
drop policy if exists "editar automation_runs" on public.automation_runs;
create policy "editar automation_runs" on public.automation_runs for update to authenticated using (public.is_book_member(book_id, 'editor')) with check (public.is_book_member(book_id, 'editor'));

-- La cola solo se lee (para que la app sepa que llegó un evento); nadie la escribe desde el navegador.
alter table public.automation_events enable row level security;
drop policy if exists "leer automation_events" on public.automation_events;
create policy "leer automation_events" on public.automation_events for select to authenticated using (public.is_book_member(book_id, 'viewer'));

drop trigger if exists trg_touch on public.automations;
create trigger trg_touch before update on public.automations for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch on public.automation_runs;
create trigger trg_touch before update on public.automation_runs for each row execute function public.touch_updated_at();
drop trigger if exists trg_audit on public.automations;
create trigger trg_audit after insert or update or delete on public.automations for each row execute function public.audit_row();

do $$
declare t text;
begin
  foreach t in array array['automations', 'automation_runs', 'automation_events'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── Límite del plan Gratis ──────────────────────────────────────────────────────────────────────────────────────
-- Gratis: hasta N automatizaciones activas por libro (plans.limites.automatizaciones, 3 por defecto). Premium: sin límite.
update public.plans set limites = limites || '{"automatizaciones": 3}'::jsonb where id = 'gratis' and not (limites ? 'automatizaciones');

create or replace function public.automation_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  h uuid;
  lim int;
  n int;
begin
  if not new.activo or new.deleted_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.activo and old.deleted_at is null then return new; end if;
  select household_id into h from public.books where id = new.book_id;
  if public.household_plan(h) = 'premium' then return new; end if;
  select coalesce((limites->>'automatizaciones')::int, 3) into lim from public.plans where id = 'gratis';
  lim := coalesce(lim, 3);
  select count(*) into n from public.automations where book_id = new.book_id and activo and deleted_at is null and id <> new.id;
  if n >= lim then
    raise exception 'El plan Gratis permite % automatizaciones activas. Pausa otra o pásate a Premium para tenerlas sin límite.', lim;
  end if;
  return new;
end $$;
drop trigger if exists automations_limit on public.automations;
create trigger automations_limit before insert or update of activo, deleted_at on public.automations for each row execute function public.automation_limit();

-- ── Encolar eventos ─────────────────────────────────────────────────────────────────────────────────────────────
-- Solo si el libro tiene alguna automatización activa que escuche ese evento. Los gastos que crea una automatización
-- (external_id 'auto:…') no se encolan: así una automatización nunca se dispara a sí misma.
create or replace function public.automation_enqueue() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ev text;
  kinds text[];
  d jsonb;
begin
  if new.deleted_at is not null then return new; end if;
  if tg_table_name = 'expenses' then
    if coalesce(new.external_id, '') like 'auto:%' then return new; end if;
    ev := 'gasto'; kinds := array['gasto', 'hormiga'];
    d := jsonb_build_object('valor', new.valor, 'descripcion', new.descripcion, 'category_id', new.category_id, 'member_id', new.member_id,
      'fecha', new.fecha, 'hormiga', new.hormiga, 'currency', new.currency, 'origen', new.origen);
  elsif tg_table_name = 'extra_incomes' then
    ev := 'ingreso'; kinds := array['ingreso'];
    d := jsonb_build_object('valor', new.valor, 'descripcion', new.descripcion, 'category_id', new.category_id, 'member_id', new.member_id,
      'fecha', new.fecha, 'currency', new.currency);
  elsif tg_table_name = 'fixed_expense_payments' then
    ev := 'pago_fijo'; kinds := array['pago_fijo'];
    d := jsonb_build_object('valor', new.valor, 'fixed_expense_id', new.fixed_expense_id, 'periodo', new.periodo, 'fecha', new.fecha,
      'descripcion', (select nombre from public.fixed_expenses where id = new.fixed_expense_id),
      'category_id', (select category_id from public.fixed_expenses where id = new.fixed_expense_id));
  else
    return new;
  end if;
  if exists (select 1 from public.automations a where a.book_id = new.book_id and a.activo and a.deleted_at is null and a.disparador = any(kinds)) then
    insert into public.automation_events(book_id, tipo, tabla, row_id, datos) values (new.book_id, ev, tg_table_name, new.id, d);
  end if;
  return new;
end $$;

drop trigger if exists trg_automation_enqueue on public.expenses;
create trigger trg_automation_enqueue after insert on public.expenses for each row execute function public.automation_enqueue();
drop trigger if exists trg_automation_enqueue on public.extra_incomes;
create trigger trg_automation_enqueue after insert on public.extra_incomes for each row execute function public.automation_enqueue();
drop trigger if exists trg_automation_enqueue on public.fixed_expense_payments;
create trigger trg_automation_enqueue after insert on public.fixed_expense_payments for each row execute function public.automation_enqueue();
