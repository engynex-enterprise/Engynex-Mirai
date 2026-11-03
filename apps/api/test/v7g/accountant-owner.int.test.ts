// V7-G (grupo D): lado del titular del acceso del contador (/v1/books/:bookId/accountant/**) con la app real y RowStore
// en memoria: el token se devuelve una vez y solo se guarda su hash, roles (Administra / Colabora / ver), plan
// «impuestos», límite «contador», idempotencia, correo opcional, notas del mismo libro y documentos visibles.
import { createHash } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { SiteUrl } from "../../src/modules/households/site-url"
import { AccountantMailer } from "../../src/modules/tax/accountant-mailer"
import { estadoDe, expiry } from "../../src/modules/tax/accountant-owner.service"
import { B_GRATIS, B_PREMIUM, USERS } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "./app"
import { B_FREE, FakeMailer, premiumContext, SITE, site } from "./d-fakes"

let t: V7gApp
const mailer = new FakeMailer()
const S = (b = B_GRATIS) => `/v1/books/${b}/accountant`
const hash = (s: string) => createHash("sha256").update(s).digest("hex")
const SHARE = "aaaaaaaa-0000-4000-8000-000000000001"
const OTRO = "aaaaaaaa-0000-4000-8000-000000000002"
const NEW = { label: "Contadora Luz", email: "", perms: "renta", exp: "90" }

beforeAll(async () => {
  t = await createV7gApp({ context: premiumContext, overrides: [[AccountantMailer, mailer], [SiteUrl, site()]] })
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.rows.reset()
  mailer.sent = []
  mailer.fail = false
  mailer.on = true
  t.fx.rows.seed("accountant_shares", [
    { id: SHARE, book_id: B_GRATIS, label: "Contador Pedro", email: "pedro@contador.co", perms: "todo", token_hash: "h-viejo", expires_at: null, revoked_at: null, views: 3, last_access: null, created_by: USERS.owner, created_at: "2026-10-01T00:00:00Z" },
    { id: OTRO, book_id: B_PREMIUM, label: "Ajeno", email: "", perms: "renta", token_hash: "h-ajeno", expires_at: "2020-01-01T00:00:00Z", revoked_at: null, views: 0, last_access: null, created_by: USERS.owner, created_at: "2026-09-01T00:00:00Z" },
  ])
})

describe("reglas puras", () => {
  it("vencimiento y estado como la web", () => {
    const now = new Date("2026-11-02T12:00:00Z")
    expect(expiry("nunca", now)).toBeNull()
    expect(expiry("30", now)).toBe("2026-12-02T12:00:00.000Z")
    expect(expiry("dic", now)).toBe("2027-01-01T04:59:00.000Z")
    expect(estadoDe({ revoked_at: "x", expires_at: null }, now)).toBe("quitado")
    expect(estadoDe({ revoked_at: null, expires_at: "2026-01-01" }, now)).toBe("vencido")
    expect(estadoDe({ revoked_at: null, expires_at: null }, now)).toBe("activo")
  })
})

