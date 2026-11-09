-- Gasto fijo: "¿A quién le pagas?" separa un negocio o empresa (provider_id, Proveedores) de una persona
-- (contact_id, Contactos), igual que ya hace el gasto del día a día (0004_gasto_pagado_a.sql). Además:
--   referencia: número de cuenta, contrato o póliza con que se paga (la cuenta de Enel, el código del colegio).
--   hasta:      hasta cuándo se paga (contrato a 12 meses, plan de celular). Vacío = indefinido.
--   aviso:      días de anticipo propios de este gasto. Vacío = el del libro (book_settings.anticipo).
-- Aditiva: los gastos fijos de antes quedan igual.
alter table public.fixed_expenses add column if not exists contact_id uuid;
alter table public.fixed_expenses add column if not exists referencia text not null default '';
alter table public.fixed_expenses add column if not exists hasta date;
alter table public.fixed_expenses add column if not exists aviso integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fixed_expenses_contact_id_fkey') then
    alter table public.fixed_expenses add constraint fixed_expenses_contact_id_fkey
      foreign key (contact_id) references public.contacts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fixed_expenses_aviso_check') then
    alter table public.fixed_expenses add constraint fixed_expenses_aviso_check
      check (aviso is null or (aviso >= 0 and aviso <= 100));
  end if;
end $$;

-- Toda llave foránea con índice (borrar un contacto no revisa la tabla completa).
create index if not exists fixed_expenses_contact_idx
  on public.fixed_expenses using btree (contact_id) where (contact_id is not null);

comment on column public.fixed_expenses.contact_id is 'Persona a la que se le paga (Contactos). Para un negocio o empresa se usa provider_id.';
comment on column public.fixed_expenses.referencia is 'Número de cuenta, contrato o referencia con que se paga.';
comment on column public.fixed_expenses.hasta is 'Hasta cuándo se paga (vacío = indefinido). No se generan periodos después de esta fecha.';
comment on column public.fixed_expenses.aviso is 'Días de anticipo del aviso para este gasto (vacío = el del libro).';

-- Al pagar un fijo, el gasto hereda también la persona (antes solo heredaba el negocio). De paso se le fija el
-- search_path, que le faltaba.
-- Solo hereda cuando el gasto no trae NINGÚN destino: con `or` podía quedar con negocio Y persona a la vez, y
-- "a quién le pagaste" es uno solo (negocio o persona, nunca los dos).
create or replace function public.expense_provider_default() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if new.fixed_expense_id is not null and new.provider_id is null and new.contact_id is null then
    select f.provider_id, f.contact_id
      into new.provider_id, new.contact_id
      from public.fixed_expenses f where f.id = new.fixed_expense_id;
  end if;
  return new;
end $$;

-- PostgREST: que vea las columnas nuevas sin reiniciar.
notify pgrst, 'reload schema';
