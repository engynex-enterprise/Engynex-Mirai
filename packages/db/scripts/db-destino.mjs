// v7 · V7-C · Esquema de la Postgres destino (Cloud SQL, RDS, Azure o Docker local). Guía: infra/local/README.md.
//
//   node packages/db/scripts/db-destino.mjs historia  --url <postgres://…>   compat + shim + las 56 migraciones
//   node packages/db/scripts/db-destino.mjs destino   --url <postgres://…>   compat + auth (Better Auth) + línea base + datos iniciales + overrides
//                                                                         (--no-seed: sin datos iniciales, p. ej. antes de traer los de Supabase)
//   node packages/db/scripts/db-destino.mjs baseline  --url <postgres://…>   regenera db/postgres/0001_baseline.sql (servidor de pruebas)
//   node packages/db/scripts/db-destino.mjs diff      --url <postgres://…>   historia+overrides vs destino (solo `public`)
//   node packages/db/scripts/db-destino.mjs preparar  --url <postgres://…>   corte: solo compat + auth (scripts/migrate/dump-restore.sh)
//   node packages/db/scripts/db-destino.mjs cierre    --url <postgres://…>   corte: overrides + historia registrada + authenticator
//
// Opciones: --overrides (historia: aplica 0002 al final) · --live (historia: instala los triggers pg_notify sin 0002)
//           --skip-shim (historia: GoTrue/storage-api ya crearon auth y storage) · --allow-remote (una base que no está
//           en este computador: Cloud SQL por el proxy, un ensayo en la nube) · --authenticator-password-env VAR
//
// Seguridad: NUNCA lee .env.local; sin --allow-remote solo acepta localhost/127.0.0.1/servicios de Docker, y rechaza
// siempre cualquier host de Supabase (*.supabase.co / *.supabase.com / pooler). La contraseña de `authenticator` sale
// de una variable de entorno (por defecto la local de Docker), nunca del SQL ni de la consola.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const DIR = join(ROOT, "db/postgres")
const MIGRATIONS = join(ROOT, "supabase/migrations")
/** Auth propio (V7-A): la fuente única es su archivo; aquí se aplica tal cual como 0003_auth_better.sql. */
const AUTH_SRC = join(ROOT, "apps/api/src/modules/auth/sql/auth-schema.sql")
const AUTH_COPY = join(DIR, "0003_auth_better.sql")
const AUTH_SQL = [AUTH_SRC, AUTH_COPY]
/** La copia de db/postgres debe ser el original de V7-A + su encabezado; si no, se avisa (se usa el original). */
function authDrift() {
  if (existsSync(AUTH_SRC) && existsSync(AUTH_COPY) && !readFileSync(AUTH_COPY, "utf8").endsWith(readFileSync(AUTH_SRC, "utf8")))
    console.warn("! db/postgres/0003_auth_better.sql quedó distinta de apps/api/src/modules/auth/sql/auth-schema.sql: cópiala de nuevo.")
}
/** Lo que no existe en Postgres estándar (pg_cron, pg_net): se salta con un comentario (§1.7). */
const SKIP = [/create\s+extension\s+if\s+not\s+exists\s+pg_cron\s*;/gi, /create\s+extension\s+if\s+not\s+exists\s+pg_net\s*;/gi]

const args = process.argv.slice(2)
const cmd = args[0]
const flag = (f) => args.includes(f)
const opt = (f) => {
  const i = args.indexOf(f)
  return i >= 0 ? args[i + 1] : undefined
}

export function assertSafeUrl(url, allowRemote = false) {
  if (!url) throw new Error("Falta --url postgres://… (o MIRAI_LOCAL_DB_URL)")
  const u = new URL(url.replace(/^postgres(ql)?:/, "http:"))
  if (/supabase\.(co|com)$|pooler\.supabase/i.test(u.hostname)) throw new Error("Esta herramienta nunca toca Supabase. Usa una base local o la destino.")
  const local = ["localhost", "127.0.0.1", "::1", "host.docker.internal", "db", "supa-db"].includes(u.hostname)
  if (!local && !allowRemote) throw new Error(`La base ${u.hostname} no es local. Si es la destino en la nube, agrega --allow-remote.`)
  return u
}

