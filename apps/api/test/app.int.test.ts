// Integración de punta a punta (F2-B): la app real sobre Fastify con dobles en los puertos externos.
// Cubre el criterio de terminado de F2-B que se puede probar sin GCP: /readyz, /v1/me para los 5 roles, error de rol
// `{ ok:false, msg:"Tu rol no permite…", code:"ROLE_DENIED" }` con 403, y logs con la traza para Cloud Logging.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ApiError } from "@mirai/contracts/common"
import { AppContext } from "@mirai/contracts/modules/me"
import { buildAppContext } from "@mirai/domain/app-context"
import { CRON_SECRET, createTestApp, SCHEDULER_SA, type TestApp } from "./setup/app"
import { B_AJENO, B_GRATIS, B_PREMIUM, H_GRATIS, rawFor, USERS } from "./setup/fixtures"
import { probeState, ProbeModule } from "./setup/probe.module"
import { googleToken, userToken } from "./setup/tokens"

let t: TestApp
const auth = async (role: keyof typeof USERS) => ({ authorization: `Bearer ${await userToken(USERS[role])}` })
const get = async (url: string, headers: Record<string, string> = {}) => t.app.inject({ method: "GET", url, headers })
const post = async (url: string, body: unknown, headers: Record<string, string> = {}) => t.app.inject({ method: "POST", url, payload: body as object, headers })

beforeAll(async () => {
  t = await createTestApp({ modules: [ProbeModule] })
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.logs.length = 0
})

describe("salud", () => {
  it("/healthz responde sin sesión, con x-request-id y sin caché", async () => {
    const r = await get("/healthz", { "x-request-id": "req-prueba-123" })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ ok: true })
    expect(r.headers["x-request-id"]).toBe("req-prueba-123")
    expect(r.headers["cache-control"]).toBe("no-store")
    expect(r.headers["x-content-type-options"]).toBe("nosniff")
  })

  it("/readyz: 200 con todo bien y 503 si la base falla", async () => {
    const ok = await get("/readyz")
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ ok: true, checks: { db: { ok: true }, jwks: { ok: true }, encryption: { ok: true } } })
  })

  it("/v1/version", async () => {
    const r = await get("/v1/version")
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ name: "mirai-api", env: "local", mode: "api" })
  })

  it("/docs/openapi.json con los esquemas de zod 4 completos", async () => {
    const r = await get("/docs/openapi.json")
    expect(r.statusCode).toBe(200)
    const doc = r.json()
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(["/v1/me", "/v1/books/{bookId}/categories", "/healthz", "/v1/jobs/notify/tick"]))
    expect(doc.paths["/v1/me"].get.responses["200"].content["application/json"].schema.properties).toHaveProperty("household")
  })
})

describe("autenticación", () => {
  it("sin token: 401 UNAUTHENTICATED en español, con WWW-Authenticate", async () => {
    const r = await get("/v1/me")
    expect(r.statusCode).toBe(401)
    expect(r.headers["www-authenticate"]).toMatch(/^Bearer/)
    const body = ApiError.parse(r.json())
    expect(body).toMatchObject({ ok: false, code: "UNAUTHENTICATED", msg: "Inicia sesión para continuar." })
    expect(body.requestId).toBe(r.headers["x-request-id"])
  })

  it("token vencido, de otro emisor, de otra audiencia o con basura: 401", async () => {
    const vencido = await userToken(USERS.owner, {}, { expSec: -120 })
    expect((await get("/v1/me", { authorization: `Bearer ${vencido}` })).json()).toMatchObject({ code: "UNAUTHENTICATED", msg: "Tu sesión venció. Vuelve a iniciar sesión." })
    for (const tok of [await userToken(USERS.owner, {}, { iss: "https://otro.supabase.co/auth/v1" }), await userToken(USERS.owner, {}, { aud: "anon" }), "a.b.c", "nada"]) {
      expect((await get("/v1/me", { authorization: `Bearer ${tok}` })).statusCode).toBe(401)
    }
    expect((await get("/v1/me", { authorization: `Bearer ${await userToken(USERS.owner, { role: "anon" })}` })).statusCode).toBe(401)
  })
})

