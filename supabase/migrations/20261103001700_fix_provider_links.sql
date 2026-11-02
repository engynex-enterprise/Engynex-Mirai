-- Corrige provider_links_check (20261103001500): en plpgsql, `tg_table_name = 'loans' and new.provider_id ...` lee
-- new.provider_id también cuando el disparador corre en providers (que no tiene esa columna) y fallaba con
-- "record new has no field provider_id" al crear un proveedor. Una función por tabla.
create or replace function public.loan_provider_check() returns trigger
language plpgsql as $$
begin
  if new.provider_id is not null
     and not exists (select 1 from public.providers p where p.id = new.provider_id and p.book_id = new.book_id) then
    new.provider_id := null;
  end if;
  return new;
end $$;

create or replace function public.provider_method_check() returns trigger
language plpgsql as $$
begin
  if new.payment_method_id is not null
     and not exists (select 1 from public.payment_methods m where m.id = new.payment_method_id and m.book_id = new.book_id) then
    new.payment_method_id := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_provider_links on public.loans;
create trigger trg_provider_links before insert or update of provider_id on public.loans
  for each row execute function public.loan_provider_check();
drop trigger if exists trg_provider_links on public.providers;
create trigger trg_provider_links before insert or update of payment_method_id on public.providers
  for each row execute function public.provider_method_check();
drop function if exists public.provider_links_check();
