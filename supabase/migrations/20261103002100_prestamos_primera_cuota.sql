-- Fecha de la primera cuota, aparte de la fecha del préstamo ("me prestó el 1 de marzo y empiezo a pagar en junio").
-- Vacía = como antes: la primera cuota cae un periodo después del préstamo. Aditiva e idempotente.
alter table public.loans add column if not exists primera date;
comment on column public.loans.primera is 'Fecha de la primera cuota si no es un periodo después de inicio (null = un periodo después).';
