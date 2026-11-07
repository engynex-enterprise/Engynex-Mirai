// Integración de F2-E de punta a punta (Fastify inject, sin red ni base): cron y fan-out, envíos de avisos,
// integraciones del hogar, Google con `state` firmado y el outbox de automatizaciones. Los puertos son dobles.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { EventsService } from "../src/core/events/events.service"
import { signState } from "../src/modules/google/oauth-state"
import { API, createF2eApp, SITE, STATE_KEY, type F2eApp } from "./f2e/app"
import { CRON_SECRET, SCHEDULER_SA } from "./setup/app"
import { B_AJENO, B_GRATIS, B_PREMIUM, USERS } from "./setup/fixtures"
import { googleToken, userToken } from "./setup/tokens"

let t: F2eApp
const auth = async (role: keyof typeof USERS) => ({ authorization: `Bearer ${await userToken(USERS[role])}` })
const cron = { authorization: `Bearer ${CRON_SECRET}` }
const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, headers: Record<string, string> = {}, payload?: unknown) =>
  t.app.inject({ method, url, headers: payload === undefined ? headers : { ...headers, "content-type": "application/json" }, payload: payload === undefined ? undefined : JSON.stringify(payload) })

beforeAll(async () => {
  t = await createF2eApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.queue.tasks.length = 0
  t.delivery.sent.length = 0
  t.delivery.fail = null
})

describe("cron: tick, fan-out por hogar y trabajadores (SchedulerGuard)", () => {
  it("el tick con OIDC de Scheduler encola una tarea por hogar en la cola notify", async () => {
    const r = await req("POST", "/v1/jobs/notify/tick", { authorization: `Bearer ${await googleToken(SCHEDULER_SA)}` })
    expect(r.statusCode).toBe(200)
    expect(r.json().data).toMatchObject({ dry: false, horario: true, hogares: 2, repetidas: 0, caller: `oidc:${SCHEDULER_SA}` })
    const notify = t.queue.tasks.filter((x) => x.path.startsWith("/v1/jobs/notify/household/"))
    expect(notify).toHaveLength(2)
    expect(notify[0].name).toMatch(/^notify-00000000-0000-4000-8000-000000000100-\d{10}$/)
  })

  it("Cloud Scheduler manda { dry: true } en el cuerpo: simulación sin latido", async () => {
    const r = await req("POST", "/v1/jobs/notify/tick", cron, { dry: true })
    expect(r.json().data.dry).toBe(true)
    expect(t.jobs.calls).toContain("heartbeat:true")
    expect(t.queue.tasks.every((x) => x.name?.startsWith("dry-"))).toBe(true)
  })

  it("la tarea del hogar corre la pasada de resúmenes y devuelve `runs`", async () => {
    const h = "00000000-0000-4000-8000-000000000100"
    const r = await req("POST", `/v1/jobs/notify/household/${h}`, cron, { at: "2026-11-02T14:05:00.000Z", horario: true })
    expect(r.statusCode).toBe(200)
    expect(r.json().data).toEqual({ householdId: h, hora: 9, dry: false, runs: { "aaaaaaaa:00000000": ["email: ok"] } })
    expect(t.logs.some((l) => l.job === "notify.household" && l.householdId === h)).toBe(true)
  })

  it("una persona no puede llamar a los trabajos; el cuerpo inválido es 400 en español", async () => {
    expect((await req("POST", "/v1/jobs/automations/drain", await auth("owner"))).statusCode).toBe(401)
    const bad = await req("POST", "/v1/jobs/notify/household/no-es-uuid", cron, { at: "ayer", horario: true })
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toMatchObject({ ok: false, code: "VALIDATION" })
  })

  it("automations/book/:b procesa el libro (outbox) aunque la ruta tenga :bookId (no pasa por BookGuard)", async () => {
    const r = await req("POST", `/v1/jobs/automations/book/${B_GRATIS}`, cron, {})
    expect(r.statusCode).toBe(200)
    expect(t.automations.books).toContain(B_GRATIS)
  })
})

describe("outbox: EventsService → cola automations", () => {
  it("una escritura de gastos encola automations/book/:b con 1 s de espera", async () => {
    t.get(EventsService).changed(B_GRATIS, ["expenses"], "g1", "INSERT")
    await new Promise((r) => setImmediate(r))
    expect(t.queue.tasks).toEqual([expect.objectContaining({ queue: "automations", path: `/v1/jobs/automations/book/${B_GRATIS}`, delayS: 1 })])
  })
})

