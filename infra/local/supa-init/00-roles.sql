-- Perfil "supa" (Supabase local): roles que GoTrue y storage-api esperan encontrar, como en un proyecto de Supabase.
-- Corre una sola vez, al crear el volumen de supa-db. Valores solo para Docker local.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'mirai-local-authenticator';
grant anon, authenticated, service_role to authenticator;

create role supabase_auth_admin login noinherit createrole password 'mirai-local';
create role supabase_storage_admin login noinherit createrole password 'mirai-local';
grant anon, authenticated, service_role to supabase_storage_admin;
grant create on database mirai to supabase_auth_admin, supabase_storage_admin;

create schema auth authorization supabase_auth_admin;
create schema storage authorization supabase_storage_admin;
create schema extensions;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
grant usage on schema auth, storage, extensions to anon, authenticated, service_role;
alter role supabase_auth_admin set search_path = auth, extensions;
alter role supabase_storage_admin set search_path = storage, extensions;
alter database mirai set search_path = "$user", public, extensions;
