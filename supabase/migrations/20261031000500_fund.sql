-- Fondo de emergencia: usar el fondo para un gasto es atómico, y borrar/restaurar ese gasto
-- devuelve/descuenta el dinero automáticamente (regla de la v4: "Al borrar ese gasto, se devuelve al saldo").

create or replace function public.use_emergency_fund(p_expense uuid, p_valor numeric)
returns numeric language plpgsql security invoker set search_path = public as $$
declare e public.expenses; f public.emergency_funds; usado numeric;
begin
  select * into e from public.expenses where id = p_expense;
  if not found then raise exception 'Gasto no encontrado'; end if;
  if not public.is_book_member(e.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  select * into f from public.emergency_funds where book_id = e.book_id for update;
  if not found or not f.activo then raise exception 'El fondo de emergencia no está activo'; end if;
  usado := least(p_valor, f.saldo);
  if usado <= 0 then return 0; end if;
  update public.emergency_funds set saldo = saldo - usado where book_id = e.book_id;
  update public.expenses set fondo_valor = usado where id = e.id;
  insert into public.fund_movements(book_id, tipo, valor, fecha, nota, expense_id)
  values (e.book_id, 'usar', usado, e.fecha, e.descripcion, e.id);
  return f.saldo - usado;  -- saldo restante
end $$;
grant execute on function public.use_emergency_fund(uuid, numeric) to authenticated;

create or replace function public.expense_fund_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.fondo_valor, 0) <= 0 then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.emergency_funds set saldo = saldo + new.fondo_valor where book_id = new.book_id;
    update public.fund_movements set deleted_at = now() where expense_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.emergency_funds set saldo = saldo - new.fondo_valor where book_id = new.book_id;
    update public.fund_movements set deleted_at = null where expense_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_expense_fund on public.expenses;
create trigger trg_expense_fund after update of deleted_at on public.expenses for each row execute function public.expense_fund_sync();
