// Spike de V7-A (docs/arquitectura/v7-gcp-total.md §3.1.2 y §4): ¿Better Auth con el adaptador Kysely respeta el
// esquema `auth` y los nombres de Supabase? ¿Sirve un hash bcrypt de Supabase tal cual?
import bcrypt from "bcryptjs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createMiraiAuth, type AuthDelivery, type MiraiAuth } from "../../src/modules/auth/auth.config"
import { loadAuthEnv } from "../../src/modules/auth/auth.env"
import { freshDb, hasPg, type TestDb } from "./pg"

describe.skipIf(!hasPg)("spike: Better Auth sobre el esquema auth (Postgres 17)", () => {
  let t: TestDb
  let auth: MiraiAuth
  const mails: AuthDelivery[] = []
  beforeAll(async () => {
    t = await freshDb("spike")
    const env = loadAuthEnv({ AUTH_PROVIDER: "mirai", BETTER_AUTH_SECRET: "s".repeat(40), DATABASE_URL: t.url, BETTER_AUTH_URL: "http://localhost:3000" })
    auth = createMiraiAuth({ env, db: t.db, deliver: async (m) => void mails.push(m), registroAbierto: async () => true })
  })
  afterAll(async () => t?.drop())

  it("schemaName: el registro escribe en auth.users con UUID y dispara handle_new_user()", async () => {
    await auth.api.signUpEmail({ body: { email: "Ana@Ejemplo.co", password: "Clave-Segura-2026", name: "Ana", nombre: "Ana Pérez", acepta_version: "2026-11-01.2" } as never })
    const { rows } = await t.sql("select id, email, email_verified, raw_user_meta_data from auth.users")
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(rows[0].email).toBe("ana@ejemplo.co")
    expect(rows[0].email_verified).toBe(false)
    expect(rows[0].raw_user_meta_data).toMatchObject({ nombre: "Ana Pérez", acepta_version: "2026-11-01.2" })
    const p = await t.sql("select nombre from public.profiles")
    expect(p.rows[0].nombre).toBe("Ana Pérez")
    const c = await t.sql("select document, version from public.consents order by document")
    expect(c.rows.map((r) => r.document)).toEqual(["privacidad", "terminos"])
    const a = await t.sql("select provider_id, password from auth.accounts")
    expect(a.rows[0].provider_id).toBe("credential")
    expect(a.rows[0].password).toMatch(/^\$2[ab]\$12\$/)
    expect(mails.map((m) => m.kind)).toEqual(["verify"])
  })

  it("un hash bcrypt de Supabase ($2a$10$) entra sin cambiar la clave", async () => {
    const id = crypto.randomUUID()
    const hash = bcrypt.hashSync("ClaveDeSupabase1!", 10).replace(/^\$2b\$/, "$2a$")
    await t.sql("insert into auth.users (id, email, email_verified, name) values ($1, 'luis@ejemplo.co', true, 'Luis')", [id])
    await t.sql("insert into auth.accounts (id, user_id, account_id, provider_id, password) values ($1, $2::uuid, $2::text, 'credential', $3)", [crypto.randomUUID(), id, hash])
    const r = await auth.api.signInEmail({ body: { email: "luis@ejemplo.co", password: "ClaveDeSupabase1!" }, returnHeaders: true })
    expect(r.response.user.id).toBe(id)
    expect(r.headers.get("set-cookie")).toMatch(/mirai\.session_token=/)
    const s = await t.sql("select user_id, aal, amr from auth.sessions")
    expect(s.rows[0]).toMatchObject({ user_id: id, aal: "aal1", amr: "password" })
    const u = await t.sql("select last_sign_in_at from auth.users where id = $1", [id])
    expect(u.rows[0].last_sign_in_at).not.toBeNull()
  })
})
