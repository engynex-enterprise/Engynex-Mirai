// v7 · V7-J · Vuelta atrás después de reabrir (§5.4): copia al ORIGEN (Supabase) lo que cambió en el destino desde el
// corte, para volver a Supabase sin perder lo de esas horas (hasta 72 h; después se corrige hacia adelante).
//
//   node --experimental-strip-types scripts/migrate/rollback-delta.ts --origen <supabase> --destino <url> --desde <ISO>
//        [--dry-run] [--permitir-supabase] [--allow-remote]
//
// 1. Personas nuevas del destino (auth.users.created_at > --desde y que no existan en el origen) → auth.users e
//    auth.identities de GoTrue con el MISMO hash bcrypt (auth.accounts credential) y su Google; mismo UUID.
// 2. Cada tabla de public con updated_at o created_at: las filas del destino con coalesce(updated_at, created_at) >
//    --desde se insertan o actualizan en el origen por su llave primaria, en orden de llaves foráneas (padres primero).
//    Los borrados en Mirai son lógicos (deleted_at → updated_at), así que también viajan. Límite conocido: un borrado
//    DE VERDAD en el destino (p. ej. notificaciones viejas) no se replica; el reporte lo advierte.
// Todo en UNA transacción del origen. Idempotente.
import { checkDestino, checkOrigen, connect, flag, label, log, opt, type Client } from "./lib.ts"

type Col = { name: string; generated: boolean; identityAlways: boolean }

async function columns(c: Client, t: string): Promise<Col[]> {
  const r = await c.query<{ column_name: string; is_generated: string; identity_generation: string | null }>(
    "select column_name, is_generated, identity_generation from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
    [t],
  )
  return r.rows.map((x) => ({ name: x.column_name, generated: x.is_generated === "ALWAYS", identityAlways: x.identity_generation === "ALWAYS" }))
}

async function pk(c: Client, t: string): Promise<string[]> {
  const r = await c.query<{ col: string }>(
    "select a.attname as col from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisprimary",
    [`public.${t}`],
  )
  return r.rows.map((x) => x.col)
}

