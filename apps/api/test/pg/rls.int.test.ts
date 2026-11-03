// V7-C · RLS de la Postgres destino con los 5 roles del hogar (owner, admin, editor, registra, viewer) + alguien de
// afuera, contra Postgres 17 en Docker con compat + Better Auth + línea base + overrides (db/postgres/*).
// Las expectativas salen de ROLE_MATRIX (@mirai/domain): "ver" = Solo mira, "editarTodo" = Colabora, "ajustes" =
// Administra, "plan" = Dueño. Todo corre en UNA transacción que al final se deshace: la base queda igual.
//
//   pnpm local:test        (levanta la base y corre esta batería; infra/local/README.md)
import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, beforeAll, expect, it } from "vitest"
import { ACCESS_ROLES, ROLE_MATRIX, type AccessRole, type Perm } from "@mirai/domain/household/roles"
import { as, connect, pgDescribe, seedRow, whereOf, type Outcome, type RowKey, type Who } from "./harness"

type Actor = AccessRole | "outsider"
const ACTORS: Actor[] = [...ACCESS_ROLES, "outsider"]
/** Rol mínimo de cada acción → permiso de ROLE_MATRIX. `none` = nadie con sesión (solo el servidor). */
type Min = AccessRole | "none"
const PERM_OF: Record<AccessRole, Perm> = { viewer: "ver", registra: "registrarPropio", editor: "editarTodo", admin: "ajustes", owner: "plan" }
const allowed = (actor: Actor, min: Min) => actor !== "outsider" && min !== "none" && ROLE_MATRIX.find((r) => r.perm === PERM_OF[min])!.roles[actor]

type Spec = { read: Min; update: Min; delete: Min; extra?: Record<string, unknown> }
const STD: Spec = { read: "viewer", update: "editor", delete: "editor" }

