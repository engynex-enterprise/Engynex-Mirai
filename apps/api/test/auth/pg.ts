// Postgres 17 en Docker para las pruebas del auth propio (V7-A). NUNCA la base compartida.
//
//   docker run -d --name mirai-auth-pg -e POSTGRES_PASSWORD=mirai -p 127.0.0.1:55433:5432 postgres:17-alpine
//   MIRAI_TEST_PG_URL=postgres://postgres:mirai@127.0.0.1:55433/postgres pnpm --filter api test test/auth
//
// Sin MIRAI_TEST_PG_URL estas pruebas se saltan (CI sin Docker). Cada archivo crea su propia base y la borra al final.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import pg from "pg"
import { createAuthKysely, type AuthKysely } from "../../src/modules/auth/auth-db"

export const PG_URL = process.env.MIRAI_TEST_PG_URL ?? ""
export const hasPg = !!PG_URL

const SCHEMA = readFileSync(join(__dirname, "../../src/modules/auth/sql/auth-schema.sql"), "utf8")

/** Lo mínimo de `public` (igual que las migraciones de Supabase) para probar que handle_new_user() sigue sirviendo. */
export const PUBLIC_MIN = `
create table if not exists public.profiles (id uuid primary key references auth.users(id) on delete cascade, email text, nombre text, avatar_url text);
create table if not exists public.user_preferences (user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists public.consents (id bigserial primary key, user_id uuid not null references auth.users(id) on delete cascade, document text not null, version text not null, accepted_at timestamptz not null default now());
create table if not exists public.platform_settings (id boolean primary key default true, registro_abierto boolean not null default true);
insert into public.platform_settings default values on conflict do nothing;
create table if not exists public.account_events (id bigserial primary key, user_id uuid not null, kind text not null, detail jsonb, ip text, user_agent text, created_at timestamptz not null default now());
create or replace function public.registro_abierto() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select registro_abierto from public.platform_settings where id), true) $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, nombre, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nombre', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'))
  on conflict (id) do nothing;
  insert into public.user_preferences(user_id) values (new.id) on conflict do nothing;
  if (new.raw_user_meta_data->>'acepta_version') is not null then
    insert into public.consents(user_id, document, version)
    values (new.id, 'terminos', new.raw_user_meta_data->>'acepta_version'), (new.id, 'privacidad', new.raw_user_meta_data->>'acepta_version');
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
`

export type TestDb = { url: string; db: AuthKysely; pool: pg.Pool; sql: (q: string, p?: unknown[]) => Promise<pg.QueryResult>; drop: () => Promise<void> }

/** Crea una base nueva con el esquema `auth` (y lo mínimo de `public`). */
export async function freshDb(name: string): Promise<TestDb> {
  const admin = new pg.Client({ connectionString: PG_URL })
  await admin.connect()
  const db = `mirai_${name}_${Math.random().toString(36).slice(2, 8)}`
  await admin.query(`create database ${db}`)
  await admin.end()
  const url = PG_URL.replace(/\/[^/]*$/, `/${db}`)
  const { db: k, pool } = createAuthKysely(url)
  await pool.query(SCHEMA)
  await pool.query(PUBLIC_MIN)
  return {
    url,
    db: k,
    pool,
    sql: (q, p) => pool.query(q, p as unknown[]),
    drop: async () => {
      await k.destroy().catch(() => undefined)
      const a = new pg.Client({ connectionString: PG_URL })
      await a.connect()
      await a.query(`drop database if exists ${db} with (force)`)
      await a.end()
    },
  }
}