/** Tablas de public en orden de llaves foráneas (padres primero). */
export async function fkOrder(c: Client): Promise<string[]> {
  const tables = (await c.query<{ t: string }>("select relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'")).rows.map((r) => r.t)
  const deps = (await c.query<{ child: string; parent: string }>(
    "select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace",
  )).rows
  const parents = new Map(tables.map((t) => [t, new Set<string>()]))
  for (const d of deps) {
    const ch = d.child.replace(/^public\./, "")
    const pa = d.parent.replace(/^public\./, "")
    if (ch !== pa && parents.has(ch) && parents.has(pa)) parents.get(ch)!.add(pa)
  }
  const out: string[] = []
  const seen = new Set<string>()
  const visit = (t: string, stack: Set<string>) => {
    if (seen.has(t) || stack.has(t)) return
    stack.add(t)
    for (const p of parents.get(t) ?? []) visit(p, stack)
    stack.delete(t)
    seen.add(t)
    out.push(t)
  }
  for (const t of tables.sort()) visit(t, new Set())
  return out
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`

export type DeltaReport = { personas: number; tablas: Record<string, number>; advertencias: string[] }

export async function rollbackDelta(src: Client, dst: Client, desde: string, o: { dryRun?: boolean } = {}): Promise<DeltaReport> {
  const rep: DeltaReport = { personas: 0, tablas: {}, advertencias: [] }
  await src.query("begin")
  try {
    await src.query("set local session_replication_role = replica").catch(() => rep.advertencias.push("sin session_replication_role: los triggers del origen corren (handle_new_user es inocuo con on conflict)"))
    // 1. Personas nuevas.
    const nuevas = (await dst.query<{ id: string; email: string; email_confirmed_at: Date | null; raw_user_meta_data: unknown; raw_app_meta_data: unknown; created_at: Date; updated_at: Date; last_sign_in_at: Date | null; password: string | null }>(
      `select u.id, u.email, u.email_confirmed_at, u.raw_user_meta_data, u.raw_app_meta_data, u.created_at, u.updated_at, u.last_sign_in_at,
              (select a.password from auth.accounts a where a.user_id = u.id and a.provider_id = 'credential' limit 1) as password
         from auth.users u where u.created_at > $1 order by u.created_at`,
      [desde],
    )).rows
    for (const u of nuevas) {
      const exists = (await src.query("select 1 from auth.users where id = $1", [u.id])).rowCount
      if (exists) continue
      const providers = ["email", ...((await dst.query("select 1 from auth.accounts where user_id = $1 and provider_id = 'google'", [u.id])).rowCount ? ["google"] : [])]
      await src.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, last_sign_in_at)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3, $4, $5, $6, $7, $8, $9)`,
        [u.id, u.email, u.password, u.email_confirmed_at, u.raw_user_meta_data ?? {}, { ...((u.raw_app_meta_data as object) ?? {}), provider: "email", providers }, u.created_at, u.updated_at, u.last_sign_in_at],
      )
      await src.query(
        "insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values ($1, $3, $2, 'email', now(), now()) on conflict do nothing",
        [u.id, { sub: u.id, email: u.email, email_verified: !!u.email_confirmed_at }, u.id],
      )
      for (const g of (await dst.query<{ account_id: string }>("select account_id from auth.accounts where user_id = $1 and provider_id = 'google'", [u.id])).rows) {
        await src.query("insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values ($1, $2, $3, 'google', now(), now()) on conflict do nothing", [g.account_id, u.id, { sub: g.account_id, email: u.email }])
      }
      rep.personas++
    }
    // 2. Filas cambiadas, padres primero.
    for (const t of await fkOrder(dst)) {
      if (t === "_mirai_migrations") continue
      const cols = await columns(dst, t)
      const names = cols.map((c) => c.name)
      const ts = names.includes("updated_at") ? (names.includes("created_at") ? "coalesce(updated_at, created_at)" : "updated_at") : names.includes("created_at") ? "created_at" : null
      if (!ts) {
        rep.advertencias.push(`${t}: sin updated_at ni created_at (no se puede saber qué cambió)`)
        continue
      }
      const rows = (await dst.query(`select to_jsonb(x) as r from public.${q(t)} x where ${ts} > $1`, [desde])).rows.map((r) => r.r)
      if (!rows.length) continue
      const keys = await pk(dst, t)
      const write = cols.filter((c) => !c.generated)
      const list = write.map((c) => q(c.name)).join(", ")
      const set = write.filter((c) => !keys.includes(c.name)).map((c) => `${q(c.name)} = excluded.${q(c.name)}`).join(", ")
      const overriding = cols.some((c) => c.identityAlways) ? "overriding system value" : ""
      await src.query(
        `insert into public.${q(t)} (${list}) ${overriding} select ${list} from jsonb_populate_recordset(null::public.${q(t)}, $1::jsonb)
         on conflict (${keys.map(q).join(", ")}) do ${set ? `update set ${set}` : "nothing"}`,
        [JSON.stringify(rows)],
      )
      rep.tablas[t] = rows.length
    }
    await src.query(o.dryRun ? "rollback" : "commit")
  } catch (e) {
    await src.query("rollback").catch(() => {})
    throw e
  }
  return rep
}

async function main() {
  const origen = checkOrigen(opt("--origen", "MIGRATE_ORIGEN_URL"))
  const destino = checkDestino(opt("--destino", "MIGRATE_DESTINO_URL"))
  const desde = opt("--desde")
  if (!desde || Number.isNaN(Date.parse(desde))) throw new Error("Falta --desde <fecha ISO del corte>")
  log(`Vuelta atrás: ${label(destino)} → ${label(origen)} desde ${desde}${flag("--dry-run") ? " (simulación)" : ""}`)
  const [src, dst] = [await connect(origen, "delta-src"), await connect(destino, "delta-dst")]
  try {
    log(JSON.stringify(await rollbackDelta(src, dst, desde, { dryRun: flag("--dry-run") })))
  } finally {
    await src.end()
    await dst.end()
  }
}

if (process.argv[1]?.endsWith("rollback-delta.ts")) await main()
