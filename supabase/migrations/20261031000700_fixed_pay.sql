-- Pagos de gastos fijos (pagarFijo / unpayfijo / aporteApply / aporteRevert de la v4) como transacciones.
-- Registrar un pago crea el gasto ligado, el pago del periodo, ajusta el rango de los variables y,
-- si el fijo es un aporte programado, suma a la meta o al fondo de emergencia. Deshacer revierte todo.

alter table public.expenses add column if not exists aporte jsonb;   -- {t: 'meta'|'fondo', id, v}

create or replace function public.pay_fixed_expense(
  p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_medio uuid default null, p_desc_suffix text default ''
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  f public.fixed_expenses; gid uuid; pid uuid; ajuste text := null; aporte jsonb := null; saldo numeric; g public.goals;
begin
  select * into f from public.fixed_expenses where id = p_fixed and deleted_at is null for update;
  if not found then raise exception 'Gasto fijo no encontrado'; end if;
  if not public.is_book_member(f.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Escribe el valor que pagaste'; end if;
  if exists (select 1 from public.fixed_expense_payments where fixed_expense_id = f.id and periodo = p_periodo and deleted_at is null) then
    raise exception 'Ese periodo ya está pagado';
  end if;

  insert into public.expenses(book_id, fecha, descripcion, category_id, valor, payment_method_id, fixed_expense_id, periodo, hormiga, origen)
  values (f.book_id, p_fecha, f.nombre || coalesce(p_desc_suffix, ''), f.category_id, p_valor, coalesce(p_medio, f.payment_method_id), f.id, p_periodo, false,
          case when f.link_type is not null then 'aporte' else 'manual' end)
  returning id into gid;
  insert into public.fixed_expense_payments(book_id, fixed_expense_id, periodo, fecha, valor, payment_method_id, expense_id)
  values (f.book_id, f.id, p_periodo, p_fecha, p_valor, coalesce(p_medio, f.payment_method_id), gid)
  returning id into pid;

  -- Rango variable: se amplía con pagos fuera de rango y el valor de referencia es el punto medio
  if f.variable and coalesce(f.vmin, 0) > 0 then
    if p_valor < f.vmin then update public.fixed_expenses set vmin = p_valor where id = f.id; ajuste := 'min';
    elsif p_valor > f.vmax then update public.fixed_expenses set vmax = p_valor where id = f.id; ajuste := 'max';
    end if;
    update public.fixed_expenses set valor = round((vmin + vmax) / 2) where id = f.id;
  end if;

  -- Aporte programado a meta o fondo
  if f.link_type = 'fondo' then
    update public.emergency_funds set saldo = saldo + p_valor, activo = true where book_id = f.book_id returning saldo into saldo;
    insert into public.fund_movements(book_id, tipo, valor, fecha, nota, expense_id) values (f.book_id, 'guardar', p_valor, p_fecha, 'Aporte programado', gid);
    aporte := jsonb_build_object('t', 'fondo', 'v', p_valor, 'saldo', saldo);
  elsif f.link_type = 'meta' and f.link_id is not null then
    update public.goals set ahorrado = ahorrado + p_valor where id = f.link_id and book_id = f.book_id returning * into g;
    if found then aporte := jsonb_build_object('t', 'meta', 'id', g.id, 'v', p_valor, 'nombre', g.nombre, 'ahorrado', g.ahorrado, 'objetivo', g.objetivo); end if;
  end if;
  if aporte is not null then update public.expenses set aporte = aporte where id = gid; end if;

  return jsonb_build_object('expense_id', gid, 'payment_id', pid, 'ajuste', ajuste, 'aporte', aporte);
end $$;
grant execute on function public.pay_fixed_expense(uuid, text, date, numeric, uuid, text) to authenticated;

-- Deshacer el pago de un periodo: borra (lógico) el pago y su gasto; el trigger revierte el aporte.
create or replace function public.unpay_fixed_expense(p_payment uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare p public.fixed_expense_payments;
begin
  select * into p from public.fixed_expense_payments where id = p_payment and deleted_at is null;
  if not found then raise exception 'Pago no encontrado'; end if;
  if not public.is_book_member(p.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  update public.fixed_expense_payments set deleted_at = now() where id = p.id;
  if p.expense_id is not null then update public.expenses set deleted_at = now() where id = p.expense_id and deleted_at is null; end if;
end $$;
grant execute on function public.unpay_fixed_expense(uuid) to authenticated;

-- Al borrar/restaurar un gasto ligado a un fijo: su pago del periodo y su aporte se quitan/recuperan.
create or replace function public.expense_fixed_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare a jsonb := new.aporte; s numeric;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.fixed_expense_payments set deleted_at = now() where expense_id = new.id and deleted_at is null;
    if a->>'t' = 'fondo' then
      update public.emergency_funds set saldo = greatest(0, saldo - (a->>'v')::numeric) where book_id = new.book_id;
      update public.fund_movements set deleted_at = now() where expense_id = new.id and tipo = 'guardar' and deleted_at is null;
    elsif a->>'t' = 'meta' then
      update public.goals set ahorrado = greatest(0, ahorrado - (a->>'v')::numeric) where id = (a->>'id')::uuid;
    end if;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.fixed_expense_payments set deleted_at = null where expense_id = new.id;
    if a->>'t' = 'fondo' then
      update public.emergency_funds set saldo = saldo + (a->>'v')::numeric where book_id = new.book_id;
      update public.fund_movements set deleted_at = null where expense_id = new.id and tipo = 'guardar';
    elsif a->>'t' = 'meta' then
      update public.goals set ahorrado = ahorrado + (a->>'v')::numeric where id = (a->>'id')::uuid;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_expense_fixed on public.expenses;
create trigger trg_expense_fixed after update of deleted_at on public.expenses for each row
  when (new.fixed_expense_id is not null) execute function public.expense_fixed_sync();

-- Borrar un gasto fijo borra también sus gastos generados (regla de la v4); restaurarlo los recupera.
create or replace function public.fixed_cascade_soft() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.expenses set deleted_at = new.deleted_at where fixed_expense_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.expenses set deleted_at = null where fixed_expense_id = new.id and deleted_at = old.deleted_at;
  end if;
  return new;
end $$;
drop trigger if exists trg_fixed_cascade on public.fixed_expenses;
create trigger trg_fixed_cascade after update of deleted_at on public.fixed_expenses for each row execute function public.fixed_cascade_soft();
