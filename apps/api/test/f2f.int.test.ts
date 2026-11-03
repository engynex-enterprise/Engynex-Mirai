// Integración de F2-F de punta a punta (Fastify inject, sin red, base ni proveedor de IA): rutas de IA con sus roles,
// errores con el mismo texto de la web y su código, archivos por fileId o base64, chat en streaming NDJSON, propuestas,
// hilos, adjuntos con su límite y la consola › Uso de IA. Los puertos son dobles (test/f2f/fakes.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { LiveChange } from "@mirai/contracts/live"
import { createF2fApp, type F2fApp } from "./f2f/app"
import { PROP } from "./f2f/fakes"
import { B_AJENO, B_GRATIS, B_PREMIUM, USERS } from "./setup/fixtures"
import { userToken } from "./setup/tokens"

let t: F2fApp
const auth = async (role: keyof typeof USERS) => ({ authorization: `Bearer ${await userToken(USERS[role])}` })
const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, headers: Record<string, string> = {}, payload?: unknown) =>
  t.app.inject({ method, url, headers: payload === undefined ? headers : { ...headers, "content-type": "application/json" }, payload: payload === undefined ? undefined : JSON.stringify(payload) })
const FILE = { file: { name: "factura.jpg", type: "image/jpeg", data: "AAAA" } }

beforeAll(async () => {
  t = await createF2fApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.ai.calls.length = 0
  t.ai.next = {}
  t.chat.calls.length = 0
  t.writes.written.length = 0
})

