-- v7 · V7-C · Copia TAL CUAL de apps/api/src/modules/auth/sql/auth-schema.sql (V7-A, fuente única). La aplica
-- packages/db/scripts/db-destino.mjs entre 0000_compat y la línea base; si el original cambia, el script avisa y usa el original.

-- Esquema `auth` para el auth propio con Better Auth (v7, frente V7-A; diseño en docs/arquitectura/v7-gcp-total.md §3.1.3).
-- Solo para la Postgres destino (Cloud SQL, RDS, Azure o Docker local). NUNCA se aplica en Supabase.
-- V7-C lo incluye tal cual en db/postgres/0003_auth_better.sql (después de 0000_compat.sql y antes de la línea base de
-- `public`, porque las 44 claves foráneas de `public` apuntan a auth.users). Idempotente.
--
-- Regla: los nombres que ya existen en Supabase se conservan (auth.users, auth.sessions, email_confirmed_at,
-- last_sign_in_at, raw_user_meta_data, raw_app_meta_data) para que handle_new_user(), on_auth_user_change(),
-- my_account() y las claves foráneas sigan iguales. Better Auth los usa con `fields` (snake_case) en auth.config.ts.

create schema if not exists auth;

-- ── Personas (modelo `user` de Better Auth; misma tabla y mismos UUID que Supabase) ──
create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_verified boolean not null default false,
  -- Compatibilidad con Supabase: lo mantiene el trigger users_compat (no lo escribe Better Auth).
  email_confirmed_at timestamptz,
  name text not null default '',
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  -- Lo lee handle_new_user() (nombre, acepta_version, ref, avatar_url) igual que en Supabase.
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  banned boolean not null default false,
  ban_reason text,
  ban_expires timestamptz,
  two_factor_enabled boolean not null default false,
  -- El TOTP de Supabase no se pudo migrar: al entrar se le pide activarlo otra vez (§3.1.7).
  mfa_reactivar boolean not null default false,
  is_anonymous boolean not null default false
);
-- Supabase guarda el correo en minúsculas; Better Auth también lo normaliza. Un correo = una cuenta.
create unique index if not exists users_email_key on auth.users (lower(email)) where email is not null;

-- ── Sesiones (una por dispositivo: listar y cerrar una, como my_sessions/revoke_my_session) ──
create table if not exists auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- aal1 / aal2 (segundo factor verificado). Va en request.jwt.claims igual que en Supabase.
  aal text not null default 'aal1',
  -- Cómo entró: password | magiclink | oauth | otp (amr de Supabase; "entraste hace poco" para quitar métodos).
  amr text
);
create unique index if not exists sessions_token_key on auth.sessions (token);
create index if not exists sessions_user_idx on auth.sessions (user_id);

-- ── Formas de entrar (reemplaza auth.identities y auth.users.encrypted_password) ──
create table if not exists auth.accounts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- `credential`: el id de la persona; `google`: el `sub` de Google (identities.provider_id en Supabase).
  account_id text not null,
  provider_id text not null,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  -- bcrypt ($2a$/$2b$, el mismo hash de Supabase: nadie cambia su clave).
  password text,
  -- Correo de la cuenta de Google (Perfil › Cuentas conectadas). Lo llena la API (id_token) o la migración.
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists accounts_provider_key on auth.accounts (provider_id, account_id);
create index if not exists accounts_user_idx on auth.accounts (user_id);

-- ── Enlaces y códigos de un solo uso (enlace mágico, verificar correo, recuperar clave, cambio de correo, 2FA) ──
create table if not exists auth.verifications (
  -- texto: Better Auth a veces reserva filas con un id propio (no UUID).
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists verifications_identifier_idx on auth.verifications (identifier);

-- ── Segundo factor (TOTP + códigos de respaldo, cifrados con BETTER_AUTH_SECRET) ──
create table if not exists auth.two_factors (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  secret text not null,
  backup_codes text not null,
  verified boolean not null default true,
  failed_verification_count integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists two_factors_user_key on auth.two_factors (user_id);

-- ── Límites de intentos de Better Auth (rateLimit.storage = "database"; sirve con varias instancias) ──
create table if not exists auth.rate_limits (
  id text primary key default gen_random_uuid()::text,
  key text not null,
  count integer not null default 0,
  last_request bigint not null default 0
);
create unique index if not exists rate_limits_key on auth.rate_limits (key);

-- ── Compatibilidad con Supabase ──
-- email_confirmed_at sigue a email_verified (lo leen my_account(), la consola y el script de vuelta atrás).
create or replace function auth.users_compat() returns trigger language plpgsql as $$
begin
  if new.email_verified and new.email_confirmed_at is null then new.email_confirmed_at := now(); end if;
  if not new.email_verified then new.email_confirmed_at := null; end if;
  new.email := lower(new.email);
  return new;
end $$;
drop trigger if exists users_compat on auth.users;
create trigger users_compat before insert or update of email, email_verified on auth.users
  for each row execute function auth.users_compat();

-- Cada inicio de sesión nuevo actualiza last_sign_in_at (dispara on_auth_user_change → evento "inicio", como hoy).
create or replace function auth.sessions_last_sign_in() returns trigger language plpgsql as $$
begin
  update auth.users set last_sign_in_at = new.created_at where id = new.user_id;
  return new;
end $$;
drop trigger if exists sessions_last_sign_in on auth.sessions;
create trigger sessions_last_sign_in after insert on auth.sessions
  for each row execute function auth.sessions_last_sign_in();