const label = (url) => {
  const u = new URL(url.replace(/^postgres(ql)?:/, "http:"))
  return `${u.hostname}:${u.port || 5432}${u.pathname}`
}

async function connect(url) {
  const c = new pg.Client({ connectionString: url, application_name: "mirai-db-destino" })
  await c.connect()
  return c
}

/** Corre un archivo en su propia conexión y transacción (los volcados cambian search_path de la sesión). */
async function runSql(url, name, sql) {
  const c = await connect(url)
  try {
    await c.query("begin")
    await c.query(sql)
    await c.query("create table if not exists public._mirai_migrations (name text primary key, applied_at timestamptz not null default now())")
    await c.query("alter table public._mirai_migrations enable row level security")
    await c.query("revoke all on public._mirai_migrations from anon, authenticated")
    await c.query("insert into public._mirai_migrations(name) values ($1) on conflict (name) do update set applied_at = now()", [name])
    await c.query("commit")
    console.log("↑", name)
  } catch (e) {
    await c.query("rollback").catch(() => {})
    throw new Error(`✗ ${name}: ${e.message}${e.position ? ` (posición ${e.position})` : ""}`)
  } finally {
    await c.end()
  }
}

async function applied(url) {
  const c = await connect(url)
  try {
    const r = await c.query("select name from public._mirai_migrations").catch(() => ({ rows: [] }))
    return new Set(r.rows.map((x) => x.name))
  } finally {
    await c.end()
  }
}

export const historySql = (name) => {
  let sql = readFileSync(join(MIGRATIONS, name), "utf8")
  for (const re of SKIP) sql = sql.replace(re, "-- (v7) saltado: no existe en Postgres estándar")
  return sql
}

/**
 * Contraseñas de los roles con login que crea 0000_compat.sql, desde variables (nunca en el SQL ni en la consola):
 *   authenticator ← MIRAI_AUTHENTICATOR_PASSWORD (o la variable de --authenticator-password-env)
 *   mirai_app     ← MIRAI_APP_PASSWORD           (o la variable de --app-password-env)
 * En una base local sin la variable quedan las de Docker; en una remota, sin la variable no se toca (p. ej. GCP con
 * usuario IAM, o un rol que ya tiene su contraseña).
 */
async function setAuthenticatorPassword(url) {
  const local = ["localhost", "127.0.0.1", "::1", "db", "supa-db", "host.docker.internal"].includes(new URL(url.replace(/^postgres(ql)?:/, "http:")).hostname)
  const roles = [
    ["authenticator", opt("--authenticator-password-env") ?? "MIRAI_AUTHENTICATOR_PASSWORD", "mirai-local-authenticator"],
    ["mirai_app", opt("--app-password-env") ?? "MIRAI_APP_PASSWORD", "mirai-local-app"],
  ]
  const c = await connect(url)
  try {
    for (const [role, env, def] of roles) {
      const pwd = process.env[env] ?? (local ? def : undefined)
      if (!pwd) {
        console.log(`· ${role}: sin ${env}, la contraseña no cambia`)
        continue
      }
      const { rows } = await c.query("select quote_literal($1) as q", [pwd])
      await c.query(`alter role ${role} password ${rows[0].q}`)
    }
  } finally {
    await c.end()
  }
}

