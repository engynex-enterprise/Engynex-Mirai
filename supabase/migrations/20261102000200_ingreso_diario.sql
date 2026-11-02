-- Ingresos pagados por día (jornal): amplía la frecuencia permitida. Aditiva: los valores de antes siguen siendo válidos.
-- incomes.reparto gana { tipo, mensual, dias, x1 } (ver lib/domain/reparto.ts); `valor` sigue siendo el promedio por pago.
alter table public.incomes drop constraint if exists incomes_frec_check;
alter table public.incomes add constraint incomes_frec_check check (frec in ('mensual','quincenal','semanal','diario','anual'));
