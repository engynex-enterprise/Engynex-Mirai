-- Préstamos con pago único (una sola fecha pactada) y fiado (una tienda o negocio que te fía). Aditiva:
--   loans.vence: fecha del pago único (frec = 'unico'). La versión publicada no la conoce y lo toma como 1 cuota a un mes.
--   loans.fiado: la deuda es un fiado en una tienda o negocio (el proveedor es quien fía).
--   loans.acreedor: nombre de quien presta cuando no es un contacto ni una entidad (el proveedor). Se mantiene solo
--     con disparadores, así todas las pantallas lo muestran sin consultar proveedores.
alter table public.loans add column if not exists vence date;
alter table public.loans add column if not exists fiado boolean not null default false;
alter table public.loans add column if not exists acreedor text;
alter table public.loans drop constraint if exists loans_frec_check;
alter table public.loans add constraint loans_frec_check check (frec in ('mensual','quincenal','semanal','diario','diariohab','unico'));

create or replace function public.loan_acreedor_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.provider_id is not null then
    select p.nombre into new.acreedor from public.providers p where p.id = new.provider_id;
  elsif tg_op = 'UPDATE' and old.provider_id is not null then
    new.acreedor := null;
  end if;
  return new;
end $$;
drop trigger if exists loan_acreedor_sync on public.loans;
create trigger loan_acreedor_sync before insert or update of provider_id on public.loans
  for each row execute function public.loan_acreedor_sync();

create or replace function public.provider_rename_loans() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.nombre is distinct from old.nombre then
    update public.loans set acreedor = new.nombre where provider_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists provider_rename_loans on public.providers;
create trigger provider_rename_loans after update of nombre on public.providers
  for each row execute function public.provider_rename_loans();

-- Los préstamos ya enlazados a un proveedor quedan con su nombre.
update public.loans l set acreedor = p.nombre from public.providers p where l.provider_id = p.id and l.acreedor is null;
