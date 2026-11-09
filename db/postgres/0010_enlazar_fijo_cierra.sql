-- Arreglo de link_expense_fixed (0007): la variable se llamaba igual que la columna fixed_expense_payments.cierra y
-- Postgres no sabía cuál usar ("column reference cierra is ambiguous", código 42702). Resultado: enlazar un gasto
-- suelto con su gasto fijo ("Es el mismo: enlazar" en Todos los gastos, Balance y el formulario de gasto) fallaba
-- siempre con un error 500. Solo se renombra la variable (v_cierra); la firma y lo que hace no cambian.
-- Aditiva: create or replace de la misma función, con los mismos permisos.
create or replace function public.link_expense_fixed(p_expense uuid, p_fixed uuid, p_periodo text, p_cierra boolean default true) returns jsonb
    language plpgsql
    set search_path to 'public'
    as $$
declare e public.expenses; f public.fixed_expenses; pid uuid; v_cierra boolean := coalesce(p_cierra, true);
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
  -- Pagado = hay un pago que cierra el periodo (o uno de antes sin marcar). Los abonos (cierra = false) dejan seguir.
  if exists (select 1 from public.fixed_expense_payments where fixed_expense_id = f.id and periodo = p_periodo and deleted_at is null and cierra is distinct from false) then
    raise exception 'Ese periodo ya está pagado';
  end if;
  update public.expenses set fixed_expense_id = f.id, periodo = p_periodo where id = e.id;
  insert into public.fixed_expense_payments(book_id, fixed_expense_id, periodo, fecha, valor, payment_method_id, expense_id, cierra)
  values (f.book_id, f.id, p_periodo, e.fecha, e.valor, coalesce(e.payment_method_id, f.payment_method_id), e.id, v_cierra)
  returning id into pid;
  -- Rango variable: se amplía con pagos fuera de rango (solo con pagos que cierran el periodo, no con abonos).
  if f.variable and coalesce(f.vmin, 0) > 0 and v_cierra then
    if e.valor < f.vmin then update public.fixed_expenses set vmin = e.valor where id = f.id;
    elsif e.valor > f.vmax then update public.fixed_expenses set vmax = e.valor where id = f.id;
    end if;
    update public.fixed_expenses set valor = round((vmin + vmax) / 2) where id = f.id;
  end if;
  return jsonb_build_object('payment_id', pid, 'completo', v_cierra);
end $$;

grant all on function public.link_expense_fixed(uuid, uuid, text, boolean) to anon;
grant all on function public.link_expense_fixed(uuid, uuid, text, boolean) to authenticated;
grant all on function public.link_expense_fixed(uuid, uuid, text, boolean) to service_role;

notify pgrst, 'reload schema';
