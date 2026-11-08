-- Abonos a un gasto fijo (0005): un periodo puede tener varios pagos. Antes solo se permitía uno (fixed_payments_uidx);
-- ahora puede haber varios abonos (cierra = false) y a lo sumo un pago que lo deja pagado (o uno de antes sin marcar).
drop index if exists public.fixed_payments_uidx;
create unique index if not exists fixed_payments_cierra_uidx on public.fixed_expense_payments using btree (fixed_expense_id, periodo)
  where (deleted_at is null and cierra is distinct from false);
-- Para buscar los pagos de un periodo sin recorrer la tabla.
create index if not exists fixed_payments_periodo_idx on public.fixed_expense_payments using btree (fixed_expense_id, periodo) where (deleted_at is null);

notify pgrst, 'reload schema';