describe("accesos", () => {
  it("cualquier integrante los ve (sin el hash) y solo los del libro", async () => {
    const r = await t.call("GET", `${S()}/shares`, "viewer")
    expect(r.status).toBe(200)
    expect(r.body).toEqual([{ id: SHARE, label: "Contador Pedro", email: "pedro@contador.co", perms: "todo", expires_at: null, revoked_at: null, views: 3, last_access: null, created_at: "2026-10-01T00:00:00Z", estado: "activo" }])
    expect(JSON.stringify(r.body)).not.toContain("h-viejo")
    expect(t.fx.rows.scopesOf("accountant_shares")).toEqual(["user"])
  })

  it("crear: el enlace sale una vez y en la base solo queda el hash; con la sesión de quien lo crea", async () => {
    const r = await t.call("POST", `${S()}/shares`, "admin", NEW)
    expect(r.status).toBe(200)
    const d = r.body.data as { id: string; url: string; msg: string; enviado: boolean }
    expect(d.url).toMatch(new RegExp(`^${SITE}/contador/[\\w-]{32}$`))
    expect(d).toMatchObject({ enviado: false, msg: "Copia el enlace y envíaselo a Contadora Luz por un medio seguro." })
    const row = t.fx.rows.all<Record<string, unknown>>("accountant_shares").find((s) => s.id === d.id)!
    expect(row).toMatchObject({ book_id: B_GRATIS, label: "Contadora Luz", perms: "renta", created_by: USERS.admin, token_hash: hash(d.url.split("/").pop()!) })
    expect(new Date(String(row.expires_at)).getTime()).toBeGreaterThan(Date.now() + 89 * 864e5)
    expect(JSON.stringify(row)).not.toContain(d.url.split("/").pop())
    expect(t.fx.rows.calls.find((c) => c.m === "insert")?.scope).toMatchObject({ kind: "user", userId: USERS.admin })
  })

  it("con correo se lo envía; si el correo falla igual queda creado", async () => {
    const r = await t.call("POST", `${S()}/shares`, "admin", { ...NEW, email: "luz@contadora.co" })
    expect(r.body.data).toMatchObject({ enviado: true, msg: "Le enviamos el enlace a luz@contadora.co." })
    expect(mailer.sent).toMatchObject([{ to: "luz@contadora.co", owner: "admin@correo.co", url: (r.body.data as { url: string }).url }])
    mailer.fail = true
    const r2 = await t.call("POST", `${S()}/shares`, "admin", { ...NEW, email: "luz@contadora.co" })
    expect(r2.body.data).toMatchObject({ enviado: false })
    expect(t.fx.rows.all("accountant_shares")).toHaveLength(4)
  })

  it("Idempotency-Key: repetir no crea otro acceso y devuelve el mismo enlace", async () => {
    const h = { "idempotency-key": "crear-acceso-0001" }
    const a = await t.call("POST", `${S()}/shares`, "admin", NEW, h)
    const b = await t.call("POST", `${S()}/shares`, "admin", NEW, h)
    expect(b.headers["idempotent-replayed"]).toBe("true")
    expect(b.body).toEqual(a.body)
    expect(t.fx.rows.all("accountant_shares")).toHaveLength(3)
  })

  it("roles, plan y validación en español", async () => {
    const e = await t.call("POST", `${S()}/shares`, "editor", NEW)
    expect(e).toMatchObject({ status: 403, body: { code: "ROLE_DENIED" } })
    expect(e.body.msg).toContain("Administra")
    const p = await t.call("POST", `${S(B_FREE)}/shares`, "owner", NEW)
    expect(p).toMatchObject({ status: 402, body: { code: "PLAN_REQUIRED" } })
    const v = await t.call("POST", `${S()}/shares`, "admin", { ...NEW, label: " ", email: "no-es-correo" })
    expect(v.status).toBe(400)
    expect(JSON.stringify(v.body)).toMatch(/Escribe el nombre de tu contador|Correo inválido/)
    expect((await t.call("GET", `${S(B_PREMIUM)}/shares`, "admin")).status).toBe(404)
  })

  it("enlace nuevo: cambia el hash y reactiva; de otro libro o inexistente → 404", async () => {
    t.fx.rows.update({ kind: "system", reason: "prueba" }, "accountant_shares", { eq: { id: SHARE } }, { revoked_at: "2026-10-05T00:00:00Z" })
    const r = await t.call("POST", `${S()}/shares/${SHARE}/rotate`, "admin")
    expect(r.status).toBe(200)
    const tok = (r.body.data as { url: string }).url.split("/").pop()!
    expect(t.fx.rows.all<Record<string, unknown>>("accountant_shares").find((s) => s.id === SHARE)).toMatchObject({ token_hash: hash(tok), revoked_at: null })
    const x = await t.call("POST", `${S()}/shares/${OTRO}/rotate`, "admin")
    expect(x).toMatchObject({ status: 404, body: { msg: "Ese acceso ya no existe." } })
  })

  it("quitar el acceso: Administra, también sin el plan; Colabora no", async () => {
    expect((await t.call("DELETE", `${S()}/shares/${SHARE}`, "editor")).status).toBe(403)
    const r = await t.call("DELETE", `${S()}/shares/${SHARE}`, "admin")
    expect(r.body).toEqual({ ok: true, data: { msg: "Contador Pedro ya no puede entrar." } })
    expect(t.fx.rows.all<Record<string, unknown>>("accountant_shares").find((s) => s.id === SHARE)?.revoked_at).toBeTruthy()
    t.fx.rows.seed("accountant_shares", [{ id: "bbbbbbbb-0000-4000-8000-000000000003", book_id: B_FREE, label: "Viejo", email: "", perms: "renta", token_hash: "h", expires_at: null, revoked_at: null, views: 0, created_at: "2026-01-01" }])
    expect((await t.call("DELETE", `${S(B_FREE)}/shares/bbbbbbbb-0000-4000-8000-000000000003`, "owner")).status).toBe(200)
  })

  it("límite «contador»: 10 accesos al día por persona", async () => {
    for (let i = 0; i < 10; i++) expect((await t.call("POST", `${S()}/shares`, "owner", NEW)).status).toBe(200)
    const r = await t.call("POST", `${S()}/shares`, "owner", NEW)
    expect(r.status).toBe(429)
    expect(r.body.msg).toMatch(/^Creaste muchos accesos hoy/)
  })
})