describe("avisos: Ajustes › Alertas", () => {
  const base = `/v1/books/${B_GRATIS}`

  it("mi regla (por defecto) y guardarla", async () => {
    const r = await req("GET", `${base}/notification-rules/me`, await auth("viewer"))
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ user_id: USERS.viewer, book_id: B_GRATIS, hora: 7, frecuencia: "diario" })
    const p = await req("PUT", `${base}/notification-rules/me`, await auth("viewer"), { hora: 9, canales: { app: true, email: true }, email_to: "" })
    expect(p.statusCode).toBe(200)
    expect(p.json()).toMatchObject({ hora: 9, canales: { email: true }, email_to: null })
    const mal = await req("PUT", `${base}/notification-rules/me`, await auth("viewer"), { hora: 25 })
    expect(mal.statusCode).toBe(400)
  })

  it("enviarme una prueba: usa el correo del perfil; el error del proveedor sale como 502 con su mensaje", async () => {
    const ok = await req("POST", `${base}/notifications/test`, await auth("editor"), { canal: "email" })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ ok: true, data: { msg: expect.stringMatching(/^Enviado a /) } })
    expect(t.delivery.sent[0]).toMatchObject({ canal: "email", w: { userId: USERS.editor, bookId: B_GRATIS } })
    t.delivery.fail = new Error("Resend: dominio sin verificar")
    const ko = await req("POST", `${base}/notifications/test`, await auth("editor"), { canal: "email" })
    expect(ko.statusCode).toBe(502)
    expect(ko.json()).toMatchObject({ ok: false, code: "UPSTREAM", msg: "Resend: dominio sin verificar" })
  })

  it("canal desconocido: 400; quien no es del hogar: 404", async () => {
    expect((await req("POST", `${base}/notifications/test`, await auth("editor"), { canal: "sms" })).statusCode).toBe(400)
    expect((await req("POST", `/v1/books/${B_AJENO}/notifications/test`, await auth("editor"), { canal: "email" })).statusCode).toBe(404)
  })

  it("una condición que falta responde 400 con el texto de la web; el cobro repetido, 409", async () => {
    const tg = await req("POST", `${base}/telegram/link`, await auth("viewer"))
    expect(tg.statusCode).toBe(400)
    expect(tg.json().msg).toMatch(/Telegram/)
    const cobro = await req("POST", `${base}/notifications/cobro-whatsapp`, await auth("editor"), { loanId: B_GRATIS, consentimiento: true })
    expect(cobro.statusCode).toBe(409)
    expect((await req("POST", `${base}/notifications/cobro-whatsapp`, await auth("viewer"), { loanId: B_GRATIS, consentimiento: true })).statusCode).toBe(403)
  })

  it("canales, ventanas al abrir la app y push", async () => {
    expect((await req("GET", `${base}/notifications/channels`, await auth("viewer"))).json()).toEqual({ email: true, telegram: false, whatsapp: false, push: false })
    expect((await req("POST", `${base}/notifications/open`, await auth("viewer"))).json()).toHaveLength(1)
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }
    expect((await req("PUT", "/v1/push/subscriptions", await auth("viewer"), sub)).statusCode).toBe(200)
    expect(t.delivery.push).toHaveLength(1)
    expect((await req("DELETE", "/v1/push/subscriptions", await auth("viewer"), { endpoint: sub.endpoint })).statusCode).toBe(200)
    expect(t.delivery.push).toHaveLength(0)
  })
})

