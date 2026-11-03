// V7-D · El puente contra Postgres 17 + PostgREST en Docker (infra/local): PostgrestFactory (JWT interno) y
// PgKyselyFactory (set local role) dan la misma RLS que Supabase, y SystemScope corre como service_role.
// Crea su propio hogar de prueba (ids al azar) y lo borra al final. Solo corre con `pnpm local:test`.
import { randomUUID } from "node:crypto"
import { PostgresDialect } from "kysely"
import pg from "pg"
import pino from "pino"
import { sql } from "kysely"
import { afterAll, beforeAll, expect, it } from "vitest"
import type { AppConfig } from "../../src/core/config/app-config"
import { PgKyselyFactory } from "../../src/core/db/pg-kysely.factory"
import { PostgrestFactory } from "../../src/core/db/postgrest.factory"
import { systemScope, type UserScope } from "../../src/core/db/scope"
import { SupabaseJsFactory } from "../../src/core/db/supabase-js.factory"
import { SupabaseJsBookStore } from "../../src/modules/book-tables/adapters/supabase-js.book-store"
import { SupabaseJsCatalogsRepo } from "../../src/modules/catalogs/adapters/supabase-js.catalogs.repo"
import { connect, PG_URL, PGRST_SECRET, PGRST_URL, pgrstDescribe } from "./harness"

const log = pino({ level: "silent" })
const config = { db: { adapter: "postgrest", url: PG_URL, postgrest: { url: PGRST_URL, jwtSecret: PGRST_SECRET } } } as unknown as AppConfig
const owner = randomUUID()
const outsider = randomUUID()
const scope = (id: string): UserScope => ({ kind: "user", userId: id, token: "-", claims: { sub: id, role: "authenticated", email: `${id}@pgrst.mirai.test`, session_id: "s-1" } })

let admin: pg.Client
let book = ""
let household = ""
let pool: pg.Pool

