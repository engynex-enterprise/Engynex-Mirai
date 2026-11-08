-- Gasto: "¿A quién le pagaste?" separa un negocio o empresa (provider_id, Proveedores) de una persona (contact_id,
-- Contactos). Aditiva: los gastos de antes quedan igual. Si se borra el contacto, el gasto queda sin persona.
alter table public.expenses add column if not exists contact_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_contact_id_fkey') then
    alter table public.expenses add constraint expenses_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete set null;
  end if;
end $$;

-- Toda llave foránea con índice (borrar un contacto no revisa la tabla completa).
create index if not exists expenses_contact_idx on public.expenses using btree (contact_id) where (contact_id is not null);

comment on column public.expenses.contact_id is 'Persona a la que se le pagó (Contactos). Para un negocio o empresa se usa provider_id.';

-- PostgREST: que vea la columna nueva sin reiniciar.
notify pgrst, 'reload schema';
