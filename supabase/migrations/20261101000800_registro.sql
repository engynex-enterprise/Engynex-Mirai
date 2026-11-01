-- ¿Se pueden crear cuentas nuevas? (lo consulta la página de registro, sin sesión). Solo devuelve un sí o un no.
create or replace function public.registro_abierto() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select registro_abierto from public.platform_settings where id), true)
$$;
grant execute on function public.registro_abierto() to anon, authenticated;