describe("IA de los formularios (/v1/books/:b/ai/*)", () => {
  it("factura: { ok:true, data } con quién llama (libro, hogar, rol y plan de la ruta)", async () => {
    const r = await req("POST", `/v1/books/${B_PREMIUM}/ai/invoice`, await auth("owner"), FILE)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ ok: true, data: { comercio: "Éxito", valor: 45900, fecha: "2026-11-01", category_id: null } })
    const call = t.ai.calls[0]
    expect(call.ctx).toMatchObject({ user: { id: USERS.owner }, book: { id: B_PREMIUM }, household: { access: "owner" }, plan: { id: "premium" } })
    expect(call.args[0]).toEqual({ data: "AAAA", mediaType: "image/jpeg" })
  })

  it("roles de la web: «Registra sus gastos» lee facturas; «Solo mira» no (403); comprobante pide Colabora (403)", async () => {
    expect((await req("POST", `/v1/books/${B_GRATIS}/ai/invoice`, await auth("registra"), FILE)).statusCode).toBe(200)
    const v = await req("POST", `/v1/books/${B_GRATIS}/ai/invoice`, await auth("viewer"), FILE)
    expect(v.statusCode).toBe(403)
    expect(v.json()).toMatchObject({ ok: false, code: "ROLE_DENIED" })
    expect((await req("POST", `/v1/books/${B_GRATIS}/ai/receipt`, await auth("registra"), FILE)).statusCode).toBe(403)
    expect((await req("POST", `/v1/books/${B_GRATIS}/ai/receipt`, await auth("editor"), FILE)).statusCode).toBe(200)
  })

  it("fuera del hogar: 404 sin revelar el libro", async () => {
    const r = await req("POST", `/v1/books/${B_AJENO}/ai/invoice`, await auth("owner"), FILE)
    expect(r.statusCode).toBe(404)
    expect(t.ai.calls).toHaveLength(0)
  })

  it("archivo por fileId: solo de la carpeta del libro; tipo o tamaño inválido → 400 con la causa", async () => {
    const ok = await req("POST", `/v1/books/${B_PREMIUM}/ai/invoice`, await auth("owner"), { file: { fileId: `${B_PREMIUM}/2026/factura.jpg` } })
    expect(ok.statusCode).toBe(200)
    const ajeno = await req("POST", `/v1/books/${B_PREMIUM}/ai/invoice`, await auth("owner"), { file: { fileId: `${B_GRATIS}/factura.jpg` } })
    expect(ajeno.statusCode).toBe(404)
    const txt = await req("POST", `/v1/books/${B_PREMIUM}/ai/invoice`, await auth("owner"), { file: { name: "a.txt", type: "text/plain", data: "AAAA" } })
    expect(txt.json()).toMatchObject({ code: "VALIDATION", msg: "Usa una foto (JPG, PNG) o un PDF" })
  })

  it("{ ok:false, msg } de la web → ApiError con el MISMO texto: plan 402, configuración 400, proveedor 502", async () => {
    const plan = await req("POST", `/v1/books/${B_PREMIUM}/ai/prima`, await auth("owner"), { prima: 1, tarjetas: 0, disponible: 0, basicos: 0, deudas: [], metas: [] })
    expect(plan.statusCode).toBe(402)
    expect(plan.json()).toMatchObject({ ok: false, code: "PLAN_REQUIRED", msg: "La inteligencia artificial no está incluida en tu plan. Conoce los planes en /planes." })
    const off = await req("POST", `/v1/books/${B_PREMIUM}/ai/loan-doc`, await auth("owner"), { ...FILE, kind: "pagar" })
    expect(off.statusCode).toBe(400)
    expect(off.json().msg).toBe("La lectura de fotos está desactivada en Ajustes › Inteligencia artificial.")
    t.ai.next.cobro = { ok: false, text: "No se pudo mejorar el mensaje" }
    const up = await req("POST", `/v1/books/${B_PREMIUM}/ai/cobro`, await auth("owner"), { msg: "págame", tono: "firme" })
    expect(up.statusCode).toBe(502)
    expect(up.json()).toMatchObject({ code: "UPSTREAM", msg: "No se pudo mejorar el mensaje" })
    t.ai.next.cobro = { ok: false, text: "Usaste todos los créditos de IA de este mes (1.000). Se renuevan…" }
    expect((await req("POST", `/v1/books/${B_PREMIUM}/ai/cobro`, await auth("owner"), { msg: "x" })).statusCode).toBe(429)
  })

  it("sin sugerencia es data: null; clasificar sin IA es items: null", async () => {
    expect((await req("POST", `/v1/books/${B_PREMIUM}/ai/category`, await auth("owner"), { desc: "perro" })).json()).toEqual({ ok: true, data: null })
    expect((await req("POST", `/v1/books/${B_PREMIUM}/ai/parse`, await auth("owner"), { text: "hola" })).json()).toEqual({ ok: true, data: null })
    expect((await req("POST", `/v1/books/${B_PREMIUM}/ai/classify`, await auth("owner"), { items: [{ i: 0, descripcion: "Éxito", valor: 1, veces_mes: 1 }] })).json()).toEqual({ ok: true, data: { items: null } })
    expect((await req("POST", `/v1/books/${B_PREMIUM}/ai/entity`, await auth("owner"), { q: "bancolombia" })).json().data.nit).toBe("890903938")
  })

  it("validación del contrato en español (400 VALIDATION con los campos)", async () => {
    const r = await req("POST", `/v1/books/${B_PREMIUM}/ai/hormiga`, await auth("owner"), { mes: "2026-13" })
    expect(r.statusCode).toBe(400)
    expect(r.json()).toMatchObject({ code: "VALIDATION", details: { mes: "Mes inválido (usa AAAA-MM)" } })
  })

  it("consejero, resumen del mes, correo, uso de IA, probar y listar modelos", async () => {
    expect((await req("POST", `/v1/books/${B_GRATIS}/ai/advisor`, await auth("viewer"), { text: "¿Me conviene un carro?" })).json()).toEqual({ ok: true, data: { consulta: null, faltan: [], preguntas: ["¿Cuánto cuesta?"] } })
    expect((await req("POST", `/v1/books/${B_PREMIUM}/reports/2026-11/summary`, await auth("owner"))).json().data.local).toBe(true)
    expect((await req("POST", `/v1/books/${B_GRATIS}/reports/2026-11/summary`, await auth("viewer"))).statusCode).toBe(403)
    expect((await req("POST", `/v1/books/${B_PREMIUM}/mail/scan`, await auth("owner"), {})).json()).toEqual({ ok: true, data: { rows: [], ia: false } })
    expect((await req("GET", `/v1/books/${B_GRATIS}/ai/usage`, await auth("viewer"))).json()).toEqual({ plan: "Premium", incluyeIa: true })
    // La prueba de conexión que no pasa es un dato (la persona la ve como "La prueba falló"), no un error HTTP.
    expect((await req("POST", `/v1/books/${B_PREMIUM}/integrations/ai_gemini/test`, await auth("owner"))).json()).toEqual({ ok: true, data: { ok: false, msg: "Primero guarda la clave de API." } })
    expect((await req("POST", `/v1/books/${B_GRATIS}/integrations/ai_gemini/models`, await auth("editor"), {})).statusCode).toBe(403)
    const m = await req("POST", `/v1/books/${B_PREMIUM}/integrations/ai_gemini/models`, await auth("owner"), { apiKey: "clave" })
    expect(m.json().data.rec).toBe("gemini-2.5-flash")
    expect(t.ai.calls.find((c) => c.m === "integrationModels")!.args).toEqual(["ai_gemini", "clave"])
  })
})

