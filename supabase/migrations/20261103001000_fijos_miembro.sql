-- Gastos fijos asignados a una persona de la familia (null = todo el hogar / general). Aditiva: la versión publicada
-- no conoce la columna y sigue igual. El gasto que se registra al pagar un fijo hereda la persona (trigger), así que
-- "Por miembro" y los reportes lo cuentan a nombre de quien corresponde sin tocar pay_fixed_expense.
alter table public.fixed_expenses add column if not exists member_id uuid references public.family_members(id) on delete set null;
create index if not exists fixed_expenses_member_idx on public.fixed_expenses(member_id) where member_id is not null;

create or replace function public.expense_member_from_fixed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.fixed_expense_id is not null and new.member_id is null then
    select f.member_id into new.member_id from public.fixed_expenses f where f.id = new.fixed_expense_id;
  end if;
  return new;
end $$;

drop trigger if exists expense_member_from_fixed on public.expenses;
create trigger expense_member_from_fixed before insert on public.expenses
  for each row execute function public.expense_member_from_fixed();
