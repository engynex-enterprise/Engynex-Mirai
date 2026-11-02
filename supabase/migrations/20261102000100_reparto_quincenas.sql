-- Ingresos y gastos fijos flexibles por quincena. Aditiva: `valor` sigue siendo el promedio por periodo,
-- así la versión publicada suma bien el total del mes aunque no lea el reparto.
--
-- incomes.reparto: {
--   modo: 'igual' | 'distinto',      -- quincenal: mismo valor en las dos quincenas o uno distinto en cada una
--   b1, b2: number,                  -- valor escrito para la 1ª y 2ª quincena (bruto si hay descuentos)
--   n1, n2: number,                  -- lo que llega a la cuenta en cada quincena (ya con descuentos)
--   ded: 'mitad' | 'q1' | 'q2',      -- en qué quincena se descuentan salud, pensión, retención…
--   d1, d2: number,                  -- días de pago de cada quincena (por defecto 15 y fin de mes)
--   dow: 0..6,                       -- semanal: día de la semana (por defecto viernes)
--   mes: 1..12                       -- anual: mes del pago
-- }
-- fixed_expenses.reparto: { modo: 'igual' | 'distinto', q1, q2 }  -- quincenal: cuánto se paga en cada quincena

alter table public.incomes add column if not exists reparto jsonb;
alter table public.fixed_expenses add column if not exists reparto jsonb;