describe("chat en streaming (POST /v1/books/:b/chat/messages)", () => {
  it("NDJSON: un ChatEvent por línea, sin búfer ni caché", async () => {
    const r = await req("POST", `/v1/books/${B_GRATIS}/chat/messages`, await auth("viewer"), { text: "gasté 15 mil en almuerzo" })
    expect(r.statusCode).toBe(200)
    expect(r.headers["content-type"]).toBe("application/x-ndjson; charset=utf-8")
    expect(r.headers["cache-control"]).toBe("no-store, no-transform")
    const lines = r.body.trim().split("\n").map((l) => JSON.parse(l))
    expect(lines.map((e) => e.t)).toEqual(["thread", "user", "tool", "card", "delta", "done"])
    expect(t.chat.calls[0].args[0]).toEqual({ text: "gasté 15 mil en almuerzo", tono: "simple" })
    expect(t.chat.calls[0].ctx).toMatchObject({ household: { access: "viewer" }, plan: { id: "gratis" } })
    expect(t.chat.aborted).toBe(false)
  })

  it("cuerpo inválido, sin sesión o libro ajeno: JSON de error antes de abrir el stream", async () => {
    const bad = await req("POST", `/v1/books/${B_GRATIS}/chat/messages`, await auth("viewer"), { text: 5 })
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toMatchObject({ ok: false, code: "VALIDATION" })
    expect((await req("POST", `/v1/books/${B_GRATIS}/chat/messages`, {}, { text: "hola" })).statusCode).toBe(401)
    expect((await req("POST", `/v1/books/${B_AJENO}/chat/messages`, await auth("owner"), { text: "hola" })).statusCode).toBe(404)
    expect(t.chat.calls).toHaveLength(0)
  })

  it("el límite `chat` (60 cada 10 minutos por persona) responde 429 con Retry-After", async () => {
    const h = await auth("admin")
    let last = 0
    for (let i = 0; i < 61; i++) last = (await req("POST", `/v1/books/${B_GRATIS}/chat/messages`, h, { text: "hola" })).statusCode
    expect(last).toBe(429)
    const r = await req("POST", `/v1/books/${B_GRATIS}/chat/messages`, h, { text: "hola" })
    expect(r.json().msg).toMatch(/^Enviaste muchos mensajes seguidos\. Espera/)
    expect(r.headers["retry-after"]).toBeDefined()
  })
})

