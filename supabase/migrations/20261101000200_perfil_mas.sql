-- Perfil (2): situación laboral, medios para recibir pagos (llaves Bre-B y cuentas) y cumpleaños de la familia.

alter table public.profiles add column if not exists trabajo text not null default ''
  check (trabajo in ('', 'empleado', 'independiente', 'empresario', 'pensionado', 'estudiante', 'hogar', 'buscando'));
-- [{ id, medio, detalle, tipo, titular }] — medio: 'breb' | clave de lib/brands (nequi, daviplata, bancolombia…) | 'otro'
alter table public.profiles add column if not exists cobro jsonb not null default '[]';
alter table public.family_members add column if not exists nacimiento date;

-- Personas naturales: el NIT es la cédula, así que los 2 dígitos de la DIAN salen del documento.
update public.profiles
set digitos = right(regexp_replace(doc, '\D', '', 'g'), 2)
where doc_tipo = 'CC' and length(regexp_replace(doc, '\D', '', 'g')) >= 2
  and digitos is distinct from right(regexp_replace(doc, '\D', '', 'g'), 2);
