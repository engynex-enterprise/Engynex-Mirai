-- Mirai 5.6 · Frente F2: movimientos enlazados (tarjetas, suscripciones, compartidos, fijos, préstamos e importar).
-- Todo es ADITIVO (columnas nulas, tabla nueva, funciones y triggers nuevos). Lo que cambia el comportamiento con los
-- datos que ya escribe la versión publicada (cascadas entre gasto ↔ compra con tarjeta ↔ gasto de grupo y la edición del
-- gasto de un fijo) solo corre si `sync_enlaces_on()`:
--   · el interruptor global `platform_settings.sync_enlaces` (apagado por defecto), o
--   · la petición trae el encabezado `x-mirai-enlaces: 1`, que solo envía el código nuevo (utils/supabase/client.ts).
-- Así pruebas (código nuevo) ya tiene las cascadas y producción (código anterior) sigue igual sobre la misma base.

-- ───────────────────────── 0. Interruptor ─────────────────────────
alter table public.platform_settings add column if not exists sync_enlaces boolean not null default false;

create or replace function public.sync_enlaces_on() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare h text := current_setting('request.headers', true);
begin
  if coalesce((select sync_enlaces from public.platform_settings where id), false) then return true; end if;
  if h is null or h = '' then return false; end if;
  return coalesce((h::jsonb)->>'x-mirai-enlaces', '') = '1';
exception when others then return false;
end $$;
grant execute on function public.sync_enlaces_on() to anon, authenticated;

-- ───────────────────────── 1. Columnas nuevas (nulas) ─────────────────────────
-- Gasto que salió de "Ya se cobró" (pay_subscription): la suscripción y el cobro que pagó (para deshacer).
alter table public.expenses add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null;
alter table public.expenses add column if not exists sub_proximo date;
create index if not exists expenses_subscription_idx on public.expenses(subscription_id) where subscription_id is not null;
-- Con qué se pagó la cuota o a qué medio llegó el ingreso extra (el saldo de cuentas de F1 los lee si no son nulos).
alter table public.loan_payments add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null;
alter table public.extra_incomes add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null;
-- Entradas importadas del extracto (abonos): id estable para no duplicarlas.
alter table public.extra_incomes add column if not exists external_id text;
create unique index if not exists extra_incomes_external_uidx on public.extra_incomes(book_id, external_id) where external_id is not null and deleted_at is null;
create index if not exists card_purchases_expense_idx on public.card_purchases(expense_id) where expense_id is not null;
create index if not exists shared_group_expenses_expense_idx on public.shared_group_expenses(expense_id) where expense_id is not null;

-- ───────────────────────── 2. Pagos de tarjeta ─────────────────────────
create table if not exists public.card_payments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  fecha date not null default current_date,
  valor numeric(18,2) not null check (valor > 0),
  tipo text not null default 'otro' check (tipo in ('minimo','total','otro')),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  compras uuid[] not null default '{}',                  -- compras que el pago "total" dejó pagadas (para deshacer)
  nota text not null default '',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists card_payments_card_idx on public.card_payments(card_id, fecha) where deleted_at is null;
create index if not exists card_payments_book_idx on public.card_payments(book_id);
alter table public.card_payments enable row level security;
drop policy if exists "leer card_payments" on public.card_payments;
create policy "leer card_payments" on public.card_payments for select to authenticated using (public.is_book_member(book_id, 'viewer'));
drop policy if exists "crear card_payments" on public.card_payments;
create policy "crear card_payments" on public.card_payments for insert to authenticated with check (public.is_book_member(book_id, 'editor'));
drop policy if exists "editar card_payments" on public.card_payments;
create policy "editar card_payments" on public.card_payments for update to authenticated using (public.is_book_member(book_id, 'editor')) with check (public.is_book_member(book_id, 'editor'));
drop policy if exists "borrar card_payments" on public.card_payments;
create policy "borrar card_payments" on public.card_payments for delete to authenticated using (public.is_book_member(book_id, 'editor'));
drop trigger if exists trg_touch on public.card_payments;
create trigger trg_touch before update on public.card_payments for each row execute function public.touch_updated_at();
drop trigger if exists trg_audit on public.card_payments;
create trigger trg_audit after insert or update or delete on public.card_payments for each row execute function public.audit_row();
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'card_payments') then
    alter publication supabase_realtime add table public.card_payments;
  end if;