/** Tablas del libro (book_id) y lo que puede cada rol. Lo que no está aquí y tiene book_id falla la prueba (hay que decidirlo). */
const BOOK_TABLES: Record<string, Spec> = {
  ...Object.fromEntries(
    [
      "advisor_consultations", "allowance_movements", "allowances", "assets", "attachments", "automations", "book_settings", "calendar_events",
      "card_payments", "card_purchases", "categories", "contacts", "credit_cards", "emergency_funds", "entities", "expenses", "extra_incomes",
      "fixed_expense_payments", "fixed_expenses", "fund_movements", "gami_state", "goal_movements", "goals", "income_categories", "incomes",
      "investments", "keyword_rules", "liabilities", "loan_payments", "loans", "monthly_summaries", "payment_methods",
      "providers", "savings_challenges", "shared_group_expenses", "shared_groups", "subscriptions", "tax_assets", "tax_years", "wishlist",
    ].map((t) => [t, STD]),
  ),
  accountant_notes: { ...STD, extra: { autor: "titular" } }, // + share_id del acceso de abajo (lo pide su WITH CHECK)
  accountant_shares: { read: "viewer", update: "admin", delete: "admin" },
  net_worth_snapshots: { ...STD, extra: { mes: "2026-01" } },
  backups: { read: "admin", update: "none", delete: "none" },
  automation_events: { read: "viewer", update: "none", delete: "none" },
  automation_runs: { read: "viewer", update: "editor", delete: "none" },
  audit_log: { read: "viewer", update: "none", delete: "none" },
  gami_badges: { read: "viewer", update: "none", delete: "none" },
  gami_missions: { read: "viewer", update: "none", delete: "none" },
  gami_points_ledger: { read: "viewer", update: "none", delete: "none" },
  ai_usage: { read: "viewer", update: "none", delete: "none" },
  notification_log: { read: "none", update: "none", delete: "none" },
  notification_outbox: { read: "none", update: "none", delete: "none" },
}
/** Tablas con book_id que son de cada persona (se prueban aparte, en "de cada persona"). */
const PER_USER_BOOK = ["chat_threads", "chat_messages", "gami_visits", "notification_rules", "notifications", "google_event_map"]

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`
const U: Record<Actor, string> = { owner: id(1), admin: id(2), editor: id(3), registra: id(4), viewer: id(5), outsider: id(9) }
const who = (a: Actor): Who => ({ kind: "user", id: U[a], email: `${a}@rls.mirai.test` })

let c: pg.Client
let H = ""
let B = ""
let BO = ""
const rows: Record<string, RowKey> = {}
const seedErrors: string[] = []

async function count(table: string, key: RowKey) {
  const w = whereOf(key)
  const r = await c.query(`select count(*)::int as n from public.${table} where ${w.sql}`, w.params)
  return r.rows[0].n as number
}
/** Cambio que no cambia nada (`set llave = llave`): solo mide si la RLS deja tocar la fila. */
async function touch(table: string, key: RowKey) {
  const w = whereOf(key)
  return (await c.query(`update public.${table} set ${w.first} = ${w.first} where ${w.sql}`, w.params)).rowCount
}
async function remove(table: string, key: RowKey) {
  const w = whereOf(key)
  return (await c.query(`delete from public.${table} where ${w.sql}`, w.params)).rowCount
}
const byId = (id: string): RowKey => ({ id })
/**
 * ¿La RLS dejó pasar la operación? Una fila tocada, o un error que solo ocurre DESPUÉS de la política: las filas de
 * prueba se crean sin llaves foráneas reales (modo réplica) y Postgres vuelve a revisarlas al cambiar una fila creada
 * en la misma transacción (23503). 42501 = la política (o el GRANT) lo negó; 0 filas = la política la escondió.
 */
const passed = (o: Outcome<number | null>) => (o.ok ? o.value === 1 : o.code === "23503")
/** Leer: 1 = la ve, 0 = no la ve; sin permiso sobre la tabla (42501) también es "no la ve". */
const seen = (o: Outcome<number>) => (o.ok ? o.value : o.code === "42501" ? 0 : -1)

pgDescribe("RLS de la base destino (5 roles + alguien de afuera)", () => {
  beforeAll(async () => {
    c = await connect()
    await c.query("begin")
    // Personas: el trigger on_auth_user_created (handle_new_user) les crea perfil y preferencias, como al registrarse.
    for (const a of ACTORS) await c.query("insert into auth.users (id, email, name, email_verified, raw_user_meta_data) values ($1, $2, $3, true, $4)", [U[a], `${a}@rls.mirai.test`, a, JSON.stringify({ nombre: a })])
    // Hogar con su libro por el mismo camino de la app (create_household como el dueño) y 4 integrantes más.
    // (`as` deshace lo que hace; aquí el hogar debe quedar para el resto de la batería: mismo rol, sin savepoint.)
    await c.query("set local role authenticated")
    await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: U.owner, role: "authenticated" }), U.owner])
    B = (await c.query("select public.create_household('Familia RLS', 'Casa') as b")).rows[0].b
    await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: U.outsider, role: "authenticated" }), U.outsider])
    BO = (await c.query("select public.create_household('Otro hogar', 'Suyo') as b")).rows[0].b
    await c.query("reset role")
    await c.query("select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)")
    H =(await c.query("select household_id from public.books where id = $1", [B])).rows[0].household_id
    expect((await c.query("select household_id from public.books where id = $1", [BO])).rows[0].household_id).not.toBe(H)
    for (const a of ["admin", "editor", "registra", "viewer"] as const) await c.query("insert into public.household_members (household_id, user_id, role, access_role) values ($1, $2, 'viewer', $3)", [H, U[a], a])
    const roles = (await c.query("select user_id, access_role from public.household_members where household_id = $1", [H])).rows
    expect(Object.fromEntries(roles.map((r) => [r.user_id, r.access_role]))).toEqual({ [U.owner]: "owner", [U.admin]: "admin", [U.editor]: "editor", [U.registra]: "registra", [U.viewer]: "viewer" })
    rows.accountant_shares = await seedRow(c, "accountant_shares", { book_id: B })
    for (const [t, spec] of Object.entries(BOOK_TABLES)) {
      if (rows[t]) continue
      try {
        rows[t] = await seedRow(c, t, { book_id: B, ...(t === "accountant_notes" ? { share_id: rows.accountant_shares.id } : {}), ...(t === "ai_usage" || t === "audit_log" || t === "notification_log" ? { household_id: H } : {}), ...(spec.extra ?? {}) })
      } catch (e) {
        seedErrors.push((e as Error).message)
      }
    }
  })

  afterAll(async () => {
    await c?.query("rollback").catch(() => {})
    await c?.end()
  })

  it("se pudo crear una fila de prueba en cada tabla", () => {
    expect(seedErrors).toEqual([])
  })

  it("cubre todas las tablas con book_id (ninguna queda sin decidir)", async () => {
    const { rows: t } = await c.query<{ table_name: string }>(
      "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'book_id' and table_name in (select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r')",
    )
    const missing = t.map((r) => r.table_name).filter((n) => !(n in BOOK_TABLES) && !PER_USER_BOOK.includes(n))
    expect(missing).toEqual([])
  })

  it("todas las tablas de public tienen RLS activa", async () => {
    const { rows: t } = await c.query("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")
    expect(t.map((r) => r.relname)).toEqual([])
  })

  it("tablas del libro: leer, cambiar y borrar según ROLE_MATRIX", async () => {
    const bad: string[] = []
    for (const [t, spec] of Object.entries(BOOK_TABLES)) {
      for (const a of ACTORS) {
        const read = await as(c, who(a), () => count(t, rows[t]))
        const canRead = allowed(a, spec.read)
        if (seen(read) !== (canRead ? 1 : 0)) bad.push(`${t} · ${a} · leer: esperaba ${canRead ? "ver" : "no ver"}, ${read.ok ? `vio ${read.value}` : read.msg}`)
        const upd = await as(c, who(a), () => touch(t, rows[t]))
        const canUpd = allowed(a, spec.update)
        const updOk = passed(upd)
        if (updOk !== canUpd) bad.push(`${t} · ${a} · cambiar: esperaba ${canUpd ? "sí" : "no"}, ${upd.ok ? `filas=${upd.value}` : upd.msg}`)
        const del = await as(c, who(a), () => remove(t, rows[t]))
        const canDel = allowed(a, spec.delete)
        const delOk = passed(del)
        if (delOk !== canDel) bad.push(`${t} · ${a} · borrar: esperaba ${canDel ? "sí" : "no"}, ${del.ok ? `filas=${del.value}` : del.msg}`)
      }
    }
    expect(bad).toEqual([])
  })

  it("Registra sus gastos: crea y cambia SOLO lo suyo (expenses, incomes, extra_incomes)", async () => {
    for (const t of ["expenses", "incomes", "extra_incomes"]) {
      const mine = await seedRow(c, t, { book_id: B, created_by: U.registra })
      const upMine = await as(c, who("registra"), () => touch(t, mine))
      expect(upMine, `${t}: cambiar lo suyo`).toEqual({ ok: true, value: 1 })
      const upOther = await as(c, who("registra"), () => touch(t, rows[t]))
      expect(upOther, `${t}: cambiar lo de otro`).toEqual({ ok: true, value: 0 })
      const delMine = await as(c, who("registra"), () => remove(t, mine))
      expect(delMine, `${t}: borrar lo suyo`).toEqual({ ok: true, value: 1 })
      // Crear a nombre de otra persona: la política lo rechaza (42501). Copia de su propia fila con otro autor.
      const forged = await as(c, who("registra"), () =>
        c.query(`insert into public.${t} select (jsonb_populate_record(null::public.${t}, to_jsonb(x) || jsonb_build_object('id', $1::uuid, 'created_by', $2::uuid))).* from public.${t} x where x.id = $3`, [randomUUID(), U.owner, mine.id]),
      )
      expect(forged.ok ? "creó" : forged.code, `${t}: crear a nombre de otro`).toBe("42501")
    }
    const v = await as(c, who("viewer"), () => c.query("insert into public.expenses (id, book_id, created_by, fecha, descripcion, valor) values ($1, $2, $3, '2026-01-15', 'x', 1)", [randomUUID(), B, U.viewer]))
    expect(v.ok ? "creó" : v.code, "Solo mira no crea gastos").toBe("42501")
  })

  it("hogar: ver, cambiar y borrar según el rol; alguien de afuera no ve nada", async () => {
    const cases: [string, RowKey, Spec][] = [
      ["households", byId(H), { read: "viewer", update: "owner", delete: "owner" }],
      ["books", byId(B), { read: "viewer", update: "editor", delete: "owner" }],
      ["family_members", byId((await c.query("select id from public.family_members where household_id = $1 limit 1", [H])).rows[0].id), { read: "viewer", update: "editor", delete: "editor" }],
      ["household_invitations", await seedRow(c, "household_invitations", { household_id: H, email: "nuevo@rls.mirai.test" }), { read: "admin", update: "admin", delete: "admin" }],
      ["plan_payments", await seedRow(c, "plan_payments", { household_id: H }), { read: "owner", update: "none", delete: "none" }],
      ["plan_subscriptions", await seedRow(c, "plan_subscriptions", { household_id: H }), { read: "viewer", update: "none", delete: "none" }],
      ["integrations", await seedRow(c, "integrations", { household_id: H }), { read: "none", update: "none", delete: "none" }],
      ["ai_cache", await seedRow(c, "ai_cache", { household_id: H }), { read: "none", update: "none", delete: "none" }],
    ]
    const bad: string[] = []
    for (const [t, rowId, spec] of cases) {
      for (const a of ACTORS) {
        const read = await as(c, who(a), () => count(t, rowId))
        if (seen(read) !== (allowed(a, spec.read) ? 1 : 0)) bad.push(`${t} · ${a} · leer: ${read.ok ? read.value : read.msg}`)
        const upd = await as(c, who(a), () => touch(t, rowId))
        if (passed(upd) !== allowed(a, spec.update)) bad.push(`${t} · ${a} · cambiar: ${upd.ok ? upd.value : upd.msg}`)
        const del = await as(c, who(a), () => remove(t, rowId))
        if (passed(del) !== allowed(a, spec.delete)) bad.push(`${t} · ${a} · borrar: ${del.ok ? del.value : del.msg}`)
      }
    }
    // household_members: el dueño cambia roles; cualquiera puede salirse (borrar su propia fila); nadie más.
    for (const a of ACTORS) {
      const n = await as(c, who(a), async () => (await c.query("select count(*)::int as n from public.household_members where household_id = $1", [H])).rows[0].n)
      if (!n.ok || n.value !== (a === "outsider" ? 0 : 5)) bad.push(`household_members · ${a} · leer: ${n.ok ? n.value : n.msg}`)
      const up = await as(c, who(a), async () => (await c.query("update public.household_members set role = role where household_id = $1 and user_id = $2", [H, U.viewer])).rowCount)
      if ((up.ok && up.value === 1) !== (a === "owner")) bad.push(`household_members · ${a} · cambiar rol: ${up.ok ? up.value : up.msg}`)
      if (a !== "owner" && a !== "outsider") {
        const self = await as(c, who(a), async () => (await c.query("delete from public.household_members where household_id = $1 and user_id = $2", [H, U[a]])).rowCount)
        if (!self.ok || self.value !== 1) bad.push(`household_members · ${a} · salirse: ${self.ok ? self.value : self.msg}`)
      }
    }
    expect(bad).toEqual([])
  })

  it("de cada persona: notificaciones, reglas de aviso, visitas, conversaciones y perfiles", async () => {
    const own = {
      notifications: await seedRow(c, "notifications", { book_id: B, user_id: U.owner }),
      notification_rules: await seedRow(c, "notification_rules", { book_id: B, user_id: U.owner }),
      gami_visits: await seedRow(c, "gami_visits", { book_id: B, user_id: U.owner }),
      chat_threads: await seedRow(c, "chat_threads", { book_id: B, user_id: U.owner }),
      push_subscriptions: await seedRow(c, "push_subscriptions", { user_id: U.owner }),
      account_events: byId(String((await c.query("insert into public.account_events (user_id, kind) values ($1, 'inicio') returning id", [U.owner])).rows[0].id)),
    }
    const msg = await seedRow(c, "chat_messages", { book_id: B, thread_id: own.chat_threads.id })
    const bad: string[] = []
    for (const [t, rowId] of [...Object.entries(own), ["chat_messages", msg]] as [string, RowKey][]) {
      for (const a of ACTORS) {
        const n = await as(c, who(a), () => count(t, rowId))
        if (!n.ok || n.value !== (a === "owner" ? 1 : 0)) bad.push(`${t} · ${a}: ${n.ok ? n.value : n.msg}`)
      }
    }
    // Perfiles: el propio y los de su hogar; nunca los de otro hogar.
    for (const a of ACTORS) {
      const n = await as(c, who(a), async () => (await c.query("select id from public.profiles where id = any($1)", [Object.values(U)])).rows.map((r) => r.id).sort())
      const want = a === "outsider" ? [U.outsider] : ACCESS_ROLES.map((r) => U[r]).sort()
      if (!n.ok || JSON.stringify(n.value) !== JSON.stringify(want)) bad.push(`profiles · ${a}: ${n.ok ? n.value.length : n.msg}`)
    }
    expect(bad).toEqual([])
  })

  it("anon no ve datos de nadie, solo lo público (planes, referencias, ajustes de la plataforma)", async () => {
    for (const t of ["profiles", "households", "books", "expenses", "household_members", "notifications"]) {
      const n = await as(c, { kind: "anon" }, async () => (await c.query(`select count(*)::int as n from public.${t}`)).rows[0].n)
      expect(n.ok ? n.value : 0, t).toBe(0)
    }
    const plans = await as(c, { kind: "anon" }, async () => (await c.query("select count(*)::int as n from public.plans")).rows[0].n)
    expect(plans.ok && plans.value > 0).toBe(true)
  })

  it("service_role (SystemScope) salta la RLS y las 5 comprobaciones de auth.role() pasan con sus claims", async () => {
    await seedRow(c, "ai_usage", { household_id: H, book_id: B, creditos: 5, created_at: new Date().toISOString() })
    const sys: Who = { kind: "service" }
    const bare: Who = { kind: "service", claims: false }
    expect(await as(c, sys, async () => (await c.query("select auth.role() as r")).rows[0].r)).toEqual({ ok: true, value: "service_role" })
    // Ve todo (BYPASSRLS), incluidos los respaldos que solo ve Administra.
    expect(await as(c, sys, () => count("backups", rows.backups))).toEqual({ ok: true, value: 1 })
    // 1-3: ai_creditos_desde y ai_usage_rollup (20261103000200_ia_uso.sql:70,83,84)
    const desde = "2000-01-01"
    const cred = await as(c, sys, async () => Number((await c.query("select public.ai_creditos_desde($1, $2::timestamptz) as n", [H, desde])).rows[0].n))
    expect(cred.ok && cred.value >= 5).toBe(true)
    const credBare = await as(c, bare, async () => Number((await c.query("select public.ai_creditos_desde($1, $2::timestamptz) as n", [H, desde])).rows[0].n))
    expect(credBare, "sin claims (como estaba SystemScope antes de V7-D) no ve nada").toEqual({ ok: true, value: 0 })
    const all = await as(c, sys, async () => (await c.query("select count(*)::int as n from public.ai_usage_rollup($1::date, null)", [desde])).rows[0].n)
    expect(all.ok && all.value > 0).toBe(true)
    const one = await as(c, sys, async () => (await c.query("select count(*)::int as n from public.ai_usage_rollup($1::date, $2)", [desde, H])).rows[0].n)
    expect(one.ok && one.value > 0).toBe(true)
    // 4: member_access (20261103001400_seguridad.sql:60)
    expect(await as(c, sys, async () => (await c.query("select public.member_access($1, $2) as r", [H, U.viewer])).rows[0].r)).toEqual({ ok: true, value: "viewer" })
    expect(await as(c, bare, async () => (await c.query("select public.member_access($1, $2) as r", [H, U.viewer])).rows[0].r)).toEqual({ ok: true, value: null })
    // 5: profiles_lock_email (20261103001400_seguridad.sql:117): el servidor sí puede cambiar el correo del perfil; la persona no.
    const svc = await as(c, sys, async () => (await c.query("update public.profiles set email = 'nuevo@rls.mirai.test' where id = $1 returning email", [U.viewer])).rows[0].email)
    expect(svc).toEqual({ ok: true, value: "nuevo@rls.mirai.test" })
    const usr = await as(c, who("viewer"), async () => (await c.query("update public.profiles set email = 'robado@rls.mirai.test' where id = $1 returning email", [U.viewer])).rows[0].email)
    expect(usr).toEqual({ ok: true, value: "viewer@rls.mirai.test" })
  })

  it("auth.uid(), auth.jwt() y auth.role() leen request.jwt.claims (también la forma vieja request.jwt.claim.sub)", async () => {
    const r = await as(c, who("editor"), async () => (await c.query("select auth.uid() as uid, auth.role() as role, auth.jwt() ->> 'email' as email")).rows[0])
    expect(r).toEqual({ ok: true, value: { uid: U.editor, role: "authenticated", email: "editor@rls.mirai.test" } })
    await c.query("savepoint old")
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [U.admin])
    expect((await c.query("select auth.uid() as u")).rows[0].u).toBe(U.admin)
    await c.query("rollback to savepoint old")
    // Fuera de un alcance: nadie.
    expect((await c.query("select auth.uid() as u, auth.role() as r")).rows[0]).toEqual({ u: null, r: null })
  })
})