describe("GET /v1/me (paridad con getAppContext)", () => {
  for (const role of ["owner", "admin", "editor", "registra", "viewer"] as const) {
    it(`rol ${role}: hogar, rol fino, libro y plan`, async () => {
      const r = await get(`/v1/me?bookId=${B_GRATIS}`, await auth(role))
      expect(r.statusCode).toBe(200)
      const body = AppContext.parse(r.json())
      // La regla de armado es la de apps/web/lib/dal.ts (portada a @mirai/domain/app-context y probada allá).
      const expected = buildAppContext(rawFor(USERS[role]), { uid: USERS[role], claimsEmail: `${USERS[role].slice(0, 4)}@correo.co`, wantedBookId: B_GRATIS })
      expect(body).toEqual(expected)
      expect(body.household).toMatchObject({ id: H_GRATIS, access: role })
      expect(body.isAdmin).toBe(role === "owner")
      expect(body.plan.id).toBe("gratis")
    })
  }

  it("elige el libro pedido (Premium) y, si no existe, el predeterminado", async () => {
    const h = await auth("owner")
    expect((await get(`/v1/me?bookId=${B_PREMIUM}`, h)).json()).toMatchObject({ book: { id: B_PREMIUM }, plan: { id: "premium" } })
    expect((await get(`/v1/me?bookId=${B_AJENO}`, h)).json()).toMatchObject({ book: { id: B_GRATIS } })
  })

  it("sin hogar: 404 con redirect a /bienvenida", async () => {
    const r = await get("/v1/me", await auth("outsider"))
    expect(r.statusCode).toBe(404)
    expect(r.json()).toMatchObject({ ok: false, code: "NOT_FOUND", details: { redirect: "/bienvenida" } })
  })

  it("bookId inválido: 400 VALIDATION con el campo en español", async () => {
    const r = await get("/v1/me?bookId=no-es-uuid", await auth("owner"))
    expect(r.statusCode).toBe(400)
    expect(r.json()).toMatchObject({ code: "VALIDATION", details: { bookId: "Identificador inválido" } })
  })

  it("la caché de 30 s evita repetir el viaje a la base en la misma ráfaga", async () => {
    const h = await auth("viewer")
    const before = t.contextRepo.loads.filter((s) => s.userId === USERS.viewer).length
    await Promise.all([get("/v1/me", h), get("/v1/me", h), get(`/v1/books/${B_GRATIS}/categories`, h)])
    expect(t.contextRepo.loads.filter((s) => s.userId === USERS.viewer).length - before).toBeLessThanOrEqual(1)
  })
})

describe("módulo de ejemplo: GET /v1/books/:bookId/categories", () => {
  it("el que solo mira lee las categorías del libro en su orden; el repositorio recibe el JWT de la persona (RLS)", async () => {
    const h = await auth("viewer")
    t.catalogs.calls.length = 0
    const r = await get(`/v1/books/${B_GRATIS}/categories`, h)
    expect(r.statusCode).toBe(200)
    expect(r.json().map((c: { nombre: string }) => c.nombre)).toEqual(["Arriendo", "Mercado", "Restaurantes"])
    const call = t.catalogs.calls[0]
    expect(call.q).toEqual({ bookId: B_GRATIS, grupo: undefined })
    expect(call.scope).toMatchObject({ kind: "user", userId: USERS.viewer, token: h.authorization.slice(7) })
  })

  it("filtra por grupo", async () => {
    const r = await get(`/v1/books/${B_GRATIS}/categories?grupo=gustos`, await auth("viewer"))
    expect(r.json()).toHaveLength(1)
  })

  it("alguien que no es miembro (o un libro que no existe) recibe 404 sin revelar nada", async () => {
    for (const url of [`/v1/books/${B_PREMIUM}/categories`, `/v1/books/${B_AJENO}/categories`, "/v1/books/no-es-uuid/categories"]) {
      const r = await get(url, await auth("viewer"))
      expect(r.statusCode, url).toBe(404)
      expect(r.json()).toMatchObject({ ok: false, code: "NOT_FOUND", msg: "No encontramos ese libro." })
    }
  })
})

