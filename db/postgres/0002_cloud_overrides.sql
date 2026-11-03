-- v7 · V7-C · Lo que cambia en la base destino respecto a Supabase (docs/arquitectura/v7-gcp-total.md §1.7, §3.5, §3.6).
-- Corre después de la línea base (o de las 56 migraciones en la línea histórica). Idempotente. NUNCA en Supabase.
--
--   1. Cron: pg_cron y pg_net no existen en Postgres estándar. El reloj vive en el programador de la nube (Cloud
--      Scheduler / EventBridge / Container Apps Job → POST /v1/jobs/notify/tick). mirai_schedule_notify() queda como
--      aviso y mirai_notify_cron_active() lee el latido platform_settings.cron_horario_visto (< 2 h).
--   2. Tiempo real: sin publicación supabase_realtime; triggers pg_notify('mirai_live') que escucha el gateway
--      (apps/api MODE=realtime, REALTIME_PG_LISTEN=1).
--   3. Archivos: las políticas de storage.objects no se llevan (la autorización la hace la API con ObjectStore, §3.4).
--   4. auth.users: el alta (handle_new_user) y los cambios de correo / último ingreso siguen con los mismos triggers,
--      sirvan las tablas de GoTrue o las de Better Auth (0003_auth_better.sql).

-- ── 1. Cron ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.mirai_schedule_notify(site_url text, cron_secret text)
returns text language plpgsql security definer set search_path = public as $$
begin
  return 'Sin cambios: el cron vive en el programador de la nube (POST /v1/jobs/notify/tick).';
end $$;
revoke all on function public.mirai_schedule_notify(text, text) from public, anon, authenticated;

create or replace function public.mirai_notify_cron_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select cron_horario_visto > now() - interval '2 hours' from public.platform_settings where id), false) $$;
revoke all on function public.mirai_notify_cron_active() from public, anon, authenticated;
grant execute on function public.mirai_notify_cron_active() to service_role;

drop schema if exists cron cascade;

-- ── 2. Tiempo real ──────────────────────────────────────────────────────────────────────────────────────────────
drop publication if exists supabase_realtime;
select public.mirai_live_notify_install(true);

-- ── 3. Archivos ─────────────────────────────────────────────────────────────────────────────────────────────────
drop schema if exists storage cascade;

-- ── 4. auth.users ───────────────────────────────────────────────────────────────────────────────────────────────
-- Mismo comportamiento que 20261103001600_cuenta_titularidad.sql, pero sin suponer la columna encrypted_password
-- (Better Auth guarda la clave en auth.accounts; sus eventos de contraseña los pone 0003_auth_better.sql).
create or replace function public.on_auth_user_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare n jsonb := to_jsonb(new); o jsonb := to_jsonb(old);
begin
  begin
    if new.email is distinct from old.email then
      update public.profiles set email = new.email where id = new.id;
      perform public.log_account_event(new.id, 'correo_cambiado', jsonb_build_object('antes', old.email, 'despues', new.email));
    end if;
    if n ? 'encrypted_password' and (n ->> 'encrypted_password') is distinct from (o ->> 'encrypted_password') then
      perform public.log_account_event(new.id, 'contrasena', jsonb_build_object('accion',
        case when coalesce(n ->> 'encrypted_password', '') = '' then 'quitada'
             when coalesce(o ->> 'encrypted_password', '') = '' then 'creada' else 'cambiada' end));
    end if;
    if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
      perform public.log_account_event(new.id, 'inicio', '{}');
    end if;
  exception when others then null;
  end;
  return new;
end $$;
revoke execute on function public.on_auth_user_change() from public, anon, authenticated;

do $$
declare has_pwd boolean;
begin
  if to_regclass('auth.users') is null then
    raise notice 'Sin auth.users todavía: aplica 0003_auth_better.sql y vuelve a correr este archivo.';
    return;
  end if;
  execute 'drop trigger if exists on_auth_user_created on auth.users';
  execute 'create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()';
  select exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') into has_pwd;
  execute 'drop trigger if exists on_auth_user_change on auth.users';
  execute format('create trigger on_auth_user_change after update of %s on auth.users for each row execute function public.on_auth_user_change()',
    case when has_pwd then 'email, encrypted_password, last_sign_in_at' else 'email, last_sign_in_at' end);
end $$;

-- ── 5. La API (mirai_app) y las tablas de Better Auth ───────────────────────────────────────────────────────────
-- Better Auth (V7-A) entra con AUTH_DATABASE_URL = el usuario de la API y lee/escribe el esquema auth directamente.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mirai_app') then
    grant usage on schema public, extensions, auth to mirai_app;
    grant select, insert, update, delete on all tables in schema auth to mirai_app;
    grant usage, select on all sequences in schema auth to mirai_app;
    alter default privileges in schema auth grant select, insert, update, delete on tables to mirai_app;
  end if;
end $$;
