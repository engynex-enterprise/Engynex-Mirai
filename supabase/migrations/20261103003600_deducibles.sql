-- Mirai 5.5 · Frente F6 (P1-9): marca "deducible" en los gastos para proponer deducciones en la Declaración de renta.
-- Aditiva e idempotente: una columna nula, sin valor por defecto. La versión publicada no la lee ni la escribe.
-- Valores (contrato con el formulario de gastos):
--   salud       → medicina prepagada, pólizas de salud o planes complementarios (art. 387 ET; DUR 1625 art. 1.2.4.1.6)
--   vivienda    → intereses del crédito de vivienda o leasing habitacional (art. 119 ET), solo como referencia
--   educacion   → intereses de créditos ICETEX del contribuyente (art. 119 par. ET), solo como referencia
--   dependiente → respaldo para el contador (no suma a ninguna deducción por su valor)

alter table public.expenses add column if not exists deducible text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_deducible_check' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_deducible_check
      check (deducible is null or deducible in ('salud', 'educacion', 'vivienda', 'dependiente'));
  end if;
end $$;

comment on column public.expenses.deducible is
  'Deducción de renta a la que puede servir el gasto: salud | educacion | vivienda | dependiente (nulo = no aplica). La renta propone tax_years.ded desde los gastos marcados del año.';

-- Índice parcial: la renta solo consulta los gastos marcados.
create index if not exists expenses_deducible_idx on public.expenses (book_id, fecha) where deducible is not null and deleted_at is null;
