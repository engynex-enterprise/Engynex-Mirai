-- v7 · V7-C · Lo mínimo de Supabase para aplicar las 56 migraciones de supabase/migrations sobre Postgres 17 estándar
-- ("línea histórica"). Se usa para: (1) generar la línea base 0001_baseline.sql, (2) comparar esquemas y (3) la base
-- "Supabase local" de los ensayos (V7-J) y de la E2E local. NO va en la base destino (allá: 0003_auth_better.sql).
--
-- Todo es `if not exists`: si un GoTrue o un storage-api locales ya crearon sus tablas, se usan las de ellos.
-- Solo trae las columnas que leen las migraciones (triggers sobre auth.users/auth.identities, my_account(),
-- my_sessions(), cancel_my_email_change(), ensure_email_identity(), las políticas de storage.objects y el job de cron).

-- ── auth (forma de GoTrue) ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  email_change_token_current varchar(255) default '',
  email_change_confirm_status smallint default 0,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  phone text,
  phone_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean not null default false
);

create table if not exists auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  email text generated always as (lower(identity_data ->> 'email')) stored,
  id uuid primary key default gen_random_uuid(),
  unique (provider_id, provider)
);

do $$
begin
  if to_regtype('auth.aal_level') is null then create type auth.aal_level as enum ('aal1', 'aal2', 'aal3'); end if;
end $$;

create table if not exists auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz,
  updated_at timestamptz,
  factor_id uuid,
  aal auth.aal_level,
  not_after timestamptz,
  refreshed_at timestamp,
  user_agent text,
  ip inet,
  tag text
);

-- Factores TOTP (los lee scripts/migrate/auth-from-supabase.ts).
create table if not exists auth.mfa_factors (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  friendly_name text,
  factor_type text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  secret text
);

create table if not exists auth.one_time_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_type text not null,
  token_hash text not null,
  relates_to text not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- ── storage (forma de storage-api) ──────────────────────────────────────────────────────────────────────────────
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  owner_id text,
  user_metadata jsonb
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;

-- ── cron (pg_cron no existe en Postgres estándar; pg_net tampoco) ───────────────────────────────────────────────
-- El script de migración salta `create extension pg_cron/pg_net` (20261031001000_notify.sql) y aquí quedan una tabla
-- y dos funciones que no hacen nada, solo para que esa migración y mirai_notify_cron_active() se creen. En la base
-- destino 0002_cloud_overrides.sql las reemplaza (el cron vive en el programador de la nube, §3.6).
create schema if not exists cron;
create table if not exists cron.job (
  jobid bigserial primary key,
  schedule text not null,
  command text not null,
  jobname text,
  active boolean not null default true
);

create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$
  insert into cron.job (schedule, command, jobname, active) values (schedule, command, job_name, false) returning jobid
$$;

create or replace function cron.unschedule(job_id bigint) returns boolean
language sql as $$ with d as (delete from cron.job where jobid = job_id returning 1) select exists (select 1 from d) $$;
