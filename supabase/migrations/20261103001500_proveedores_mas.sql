-- Proveedores 2: medio de pago preferido y enlace con préstamos (Me deben / Le debo).
--   · providers.payment_method_id: el medio con el que se le suele pagar (se sugiere al crear gastos con ese proveedor).
--   · loans.provider_id: la deuda o el préstamo con ese proveedor (opcional).
-- Aditiva: la versión publicada no conoce estas columnas y sigue igual. Idempotente.

alter table public.providers add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null;
alter table public.loans     add column if not exists provider_id uuid references public.providers(id) on delete set null;
create index if not exists loans_provider_idx on public.loans(provider_id) where provider_id is not null;

-- El proveedor o el medio de otro libro no se pueden enlazar (las RLS solo dejan leer los propios; esto evita IDs ajenos).
create or replace function public.provider_links_check() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'loans' and new.provider_id is not null
     and not exists (select 1 from public.providers p where p.id = new.provider_id and p.book_id = new.book_id) then
    new.provider_id := null;
  end if;
  if tg_table_name = 'providers' and new.payment_method_id is not null
     and not exists (select 1 from public.payment_methods m where m.id = new.payment_method_id and m.book_id = new.book_id) then
    new.payment_method_id := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_provider_links on public.loans;
create trigger trg_provider_links before insert or update of provider_id on public.loans
  for each row execute function public.provider_links_check();
drop trigger if exists trg_provider_links on public.providers;
create trigger trg_provider_links before insert or update of payment_method_id on public.providers
  for each row execute function public.provider_links_check();
