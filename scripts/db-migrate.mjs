// Aplica las migraciones de supabase/migrations en orden (idempotente) usando SUPABASE_DB_URL.
// Uso: npm run db:migrate   ·   Registra lo aplicado en public._mirai_migrations.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

process.loadEnvFile?.('.env.local')
const url = process.env.SUPABASE_DB_URL
if (!url) { console.error('Falta SUPABASE_DB_URL en .env.local'); process.exit(1) }

const dir = 'supabase/migrations'
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
