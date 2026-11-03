// Pruebas contra la Postgres destino en Docker (V7-C, V7-D, V7-I). Solo corren con MIRAI_PG_TEST_URL (la pone
// `pnpm local:test`, infra/local/stack.mjs); sin ella se saltan. NUNCA contra Supabase ni la base compartida: la URL
// debe ser de este computador.
import { randomUUID } from "node:crypto"
import pg from "pg"
import { describe } from "vitest"

export const PG_URL = process.env.MIRAI_PG_TEST_URL
export const PGRST_URL = process.env.MIRAI_PGRST_TEST_URL
export const PGRST_SECRET = process.env.MIRAI_PGRST_TEST_SECRET

function local(url?: string) {
  if (!url) return false
  const h = new URL(url.replace(/^postgres(ql)?:/, "http:")).hostname
  if (!["localhost", "127.0.0.1", "::1"].includes(h)) throw new Error(`MIRAI_PG_TEST_URL debe ser local (es ${h})`)
  return true
}

/** describe que solo corre con la base local de Docker. */
export const pgDescribe = local(PG_URL) ? describe : describe.skip
export const pgrstDescribe = local(PG_URL) && PGRST_URL && PGRST_SECRET ? describe : describe.skip

export async function connect(url = PG_URL): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: url, application_name: "mirai-api-test" })
  await c.connect()
  return c
}

export type Who = { kind: "user"; id: string; email?: string } | { kind: "service"; claims?: boolean } | { kind: "anon" }
export type Outcome<T> = { ok: true; value: T } | { ok: false; code: string; msg: string }

/**
 * Corre `fn` con el rol y los claims de `who` (lo mismo que hacen PostgREST y PgKyselyFactory) dentro de un savepoint
 * que siempre se deshace: así cada comprobación ve los mismos datos.
 */
export async function as<T>(c: pg.Client, who: Who, fn: () => Promise<T>): Promise<Outcome<T>> {
  await c.query("savepoint chk")
  try {
    if (who.kind === "user") {
      await c.query("set local role authenticated")
      await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: who.id, role: "authenticated", email: who.email }), who.id])
    } else if (who.kind === "service") {
      await c.query("set local role service_role")
      if (who.claims !== false) await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })])
    } else {
      await c.query("set local role anon")
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })])
    }
    return { ok: true, value: await fn() }
  } catch (e) {
    const err = e as { code?: string; message: string }
    return { ok: false, code: err.code ?? "?", msg: err.message }
  } finally {
    await c.query("rollback to savepoint chk")
  }
}

type Col = { column_name: string; udt_name: string; data_type: string; is_nullable: string; column_default: string | null; is_generated: string; is_identity: string }

/** Valor de relleno para una columna obligatoria (respeta los CHECK con lista de valores). */
function filler(col: Col, checks: string[]): string {
  const lit = checks.map((d) => (d.includes(col.column_name) ? /'([^']*)'::(text|character varying)/.exec(d)?.[1] : undefined)).find((v) => v !== undefined)
  if (lit !== undefined) return lit
  switch (col.udt_name) {
    case "uuid":
      return randomUUID()
    case "int2":
    case "int4":
    case "int8":
    case "numeric":
    case "float4":
    case "float8":
      return "1"
    case "bool":
      return "false"
    case "date":
      return "2026-01-15"
    case "timestamptz":
    case "timestamp":
      return "2026-01-15T12:00:00Z"
    case "jsonb":
    case "json":
      return "{}"
    case "inet":
      return "127.0.0.1"
    default:
      return col.data_type === "ARRAY" ? "{}" : "x"
  }
}

/** Llave de una fila (sus columnas de llave primaria). */
export type RowKey = Record<string, unknown>

/** `where` para una llave, con parámetros desde $start. */
export function whereOf(key: RowKey, start = 1) {
  const ks = Object.keys(key)
  return { sql: ks.map((k, i) => `${pg.escapeIdentifier(k)} = $${start + i}`).join(" and "), params: ks.map((k) => key[k]), first: ks[0] }
}

/**
 * Inserta una fila de prueba como dueño de la base (sin RLS, sin triggers ni revisión de llaves foráneas: modo
 * réplica), llenando solo lo obligatorio. Si ya existe (p. ej. book_settings, que crea el alta del libro) la deja.
 * Devuelve su llave primaria.
 */
export async function seedRow(c: pg.Client, table: string, values: Record<string, unknown>): Promise<RowKey> {
  const { rows: cols } = await c.query<Col>(
    "select column_name, udt_name, data_type, is_nullable, column_default, is_generated, is_identity from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table],
  )
  const { rows: cons } = await c.query<{ def: string }>("select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1::regclass and contype = 'c'", [`public.${table}`])
  const { rows: pk } = await c.query<{ col: string }>(
    "select a.attname as col from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisprimary",
    [`public.${table}`],
  )
  const checks = cons.map((r) => r.def)
  const v: Record<string, unknown> = { ...values }
  for (const col of cols) {
    if (col.column_name in v || col.is_nullable === "YES" || col.column_default !== null || col.is_generated !== "NEVER" || col.is_identity === "YES") continue
    v[col.column_name] = filler(col, checks)
  }
  if (pk.some((x) => x.col === "id") && !("id" in v) && cols.find((x) => x.column_name === "id")?.udt_name === "uuid") v.id = randomUUID()
  const keys = Object.keys(v)
  const ret = pk.map((x) => pg.escapeIdentifier(x.col)).join(", ")
  await c.query("savepoint seed")
  await c.query("set local session_replication_role = replica")
  try {
    const { rows } = await c.query<RowKey>(
      `insert into public.${pg.escapeIdentifier(table)} (${keys.map((k) => pg.escapeIdentifier(k)).join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) on conflict do nothing returning ${ret}`,
      keys.map((k) => v[k]),
    )
    await c.query("set local session_replication_role = origin")
    await c.query("release savepoint seed")
    return rows[0] ?? Object.fromEntries(pk.map((x) => [x.col, v[x.col]]))
  } catch (e) {
    await c.query("rollback to savepoint seed")
    throw new Error(`seedRow(${table}): ${(e as Error).message}`)
  }
}
