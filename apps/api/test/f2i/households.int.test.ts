// F2-I-1: hogar, personas, invitaciones, familia, pasar el hogar, salir, borrar y bienvenida, de punta a punta sobre
// Fastify con dobles. Incluye la matriz de roles completa (owner, admin, editor, registra, viewer y alguien de afuera).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ApiError } from "@mirai/contracts/common"
import { HouseholdPeople } from "@mirai/contracts/modules/households"
import type { AccessRole } from "@mirai/domain/household/roles"
import { DomainError } from "../../src/core/errors/domain-error"
import { H_GRATIS, H_PREMIUM, USERS } from "../setup/fixtures"
import { userToken } from "../setup/tokens"
import { createF2iApp, SITE, type F2iApp } from "./app"
import { familyRow } from "./fakes"

let t: F2iApp
type Who = AccessRole | "outsider"
const ROLES: Who[] = ["owner", "admin", "editor", "registra", "viewer", "outsider"]
const H = `/v1/households/${H_GRATIS}`
const FAM = "77777777-0000-4000-8000-000000000001"

async function call(who: Who, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: unknown, headers: Record<string, string> = {}) {
  const r = await t.app.inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${await userToken(USERS[who])}`, ...headers } })
  return { status: r.statusCode, body: r.json() as Record<string, unknown> & { data?: Record<string, unknown>; details?: Record<string, unknown>; msg?: string; code?: string } }
}

beforeAll(async () => {
  t = await createF2iApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  const h = t.fx.households
  h.calls = []
  h.invitations = []
  h.members_ = { [H_GRATIS]: [{ user_id: USERS.owner, role: "owner", access_role: "owner" }] }
  h.family_ = [familyRow({ id: FAM, household_id: H_GRATIS, nombre: "Sofía", rol: "Hija" })]
  h.rpcError = null
  t.fx.billing.subs = []
  t.fx.messenger.emails = []
  t.fx.purge.households = []
})

describe("matriz de roles del hogar (misma regla que la web: lib/household/roles.ts)", () => {
  // Rol mínimo de cada acción: invitar/ajustes = admin, planear = editor, borrar/pasar = owner, ver = viewer.
  const matrix: { name: string; run: (who: Who) => Promise<{ status: number }>; ok: Who[] }[] = [
    { name: "ver personas", run: (w) => call(w, "GET", `${H}/people`), ok: ["owner", "admin", "editor", "registra", "viewer"] },
    { name: "invitar", run: (w) => call(w, "POST", `${H}/invitations`, { destino: `nueva-${w}@example.com`, access: "viewer" }), ok: ["owner", "admin"] },
    { name: "cambiar el nombre", run: (w) => call(w, "PATCH", H, { nombre: "Casa Pérez" }), ok: ["owner", "admin"] },
    { name: "agregar integrante", run: (w) => call(w, "POST", `${H}/family`, { nombre: `Tío ${w}`, force: true }), ok: ["owner", "admin"] },
    { name: "editar integrante", run: (w) => call(w, "PUT", `${H}/family/${FAM}`, { nombre: "Sofía", rol: "Hija", force: true }), ok: ["owner", "admin", "editor"] },
    { name: "sacar integrante", run: (w) => call(w, "DELETE", `${H}/family/${FAM}`), ok: ["owner", "admin"] },
    { name: "pedir pasar el hogar", run: (w) => call(w, "POST", `${H}/transfer`, { userId: USERS.admin, fromRole: "admin", planAction: "seguir", confirm: "familia pérez" }), ok: ["owner"] },
    { name: "borrar el hogar", run: (w) => call(w, "DELETE", H, { confirm: "Familia Pérez" }), ok: ["owner"] },
    { name: "salir del hogar", run: (w) => call(w, "POST", `${H}/leave`), ok: ["admin", "editor", "registra", "viewer"] },
  ]
  for (const row of matrix) {
    it(row.name, async () => {
      const got: Record<string, number> = {}
      for (const who of ROLES) {
        t.fx.households.invitations = []
        t.fx.households.family_ = [familyRow({ id: FAM, household_id: H_GRATIS, nombre: "Sofía", rol: "Hija" })]
        got[who] = (await row.run(who)).status
      }
      const want = Object.fromEntries(ROLES.map((w) => [w, row.ok.includes(w) ? 200 : w === "outsider" ? 404 : w === "owner" && row.name === "salir del hogar" ? 409 : 403]))
      expect(got).toEqual(want)
    })
  }

  it("403 con el mensaje de la matriz y 404 sin revelar el hogar", async () => {
    const r = await call("viewer", "POST", `${H}/invitations`, { destino: "x@example.com", access: "viewer" })
    expect(ApiError.parse(r.body)).toMatchObject({ code: "ROLE_DENIED", msg: "Tu rol no permite invitar, agregar y quitar personas." })
    const o = await call("outsider", "GET", `${H}/people`)
    expect(o.body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos ese hogar." })
  })
})

describe("personas e invitaciones", () => {
  it("la lista junta personas, integrantes e invitaciones (solo quien invita ve las invitaciones)", async () => {
    const inv = await call("owner", "POST", `${H}/invitations`, { destino: "Primo@Example.com", nombre: "Primo", access: "editor" })
    expect(inv.status).toBe(200)
    t.fx.households.members_[H_GRATIS].push({ user_id: USERS.viewer, role: "viewer", access_role: "viewer" })
    const owner = await call("owner", "GET", `${H}/people`)
    const list = HouseholdPeople.parse(owner.body)
    expect(list.people.map((p) => [p.nombre, p.estado])).toEqual([["Ana", "miembro"], ["viewer", "miembro"], ["Sofía", "sin_cuenta"], ["Primo", "invitado"]])
    expect(list.people[0].me).toBe(true)
    expect(list.limite).toBe(2)
    expect(list.people[3].invite?.share?.url).toMatch(new RegExp(`^${SITE}/invitacion/[\\w-]{32}$`))
    const viewer = HouseholdPeople.parse((await call("viewer", "GET", `${H}/people`)).body)
    expect(viewer.people.some((p) => p.estado === "invitado")).toBe(false)
  })

  it("invitar: normaliza el destino, guarda el hash (no el token), cifra el enlace y envía por el canal", async () => {
    const r = await call("admin", "POST", `${H}/invitations`, { destino: "  Prima@EXAMPLE.com ", access: "registra" })
    expect(r.status).toBe(200)
    const row = t.fx.households.invitations[0]
    expect(row).toMatchObject({ email: "prima@example.com", access_role: "registra", role: "viewer", invited_by: USERS.admin })
    const url = String((r.body.data as { share: { url: string } }).share.url)
    const token = url.split("/").pop()!
    expect(row.token_hash).not.toContain(token)
    expect(row.token_enc).toMatch(/^v1\./)
    expect(r.body.data).toMatchObject({ msg: "Invitación enviada (correo de prueba: no se envió de verdad).", delivery: { email: { ok: true, via: "prueba" } } })
    expect(t.fx.messenger.emails[0]).toMatchObject({ to: "prima@example.com", m: { hogar: "Familia Pérez", rol: "registra" } })
    // El enlace se puede volver a compartir (token descifrado) y es el mismo.
    const s = await call("admin", "GET", `${H}/invitations/${row.id}/share`)
    expect((s.body.data as { share: { url: string } }).share.url).toBe(url)
  })

  it("duplicados y límites: 409 con details.reason (como el `code` de la web) y 402 por el plan", async () => {
    t.fx.households.members_[H_GRATIS].push({ user_id: USERS.editor, role: "editor", access_role: "editor" })
    expect((await call("owner", "POST", `${H}/invitations`, { destino: "editor@correo.co", access: "viewer" })).body).toMatchObject({ code: "CONFLICT", details: { reason: "miembro" }, msg: "editor ya hace parte de tu hogar." })
    // Con 2 personas (el límite del plan Gratis) ya no se puede invitar.
    const lim = await call("owner", "POST", `${H}/invitations`, { destino: "otra@example.com", access: "viewer" })
    expect(lim.status).toBe(402)
    expect(lim.body.msg).toBe("Tu plan permite 2 personas con cuenta por hogar. Cambia de plan para invitar a toda tu familia.")
    t.fx.households.members_[H_GRATIS].pop()
    await call("owner", "POST", `${H}/invitations`, { destino: "rep@example.com", access: "viewer" })
    const dup = await call("owner", "POST", `${H}/invitations`, { destino: "REP@example.com", access: "viewer" })
    expect(dup.body).toMatchObject({ code: "CONFLICT", details: { reason: "pendiente", invitationId: t.fx.households.invitations[0].id } })
    const same = await call("owner", "POST", `${H}/invitations`, { destino: "sofi@example.com", nombre: "sofia", access: "viewer" })
    expect(same.body).toMatchObject({ code: "CONFLICT", details: { reason: "mismo_nombre", familyId: FAM } })
  })

  it("no puede dar un rol con más permisos que el suyo", async () => {
    const r = await call("admin", "POST", `${H}/invitations`, { destino: "x@example.com", access: "admin" })
    expect(r.status).toBe(200)
    t.fx.households.invitations = []
    const e = await call("editor", "POST", `${H}/invitations`, { destino: "x@example.com", access: "viewer" })
    expect(e.status).toBe(403)
  })

  it("límite de invitaciones reales (invitarMin: 5 en 5 minutos); los correos de prueba no cuentan", async () => {
    const who: Who = "admin"
    for (let i = 0; i < 7; i++) {
      t.fx.households.invitations = []
      expect((await call(who, "POST", `${H}/invitations`, { destino: `prueba${i}@example.com`, access: "viewer" })).status).toBe(200)
    }
    for (let i = 0; i < 5; i++) {
      t.fx.households.invitations = []
      expect((await call(who, "POST", `${H}/invitations`, { destino: `real${i}@gmail.com`, access: "viewer" })).status).toBe(200)
    }
    t.fx.households.invitations = []
    const r = await call(who, "POST", `${H}/invitations`, { destino: "real6@gmail.com", access: "viewer" })
    expect(r.status).toBe(429)
    expect(r.body.msg).toMatch(/^Enviaste muchas invitaciones seguidas\. Espera/)
  })

  it("reenviar respeta el intervalo (429 details.reason = 'espera') y cancelar deja el enlace sin servir", async () => {
    await call("owner", "POST", `${H}/invitations`, { destino: "tia@example.com", access: "viewer" })
    const id = t.fx.households.invitations[0].id
    const again = await call("owner", "POST", `${H}/invitations/${id}/resend`)
    expect(again.status).toBe(429)
    expect(again.body).toMatchObject({ code: "RATE_LIMITED", details: { reason: "espera" } })
    t.fx.households.invitations[0].last_sent_at = new Date(Date.now() - 11 * 60_000).toISOString()
    expect((await call("owner", "POST", `${H}/invitations/${id}/resend`)).body.data).toMatchObject({ msg: "Invitación reenviada (correo de prueba: no se envió de verdad)." })
    expect((await call("owner", "DELETE", `${H}/invitations/${id}`)).body.data).toEqual({ msg: "Invitación cancelada. El enlace ya no sirve." })
    expect((await call("owner", "GET", `${H}/invitations/${id}/share`)).status).toBe(404)
  })

  it("la misma Idempotency-Key no crea dos invitaciones", async () => {
    const k = { "idempotency-key": "invitar-tia-123456" }
    const a = await call("owner", "POST", `${H}/invitations`, { destino: "abuela@example.com", access: "viewer" }, k)
    const b = await call("owner", "POST", `${H}/invitations`, { destino: "abuela@example.com", access: "viewer" }, k)
    expect(b.body).toEqual(a.body)
    expect(t.fx.households.invitations).toHaveLength(1)
  })
})

describe("roles, integrantes y RPC de la base", () => {
  it("cambiar el rol va por set_member_access con el JWT de la persona; dueño no es un rol asignable", async () => {
    const r = await call("admin", "PATCH", `${H}/people/${USERS.viewer}/role`, { access: "editor" })
    expect(r.body.data).toEqual({ msg: "Rol actualizado: Colabora." })
    expect(t.fx.households.called("rpc:set_member_access")[0]).toMatchObject({ scope: "user", args: [{ p_household: H_GRATIS, p_user: USERS.viewer, p_access: "editor" }] })
    expect((await call("owner", "PATCH", `${H}/people/${USERS.viewer}/role`, { access: "owner" })).status).toBe(400)
  })

  it("el RAISE de la base sale con su texto en español (P0001 → 400)", async () => {
    t.fx.households.rpcError = DomainError.fromPg({ code: "P0001", message: "No puedes cambiar el rol del dueño." })
    const r = await call("admin", "PATCH", `${H}/people/${USERS.owner}/role`, { access: "viewer" })
    expect(r.body).toMatchObject({ code: "VALIDATION", msg: "No puedes cambiar el rol del dueño." })
  })

  it("quitar a una persona cierra sus accesos del contador", async () => {
    const r = await call("owner", "DELETE", `${H}/people/${USERS.viewer}`)
    expect(r.body.data).toEqual({ self: false, msg: "Ya no tiene acceso al hogar. Sus gastos e ingresos se quedan a su nombre." })
    expect(t.fx.households.called("revokeAccountantShares")[0].args).toEqual([H_GRATIS, USERS.viewer])
  })

  it("integrante: nombre repetido pide confirmar; con cuenta no se puede sacar; deshacer lo devuelve", async () => {
    const dup = await call("owner", "POST", `${H}/family`, { nombre: "SOFÍA" })
    expect(dup.body).toMatchObject({ code: "CONFLICT", details: { reason: "mismo_nombre" } })
    const ok = await call("owner", "POST", `${H}/family`, { nombre: "Abuelo" })
    expect(ok.body.data).toMatchObject({ msg: "Abuelo ya hace parte de tu hogar." })
    expect(t.fx.households.called("saveFamily")[0].scope).toBe("user")
    t.fx.households.family_[0].user_id = USERS.editor
    expect((await call("owner", "DELETE", `${H}/family/${FAM}`)).status).toBe(409)
    t.fx.households.family_[0].user_id = null
    expect((await call("owner", "DELETE", `${H}/family/${FAM}`)).body.data).toEqual({ msg: "Sofía ya no está en el hogar." })
    expect(t.fx.households.called("cancelFamilyInvitations")).toHaveLength(1)
    expect((await call("owner", "POST", `${H}/family/${FAM}/restore`)).body.data).toEqual({ msg: "Sofía volvió al hogar." })
  })
})

describe("pasar el hogar, salir y borrar", () => {
  it("pedir pasar el hogar exige escribir el nombre y avisa a la persona", async () => {
    expect((await call("owner", "POST", `${H}/transfer`, { userId: USERS.admin, fromRole: "admin", planAction: "seguir", confirm: "otro" })).status).toBe(400)
    const r = await call("owner", "POST", `${H}/transfer`, { userId: USERS.admin, fromRole: "editor", planAction: "seguir", confirm: " FAMILIA PÉREZ " })
    expect(r.body.data).toEqual({ msg: "Listo: le enviamos a admin un aviso en Mirai. Cuando acepte, será el dueño del hogar." })
  })

  it("candidatos: solo el dueño puede, y se ve si paga una renovación", async () => {
    t.fx.households.members_[H_GRATIS].push({ user_id: USERS.admin, role: "editor", access_role: "admin" })
    t.fx.billing.subs.push({ id: "s1", household_id: H_GRATIS, proveedor: "mercadopago", estado: "activa", plan: "premium", periodo: "mes", proveedor_ref: "pre-9", vence_at: null, created_by: USERS.owner })
    const o = await call("owner", "GET", `${H}/transfer/candidates`)
    expect(o.body).toMatchObject({ owner: true, tienePago: true, hogar: "Familia Pérez", people: [{ userId: USERS.admin, access: "admin", ok: true }] })
    expect((await call("admin", "GET", `${H}/transfer/candidates`)).body).toMatchObject({ owner: false, msg: "Solo el dueño puede pasar el hogar a otra persona." })
  })

  it("aceptar con 'cancelar' cancela la renovación de quien lo pasó (sin cobros reales: doble de Mercado Pago)", async () => {
    t.fx.billing.subs.push({ id: "s2", household_id: H_GRATIS, proveedor: "mercadopago", estado: "activa", plan: "premium", periodo: "mes", proveedor_ref: "pre-77", vence_at: null, created_by: USERS.owner })
    t.fx.households.respond = { estado: "aceptada", household_id: H_GRATIS, from_user: USERS.owner, plan_action: "cancelar" }
    const r = await call("admin", "POST", "/v1/transfers/88888888-0000-4000-8000-000000000001/respond", { accept: true })
    expect(r.body.data).toEqual({ msg: "¡Listo! Ahora eres el dueño del hogar. El plan y borrar el hogar quedan en tus manos." })
    expect(t.fx.mp.canceled).toContain("pre-77")
    expect(t.fx.billing.subs.find((s) => s.id === "s2")?.estado).toBe("cancelada")
    t.fx.households.respond = { estado: "vencida", household_id: H_GRATIS }
    expect((await call("admin", "POST", "/v1/transfers/88888888-0000-4000-8000-000000000001/respond", { accept: true })).body).toMatchObject({ code: "CONFLICT", details: { reason: "vencida" } })
  })

  it("borrar: no con una renovación activa; sí con el nombre escrito (borra sus archivos primero)", async () => {
    t.fx.billing.subs.push({ id: "s3", household_id: H_GRATIS, proveedor: "mercadopago", estado: "pendiente", plan: "premium", periodo: "mes", proveedor_ref: null, vence_at: null, created_by: USERS.owner })
    expect((await call("owner", "DELETE", H, { confirm: "Familia Pérez" })).body).toMatchObject({ code: "CONFLICT", details: { reason: "renovacion" } })
    t.fx.billing.subs = []
    expect((await call("owner", "DELETE", H, { confirm: "Familia" })).status).toBe(400)
    const r = await call("owner", "DELETE", H, { confirm: "familia pérez" })
    expect(r.body.data).toEqual({ msg: "Borramos “Familia Pérez” con sus libros." })
    expect(t.fx.purge.households).toEqual([H_GRATIS])
    expect(t.fx.households.called("deleteHousehold")[0]).toMatchObject({ scope: "system", args: [H_GRATIS] })
    expect(t.fx.households.called("accountEvent")[0].args[0]).toMatchObject({ kind: "hogar_borrado", detail: { hogar: "Familia Pérez" } })
  })

  it("el dueño no puede salir (409); los demás salen y se cierran sus accesos del contador", async () => {
    expect((await call("owner", "POST", `${H}/leave`)).body).toMatchObject({ code: "CONFLICT", msg: "Eres el dueño: primero pásale el hogar a otra persona o bórralo." })
    const r = await call("registra", "POST", `${H}/leave`)
    expect(r.body.data).toEqual({ msg: "Saliste de “Familia Pérez”. Para volver, alguien tendrá que invitarte de nuevo." })
    expect(t.fx.households.called("revokeAccountantShares")[0].args).toEqual([H_GRATIS, USERS.registra])
  })
})

describe("invitación pública y aceptar", () => {
  it("sin sesión usa SystemScope; con sesión, la de la persona (ya_miembro)", async () => {
    t.fx.households.info = { estado: "pendiente", hogar: "Familia Pérez", invita: "Ana", rol: "editor", vence: "2026-11-09T00:00:00Z" }
    const anon = await t.app.inject({ method: "GET", url: "/v1/invitations/token-de-prueba-123" })
    expect(anon.statusCode).toBe(200)
    expect(anon.json()).toMatchObject({ estado: "pendiente", hogar: "Familia Pérez", rol: "editor" })
    expect(t.fx.households.called("invitationInfo")[0].scope).toBe("system")
    await call("viewer", "GET", "/v1/invitations/token-de-prueba-123")
    expect(t.fx.households.called("invitationInfo")[1].scope).toBe("user")
    t.fx.households.info = null
    expect((await t.app.inject({ method: "GET", url: "/v1/invitations/otro" })).json()).toEqual({ estado: "no_existe" })
  })

  it("aceptar abre el primer libro; con el hogar lleno según su plan: 402", async () => {
    t.fx.households.info = { estado: "pendiente" }
    const ok = await call("outsider", "POST", "/v1/invitations/token-de-prueba-123/accept")
    expect(ok.body.data).toEqual({ householdId: H_GRATIS, bookId: `book-de-${H_GRATIS.slice(0, 8)}`, ya: false, msg: "¡Listo! Ya haces parte del hogar." })
    // Hogar Gratis con 2 personas y una invitación pendiente con ese token.
    const inv = await call("owner", "POST", `${H}/invitations`, { destino: "lleno@example.com", access: "viewer" })
    const token = String((inv.body.data as { share: { url: string } }).share.url).split("/").pop()!
    t.fx.households.members_[H_GRATIS].push({ user_id: USERS.editor, role: "editor", access_role: "editor" })
    const full = await call("outsider", "POST", `/v1/invitations/${token}/accept`)
    expect(full.status).toBe(402)
    expect(full.body.msg).toMatch(/^Ese hogar ya tiene las 2 personas que permite su plan/)
  })
})

describe("bienvenida y referidos", () => {
  it("crea el hogar con la sesión de la persona y premia a los dos hogares del referido", async () => {
    const ref = t.fx.households.referral
    ref.owner = USERS.owner
    ref.own = { [USERS.owner]: H_PREMIUM, [USERS.outsider]: "99999999-0000-4000-8000-000000000001" }
    const r = await call("outsider", "POST", "/v1/households", { nombre: "Nuevo", hogar: "Mi casa", libro: "Personal", ref: " abcd2345 " })
    expect(r.body.data).toEqual({ bookId: "book-nuevo", msg: "¡Listo! Tu hogar quedó creado." })
    expect(t.fx.households.called("createHousehold")[0]).toMatchObject({ scope: "user", args: ["Mi casa", "Personal"] })
    expect(t.fx.households.courtesies.map((c) => c.householdId)).toEqual([H_PREMIUM, "99999999-0000-4000-8000-000000000001"])
    expect(t.fx.households.notices.map((n) => n.titulo)).toEqual(["¡Ganaste 30 días de Mirai Premium!", "¡Ganaste 30 días de Mirai Premium!"])
    expect(Object.values(t.fx.households.referralState)).toEqual(["recompensado"])
  })

  it("valida los campos en español", async () => {
    const r = await call("outsider", "POST", "/v1/households", { nombre: "A", hogar: "Mi casa", libro: "Personal" })
    expect(r.status).toBe(400)
    expect(JSON.stringify(r.body)).toContain("Escribe tu nombre")
  })
})