describe("propuestas, hilos y adjuntos", () => {
  it("confirmar escribe con ChatWritesPort y avisa qué tablas cambiaron (EventsService)", async () => {
    const seen: LiveChange[] = []
    const off = t.events.subscribe((c) => void seen.push(c))
    const r = await req("POST", `/v1/books/${B_GRATIS}/chat/messages/00000000-0000-4000-8000-00000000a001/proposals/${PROP.id}/confirm`, await auth("registra"))
    off()
    expect(r.statusCode).toBe(200)
    expect(r.json().data).toMatchObject({ msg: "Gasto registrado", href: "/gastos", propuesta: { estado: "hecho", registroId: "e-1" } })
    expect(t.writes.written).toHaveLength(1)
    expect(seen).toEqual([{ table: "expenses", bookId: B_GRATIS, id: "e-1", op: "INSERT" }])
  })

  it("propuesta que no existe → 404; cancelar algo que ya no está pendiente → 409", async () => {
    const h = await auth("owner")
    const nf = await req("POST", `/v1/books/${B_GRATIS}/chat/messages/00000000-0000-4000-8000-00000000a001/proposals/00000000-0000-4000-8000-00000000f999/confirm`, h)
    expect(nf.statusCode).toBe(404)
    expect(nf.json().msg).toBe("No encontramos esta propuesta. Pídela de nuevo en el chat.")
    expect((await req("POST", `/v1/books/${B_GRATIS}/chat/messages/00000000-0000-4000-8000-00000000a001/proposals/${PROP.id}/cancel`, h)).statusCode).toBe(409)
  })

  it("hilos: listar, mensajes (404 si no es suyo), renombrar, borrar, título, detalles y sugerencias con el nombre", async () => {
    const h = await auth("editor")
    const th = "00000000-0000-4000-8000-00000000c001"
    expect((await req("GET", `/v1/books/${B_GRATIS}/chat/threads?archivados=0`, h)).json()).toEqual({ items: [] })
    expect(t.chat.calls.find((c) => c.m === "threads")!.args[0]).toEqual({ archivados: false, limit: undefined })
    expect((await req("GET", `/v1/books/${B_GRATIS}/chat/threads/${th}/messages`, h)).json().items).toHaveLength(1)
    expect((await req("GET", `/v1/books/${B_GRATIS}/chat/threads/00000000-0000-4000-8000-00000000c002/messages`, h)).statusCode).toBe(404)
    expect((await req("PATCH", `/v1/books/${B_GRATIS}/chat/threads/${th}`, h, { titulo: "Almuerzos" })).json()).toEqual({ ok: true, data: { id: th } })
    expect((await req("PATCH", `/v1/books/${B_GRATIS}/chat/threads/${th}`, h, {})).statusCode).toBe(400)
    expect((await req("DELETE", `/v1/books/${B_GRATIS}/chat/threads/${th}`, h)).statusCode).toBe(404)
    expect((await req("POST", `/v1/books/${B_GRATIS}/chat/threads/${th}/restore`, h)).statusCode).toBe(200)
    expect((await req("POST", `/v1/books/${B_GRATIS}/chat/threads/${th}/title`, h)).json().data).toEqual({ titulo: "Almuerzos", fuente: "algoritmo" })
    expect((await req("POST", `/v1/books/${B_GRATIS}/chat/threads/${th}/duplicate`, h)).statusCode).toBe(404)
    expect((await req("GET", `/v1/books/${B_GRATIS}/chat/threads/${th}/info`, h)).json()).toEqual({ mensajes: 2, preguntas: 1, creditos: 0, algoritmo: 1 })
    expect((await req("GET", `/v1/books/${B_GRATIS}/chat/hints`, h)).json().nombre).toBe("editor")
  })

  it("adjunto: «Solo mira» no puede (403, mensaje de la web); el archivo se lee antes del motor", async () => {
    const v = await req("POST", `/v1/books/${B_GRATIS}/chat/attachments`, await auth("viewer"), { ...FILE, text: "mi factura" })
    expect(v.statusCode).toBe(403)
    expect(v.json().msg).toBe("Tu rol en este hogar es de solo lectura: no puedes registrar documentos.")
    const r = await req("POST", `/v1/books/${B_GRATIS}/chat/attachments`, await auth("registra"), { file: { fileId: `${B_GRATIS}/x/factura.jpg` }, text: "mi factura" })
    expect(r.statusCode).toBe(200)
    expect(r.json().data).toMatchObject({ threadId: "t-9", nuevo: true })
    expect(t.chat.calls.find((c) => c.m === "attach")!.args[0]).toMatchObject({ file: { name: "factura.jpg", type: "image/jpeg", size: 3 }, text: "mi factura", threadId: null })
    // Más de 6 MB en base64 ya no cabe en el cuerpo (bodyLimit de 8 MB): 413 con el error de siempre. Para eso está fileId.
    const big = await req("POST", `/v1/books/${B_GRATIS}/chat/attachments`, await auth("registra"), { file: { name: "a.pdf", type: "application/pdf", data: Buffer.alloc(7 * 1024 * 1024).toString("base64") } })
    expect(big.statusCode).toBe(413)
    expect(big.json()).toMatchObject({ ok: false, code: "VALIDATION" })
    const txt = await req("POST", `/v1/books/${B_GRATIS}/chat/attachments`, await auth("registra"), { file: { name: "a.txt", type: "text/plain", data: "AAAA" } })
    expect(txt.json()).toMatchObject({ code: "VALIDATION", msg: "Usa una foto (JPG, PNG) o un PDF." })
  })
})

describe("consola › Uso de IA (/v1/admin/ai/*)", () => {
  it("solo administradores de la plataforma; cada cambio con quién lo hizo", async () => {
    expect((await req("GET", "/v1/admin/ai/usage", await auth("editor"))).statusCode).toBe(403)
    const h = await auth("owner")
    expect((await req("GET", "/v1/admin/ai/usage?dias=30", h)).json()).toMatchObject({ dias: 30 })
    expect((await req("PATCH", "/v1/admin/ai/settings", h, { cacheHoras: 12 })).json()).toEqual({ ok: true, data: {} })
    expect((await req("PUT", "/v1/admin/ai/plans/premium/cupo", h, { cupo: null })).statusCode).toBe(200)
    expect((await req("PUT", "/v1/admin/ai/prices", h, { model: "google/gemini-2.5-flash", price: { in: 0.3, out: 2.5 } })).statusCode).toBe(200)
    expect((await req("DELETE", "/v1/admin/ai/cache", h)).json()).toEqual({ ok: true, data: { borradas: 7 } })
    expect(t.admin.calls.filter((c) => c.m !== "usage").map((c) => c.args[0])).toEqual([USERS.owner, USERS.owner, USERS.owner, USERS.owner])
    expect((await req("PATCH", "/v1/admin/ai/settings", h, { avisoPct: 500 })).statusCode).toBe(400)
  })
})
