-- Gastos por pagar o abonados: un gasto con fecha futura todavía no se ha pagado ("Marcar como pagado") y uno de hoy o
-- de antes puede quedar pagado completo, abonado (pagaste una parte y lo demás después) o por pagar.
--   pagado   = lo que ya se pagó; NULL = pagado completo (así quedan TODOS los gastos de antes: nada cambia para ellos).
--   pagar_el = cuándo se paga lo que falta (si no, la fecha del gasto).
-- Lo usan flujoIntegral (lo que falta sale "por pagar" en Todos y en el Balance, sin cambiar el total del mes) y los
-- saldos de las cuentas (solo baja lo pagado). Aditiva: dos columnas que pueden quedar vacías.
alter table public.expenses add column if not exists pagado numeric(18,2);
alter table public.expenses add column if not exists pagar_el date;
alter table public.expenses drop constraint if exists expenses_pagado_rango;
alter table public.expenses add constraint expenses_pagado_rango check (pagado is null or (pagado >= 0 and pagado <= valor)) not valid;
comment on column public.expenses.pagado is 'Lo que ya se pagó de este gasto; NULL = pagado completo.';
comment on column public.expenses.pagar_el is 'Cuándo se paga lo que falta (gasto por pagar o abonado).';
