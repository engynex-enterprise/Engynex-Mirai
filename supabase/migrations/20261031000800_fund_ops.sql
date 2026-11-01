-- Fondo de emergencia: guardar y usar (modal "fondo" de la v4) como transacciones.

create or replace function public.fund_save(p_book uuid, p_valor numeric, p_fecha date, p_nota text default '')
returns numeric language plpgsql security invoker set search_path = public as $$
declare s numeric;
begin
  if not public.is_book_member(p_book, 'editor') then raise exception 'Sin permiso'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Escribe el valor'; end if;
  insert into public.emergency_funds(book_id, activo, saldo) values (p_book, true, 0) on conflict (book_id) do nothing;
  update public.emergency_funds set activo = true, saldo = saldo + p_valor where book_id = p_book returning saldo into s;
  insert into public.fund_movements(book_id, tipo, valor, fecha, nota) values (p_book, 'guardar', p_valor, p_fecha, coalesce(p_nota, ''));
  return s;
end $$;
grant execute on function public.fund_save(uuid, numeric, date, text) to authenticated;

-- Usar el fondo: crea el gasto (categoría Imprevistos) por el valor total y descuenta del fondo lo que alcance.
create or replace function public.fund_use(p_book uuid, p_desc text, p_valor numeric, p_fecha date, p_medio uuid default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare gid uuid; cat uuid; queda numeric; antes numeric;
begin
  if not public.is_book_member(p_book, 'editor') then raise exception 'Sin permiso'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Escribe el valor'; end if;
  select id into cat from public.categories where book_id = p_book and lower(nombre) = 'imprevistos' and deleted_at is null limit 1;
  select saldo into antes from public.emergency_funds where book_id = p_book;
  insert into public.expenses(book_id, fecha, descripcion, category_id, valor, payment_method_id, hormiga, hormiga_src, origen)
  values (p_book, p_fecha, coalesce(nullif(trim(p_desc), ''), 'Imprevisto'), cat, p_valor, p_medio, false, 'manual', 'manual') returning id into gid;
  queda := public.use_emergency_fund(gid, p_valor);
  return jsonb_build_object('expense_id', gid, 'cubre', least(p_valor, coalesce(antes, 0)), 'resto', greatest(0, p_valor - coalesce(antes, 0)), 'saldo', queda);
end $$;
grant execute on function public.fund_use(uuid, text, numeric, date, uuid) to authenticated;