describe("notas", () => {
  it("el titular (Colabora) deja una nota en un acceso de este libro; se listan en orden y sin las borradas", async () => {
    t.fx.rows.seed("accountant_notes", [
      { id: "n-2", book_id: B_GRATIS, share_id: SHARE, autor: "contador", texto: "Falta el certificado", created_at: "2026-10-03T00:00:00Z", deleted_at: null },
      { id: "n-1", book_id: B_GRATIS, share_id: SHARE, autor: "titular", texto: "Hola", created_at: "2026-10-02T00:00:00Z", deleted_at: null },
      { id: "n-0", book_id: B_GRATIS, share_id: SHARE, autor: "titular", texto: "borrada", created_at: "2026-10-01T00:00:00Z", deleted_at: "2026-10-01T01:00:00Z" },
    ])
    const r = await t.call("POST", `${S()}/notes`, "editor", { shareId: SHARE, texto: "  Ya te lo subo  " })
    expect(r.body).toEqual({ ok: true, data: { saved: true } })
    const l = await t.call("GET", `${S()}/notes`, "viewer")
    expect((l.body as unknown as { id: string; texto: string; autor: string }[]).map((n) => [n.autor, n.texto])).toEqual([["titular", "Hola"], ["contador", "Falta el certificado"], ["titular", "Ya te lo subo"]])
    expect(t.fx.rows.all<Record<string, unknown>>("accountant_notes").at(-1)).toMatchObject({ autor: "titular", created_by: USERS.editor, book_id: B_GRATIS })
  })

  it("acceso de otro libro → 404; Registra o Ve → 403; vacía → 400", async () => {
    expect((await t.call("POST", `${S()}/notes`, "editor", { shareId: OTRO, texto: "x" })).body).toMatchObject({ code: "NOT_FOUND", msg: "Ese acceso ya no existe." })
    expect((await t.call("POST", `${S()}/notes`, "registra", { shareId: SHARE, texto: "x" })).status).toBe(403)
    expect((await t.call("POST", `${S()}/notes`, "editor", { shareId: SHARE, texto: "   " })).status).toBe(400)
    expect(t.fx.rows.all("accountant_notes")).toEqual([])
  })
})

describe("documentos visibles para el contador", () => {
  beforeEach(() => {
    t.fx.rows.seed("attachments", [
      { id: "cccccccc-0000-4000-8000-000000000001", book_id: B_GRATIS, nombre: "Certificado.pdf", path: `${B_GRATIS}/renta/cert.pdf`, mime: "application/pdf", size: "2048", year: 2025, doc_key: "cert", visible_contador: true, created_at: "2026-10-01", deleted_at: null },
      { id: "cccccccc-0000-4000-8000-000000000002", book_id: B_GRATIS, nombre: "Factura.jpg", path: `${B_GRATIS}/f.jpg`, mime: "image/jpeg", size: 100, year: null, doc_key: null, visible_contador: false, created_at: "2026-10-02", deleted_at: null },
    ])
  })

  it("lista lo visible (o todo con todos=1) y Administra lo muestra u oculta", async () => {
    expect((await t.call("GET", `${S()}/files`, "viewer")).body).toMatchObject([{ nombre: "Certificado.pdf", size: 2048 }])
    expect((await t.call("GET", `${S()}/files?todos=1`, "viewer")).body).toHaveLength(2)
    const r = await t.call("PATCH", `${S()}/files/cccccccc-0000-4000-8000-000000000002`, "admin", { visible: true })
    expect(r.body).toMatchObject({ ok: true, data: { nombre: "Factura.jpg", visible_contador: true } })
    expect((await t.call("GET", `${S()}/files`, "viewer")).body).toHaveLength(2)
    expect((await t.call("PATCH", `${S()}/files/cccccccc-0000-4000-8000-000000000002`, "editor", { visible: false })).status).toBe(403)
    expect((await t.call("PATCH", `${S()}/files/cccccccc-0000-4000-8000-000000000009`, "admin", { visible: false })).body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos ese documento." })
  })
})
