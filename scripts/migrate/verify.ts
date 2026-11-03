// v7 · V7-J · Verificación origen (Supabase) vs destino (§3.7): falla con CUALQUIER diferencia.
//
//   node --experimental-strip-types scripts/migrate/verify.ts --origen <url> --destino <url> [--json] [--permitir-supabase]
//
// Compara, en `public`:
//   - conteo y suma de control por tabla: md5 de los md5 de cada fila como jsonb (las llaves de jsonb van ordenadas, así
//     el orden de las columnas no cambia el resultado), en el orden de la llave primaria y con la hora en UTC;
//   - si una tabla con book_id difiere, la suma por libro (para ubicar la diferencia);
//   - el valor de las secuencias (identidades de audit_log, admin_audit, notification_log, account_events);
//   - los GRANT de anon, authenticated y service_role sobre tablas y funciones de public (deben ser iguales);
//   - el número de políticas, triggers y funciones (los triggers en vivo de overrides se esperan de más: se reportan aparte).
// Y las personas: auth.users de GoTrue (todas, anónimas incluidas) vs auth.users de Better Auth; contraseñas
// (encrypted_password) vs auth.accounts credential; identidades Google; TOTP verificados (+ los que quedan por reactivar).
import { checkDestino, checkOrigen, connect, flag, label, log, opt, type Client } from "./lib.ts"

export type Diff = { kind: string; name: string; origen: unknown; destino: unknown }
const SKIP = new Set(["_mirai_migrations"])

async function tables(c: Client): Promise<string[]> {
  return (await c.query<{ t: string }>("select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1")).rows.map((r) => r.t)
}

async function pkCols(c: Client, t: string): Promise<string[]> {
  const r = await c.query<{ col: string }>(
    "select a.attname as col from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisprimary order by array_position(i.indkey, a.attnum)",
    [`public.${t}`],
  )
  return r.rows.map((x) => x.col)
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`

/** Conteo y suma de control de una tabla (con filtro opcional). */
export async function tableSum(c: Client, t: string, order: string[], where = "", params: unknown[] = []) {
  const ord = order.length ? order.map(q).join(", ") : "md5(to_jsonb(x)::text)"
  const r = await c.query<{ n: number; sum: string | null }>(
    `select count(*)::int as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text), '' order by ${ord}), '')) as sum from public.${q(t)} x ${where}`,
    params,
  )
  return r.rows[0]
}

async function hasCol(c: Client, t: string, col: string) {
  return (await c.query("select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2", [t, col])).rowCount! > 0
}

async function sequences(c: Client) {
  const r = await c.query<{ s: string; v: string | null }>("select schemaname || '.' || sequencename as s, last_value::text as v from pg_sequences where schemaname = 'public' order by 1")
  return Object.fromEntries(r.rows.map((x) => [x.s, x.v]))
}

async function catalog(c: Client) {
  const one = async (sql: string) => Number((await c.query<{ n: number }>(sql)).rows[0].n)
  return {
    policies: await one("select count(*)::int as n from pg_policies where schemaname = 'public'"),
    triggers: await one("select count(*)::int as n from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not g.tgisinternal"),
    functions: await one("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'"),
  }
}

/** Permisos de los roles de la API sobre public (un GRANT de más a anon es un hueco aunque la RLS exista). */
async function grants(c: Client) {
  const r = await c.query<{ k: string; n: number }>(
    `select 'tabla:' || grantee || ':' || privilege_type as k, count(*)::int as n from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role') and table_name <> '_mirai_migrations' group by 1
     union all
     select 'funcion:' || grantee as k, count(*)::int as n from information_schema.role_routine_grants
       where routine_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role') group by 1`,
  )
  return Object.fromEntries(r.rows.map((x) => [x.k, x.n]))
}