/** Línea histórica: lo que tiene Supabase hoy, sobre Postgres 17. */
export async function historia(url, o = {}) {
  await runSql(url, "v7/0000_compat.sql", readFileSync(join(DIR, "0000_compat.sql"), "utf8"))
  if (!o.skipShim) await runSql(url, "v7/history/supabase_shim.sql", readFileSync(join(DIR, "history/supabase_shim.sql"), "utf8"))
  const done = await applied(url)
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue
    await runSql(url, f, historySql(f))
  }
  if (o.overrides) await runSql(url, "v7/0002_cloud_overrides.sql", readFileSync(join(DIR, "0002_cloud_overrides.sql"), "utf8"))
  else if (o.live) {
    const c = await connect(url)
    await c.query("select public.mirai_live_notify_install(true)").finally(() => c.end())
    console.log("↑ mirai_live_notify_install(true)")
  }
  await reload(url)
}

/** Base destino: compat → auth (Better Auth) → línea base → overrides. */
export async function destino(url, o = {}) {
  authDrift()
  const auth = AUTH_SQL.find((p) => existsSync(p))
  if (!existsSync(join(DIR, "0001_baseline.sql"))) throw new Error("Falta db/postgres/0001_baseline.sql: corre `baseline` primero.")
  const done = await applied(url)
  const steps = [
    ["v7/0000_compat.sql", join(DIR, "0000_compat.sql")],
    ...(auth ? [["v7/0003_auth_better.sql", auth]] : []),
    ["v7/0001_baseline.sql", join(DIR, "0001_baseline.sql")],
    ...(o.seed === false ? [] : [["v7/0001_seed.sql", join(DIR, "0001_seed.sql")]]),
  ]
  if (!auth) console.warn("! Sin el esquema de Better Auth (V7-A): auth.users no existe y la línea base no tendrá a qué apuntar.")
  for (const [name, file] of steps) {
    if ((name === "v7/0001_baseline.sql" || name === "v7/0001_seed.sql") && done.has(name)) {
      console.log("✓", name)
      continue
    }
    await runSql(url, name, readFileSync(file, "utf8"))
  }
  await runSql(url, "v7/0002_cloud_overrides.sql", readFileSync(join(DIR, "0002_cloud_overrides.sql"), "utf8"))
  // Migraciones nuevas de la v7 (0004_*.sql en adelante), en orden.
  for (const f of readdirSync(DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f) && f >= "0004").sort()) {
    if (!done.has(`v7/${f}`)) await runSql(url, `v7/${f}`, readFileSync(join(DIR, f), "utf8"))
  }
  await setAuthenticatorPassword(url)
  await reload(url)
}

/** Corte (scripts/migrate/dump-restore.sh), paso 1: compat + auth de Better Auth, antes de la línea base por secciones. */
export async function preparar(url) {
  authDrift()
  const auth = AUTH_SQL.find((p) => existsSync(p))
  await runSql(url, "v7/0000_compat.sql", readFileSync(join(DIR, "0000_compat.sql"), "utf8"))
  if (auth) await runSql(url, "v7/0003_auth_better.sql", readFileSync(auth, "utf8"))
  else throw new Error("Falta el esquema de Better Auth (V7-A): no hay dónde poner las personas.")
  // Igual que la cabecera de la línea base: mientras pg_restore crea tablas y funciones, sin los permisos por defecto
  // de 0000_compat (si no, cada función quedaría ejecutable por anon). `cierre` pone los de la línea base.
  const c = await connect(url)
  try {
    for (const k of ["TABLES", "SEQUENCES", "FUNCTIONS"]) await c.query(`alter default privileges in schema public revoke all on ${k} from anon, authenticated, service_role`)
  } finally {
    await c.end()
  }
}

/** Los ALTER DEFAULT PRIVILEGES finales de la línea base (los de la línea histórica). */
function baselineDefaultAcl() {
  return readFileSync(join(DIR, "0001_baseline.sql"), "utf8").split("\n").filter((l) => l.startsWith("ALTER DEFAULT PRIVILEGES IN SCHEMA public ") && !l.includes(" REVOKE ALL ON "))
}