pgrstDescribe("Puente PostgREST + Kysely contra la base destino", () => {
  beforeAll(async () => {
    admin = await connect()
    for (const u of [owner, outsider]) await admin.query("insert into auth.users (id, email, name, email_verified) values ($1, $2, 'p', true)", [u, `${u}@pgrst.mirai.test`])
    await admin.query("begin")
    await admin.query("set local role authenticated")
    await admin.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: owner, role: "authenticated" })])
    book = (await admin.query("select public.create_household('PostgREST', 'Casa') as b")).rows[0].b
    await admin.query("commit")
    household = (await admin.query("select household_id from public.books where id = $1", [book])).rows[0].household_id
    pool = new pg.Pool({ connectionString: PG_URL, max: 2 })
  })

  afterAll(async () => {
    await admin?.query("delete from public.households where id = $1", [household]).catch(() => {})
    await admin?.query("delete from auth.users where id = any($1)", [[owner, outsider]]).catch(() => {})
    await admin?.end()
    await pool?.end()
  })

  it("UserScope por PostgREST: el dueño ve las categorías de su libro; alguien de afuera no", async () => {
    const pf = new PostgrestFactory(config, log)
    const mine = await pf.for(scope(owner)).from("categories").select("id").eq("book_id", book)
    expect(mine.error).toBeNull()
    expect(mine.data!.length).toBeGreaterThan(5)
    const other = await pf.for(scope(outsider)).from("categories").select("id").eq("book_id", book)
    expect(other.data).toEqual([])
  })

  it("UserScope: auth.uid() y request.headers llegan a la base (mirai_app_context y sync_enlaces_on)", async () => {
    const pf = new PostgrestFactory(config, log)
    const ctx = await pf.for(scope(owner)).rpc("mirai_app_context")
    expect(ctx.error).toBeNull()
    expect((ctx.data as { profile: { id: string } }).profile.id).toBe(owner)
    expect((await pf.for(scope(owner)).rpc("sync_enlaces_on")).data).toBe(true)
    // El sistema no manda x-mirai-enlaces (igual que supabaseAdmin() de la web).
    expect((await pf.for(systemScope("prueba")).rpc("sync_enlaces_on")).data).toBe(false)
  })

  it("UserScope: escribir pasa por la RLS (crear categoría sí; en el libro de otro, no)", async () => {
    const pf = new PostgrestFactory(config, log)
    const ok = await pf.for(scope(owner)).from("categories").insert({ book_id: book, nombre: "Desde PostgREST", grupo: "g" }).select("id").single()
    expect(ok.error).toBeNull()
    const denied = await pf.for(scope(outsider)).from("categories").insert({ book_id: book, nombre: "Intruso", grupo: "g" })
    expect(denied.error?.code).toBe("42501")
  })

  it("SystemScope por PostgREST = service_role: lee lo que solo ve el servidor y llama sus funciones", async () => {
    const pf = new PostgrestFactory(config, log)
    const sys = pf.for(systemScope("prueba"))
    expect((await sys.rpc("mirai_notify_cron_active")).data).toBe(false)
    const members = await sys.from("household_members").select("user_id").eq("household_id", household)
    expect(members.data).toEqual([{ user_id: owner }])
    // Una persona no puede llamar lo que es solo del servidor.
    expect((await pf.for(scope(owner)).rpc("mirai_notify_cron_active")).error?.code).toBe("42501")
  })

  it("SupabaseJsFactory con DB_ADAPTER=postgrest habla con el mismo PostgREST", async () => {
    const sb = new SupabaseJsFactory(config, log, new PostgrestFactory(config, log))
    const r = await sb.for(scope(owner)).from("books").select("id").eq("id", book)
    expect(r.data).toEqual([{ id: book }])
    expect(await sb.ping()).toEqual({ ok: true })
  })

  it("adaptadores reales de la API por el puente: catálogos (F2-B), BookStore (F2-C) y el comando de pagar un fijo (F2-D)", async () => {
    const sb = new SupabaseJsFactory(config, log, new PostgrestFactory(config, log))
    const cats = await new SupabaseJsCatalogsRepo(sb).listCategories(scope(owner), { bookId: book })
    expect(cats.length).toBeGreaterThan(5)
    const store = new SupabaseJsBookStore(sb)
    const [fijo] = await store.insert(scope(owner), "fixed_expenses", [{ book_id: book, nombre: "Arriendo", valor: 1_200_000, dia: 5 }])
    expect(fijo.id).toBeTruthy()
    const paid = await store.rpc(scope(owner), "pay_fixed_expense", { p_fixed: String(fijo.id), p_periodo: "2026-11", p_fecha: "2026-11-05", p_valor: 1_200_000, p_medio: null as unknown as string, p_desc_suffix: "" })
    expect(paid).toBeTruthy()
    const gastos = await store.rows(scope(owner), "expenses", book)
    expect(gastos.some((g) => Number(g.valor) === 1_200_000)).toBe(true)
    // Alguien de afuera no puede pagar el fijo de otro hogar.
    await expect(store.rpc(scope(outsider), "pay_fixed_expense", { p_fixed: String(fijo.id), p_periodo: "2026-12", p_fecha: "2026-12-05", p_valor: 1, p_medio: null as unknown as string, p_desc_suffix: "" })).rejects.toBeTruthy()
  })

  it("PgKyselyFactory (Postgres directo): SystemScope = service_role con claims; UserScope = authenticated con RLS", async () => {
    const f = new PgKyselyFactory({ db: { adapter: "pg", url: PG_URL } } as AppConfig, log, new PostgresDialect({ pool }))
    const sys = await f.tx(systemScope("prueba"), async (trx) => (await sql<{ u: string; r: string }>`select current_user as u, auth.role() as r`.execute(trx)).rows[0])
    expect(sys).toEqual({ u: "service_role", r: "service_role" })
    const cred = await f.tx(systemScope("prueba"), async (trx) => (await sql<{ n: string }>`select public.member_access(${household}::uuid, ${owner}::uuid) as n`.execute(trx)).rows[0].n)
    expect(cred).toBe("owner")
    const usr = await f.tx(scope(owner), async (trx) => (await sql<{ u: string; id: string }>`select current_user as u, auth.uid()::text as id`.execute(trx)).rows[0])
    expect(usr).toEqual({ u: "authenticated", id: owner })
    const seen = await f.tx(scope(outsider), async (trx) => (await trx.selectFrom("categories").select("id").where("book_id", "=", book).execute()).length)
    expect(seen).toBe(0)
  })
})