describe("integraciones del hogar", () => {
  const base = `/v1/books/${B_GRATIS}/integrations`

  it("quien mira ve solo las de IA y sin secretos", async () => {
    const r = await req("GET", base, await auth("viewer"))
    expect(r.statusCode).toBe(200)
    expect(r.json().items.map((x: { kind: string }) => x.kind)).toEqual(["ai_gemini"])
    expect(r.json().kinds).toContain("ai_gemini")
    expect(JSON.stringify(r.json())).not.toMatch(/secrets/)
  })

  it("guardar pide 'Administra' (403 en español); el admin guarda", async () => {
    const no = await req("PUT", `${base}/ai_gemini`, await auth("editor"), { values: { apiKey: "AIza-prueba" } })
    expect(no.statusCode).toBe(403)
    expect(no.json()).toMatchObject({ code: "ROLE_DENIED", msg: expect.stringMatching(/^Tu rol no permite/) })
    const si = await req("PUT", `${base}/ai_gemini`, await auth("admin"), { values: { apiKey: "AIza-prueba" } })
    expect(si.statusCode).toBe(200)
    expect(t.integrations.saved.at(-1)).toMatchObject({ kind: "ai_gemini", values: { apiKey: "AIza-prueba" } })
  })

  it("lo que administra Mirai: 403; apagar una obligatoria: 409", async () => {
    expect((await req("PUT", `${base}/telegram`, await auth("admin"), { values: {} })).statusCode).toBe(403)
    const r = await req("PATCH", `${base}/ai_gateway`, await auth("admin"), { enabled: false })
    expect(r.statusCode).toBe(409)
    expect(r.json().msg).toMatch(/no se puede apagar/)
  })
})

describe("Google: conectar con state firmado, callback y Calendar", () => {
  it("con el plan Gratis: 402 PLAN_REQUIRED", async () => {
    const r = await req("GET", `/v1/books/${B_GRATIS}/google/connect-url?s=calendar`, await auth("owner"))
    expect(r.statusCode).toBe(402)
    expect(r.json().code).toBe("PLAN_REQUIRED")
  })

  it("con Premium: URL de Google con el callback de la API y un state firmado", async () => {
    const r = await req("GET", `/v1/books/${B_PREMIUM}/google/connect-url?s=calendar&back=/ajustes?tab=alertas`, await auth("owner"))
    expect(r.statusCode).toBe(200)
    const u = new URL(r.json().url)
    expect(u.origin).toBe("https://accounts.google.com")
    expect(u.searchParams.get("redirect_uri")).toBe(`${API}/v1/google/callback`)
    expect(u.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/calendar.events")
    // El callback (público) guarda los tokens de la persona del state y vuelve a la web.
    const cb = await req("GET", `/v1/google/callback?code=codigo-1&state=${encodeURIComponent(u.searchParams.get("state")!)}`)
    expect(cb.statusCode).toBe(302)
    expect(cb.headers.location).toBe(`${SITE}/ajustes?tab=alertas&google=ok`)
    expect(t.google.connected.at(-1)).toEqual({ userId: USERS.owner, code: "codigo-1", redirectUri: `${API}/v1/google/callback` })
  })

  it("state falso, cancelado o código inválido: vuelve a la web con el resultado (nunca a otro dominio)", async () => {
    const falso = signState("otra-llave-que-no-es-la-de-la-api-0123456789", { u: USERS.outsider, s: "gmail", b: "//malo.com" })
    expect((await req("GET", `/v1/google/callback?code=x&state=${falso}`)).headers.location).toBe(`${SITE}/correo?google=error`)
    expect((await req("GET", "/v1/google/callback?error=access_denied")).headers.location).toBe(`${SITE}/correo?google=cancelado`)
    const bueno = signState(STATE_KEY, { u: USERS.owner, s: "gmail", b: "/correo" })
    expect((await req("GET", `/v1/google/callback?code=malo&state=${bueno}`)).headers.location).toBe(`${SITE}/correo?google=error`)
  })

  it("tu conexión de Google: correo y permisos (sin tokens); sin conexión, permisos vacíos", async () => {
    const r = await req("GET", "/v1/google/connection", await auth("viewer"))
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ email: "ana@gmail.com", scopes: ["https://www.googleapis.com/auth/gmail.readonly"] })
    const before = t.google.conn
    t.google.conn = null
    expect((await req("GET", "/v1/google/connection", await auth("viewer"))).json()).toEqual({ email: null, scopes: [] })
    t.google.conn = before
    expect((await req("GET", "/v1/google/connection")).statusCode).toBe(401)
  })

  it("sincronizar Calendar (Premium) y su estado", async () => {
    const s = await req("POST", `/v1/books/${B_PREMIUM}/calendar/sync`, await auth("owner"))
    expect(s.statusCode).toBe(200)
    expect(s.json().data).toMatchObject({ msg: "Tu Google Calendar quedó al día: 2 nuevos.", creados: 2 })
    expect((await req("GET", `/v1/books/${B_GRATIS}/calendar/status`, await auth("viewer"))).json()).toEqual({ conectado: true, plan: false, eventos: 2 })
  })
})
