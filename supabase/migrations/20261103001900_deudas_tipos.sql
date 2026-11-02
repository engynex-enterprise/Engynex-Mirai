-- Tipo de deuda o de préstamo (el formulario cambia sus campos según el tipo). Aditiva e idempotente:
--   loans.tipo: banco, empeno, fiado, persona, cuotas (compra a cuotas en un almacén), gota (gota a gota o prestamista),
--   presto (le presté a una persona), vendi (le fié a un cliente) u otro. Puede ser null: la versión publicada no lo
--   escribe y en los préstamos de antes Mirai lo deduce de entity_id, prenda, fiado y contact_id (lib/domain/loan-tipos.ts).
alter table public.loans add column if not exists tipo text;
alter table public.loans drop constraint if exists loans_tipo_check;
alter table public.loans add constraint loans_tipo_check
  check (tipo is null or tipo in ('banco','empeno','fiado','persona','cuotas','gota','presto','vendi','otro'));
