-- Abonos a un gasto fijo: un periodo puede pagarse en partes (p. ej. la moto: $70.000 la quincena, pagas $40.000 y
-- luego $30.000). `cierra` dice si el pago deja el periodo pagado:
--   true  = completo (o "esta vez costó menos": no falta nada),
--   false = abono (falta el resto),
--   null  = pagos de antes: completo si cubre el valor del periodo o si el fijo es variable; si no, abono (la API los
--           marca al registrar el siguiente).
-- Aditiva: nada cambia para quien paga el periodo completo de una vez.
alter table public.fixed_expense_payments add column if not exists cierra boolean;
comment on column public.fixed_expense_payments.cierra is 'true: deja el periodo pagado; false: abono (falta el resto); null: pagos de antes (ver @mirai/domain fijoStatus).';

drop function if exists public.pay_fixed_expense(uuid, text, date, numeric, uuid, text);

create function public.pay_fixed_expense(p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_medio uuid default null, p_desc_suffix text default '', p_cierra boolean default true) returns jsonb
    language plpgsql
    set search_path to 'public'
    as $$
declare
  f public.fixed_expenses; gid uuid; pid uuid; ajuste text := null; aporte jsonb := null; saldo numeric; g public.goals;
begin
  select * into f from public.fixed_expenses where id = p_fixed and deleted_at is null for update;
  if not found then raise exception 'Gasto fijo no encontrado'; end if;
  if not public.is_book_member(f.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Escribe el valor que pagaste'; end if;
  -- Ya pagado: hay un pago que cierra el periodo (o uno de antes sin marcar). Los abonos (cierra = false) dejan seguir.
  if exists (select 1 from public.fixed_expense_payments where fixed_expense_id = f.id and periodo = p_periodo and deleted_at is null and cierra is distinct from false) then
    raise exception 'Ese periodo ya está pagado';
  end if;

  insert into public.expenses(book_id, fecha, descripcion, category_id, valor, payment_method_id, fixed_expense_id, periodo, hormiga, origen)
  values (f.book_id, p_fecha, f.nombre || coalesce(p_desc_suffix, '') || case when p_cierra then '' else ' (abono)' end, f.category_id, p_valor, coalesce(p_medio, f.payment_method_id), f.id, p_periodo, false,
          case when f.link_type is not null then 'aporte' else 'manual' end)
  returning id into gid;
  insert into public.fixed_expense_payments(book_id, fixed_expense_id, periodo, fecha, valor, payment_method_id, expense_id, cierra)
  values (f.book_id, f.id, p_periodo, p_fecha, p_valor, coalesce(p_medio, f.payment_method_id), gid, coalesce(p_cierra, true))
  returning id into pid;

  -- Rango variable: se amplía con pagos fuera de rango y el valor de referencia es el punto medio (solo pagos completos)
  if f.variable and coalesce(f.vmin, 0) > 0 and coalesce(p_cierra, true) then
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

revoke all on function public.pay_fixed_expense(uuid, text, date, numeric, uuid, text, boolean) from public;
grant all on function public.pay_fixed_expense(uuid, text, date, numeric, uuid, text, boolean) to authenticated;
grant all on function public.pay_fixed_expense(uuid, text, date, numeric, uuid, text, boolean) to service_role;

-- Gastos compartidos: "Rosa le pagó a Juan" (completo o un abono) para saldar cuentas dentro del grupo. Un pago no es
-- un gasto del grupo (no suma en "Gastado en total"), pero sí mueve quién le debe a quién.
alter table public.shared_group_expenses add column if not exists tipo text not null default 'gasto';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shared_group_expenses_tipo_check') then
    alter table public.shared_group_expenses add constraint shared_group_expenses_tipo_check check (tipo in ('gasto', 'pago'));
  end if;
end $$;

notify pgrst, 'reload schema';
