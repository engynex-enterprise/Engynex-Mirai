-- Un gasto fijo puede ser de varias personas (se reparte en partes iguales). Aditiva:
--   fixed_expenses.member_ids: personas del gasto (vacío/null = toda la familia). member_id queda sincronizado
--   (la persona si es una sola, null si son varias) para lo que solo conoce una persona.
--   expenses.member_ids: al pagar un fijo de varias personas, el gasto guarda entre quiénes se reparte.
alter table public.fixed_expenses add column if not exists member_ids uuid[];
alter table public.expenses add column if not exists member_ids uuid[];

create or replace function public.fixed_members_sync() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.member_ids is not null and cardinality(new.member_ids) = 0 then new.member_ids := null; end if;
  if tg_op = 'INSERT' or new.member_ids is distinct from old.member_ids then
    new.member_id := case when cardinality(new.member_ids) = 1 then new.member_ids[1] else null end;
  elsif new.member_id is distinct from old.member_id then
    -- La versión publicada solo cambia member_id: se refleja en la lista.
    new.member_ids := case when new.member_id is null then null else array[new.member_id] end;
  end if;
  return new;
end $$;
drop trigger if exists fixed_members_sync on public.fixed_expenses;
create trigger fixed_members_sync before insert or update on public.fixed_expenses
  for each row execute function public.fixed_members_sync();

-- El gasto que se registra al pagar un fijo hereda la persona o las personas.
create or replace function public.expense_member_from_fixed() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[]; one uuid;
begin
  if new.fixed_expense_id is not null and new.member_id is null and new.member_ids is null then
    select f.member_ids, f.member_id into ids, one from public.fixed_expenses f where f.id = new.fixed_expense_id;
    if cardinality(ids) > 1 then new.member_ids := ids; else new.member_id := coalesce(ids[1], one); end if;
  end if;
  return new;
end $$;
