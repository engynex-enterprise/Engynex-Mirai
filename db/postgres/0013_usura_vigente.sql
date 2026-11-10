-- Tasa de usura vigente desde la tabla de referencia (ref_usury_rate), mes a mes.
-- Antes: el cron diario copiaba a cada libro la ÚLTIMA tasa publicada, aunque fuera la del mes siguiente (la
-- Superfinanciera la publica antes de que empiece a regir), y no guardaba de dónde salió. Ahora:
--   · ref_usury_rate guarda la fuente (resolución) de cada tasa;
--   · usura_vigente(fecha) devuelve la de consumo y ordinario que rige ese día (la más reciente con desde <= fecha);
--   · los libros con «automático» (usura_auto) quedan con la vigente hoy, y el cron solo aplica la vigente.
-- Noviembre de 2026: 28,34 % E.A. (interés bancario corriente 18,89 % × 1,5), Superintendencia Financiera,
-- Resolución 1707 de 2026, vigente del 1 al 30 de noviembre (verificado por el subagente finanzas-colombia).
-- Aditiva: una columna opcional, una función y datos; no cambia lo que un libro tenga escrito a mano (usura_auto = false).
alter table public.ref_usury_rate add column if not exists fuente text;

insert into public.ref_usury_rate (desde, hasta, modalidad, tasa_ea, fuente)
values ('2026-11-01', '2026-11-30', 'consumo', 28.34, 'Superintendencia Financiera, Resolución 1707 de 2026')
on conflict (desde, modalidad) do update set hasta = excluded.hasta, tasa_ea = excluded.tasa_ea, fuente = excluded.fuente;

create or replace function public.usura_vigente(p_fecha date default current_date) returns numeric
    language sql stable
    set search_path to 'public'
    as $$
  select tasa_ea from public.ref_usury_rate where modalidad = 'consumo' and desde <= p_fecha order by desde desc limit 1
$$;
grant execute on function public.usura_vigente(date) to anon, authenticated, service_role;

update public.book_settings set usura = public.usura_vigente()
where usura_auto is not false and public.usura_vigente() is not null and usura is distinct from public.usura_vigente();

-- Los libros nuevos nacen con la usura vigente (antes, con 26 fijo).
alter table public.book_settings alter column usura set default coalesce(public.usura_vigente(current_date), 26);