/** Corte, último paso: overrides (triggers de auth.users y en vivo), historia registrada, authenticator y recarga. */
export async function cierre(url) {
  await runSql(url, "v7/0002_cloud_overrides.sql", readFileSync(join(DIR, "0002_cloud_overrides.sql"), "utf8"))
  const c = await connect(url)
  try {
    const names = ["v7/0001_baseline.sql", ...readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))]
    await c.query("insert into public._mirai_migrations(name) select unnest($1::text[]) on conflict (name) do nothing", [names])
    for (const l of baselineDefaultAcl()) await c.query(l)
    await c.query("analyze")
  } finally {
    await c.end()
  }
  await setAuthenticatorPassword(url)
  await reload(url)
}

async function reload(url) {
  const c = await connect(url)
  await c.query("notify pgrst, 'reload schema'").finally(() => c.end())
}

// ── Herramientas de Postgres (pg_dump) desde un contenedor: este computador no tiene psql/pg_dump ─────────────────
export function pgTool(tool, url, toolArgs, { input } = {}) {
  const u = new URL(url.replace(/^postgres(ql)?:/, "http:"))
  const host = ["localhost", "127.0.0.1", "::1"].includes(u.hostname) ? "host.docker.internal" : u.hostname
  const env = ["-e", `PGHOST=${host}`, "-e", `PGPORT=${u.port || 5432}`, "-e", `PGUSER=${decodeURIComponent(u.username)}`, "-e", `PGDATABASE=${u.pathname.slice(1)}`, "-e", "PGPASSWORD"]
  return execFileSync("docker", ["run", "--rm", "-i", ...env, "postgres:17-alpine", tool, ...toolArgs], {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password) },
    input,
    maxBuffer: 512 * 1024 * 1024,
  })
}

/** Volcado del esquema `public` listo para comparar o para la línea base (sin dueños; sin el rol del servidor). */
export function dumpPublic(url) {
  const raw = pgTool("pg_dump", url, ["--schema-only", "--schema=public", "--exclude-table=public._mirai_migrations", "--no-owner", "--no-comments"]).toString("utf8")
  return normalizeDump(raw)
}

export function normalizeDump(raw) {
  return raw
    .split("\n")
    .filter((l) => !l.startsWith("\\")) // \restrict / \unrestrict (psql)
    .filter((l) => !/^-- Dumped (from|by)/.test(l))
    .filter((l) => !/ TO postgres;$/.test(l) && !/ FROM postgres;$/.test(l))
    .map((l) => l.replace(/^CREATE SCHEMA public;$/, "CREATE SCHEMA IF NOT EXISTS public;"))
    .map((l) => l.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE \S+ IN SCHEMA public/, "ALTER DEFAULT PRIVILEGES IN SCHEMA public"))
    .join("\n")
}

async function recreateDb(adminUrl, name) {
  const c = await connect(adminUrl)
  try {
    await c.query(`drop database if exists ${name} with (force)`)
    await c.query(`create database ${name}`)
  } finally {
    await c.end()
  }
  const u = new URL(adminUrl)
  u.pathname = `/${name}`
  return u.toString()
}

