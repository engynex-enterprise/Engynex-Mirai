-- Mantenimiento de la plataforma: hogares sin integrantes (nadie los ve; restos de pruebas o cuentas eliminadas).
-- Solo cuentan y borran; los usa el panel /admin con la clave de servicio.
create or replace function public.count_orphan_households() returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from public.households h where not exists (select 1 from public.household_members m where m.household_id = h.id)
$$;
create or replace function public.delete_orphan_households() returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  with gone as (
    delete from public.households h where not exists (select 1 from public.household_members m where m.household_id = h.id) returning 1
  ) select count(*) into n from gone;
  return n;
end $$;
revoke all on function public.count_orphan_households() from public, anon, authenticated;
revoke all on function public.delete_orphan_households() from public, anon, authenticated;
grant execute on function public.count_orphan_households() to service_role;
grant execute on function public.delete_orphan_households() to service_role;
