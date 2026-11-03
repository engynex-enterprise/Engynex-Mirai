// F2-I-2: la cuenta (correo, formas de entrar, sesiones, actividad y borrar la cuenta) sobre el puerto IdentityAdmin.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { AccountData } from "@mirai/contracts/modules/account"
import { H_GRATIS, H_PREMIUM, USERS } from "../setup/fixtures"
import { userToken } from "../setup/tokens"
import { createF2iApp, SITE, type F2iApp } from "./app"
import { ACCOUNT } from "./fakes"

let t: F2iApp
const GOOGLE_ID = "11111111-1111-4111-8111-111111111111"
const recent = () => ({ amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 60 }] })

async function call(method: "GET" | "POST" | "DELETE", url: string, o: { who?: keyof typeof USERS; payload?: unknown; claims?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
  const tok = await userToken(USERS[o.who ?? "owner"], o.claims ?? {})
  const r = await t.app.inject({ method, url, payload: o.payload as object, headers: { authorization: `Bearer ${tok}`, ...o.headers } })
  return { status: r.statusCode, body: r.json() }
}

beforeAll(async () => {
  t = await createF2iApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.account.account = { ...ACCOUNT, identities: [...ACCOUNT.identities] }
  t.fx.account.calls = []
  t.fx.identity.calls = []
  t.fx.identity.emailError = null
  t.fx.purge.users = []
  t.fx.purge.households = []
})

describe("GET /v1/account", () => {
  it("formas de entrar, sesiones, hogares con su rol y las solicitudes de dueño", async () => {
    t.fx.account.allMembers = [{ household_id: H_GRATIS, user_id: USERS.owner }, { household_id: H_GRATIS, user_id: USERS.editor }, { household_id: H_PREMIUM, user_id: USERS.owner }]
    t.fx.households.transfers = [{ id: "t1", household_id: H_GRATIS, from_user: USERS.editor, to_user: USERS.owner, from_role: "admin", plan_action: "seguir", status: "pendiente", expires_at: new Date(Date.now() + 864e5).toISOString(), created_at: new Date().toISOString() }]
    const r = await call("GET", `/v1/account?householdId=${H_PREMIUM}`)
    const d = AccountData.parse(r.body)
    expect(d.households.map((h) => [h.nombre, h.access, h.personas, h.active])).toEqual([["Familia Pérez", "owner", 2, false], ["Tienda", "owner", 1, true]])
    expect(d.incoming).toMatchObject([{ id: "t1", hogar: "Familia Pérez", de: "editor", para: "owner", fromRole: "admin" }])
    expect(d.sessions[0].actual).toBe(true)
    t.fx.households.transfers = []
  })
})

describe("cambio de correo", () => {
  it("correo de prueba: queda pendiente sin enviar nada ni gastar el límite", async () => {
    const r = await call("POST", "/v1/account/email-change", { payload: { email: "Nuevo@Example.com" } })
    expect(r.body.data).toEqual({ prueba: true, msg: "Correo de prueba: no se envió de verdad. El cambio a nuevo@example.com quedó pendiente de confirmar." })
    expect(t.fx.identity.calls).toEqual([{ m: "pendingEmailChange", args: ["owner@correo.co", "nuevo@example.com"] }])
  })

  it("correo real: el proveedor envía el enlace con la vuelta a la web que llamó (si está permitida)", async () => {
    await call("POST", "/v1/account/email-change", { payload: { email: "ana@gmail.com" }, headers: { origin: "http://localhost:3000" } })
    expect(t.fx.identity.calls[0]).toEqual({ m: "requestEmailChange", args: ["ana@gmail.com", "http://localhost:3000/auth/callback?next=%2Fperfil%3Fcorreo%3Dlisto%23cuentas"] })
    await call("POST", "/v1/account/email-change", { payload: { email: "ana2@gmail.com" }, headers: { origin: "https://phishing.example" } })
    expect(t.fx.identity.calls[1].args[1]).toBe(`${SITE}/auth/callback?next=%2Fperfil%3Fcorreo%3Dlisto%23cuentas`)
  })

  it("validación, correo en uso (409) y el mismo correo de la cuenta (400)", async () => {
    expect((await call("POST", "/v1/account/email-change", { payload: { email: "owner@correo.co" } })).body.msg).toBe("Ese ya es el correo de tu cuenta.")
    t.fx.identity.emailError = { message: "A user with this email address has already been registered", code: "email_exists" }
    expect((await call("POST", "/v1/account/email-change", { who: "editor", payload: { email: "usado@gmail.com" } })).body).toMatchObject({ code: "CONFLICT", msg: "Ese correo ya es de otra cuenta de Mirai. Usa otro o entra con esa cuenta." })
  })

  it("cancelar: con la RPC de la persona", async () => {
    expect((await call("DELETE", "/v1/account/email-change")).body.data).toEqual({ msg: "Cancelamos el cambio de correo. Los enlaces que te llegaron ya no sirven." })
    expect(t.fx.account.calls[0]).toMatchObject({ m: "rpc:cancel_my_email_change", scope: "user" })
  })
})

describe("formas de entrar y sesiones", () => {
  it("quitar una forma de entrar pide haber entrado hace poco (409 details.reason = 'reauth')", async () => {
    const r = await call("DELETE", "/v1/account/methods/password", { who: "admin" })
    expect(r.body).toMatchObject({ code: "CONFLICT", details: { reason: "reauth" } })
    const ok = await call("DELETE", "/v1/account/methods/password", { who: "admin", claims: recent() })
    expect(ok.body.data).toEqual({ msg: "Quitamos tu contraseña. Ahora entras con Google." })
  })

  it("nunca la última forma de entrar", async () => {
    t.fx.account.account = { ...ACCOUNT, has_password: false }
    const r = await call("DELETE", `/v1/account/methods/google/${GOOGLE_ID}`, { who: "registra", claims: recent() })
    expect(r.body).toMatchObject({ code: "CONFLICT", details: { reason: "ultima" } })
  })

  it("desconectar Google: GoTrue con el token de la persona", async () => {
    t.fx.account.account = { ...ACCOUNT, identities: [{ id: GOOGLE_ID, provider: "google", email: "ana@gmail.com", last_sign_in_at: null, created_at: null }] }
    const r = await call("DELETE", `/v1/account/methods/google/${GOOGLE_ID}`, { who: "viewer", claims: recent() })
    expect(r.body.data).toEqual({ msg: "Quitamos la cuenta de Google ana@gmail.com. Ya no podrás entrar con ella." })
    expect(t.fx.identity.calls).toEqual([{ m: "unlinkIdentity", args: [GOOGLE_ID] }])
  })

  it("cerrar una sesión y todas", async () => {
    const id = "22222222-2222-4222-8222-222222222222"
    expect((await call("DELETE", `/v1/account/sessions/${id}`, { who: "editor" })).body.data.msg).toMatch(/^Cerramos esa sesión/)
    expect(t.fx.account.calls[0]).toMatchObject({ m: "rpc:revoke_my_session", args: [{ p_session: id }] })
    expect((await call("POST", "/v1/account/sign-out-all", { who: "editor" })).body.data).toEqual({ msg: "Cerramos tu sesión en todos los dispositivos." })
    expect(t.fx.households.called("accountEvent").at(-1)?.args[0]).toMatchObject({ kind: "sesiones_cerradas", user_agent: "lightMyRequest" })
  })
})

describe("borrar la cuenta (Ley 1581)", () => {
  it("pide el correo exacto y no deja si es dueño de un hogar con más personas", async () => {
    expect((await call("DELETE", "/v1/account", { payload: { confirm: "otro@correo.co" } })).status).toBe(400)
    t.fx.account.memberships[USERS.owner] = [{ household_id: H_GRATIS, role: "owner", access_role: "owner" }, { household_id: H_PREMIUM, role: "owner", access_role: "owner" }]
    t.fx.account.allMembers = [{ household_id: H_GRATIS, user_id: USERS.owner }, { household_id: H_GRATIS, user_id: USERS.editor }, { household_id: H_PREMIUM, user_id: USERS.owner }]
    const r = await call("DELETE", "/v1/account", { payload: { confirm: "OWNER@correo.co" } })
    expect(r.body).toMatchObject({ code: "CONFLICT", details: { reason: "dueno", hogares: ["Familia Pérez"] } })
    expect(t.fx.identity.calls).toEqual([])
  })

  it("borra los hogares donde es la única persona, sus archivos y la cuenta", async () => {
    t.fx.account.memberships[USERS.viewer] = [{ household_id: H_GRATIS, role: "viewer", access_role: "viewer" }]
    t.fx.account.allMembers = [{ household_id: H_GRATIS, user_id: USERS.viewer }]
    const r = await call("DELETE", "/v1/account", { who: "viewer", payload: { confirm: "viewer@correo.co" } })
    expect(r.body.data).toEqual({ msg: "Eliminamos tu cuenta." })
    expect(t.fx.purge.households).toEqual([H_GRATIS])
    expect(t.fx.purge.users).toEqual([USERS.viewer])
    expect(t.fx.identity.calls).toEqual([{ m: "deleteUser", args: [USERS.viewer] }])
  })
})