async function authCounts(src: Client, dst: Client) {
  const one = async (c: Client, sql: string) => Number((await c.query<{ n: number }>(sql)).rows[0].n)
  return {
    personas: [
      await one(src, "select count(*)::int as n from auth.users"),
      await one(dst, "select count(*)::int as n from auth.users"),
    ],
    contrasenas: [
      await one(src, "select count(*)::int as n from auth.users where not coalesce(is_anonymous, false) and email is not null and encrypted_password ~ '^\\$2[aby]\\$'"),
      await one(dst, "select count(*)::int as n from auth.accounts where provider_id = 'credential' and password is not null"),
    ],
    google: [
      await one(src, "select count(*)::int as n from auth.identities i join auth.users u on u.id = i.user_id where i.provider = 'google' and not coalesce(u.is_anonymous, false)"),
      await one(dst, "select count(*)::int as n from auth.accounts where provider_id = 'google'"),
    ],
    totp: [
      await one(src, "select count(distinct user_id)::int as n from auth.mfa_factors where factor_type = 'totp' and status = 'verified'"),
      await one(dst, "select (count(*) filter (where two_factor_enabled) + count(*) filter (where mfa_reactivar))::int as n from auth.users"),
    ],
  } as Record<string, [number, number]>
}

export async function verify(src: Client, dst: Client, o: { auth?: boolean } = {}): Promise<{ diffs: Diff[]; tables: number; rows: number; catalog: { origen: unknown; destino: unknown } }> {
  const diffs: Diff[] = []
  const ts = await tables(src)
  const td = new Set(await tables(dst))
  let rows = 0
  for (const t of ts) {
    if (SKIP.has(t)) continue
    if (!td.has(t)) {
      diffs.push({ kind: "tabla", name: t, origen: "existe", destino: "no existe" })
      continue
    }
    const order = await pkCols(src, t)
    const [a, b] = [await tableSum(src, t, order), await tableSum(dst, t, order)]
    rows += a.n
    if (a.n !== b.n || a.sum !== b.sum) {
      diffs.push({ kind: "datos", name: t, origen: a, destino: b })
      if (await hasCol(src, t, "book_id")) {
        const books = (await src.query<{ b: string | null }>(`select distinct book_id::text as b from public.${q(t)}`)).rows.map((r) => r.b)
        for (const bk of books) {
          const w = bk === null ? "where book_id is null" : "where book_id = $1"
          const p = bk === null ? [] : [bk]
          const [x, y] = [await tableSum(src, t, order, w, p), await tableSum(dst, t, order, w, p)]
          if (x.n !== y.n || x.sum !== y.sum) diffs.push({ kind: "libro", name: `${t} · ${bk}`, origen: x, destino: y })
        }
      }
    }
  }
  for (const t of td) if (!ts.includes(t) && !SKIP.has(t)) diffs.push({ kind: "tabla", name: t, origen: "no existe", destino: "existe" })
  const [sa, sb] = [await sequences(src), await sequences(dst)]
  for (const [s, v] of Object.entries(sa)) if (sb[s] !== v) diffs.push({ kind: "secuencia", name: s, origen: v, destino: sb[s] })
  const [ga, gb] = [await grants(src), await grants(dst)]
  for (const k of new Set([...Object.keys(ga), ...Object.keys(gb)])) if (ga[k] !== gb[k]) diffs.push({ kind: "permisos", name: k, origen: ga[k] ?? 0, destino: gb[k] ?? 0 })
  if (o.auth !== false) {
    for (const [k, [x, y]] of Object.entries(await authCounts(src, dst))) if (x !== y) diffs.push({ kind: "auth", name: k, origen: x, destino: y })
  }
  return { diffs, tables: ts.length, rows, catalog: { origen: await catalog(src), destino: await catalog(dst) } }
}

async function main() {
  const origen = checkOrigen(opt("--origen", "MIGRATE_ORIGEN_URL"))
  const destino = checkDestino(opt("--destino", "MIGRATE_DESTINO_URL"))
  const [src, dst] = [await connect(origen, "verify-src"), await connect(destino, "verify-dst")]
  try {
    const r = await verify(src, dst, { auth: !flag("--sin-auth") })
    if (flag("--json")) log(JSON.stringify(r))
    else {
      log(`Verificación ${label(origen)} → ${label(destino)}: ${r.tables} tablas, ${r.rows} filas, ${r.diffs.length} diferencias`)
      log(`Catálogo (políticas/triggers/funciones): origen ${JSON.stringify(r.catalog.origen)} · destino ${JSON.stringify(r.catalog.destino)}`)
      for (const d of r.diffs.slice(0, 50)) log(`  ✗ ${d.kind} ${d.name}: ${JSON.stringify(d.origen)} ≠ ${JSON.stringify(d.destino)}`)
    }
    if (r.diffs.length) process.exitCode = 2
  } finally {
    await src.end()
    await dst.end()
  }
}

if (process.argv[1]?.endsWith("verify.ts")) await main()