describe("guardas de rol, plan y admin", () => {
  it("rol insuficiente: 403 ROLE_DENIED con 'Tu rol no permite…'", async () => {
    const r = await get(`/v1/test/books/${B_GRATIS}/editor`, await auth("registra"))
    expect(r.statusCode).toBe(403)
    expect(ApiError.parse(r.json())).toMatchObject({ ok: false, code: "ROLE_DENIED", msg: expect.stringMatching(/^Tu rol no permite/) })
    const ok = await get(`/v1/test/books/${B_GRATIS}/editor`, await auth("admin"))
    expect(ok.json()).toEqual({ ok: true, bookId: B_GRATIS, access: "admin", household: H_GRATIS })
  })

  it("@Can usa la matriz de roles con el mensaje de deniedMsg", async () => {
    const r = await get(`/v1/test/books/${B_GRATIS}/ajustes`, await auth("editor"))
    expect(r.statusCode).toBe(403)
    expect(r.json().msg).toBe("Tu rol no permite ajustes del hogar, integraciones y respaldos.")
    expect((await get(`/v1/test/books/${B_GRATIS}/ajustes`, await auth("admin"))).statusCode).toBe(200)
  })

  it("@Premium: 402 PLAN_REQUIRED en el hogar Gratis y pasa en el Premium", async () => {
    const h = await auth("owner")
    const r = await get(`/v1/test/books/${B_GRATIS}/ia`, h)
    expect(r.statusCode).toBe(402)
    expect(r.json()).toMatchObject({ code: "PLAN_REQUIRED", msg: "Inteligencia artificial no está incluido en tu plan. Conoce los planes en /planes." })
    expect((await get(`/v1/test/books/${B_PREMIUM}/ia`, h)).json()).toEqual({ ok: true, plan: "premium" })
  })

  it("@MinRole en una ruta sin :bookId es un error del código (500, sin detalle)", async () => {
    const r = await get("/v1/test/sin-libro", await auth("owner"))
    expect(r.statusCode).toBe(500)
    expect(r.json().code).toBe("INTERNAL")
  })

  it("@PlatformAdmin", async () => {
    expect((await get("/v1/test/admin", await auth("admin"))).json()).toMatchObject({ code: "ROLE_DENIED", msg: "Solo el administrador de Mirai puede ver esto." })
    expect((await get("/v1/test/admin", await auth("owner"))).statusCode).toBe(200)
  })
})

describe("límites de tasa", () => {
  it("@RateLimit('invitarMin'): el sexto intento en 5 minutos da 429 con Retry-After y el mensaje de la web", async () => {
    const h = await auth("admin")
    for (let i = 0; i < 5; i++) expect((await post(`/v1/test/books/${B_GRATIS}/invitar`, {}, h)).statusCode).toBe(201)
    const r = await post(`/v1/test/books/${B_GRATIS}/invitar`, {}, h)
    expect(r.statusCode).toBe(429)
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(0)
    expect(r.headers["ratelimit-limit"]).toBe("5")
    expect(r.json()).toMatchObject({ code: "RATE_LIMITED", msg: expect.stringMatching(/^Hiciste muchas invitaciones seguidas\. Espera/) })
  })
})

