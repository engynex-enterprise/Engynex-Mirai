-- v7 · V7-C · Compatibilidad con Supabase para una Postgres estándar (Cloud SQL, RDS, Azure Flexible Server o Docker).
-- Diseño: docs/arquitectura/v7-gcp-total.md §3.2 (D3). NUNCA se aplica en Supabase (allá todo esto ya existe).
--
-- Qué deja listo, sin tocar ni una de las 124 políticas RLS ni las 93 funciones `security definer`:
--   1. Los roles que usan las políticas y los `grant` de las migraciones: anon, authenticated, service_role,
--      authenticator (el que usa el PostgREST interno, §3.3) y mirai_app (la API). Sus contraseñas las pone el script
--      de migración desde MIRAI_AUTHENTICATOR_PASSWORD y MIRAI_APP_PASSWORD (nunca van en el SQL).
--   2. Los esquemas `extensions` (pgcrypto, como en Supabase: `extensions.digest`) y `auth` con auth.uid(), auth.role(),
--      auth.jwt() y auth.email() IDÉNTICAS a las de Supabase: leen `request.jwt.claims` / `request.jwt.claim.*`, que
--      ponen PostgREST (con el JWT interno) o la API con Kysely (`set_config(..., true)` por transacción).
--   3. Los permisos por defecto de Supabase sobre `public` (la RLS es la que filtra; sin estos grant, PostgREST y la API
--      responderían "permission denied" antes de llegar a la política).
--
-- No crea tablas de `auth`: en la base destino las crea 0003_auth_better.sql (Better Auth, V7-A) y en la "línea
-- histórica" (aplicar las 56 migraciones de supabase/migrations) las crea history/supabase_shim.sql o el GoTrue local.
-- Idempotente: se puede correr las veces que sea.

-- ── 1. Roles ────────────────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  -- Usuario de la API (Kysely, Better Auth, la escucha del gateway). En GCP puede ser un usuario IAM (otro nombre);
  -- en AWS y Azure Terraform no entra a Postgres: el rol nace aquí y su contraseña la pone el script de migración
  -- desde MIRAI_APP_PASSWORD (nunca en el SQL).
  if not exists (select 1 from pg_roles where rolname = 'mirai_app') then create role mirai_app login noinherit; end if;
end $$;

-- service_role salta la RLS como en Supabase. Si la plataforma no deja dar BYPASSRLS (Cloud SQL sin superusuario),
-- se sigue: el plan B de §3.2 es que service_role sea dueño de las tablas (los dueños saltan la RLS porque ninguna
-- tabla usa `force row level security`). La prueba de RLS revisa cuál de los dos quedó.
do $$
begin
  alter role service_role bypassrls;
exception when insufficient_privilege then
  raise notice 'service_role sin BYPASSRLS (la plataforma no lo permite): usa el plan B de §3.2 (service_role dueño).';
end $$;

-- PostgREST entra como authenticator y cambia de rol por petición (`set local role`).
grant anon, authenticated, service_role to authenticator;
-- La API cambia de rol por transacción (`set local role authenticated|service_role`, apps/api/src/core/db).
grant anon, authenticated, service_role to mirai_app;
do $$ begin execute format('grant connect on database %I to authenticator, mirai_app', current_database()); end $$;

-- Quien aplica las migraciones (postgres en Docker, el usuario de migración en la nube) también cambia de rol por
-- transacción: la API con Kysely hace `set local role authenticated|service_role` (apps/api/src/core/db).
do $$
begin
  if not (select rolsuper from pg_roles where rolname = current_user) then
    execute format('grant anon, authenticated, service_role to %I', current_user);
  end if;
end $$;

-- ── 2. Esquemas y extensiones ───────────────────────────────────────────────────────────────────────────────────
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Igual que Supabase: lo que no lleva esquema busca en public y luego en extensions (digest, gen_salt…).
do $$
begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end $$;
set search_path = "$user", public, extensions;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Idénticas a las de Supabase (GoTrue). `request.jwt.claim.sub` es la forma vieja (PostgREST < 9 y
-- set_config('request.jwt.claim.sub') de 20261103003400_planes_automat.sql); `request.jwt.claims` la actual.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.email(), auth.jwt() to anon, authenticated, service_role;

-- ── 3. Permisos por defecto de Supabase sobre public ───────────────────────────────────────────────────────────
-- La RLS decide qué filas; estos grant solo dejan llegar a la tabla (como en cualquier proyecto de Supabase).
-- 20261103001400_seguridad.sql después quita truncate/trigger/references a anon y authenticated.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- Ojo: aquí NO va `grant all on all … in schema public`. Este archivo corre antes que todo, pero si se vuelve a correr
-- sobre una base ya migrada desharía los `revoke execute … from anon` de las migraciones.

-- PostgREST recarga su caché de esquema con `notify pgrst, 'reload schema'` (lo manda el script después de migrar).
comment on schema auth is 'v7: compatibilidad con Supabase (auth.uid/role/jwt/email) + tablas de Better Auth (0003).';
