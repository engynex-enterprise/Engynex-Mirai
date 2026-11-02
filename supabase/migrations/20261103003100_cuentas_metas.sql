-- Mirai 5.6 · Frente F1: cuentas con saldo, abonos a metas y ahorro apartado ("el libro mayor").
-- Aditiva e idempotente: pruebas y producción comparten base y la versión publicada sigue igual.
--   · Saldo CALCULADO (lib/domain/cuentas.ts): saldo_base + entradas − salidas desde saldo_fecha por los medios de pago
--     ligados a la cuenta. No hay triggers sobre assets.valor: la versión publicada sigue leyendo el valor manual, que
--     asset_cuadrar() deja igual al último "Cuadrar con mi banco". Solo aplica a cuentas con saldo_base no nulo.
--   · payment_methods.asset_id: de qué cuenta sale (o a cuál entra) la plata de ese medio.
--   · incomes / extra_incomes / loan_payments .payment_method_id: a qué cuenta llega o de cuál sale (nulos = no mueven
--     ninguna cuenta). F2 agrega las mismas columnas con "if not exists": no chocan.
--   · goals.asset_id y emergency_funds.asset_id: "esta plata está en la cuenta X" (si es nulo, es ahorro apartado y
--     suma aparte en lo que tienes).
--   · goal_movements + goal_contribute(): abono a una meta en una transacción (sin leer y luego escribir), con fecha y
--     "Deshacer" (borrado lógico → el trigger devuelve el valor). goals.ahorrado se mantiene para la versión publicada.

-- ── Columnas nuevas (todas nulas) ───────────────────────────────────────────────────────────────────────────────
alter table public.payment_methods add column if not exists asset_id uuid references public.assets(id) on delete set null;
create index if not exists payment_methods_asset_idx on public.payment_methods(asset_id) where asset_id is not null;

alter table public.assets add column if not exists saldo_base numeric(18,2);
alter table public.assets add column if not exists saldo_fecha date;
alter table public.assets add column if not exists saldo_at timestamptz;

alter table public.incomes       add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null;
alter table public.extra_incomes add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null;
alter table public.loan_payments add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null;

alter table public.goals           add column if not exists asset_id uuid references public.assets(id) on delete set null;
alter table public.emergency_funds add column if not exists asset_id uuid references public.assets(id) on delete set null;

-- ── Movimientos de metas ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.goal_movements (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  tipo text not null default 'abono' check (tipo in ('abono','retiro')),
  valor numeric(18,2) not null check (valor > 0),
  fecha date not null default ((now() at time zone 'America/Bogota')::date),
  nota text not null default '',
  payment_method_id uuid references public.payment_methods(id) on delete set null,   -- de dónde salió la plata
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists goal_movements_book_idx on public.goal_movements(book_id);
create index if not exists goal_movements_goal_idx on public.goal_movements(goal_id);

alter table public.goal_movements enable row level security;
drop policy if exists "leer goal_movements" on public.goal_movements;
create policy "leer goal_movements" on public.goal_movements for select to authenticated using (public.is_book_member(book_id, 'viewer'));
drop policy if exists "crear goal_movements" on public.goal_movements;
create policy "crear goal_movements" on public.goal_movements for insert to authenticated with check (public.is_book_member(book_id, 'editor'));
drop policy if exists "editar goal_movements" on public.goal_movements;
create policy "editar goal_movements" on public.goal_movements for update to authenticated using (public.is_book_member(book_id, 'editor')) with check (public.is_book_member(book_id, 'editor'));
drop policy if exists "borrar goal_movements" on public.goal_movements;
create policy "borrar goal_movements" on public.goal_movements for delete to authenticated using (public.is_book_member(book_id, 'editor'));

drop trigger if exists trg_touch on public.goal_movements;
create trigger trg_touch before update on public.goal_movements for each row execute function public.touch_updated_at();
drop trigger if exists trg_audit on public.goal_movements;
create trigger trg_audit after insert or update or delete on public.goal_movements for each row execute function public.audit_row();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'goal_movements') then
    alter publication supabase_realtime add table public.goal_movements;
  end if;
end $$;

-- Abonar a una meta: suma a goals.ahorrado y deja el movimiento, todo en una transacción (con la fila bloqueada: dos
-- personas que abonan a la vez no se pisan). Devuelve el movimiento y cómo queda la meta.
create or replace function public.goal_contribute(
  p_goal uuid, p_valor numeric, p_fecha date default null, p_nota text default '', p_medio uuid default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare g public.goals; mid uuid;
begin
  select * into g from public.goals where id = p_goal and deleted_at is null for update;
  if not found then raise exception 'Meta no encontrada'; end if;
  if not public.is_book_member(g.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Escribe cuánto guardaste'; end if;
  if p_medio is not null and not exists (select 1 from public.payment_methods where id = p_medio and book_id = g.book_id) then p_medio := null; end if;
  insert into public.goal_movements(book_id, goal_id, tipo, valor, fecha, nota, payment_method_id)
  values (g.book_id, g.id, 'abono', p_valor, coalesce(p_fecha, (now() at time zone 'America/Bogota')::date), coalesce(p_nota, ''), p_medio)
  returning id into mid;
  update public.goals set ahorrado = ahorrado + p_valor where id = g.id returning * into g;
  return jsonb_build_object('id', mid, 'goal_id', g.id, 'nombre', g.nombre, 'ahorrado', g.ahorrado, 'objetivo', g.objetivo);
end $$;

-- Borrar o restaurar un movimiento (Deshacer) devuelve o vuelve a sumar su valor en la meta.
create or replace function public.goal_movement_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare s numeric := case when new.tipo = 'retiro' then -1 else 1 end;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.goals set ahorrado = greatest(0, ahorrado - s * new.valor) where id = new.goal_id;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.goals set ahorrado = greatest(0, ahorrado + s * new.valor) where id = new.goal_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_goal_movement_sync on public.goal_movements;
create trigger trg_goal_movement_sync after update of deleted_at on public.goal_movements for each row execute function public.goal_movement_sync();

-- Cuadrar una cuenta con el banco: el saldo que ves hoy queda como base (desde este momento cuentan los movimientos)
-- y también como valor manual, que es el que lee la versión publicada.
create or replace function public.asset_cuadrar(p_asset uuid, p_saldo numeric)
returns public.assets language plpgsql security invoker set search_path = public as $$
declare a public.assets;
begin
  select * into a from public.assets where id = p_asset and deleted_at is null for update;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  if not public.is_book_member(a.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if p_saldo is null then raise exception 'Escribe el saldo'; end if;
  update public.assets set valor = p_saldo, saldo_base = p_saldo, saldo_fecha = (now() at time zone 'America/Bogota')::date, saldo_at = now()
  where id = a.id returning * into a;
  return a;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.goal_contribute(uuid,numeric,date,text,uuid)', 'public.asset_cuadrar(uuid,numeric)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  revoke execute on function public.goal_movement_sync() from public, anon, authenticated;
end $$;