describe("idempotencia", () => {
  it("misma Idempotency-Key y mismo cuerpo: misma respuesta sin volver a ejecutar", async () => {
    const h = { ...(await auth("editor")), "idempotency-key": "pago-abc-12345" }
    const a = await post(`/v1/test/books/${B_GRATIS}/pagar`, { valor: 1000 }, h)
    const runs = probeState.runs
    const b = await post(`/v1/test/books/${B_GRATIS}/pagar`, { valor: 1000 }, h)
    expect(b.statusCode).toBe(a.statusCode)
    expect(b.json()).toEqual(a.json())
    expect(b.headers["idempotent-replayed"]).toBe("true")
    expect(probeState.runs).toBe(runs)
  })

  it("misma llave con otro cuerpo: 409; sin llave: se ejecuta cada vez; otra persona con la misma llave: no se cruza", async () => {
    const h = { ...(await auth("editor")), "idempotency-key": "pago-xyz-12345" }
    await post(`/v1/test/books/${B_GRATIS}/pagar`, { valor: 1 }, h)
    const r = await post(`/v1/test/books/${B_GRATIS}/pagar`, { valor: 2 }, h)
    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe("CONFLICT")
    const runs = probeState.runs
    await post(`/v1/test/books/${B_GRATIS}/pagar`, { valor: 1 }, await auth("editor"))
    await post(`/v1/test/books/${B_GRATIS}/pagar`, { valor: 1 }, await auth("editor"))
    expect(probeState.runs).toBe(runs + 2)
    const otra = await post(`/v1/test/books/${B_GRATIS}/pagar`, { valor: 1 }, { ...(await auth("admin")), "idempotency-key": "pago-xyz-12345" })
    expect(otra.statusCode).toBe(201)
    expect(otra.headers["idempotent-replayed"]).toBeUndefined()
  })

  it("un error de negocio también se repite igual; la llave requerida falta: 400", async () => {
    const h = { ...(await auth("editor")), "idempotency-key": "pago-malo-12345" }
    const a = await post(`/v1/test/books/${B_GRATIS}/pagar`, { valor: 13 }, h)
    const b = await post(`/v1/test/books/${B_GRATIS}/pagar`, { valor: 13 }, h)
    expect(a.statusCode).toBe(400)
    expect(b.json()).toMatchObject({ code: "VALIDATION", msg: "Ese pago no se puede hacer." })
    expect(b.headers["idempotent-replayed"]).toBe("true")
    const r = await post(`/v1/test/books/${B_GRATIS}/checkout`, {}, await auth("owner"))
    expect(r.statusCode).toBe(400)
    expect(r.json().msg).toBe("Falta la cabecera Idempotency-Key.")
  })
})

describe("errores", () => {
  it("ruta inexistente: 404 en el formato de la API", async () => {
    const r = await get("/v1/no-existe", await auth("owner"))
    expect(r.statusCode).toBe(404)
    expect(r.json()).toMatchObject({ ok: false, code: "NOT_FOUND", msg: "Esta ruta no existe." })
  })

  it("error inesperado: 500 INTERNAL genérico con requestId; el detalle solo queda en el log", async () => {
    const r = await get("/v1/test/boom", await auth("owner"))
    expect(r.statusCode).toBe(500)
    expect(r.body).not.toMatch(/boom|secreto/)
    const body = ApiError.parse(r.json())
    expect(body).toMatchObject({ code: "INTERNAL", msg: "Algo salió mal de nuestro lado. Intenta de nuevo en un momento." })
    const line = t.logs.find((l) => l.message === "Error inesperado")
    expect(line).toMatchObject({ severity: "ERROR", requestId: body.requestId, userId: USERS.owner })
    expect(JSON.stringify(line)).toMatch(/stack_trace/)
  })

  it("JSON mal formado: 400 VALIDATION", async () => {
    const r = await t.app.inject({ method: "POST", url: `/v1/test/books/${B_GRATIS}/pagar`, payload: "{malo", headers: { ...(await auth("editor")), "content-type": "application/json" } })
    expect(r.statusCode).toBe(400)
    expect(r.json().code).toBe("VALIDATION")
  })
})

describe("logs para Cloud Logging", () => {
  it("una línea JSON por petición con severity, httpRequest, ids y la traza; nunca el token", async () => {
    const h = await auth("viewer")
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736"
    await get(`/v1/books/${B_GRATIS}/categories?grupo=gustos`, { ...h, traceparent: `00-${traceId}-00f067aa0ba902b7-01` })
    const access = t.logs.find((l) => (l.httpRequest as { requestUrl?: string } | undefined)?.requestUrl === `/v1/books/${B_GRATIS}/categories`)
    expect(access).toMatchObject({
      severity: "INFO",
      userId: USERS.viewer,
      householdId: H_GRATIS,
      bookId: B_GRATIS,
      "logging.googleapis.com/trace": `projects/mirai-pruebas/traces/${traceId}`,
      "logging.googleapis.com/spanId": "00f067aa0ba902b7",
      httpRequest: { requestMethod: "GET", status: 200 },
    })
    expect(JSON.stringify(t.logs)).not.toContain(h.authorization.slice(7))
    expect(JSON.stringify(t.logs)).not.toContain("grupo=gustos")
  })
})