end $$;

-- Pagar la tarjeta: mínimo, total u otro valor. "Total" deja pagadas las compras hasta esa fecha (y lo recuerda).
create or replace function public.pay_credit_card(
  p_card uuid, p_valor numeric, p_fecha date default null, p_tipo text default 'otro', p_medio uuid default null, p_nota text default ''
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare t public.credit_cards; pid uuid; f date := coalesce(p_fecha, (now() at time zone 'America/Bogota')::date); ids uuid[] := '{}';
begin
  select * into t from public.credit_cards where id = p_card and deleted_at is null for update;
  if not found then raise exception 'Tarjeta no encontrada'; end if;
  if not public.is_book_member(t.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Escribe el valor que pagaste'; end if;
  if coalesce(p_tipo, '') not in ('minimo','total','otro') then raise exception 'Tipo de pago no válido'; end if;
  if p_tipo = 'total' then
    select coalesce(array_agg(id), '{}') into ids from public.card_purchases
     where card_id = t.id and deleted_at is null and not pagada and fecha <= f;
    update public.card_purchases set pagada = true where id = any(ids);
  end if;
  insert into public.card_payments(book_id, card_id, fecha, valor, tipo, payment_method_id, compras, nota)
  values (t.book_id, t.id, f, p_valor, p_tipo, p_medio, ids, coalesce(p_nota, ''))
  returning id into pid;
  return jsonb_build_object('payment_id', pid, 'compras', coalesce(array_length(ids, 1), 0));
end $$;
grant execute on function public.pay_credit_card(uuid, numeric, date, text, uuid, text) to authenticated;

-- Deshacer o restaurar un pago "total": las compras que dejó pagadas vuelven a quedar pendientes (o pagadas).
create or replace function public.card_payment_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo <> 'total' or coalesce(array_length(new.compras, 1), 0) = 0 then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.card_purchases set pagada = false where id = any(new.compras) and pagada;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.card_purchases set pagada = true where id = any(new.compras) and not pagada;
  end if;
  return new;
end $$;
drop trigger if exists trg_card_payment on public.card_payments;
create trigger trg_card_payment after update of deleted_at on public.card_payments for each row execute function public.card_payment_sync();

-- ───────────────────────── 3. Compra con tarjeta en una sola transacción ─────────────────────────
-- Crea la compra y (si `p_como_gasto`) su gasto `origen='tarjeta'` enlazado. Lo usan la tarjeta, el correo, importar y el chat.
create or replace function public.add_card_purchase(
  p_card uuid, p_fecha date, p_descripcion text, p_valor numeric, p_cuotas int default 1, p_category uuid default null,
  p_como_gasto boolean default true, p_medio uuid default null, p_external_id text default null,
  p_member uuid default null, p_provider uuid default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare t public.credit_cards; gid uuid := null; pid uuid; cat uuid := p_category; medio uuid := p_medio;
  f date := coalesce(p_fecha, (now() at time zone 'America/Bogota')::date); d text := coalesce(nullif(trim(p_descripcion), ''), 'Compra con tarjeta');
begin
  select * into t from public.credit_cards where id = p_card and deleted_at is null;
  if not found then raise exception 'Tarjeta no encontrada'; end if;
  if not public.is_book_member(t.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Escribe el valor de la compra'; end if;
  if cat is null then
    select id into cat from public.categories where book_id = t.book_id and nombre = 'Otros' and deleted_at is null limit 1;
  end if;
  if coalesce(p_como_gasto, true) then
    if medio is null then
      select id into medio from public.payment_methods where book_id = t.book_id and deleted_at is null and nombre ~* 'cr[eé]dito' order by sort limit 1;
    end if;
    insert into public.expenses(book_id, fecha, descripcion, valor, category_id, origen, hormiga, payment_method_id, external_id, member_id, provider_id)
    values (t.book_id, f, d, p_valor, cat, 'tarjeta', false, medio, p_external_id, p_member, p_provider)
    returning id into gid;
  end if;
  insert into public.card_purchases(book_id, card_id, fecha, descripcion, valor, cuotas, category_id, expense_id)
  values (t.book_id, t.id, f, d, p_valor, greatest(1, coalesce(p_cuotas, 1)), cat, gid)
  returning id into pid;
  return jsonb_build_object('purchase_id', pid, 'expense_id', gid);
end $$;
grant execute on function public.add_card_purchase(uuid, date, text, numeric, int, uuid, boolean, uuid, text, uuid, uuid) to authenticated;

-- Gasto con tarjeta ↔ compra (detrás de sync_enlaces_on): borrar, restaurar o editar uno cambia el otro.
create or replace function public.expense_card_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.sync_enlaces_on() then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.card_purchases set deleted_at = new.deleted_at where expense_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.card_purchases set deleted_at = null where expense_id = new.id and deleted_at = old.deleted_at;
  elsif new.deleted_at is null then
    update public.card_purchases set valor = new.valor, fecha = new.fecha, category_id = new.category_id, descripcion = new.descripcion
     where expense_id = new.id and deleted_at is null
       and (valor, fecha, category_id, descripcion) is distinct from (new.valor, new.fecha, new.category_id, new.descripcion);
  end if;
  return new;
end $$;
drop trigger if exists trg_expense_card on public.expenses;
create trigger trg_expense_card after update of deleted_at, valor, fecha, category_id, descripcion on public.expenses
  for each row when (new.origen = 'tarjeta') execute function public.expense_card_sync();

create or replace function public.card_purchase_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.sync_enlaces_on() then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.expenses set deleted_at = new.deleted_at where id = new.expense_id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.expenses set deleted_at = null where id = new.expense_id and deleted_at = old.deleted_at;
  elsif new.deleted_at is null then
    update public.expenses set valor = new.valor, fecha = new.fecha, category_id = new.category_id, descripcion = new.descripcion
     where id = new.expense_id and deleted_at is null
       and (valor, fecha, category_id, descripcion) is distinct from (new.valor, new.fecha, new.category_id, new.descripcion);
  end if;
  return new;
end $$;
drop trigger if exists trg_card_purchase_sync on public.card_purchases;
create trigger trg_card_purchase_sync after update of deleted_at, valor, fecha, category_id, descripcion on public.card_purchases
  for each row when (new.expense_id is not null) execute function public.card_purchase_sync();

-- Borrar o restaurar la tarjeta: sus pagos siempre; sus compras (y con ellas sus gastos) detrás del interruptor.
create or replace function public.credit_card_cascade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.card_payments set deleted_at = new.deleted_at where card_id = new.id and deleted_at is null;
    if public.sync_enlaces_on() then
      update public.card_purchases set deleted_at = new.deleted_at where card_id = new.id and deleted_at is null;
    end if;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.card_payments set deleted_at = null where card_id = new.id and deleted_at = old.deleted_at;
    if public.sync_enlaces_on() then
      update public.card_purchases set deleted_at = null where card_id = new.id and deleted_at = old.deleted_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_credit_card_cascade on public.credit_cards;
create trigger trg_credit_card_cascade after update of deleted_at on public.credit_cards for each row execute function public.credit_card_cascade();

-- ───────────────────────── 4. Suscripción: "Ya se cobró" en una sola transacción ─────────────────────────
create or replace function public.pay_subscription(p_sub uuid, p_fecha date default null, p_valor numeric default null, p_medio uuid default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare s public.subscriptions; gid uuid; v numeric := p_valor; f date; hoy date := (now() at time zone 'America/Bogota')::date;
  nxt date; step interval; cat uuid; rate numeric;
begin
  select * into s from public.subscriptions where id = p_sub and deleted_at is null for update;
  if not found then raise exception 'Suscripción no encontrada'; end if;
  if not public.is_book_member(s.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  step := case when s.ciclo = 'anual' then interval '1 year' else interval '1 month' end;
  f := coalesce(p_fecha, case when s.proximo is not null and s.proximo <= hoy then s.proximo else hoy end);
  if v is null then
    rate := case when s.currency = 'COP' then 1 else coalesce((select (trm->>s.currency)::numeric from public.book_settings where book_id = s.book_id), 0) end;
    v := round(s.valor * rate / greatest(1, s.comparte));
  end if;
  if v is null or v <= 0 then raise exception 'Escribe el valor del cobro'; end if;
  cat := coalesce(s.category_id, (select id from public.categories where book_id = s.book_id and nombre = 'Suscripciones' and deleted_at is null limit 1));
  insert into public.expenses(book_id, fecha, descripcion, valor, category_id, payment_method_id, provider_id, hormiga, origen, subscription_id, sub_proximo)
  values (s.book_id, f, s.nombre, v, cat, coalesce(p_medio, s.payment_method_id), s.provider_id, false, 'manual', s.id, coalesce(s.proximo, f))
  returning id into gid;
  nxt := (coalesce(s.proximo, f) + step)::date;
  update public.subscriptions set proximo = nxt where id = s.id;
  return jsonb_build_object('expense_id', gid, 'proximo', nxt, 'anterior', s.proximo, 'valor', v);
end $$;
grant execute on function public.pay_subscription(uuid, date, numeric, uuid) to authenticated;

-- Borrar el gasto del cobro devuelve el próximo cobro (si nadie lo movió después); restaurarlo lo vuelve a adelantar.
-- Solo toca gastos con subscription_id, que escribe únicamente el código nuevo.
create or replace function public.expense_subscription_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.subscriptions; step interval;
begin
  if new.sub_proximo is null then return new; end if;
  select * into s from public.subscriptions where id = new.subscription_id;
  if not found then return new; end if;
  step := case when s.ciclo = 'anual' then interval '1 year' else interval '1 month' end;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.subscriptions set proximo = new.sub_proximo where id = s.id and proximo = (new.sub_proximo + step)::date;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.subscriptions set proximo = (new.sub_proximo + step)::date where id = s.id and proximo = new.sub_proximo;
  end if;
  return new;
end $$;
drop trigger if exists trg_expense_subscription on public.expenses;
create trigger trg_expense_subscription after update of deleted_at on public.expenses
  for each row when (new.subscription_id is not null) execute function public.expense_subscription_sync();

-- ───────────────────────── 5. Gastos compartidos (detrás de sync_enlaces_on) ─────────────────────────
create or replace function public.shared_expense_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.sync_enlaces_on() then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.expenses set deleted_at = new.deleted_at where id = new.expense_id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.expenses set deleted_at = null where id = new.expense_id and deleted_at = old.deleted_at;
  end if;
  return new;
end $$;
drop trigger if exists trg_shared_expense on public.shared_group_expenses;
create trigger trg_shared_expense after update of deleted_at on public.shared_group_expenses
  for each row when (new.expense_id is not null) execute function public.shared_expense_sync();

create or replace function public.shared_group_cascade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.sync_enlaces_on() then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.shared_group_expenses set deleted_at = new.deleted_at where group_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.shared_group_expenses set deleted_at = null where group_id = new.id and deleted_at = old.deleted_at;
  end if;
  return new;
end $$;
drop trigger if exists trg_shared_group on public.shared_groups;
create trigger trg_shared_group after update of deleted_at on public.shared_groups for each row execute function public.shared_group_cascade();

-- ───────────────────────── 6. Editar el gasto que salió de pagar un fijo (detrás de sync_enlaces_on) ─────────────────────────
-- Trigger aparte de expense_fixed_sync (que no se toca): lleva el valor y la fecha al pago del periodo y ajusta el aporte
-- a la meta o al fondo por la diferencia (y `expenses.aporte.v`, que usa la reversa al borrar).
create or replace function public.expense_fixed_edit_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare a jsonb := new.aporte; d numeric := coalesce(new.valor, 0) - coalesce(old.valor, 0);
begin
  if not public.sync_enlaces_on() then return new; end if;
  update public.fixed_expense_payments set valor = new.valor, fecha = new.fecha
   where expense_id = new.id and deleted_at is null and (valor, fecha) is distinct from (new.valor, new.fecha);
  if a is not null then
    if a->>'t' = 'fondo' then
      if d <> 0 then update public.emergency_funds set saldo = greatest(0, saldo + d) where book_id = new.book_id; end if;
      update public.fund_movements set valor = new.valor, fecha = new.fecha
       where expense_id = new.id and tipo = 'guardar' and deleted_at is null and (valor, fecha) is distinct from (new.valor, new.fecha);
    elsif a->>'t' = 'meta' and d <> 0 then
      update public.goals set ahorrado = greatest(0, ahorrado + d) where id = (a->>'id')::uuid;
    end if;
    if d <> 0 then update public.expenses set aporte = jsonb_set(a, '{v}', to_jsonb(new.valor)) where id = new.id; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_expense_fixed_edit on public.expenses;
create trigger trg_expense_fixed_edit after update of valor, fecha on public.expenses for each row
  when (new.fixed_expense_id is not null and new.deleted_at is null and old.deleted_at is null
        and (old.valor is distinct from new.valor or old.fecha is distinct from new.fecha))
  execute function public.expense_fixed_edit_sync();

-- ───────────────────────── 7. Gasto suelto que es el pago de un fijo ─────────────────────────
-- "¿Es el pago de Arriendo de noviembre?": enlaza un gasto ya registrado con el periodo pendiente (sin duplicar).
create or replace function public.link_expense_fixed(p_expense uuid, p_fixed uuid, p_periodo text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare e public.expenses; f public.fixed_expenses; pid uuid;
begin
  select * into e from public.expenses where id = p_expense and deleted_at is null for update;
  if not found then raise exception 'Gasto no encontrado'; end if;
  select * into f from public.fixed_expenses where id = p_fixed and deleted_at is null for update;
  if not found or f.book_id <> e.book_id then raise exception 'Gasto fijo no encontrado'; end if;
  if not public.is_book_member(f.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if e.fixed_expense_id is not null then raise exception 'Este gasto ya es el pago de un gasto fijo'; end if;
  if f.link_type is not null then raise exception 'Los aportes a metas se registran desde Gastos fijos'; end if;
  if e.origen in ('tarjeta','prestamo','aporte','compartido') then raise exception 'Este gasto ya está enlazado con otro registro'; end if;
  if coalesce(p_periodo, '') = '' then raise exception 'Falta el periodo'; end if;
  if exists (select 1 from public.fixed_expense_payments where fixed_expense_id = f.id and periodo = p_periodo and deleted_at is null) then
    raise exception 'Ese periodo ya está pagado';
  end if;
  update public.expenses set fixed_expense_id = f.id, periodo = p_periodo where id = e.id;
  insert into public.fixed_expense_payments(book_id, fixed_expense_id, periodo, fecha, valor, payment_method_id, expense_id)
  values (f.book_id, f.id, p_periodo, e.fecha, e.valor, coalesce(e.payment_method_id, f.payment_method_id), e.id)
  returning id into pid;
  if f.variable and coalesce(f.vmin, 0) > 0 then
    if e.valor < f.vmin then update public.fixed_expenses set vmin = e.valor where id = f.id;
    elsif e.valor > f.vmax then update public.fixed_expenses set vmax = e.valor where id = f.id;
    end if;
    update public.fixed_expenses set valor = round((vmin + vmax) / 2) where id = f.id;
  end if;
  return jsonb_build_object('payment_id', pid);
end $$;
grant execute on function public.link_expense_fixed(uuid, uuid, text) to authenticated;

-- Deshacer el enlace: el gasto vuelve a ser suelto y el periodo queda pendiente.
create or replace function public.unlink_expense_fixed(p_expense uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_expense;
  if not found then raise exception 'Gasto no encontrado'; end if;
  if not public.is_book_member(e.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if e.aporte is not null then raise exception 'Este pago es un aporte: deshazlo desde Gastos fijos'; end if;
  update public.fixed_expense_payments set deleted_at = now() where expense_id = e.id and deleted_at is null;
  update public.expenses set fixed_expense_id = null, periodo = null where id = e.id;
end $$;
grant execute on function public.unlink_expense_fixed(uuid) to authenticated;