/** Genera db/postgres/0001_baseline.sql desde una base temporal con la línea histórica + overrides. */
async function baseline(adminUrl) {
  const tmp = await recreateDb(adminUrl, "mirai_v7_baseline")
  await historia(tmp, { overrides: true })
  const header = [
    "-- v7 · V7-C · Línea base del esquema `public` para la Postgres destino (docs/arquitectura/v7-gcp-total.md §3.7).",
    "-- GENERADA: `node packages/db/scripts/db-destino.mjs baseline --url …` = pg_dump --schema-only --schema=public de",
    "-- 0000_compat + history/supabase_shim + las 56 migraciones de supabase/migrations + 0002_cloud_overrides en Postgres 17.",
    "-- No se edita a mano: los cambios nuevos van en db/postgres/0004_*.sql. Corre después de 0000_compat y 0003_auth_better.",
    "",
    "-- Mientras se crea, sin los permisos por defecto de 0000_compat: los GRANT/REVOKE de abajo son exactamente los de la",
    "-- línea histórica (si no, cada función quedaría ejecutable por anon). Al final del archivo se vuelven a poner.",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;",
    "",
  ].join("\n")
  const migrations = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()
  const footer = `\n-- Historia ya incluida en esta línea base.\nCREATE TABLE IF NOT EXISTS public._mirai_migrations (name text primary key, applied_at timestamptz not null default now());\nINSERT INTO public._mirai_migrations(name) VALUES\n${migrations.map((m) => `  ('${m}')`).join(",\n")}\nON CONFLICT (name) DO NOTHING;\n`
  writeFileSync(join(DIR, "0001_baseline.sql"), header + dumpPublic(tmp) + footer)
  // Datos que siembran las migraciones (planes, ref_*, ajustes de la plataforma): en una base recién migrada son las
  // únicas filas. Solo para instalaciones nuevas (local, CI, un ambiente vacío); el corte trae los datos de Supabase.
  const seed = pgTool("pg_dump", tmp, ["--data-only", "--schema=public", "--exclude-table=public._mirai_migrations", "--inserts", "--on-conflict-do-nothing", "--no-owner"]).toString("utf8")
  const seedHeader = [
    "-- v7 · V7-C · Datos iniciales de una base destino NUEVA (planes, tablas ref_* con su fuente, platform_settings…).",
    "-- GENERADO junto con 0001_baseline.sql: son las filas que dejan las 56 migraciones en una base vacía. Idempotente",
    "-- (ON CONFLICT DO NOTHING). No se aplica en el corte desde Supabase: allá los datos llegan con scripts/migrate.",
    "",
  ].join("\n")
  writeFileSync(join(DIR, "0001_seed.sql"), seedHeader + normalizeDump(seed))
  await dropDb(adminUrl, "mirai_v7_baseline")
  console.log("✓ db/postgres/0001_baseline.sql")
}

async function dropDb(adminUrl, name) {
  const c = await connect(adminUrl)
  await c.query(`drop database if exists ${name} with (force)`).finally(() => c.end())
}

/** Diferencia de `public`: (historia + overrides) vs (destino). Debe salir vacía (o solo lo esperado). */
async function diff(adminUrl) {
  const h = await recreateDb(adminUrl, "mirai_v7_cmp_historia")
  const d = await recreateDb(adminUrl, "mirai_v7_cmp_destino")
  await historia(h, { overrides: true })
  await destino(d)
  const a = dumpPublic(h).split("\n")
  const b = dumpPublic(d).split("\n")
  const sa = new Set(a)
  const sb = new Set(b)
  const onlyH = a.filter((l) => l.trim() && !sb.has(l))
  const onlyD = b.filter((l) => l.trim() && !sa.has(l))
  await dropDb(adminUrl, "mirai_v7_cmp_historia")
  await dropDb(adminUrl, "mirai_v7_cmp_destino")
  console.log(`Solo en historia: ${onlyH.length} líneas · solo en destino: ${onlyD.length} líneas`)
  for (const l of onlyH.slice(0, 40)) console.log("  - " + l)
  for (const l of onlyD.slice(0, 40)) console.log("  + " + l)
  return { onlyH, onlyD }
}

async function main() {
  const url = opt("--url") ?? process.env.MIRAI_LOCAL_DB_URL
  assertSafeUrl(url, flag("--allow-remote"))
  console.log(`Base: ${label(url)}`)
  if (cmd === "historia") await historia(url, { overrides: flag("--overrides"), live: flag("--live"), skipShim: flag("--skip-shim") })
  else if (cmd === "destino") await destino(url, { seed: !flag("--no-seed") })
  else if (cmd === "baseline") await baseline(url)
  else if (cmd === "preparar") await preparar(url)
  else if (cmd === "cierre") await cierre(url)
  else if (cmd === "diff") {
    const r = await diff(url)
    if (r.onlyH.length || r.onlyD.length) process.exitCode = 2
  } else {
    console.error("Uso: db-destino.mjs <historia|destino|baseline|diff> --url postgres://…")
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