describe("CORS", () => {
  it("permite los orígenes del front (con comodín para vistas previas) y no los demás", async () => {
    const pre = (origin: string) => t.app.inject({ method: "OPTIONS", url: "/v1/me", headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization,idempotency-key,traceparent" } })
    const ok = await pre("https://mirai.engynex.com")
    expect(ok.headers["access-control-allow-origin"]).toBe("https://mirai.engynex.com")
    expect(String(ok.headers["access-control-allow-headers"])).toMatch(/idempotency-key/)
    expect(ok.headers["access-control-allow-credentials"]).toBeUndefined()
    expect((await pre("https://engynex-mirai-git-v6.vercel.app")).headers["access-control-allow-origin"]).toBe("https://engynex-mirai-git-v6.vercel.app")
    expect((await pre("https://malo.com")).headers["access-control-allow-origin"]).toBeUndefined()
    expect((await pre("https://engynex-mirai-x.vercel.app.malo.com")).headers["access-control-allow-origin"]).toBeUndefined()
  })
})

describe("cron: POST /v1/jobs/notify/tick (SchedulerGuard)", () => {
  const tick = (headers: Record<string, string>) => t.app.inject({ method: "POST", url: "/v1/jobs/notify/tick?dry=1", headers })

  it("sin token, con un JWT de persona o con un secreto equivocado: 401", async () => {
    expect((await tick({})).statusCode).toBe(401)
    expect((await tick(await auth("owner"))).statusCode).toBe(401)
    expect((await tick({ authorization: "Bearer otro-secreto" })).statusCode).toBe(401)
  })

  it("con CRON_SECRET (transición) o con OIDC de la cuenta de Scheduler: 200", async () => {
    const a = await tick({ authorization: `Bearer ${CRON_SECRET}` })
    expect(a.statusCode).toBe(200)
    expect(a.json()).toMatchObject({ ok: true, data: { dry: true, encoladas: 0, caller: "secret" } })
    const b = await tick({ authorization: `Bearer ${await googleToken(SCHEDULER_SA)}` })
    expect(b.json()).toMatchObject({ ok: true, data: { caller: `oidc:${SCHEDULER_SA}` } })
  })

  it("OIDC de otra cuenta, de otra audiencia o sin correo verificado: 401", async () => {
    expect((await tick({ authorization: `Bearer ${await googleToken("otra@proyecto.iam.gserviceaccount.com")}` })).statusCode).toBe(401)
    expect((await tick({ authorization: `Bearer ${await googleToken(SCHEDULER_SA, { aud: "https://otra" })}` })).statusCode).toBe(401)
    expect((await tick({ authorization: `Bearer ${await googleToken(SCHEDULER_SA, { verified: false })}` })).statusCode).toBe(401)
  })
})

describe("readyz con la base caída", () => {
  it("503 y el detalle de qué falló", async () => {
    const t2 = await createTestApp()
    t2.db.ok = false
    const r = await t2.app.inject({ method: "GET", url: "/readyz" })
    expect(r.statusCode).toBe(503)
    expect(r.json()).toMatchObject({ ok: false, checks: { db: { ok: false, msg: "PostgREST respondió 503" } } })
    await t2.close()
  })
})

describe("límite general por minuto", () => {
  it("RATE_LIMIT_DEFAULT_PER_MIN por persona (en memoria); health queda por fuera", async () => {
    const t3 = await createTestApp({ env: { RATE_LIMIT_DEFAULT_PER_MIN: "3" } })
    const h = await auth("viewer")
    const codes = []
    for (let i = 0; i < 4; i++) codes.push((await t3.app.inject({ method: "GET", url: "/v1/me", headers: h })).statusCode)
    expect(codes).toEqual([200, 200, 200, 429])
    for (let i = 0; i < 5; i++) expect((await t3.app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200)
    await t3.close()
  })
})

describe("MODE=realtime", () => {
  it("solo levanta salud (el gateway llega en F2-G)", async () => {
    const t4 = await createTestApp({ env: { MODE: "realtime" } })
    expect((await t4.app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200)
    expect((await t4.app.inject({ method: "GET", url: "/v1/me", headers: await auth("owner") })).statusCode).toBe(404)
    await t4.close()
  })
})
