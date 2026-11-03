// Aplica las migraciones de supabase/migrations en orden (idempotente) usando SUPABASE_DB_URL.
// Con DATABASE_URL en el entorno aplica, en cambio, el esquema de la Postgres destino (v7, ver abajo).
// Uso: pnpm db:migrate (pruebas, lee .env.local de la raíz) · pnpm db:migrate:prod (producción, lee .env.produccion.local)
// Registra lo aplicado en public._mirai_migrations. Vive en packages/db; las migraciones siguen en supabase/migrations (raíz).
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

// v7: con DATABASE_URL en el entorno (Cloud SQL, RDS, Azure Flexible Server, CI) se aplica el esquema de la Postgres
// DESTINO (db/postgres: compat + Better Auth + línea base + overrides + 0004_* en adelante) con db-destino.mjs, no las
// migraciones crudas de Supabase (pg_cron/pg_net no existen allá). Se lee ANTES de .env.local, que nunca la define.
// Contraseñas de los roles: MIRAI_AUTHENTICATOR_PASSWORD y MIRAI_APP_PASSWORD. Nunca acepta un host de Supabase.
if (process.env.DATABASE_URL && !process.argv.includes('--supabase')) {
  const { assertSafeUrl, destino } = await import('./db-destino.mjs')
  const target = process.env.DATABASE_URL
  const u = assertSafeUrl(target, true)
  console.log(`Base destino: ${u.hostname}:${u.port || 5432}${u.pathname} (DATABASE_URL)`)
  await destino(target, { seed: !process.argv.includes('--no-seed') })
  process.exit(0)
}

const envFile = process.argv.includes('--prod') ? '.env.produccion.local' : '.env.local'
try { process.loadEnvFile?.(join(ROOT, envFile)) } catch { console.error(`No existe ${envFile} en la raíz del repositorio. Mientras pruebas y producción compartan base, usa pnpm db:migrate.`); process.exit(1) }
const url = process.env.SUPABASE_DB_URL
if (!url) { console.error(`Falta SUPABASE_DB_URL en ${envFile}`); process.exit(1) }
console.log(`Base de datos: ${new URL(url.replace(/^postgres(ql)?:/, 'http:')).username.split('.')[1] ?? 'local'} (${envFile})`)

const dir = join(ROOT, 'supabase/migrations')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query('create table if not exists public._mirai_migrations (name text primary key, applied_at timestamptz not null default now())')
await client.query('alter table public._mirai_migrations enable row level security')
const done = new Set((await client.query('select name from public._mirai_migrations')).rows.map(r => r.name))
const force = process.argv.includes('--reapply')
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  if (done.has(f) && !force) { console.log('✓', f); continue }
  const sql = readFileSync(join(dir, f), 'utf8')
  try {
    await client.query('begin')
    await client.query(sql)
    await client.query('insert into public._mirai_migrations(name) values ($1) on conflict (name) do update set applied_at = now()', [f])
    await client.query('commit')
    console.log('↑', f)
  } catch (e) {
    await client.query('rollback')
    console.error('✗', f, '\n', e.message, e.position ? `(posición ${e.position})` : '')
    process.exit(1)
  }
}
await client.end()
