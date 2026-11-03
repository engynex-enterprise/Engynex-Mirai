// V7-G (E10): automatizaciones de punta a punta con la app real y RowStore en memoria: roles (RLS de `automations`),
// validación del grafo, cupo del plan (= trigger automation_limit), paso de IA Premium, papelera, plantillas por
// defecto, probar (simulación por puerto), historial, procesar la cola, idempotencia, límites y alcances.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { Graph } from "@mirai/domain/automations/types"
import { DEFAULT_TEMPLATES, TEMPLATES } from "@mirai/domain/automations/templates"
import { AutomationsRunner } from "../../src/modules/automations/automations.port"
import { AutomationsTester, type SimInput, type SimResult } from "../../src/modules/automations/automations.tester"
import { DomainError } from "../../src/core/errors/domain-error"
import { B_AJENO, B_GRATIS, B_PREMIUM, USERS } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "./app"

class FakeRunner extends AutomationsRunner {
  books: string[] = []
  fail = false
  async processBook(bookId: string) {
    if (this.fail) throw new Error("caída")
    this.books.push(bookId)
    return ["r1", "r2"]
  }
  async hourly() {
    return null
  }
  async pendingBooks() {
    return []
  }
}
class FakeTester extends AutomationsTester {
  inputs: SimInput[] = []
  async simulate(i: SimInput): Promise<SimResult> {
    this.inputs.push(i)
    return { status: "ok", steps: [{ node: "t", kind: "gasto", ok: true, msg: "Gasto de ejemplo" }], evento: { descripcion: i.descripcion ?? "Mercado", monto: i.monto ?? 50000, fecha: "2026-11-02" } }
  }
}

const runner = new FakeRunner()
const tester = new FakeTester()
let t: V7gApp
const uid = (n: number) => `${n.toString(16).padStart(8, "0")}-a000-4000-8000-${n.toString(16).padStart(12, "0")}`
const A = (id = "", book = B_GRATIS) => `/v1/books/${book}/automations${id ? `/${id}` : ""}`

const pos = { x: 0, y: 0 }
/** Gasto > $200.000 → aviso (completo). */
const good: Graph = {
  nodes: [
    { id: "t", type: "trigger", kind: "gasto", data: {}, position: pos },
    { id: "c", type: "condition", kind: "monto", data: { op: "mayor", valor: 200000 }, position: pos },
    { id: "a", type: "action", kind: "aviso", data: { titulo: "Gasto alto", mensaje: "Ojo con {monto}", canales: "app" }, position: pos },
  ],
  edges: [{ id: "e1", source: "t", target: "c" }, { id: "e2", source: "c", target: "a", sourceHandle: "si" }],
}
/** Sin acciones: validateGraph lo marca por revisar. */
const pending: Graph = { nodes: [{ id: "t", type: "trigger", kind: "gasto", data: {}, position: pos }], edges: [] }
const withAi: Graph = {
  nodes: [good.nodes[0], { id: "i", type: "action", kind: "ia", data: { pregunta: "¿Voy bien este mes?", canales: "app" }, position: pos }],
  edges: [{ id: "e", source: "t", target: "i" }],
}
const seedActive = (n: number, book = B_GRATIS) =>
  t.fx.rows.seed("automations", Array.from({ length: n }, (_, i) => ({ id: uid(900 + i), book_id: book, nombre: `A${i}`, activo: true, deleted_at: null, grafo: good, disparador: "gasto", plantilla: null, created_at: `2026-10-0${i + 1}T00:00:00Z` })))

beforeAll(async () => {
  t = await createV7gApp({ overrides: [[AutomationsRunner, runner], [AutomationsTester, tester]] })
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.rows.reset()
  t.changes.length = 0
  runner.books = []
  runner.fail = false
  tester.inputs = []
})

describe("plantillas en @mirai/domain", () => {
  it("son las mismas de la web (apps/web/lib/automations/templates.ts)", async () => {
    const web = (await import("../../../web/lib/automations/templates")) as { TEMPLATES: unknown }
    expect(TEMPLATES).toEqual(web.TEMPLATES)
  })
})

describe("CRUD", () => {
  it("crea con el id del navegador: deriva el disparador, pone el creador, avisa el cambio y usa el JWT de la persona", async () => {
    const id = uid(1)
    const r = await t.call("PUT", A(id), "editor", { nombre: "  Gasto alto  ", grafo: good, activo: true })
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ pausada: false, issues: [], automation: { id, book_id: B_GRATIS, nombre: "Gasto alto", activo: true, disparador: "gasto", created_by: USERS.editor, plantilla: null, icon: "workflow" } })
    expect(t.changes).toEqual([{ table: "automations", bookId: B_GRATIS, id, op: "INSERT" }])
    expect(new Set(t.fx.rows.scopesOf("automations"))).toEqual(new Set(["user"]))
  })

  it("lista y lee sin las borradas; otro libro → 404 sin revelarlo", async () => {
    seedActive(2)
    t.fx.rows.seed("automations", [{ id: uid(5), book_id: B_GRATIS, nombre: "Borrada", activo: false, deleted_at: "2026-11-01T00:00:00Z", created_at: "2026-10-09T00:00:00Z" }])
    const l = await t.call("GET", A(), "viewer")
    expect((l.body as unknown as { nombre: string }[]).map((a) => a.nombre)).toEqual(["A0", "A1"])
    expect((await t.call("GET", A(uid(900)), "viewer")).status).toBe(200)
    expect((await t.call("GET", A(uid(5)), "viewer")).body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos esa automatización." })
    expect((await t.call("GET", A("", B_AJENO), "owner")).status).toBe(404)
  })

  it("roles: «Ver» y «Registra» no crean ni borran (403 en español)", async () => {
    for (const role of ["viewer", "registra"] as const) {
      const r = await t.call("PUT", A(uid(2)), role, { nombre: "X", grafo: good })
      expect(r.status).toBe(403)
      expect(r.body.msg).toMatch(/^Tu rol no permite/)
    }
    expect((await t.call("DELETE", A(uid(2)), "viewer")).status).toBe(403)
    expect(t.fx.rows.all("automations")).toEqual([])
  })

  it("validación: crear sin nombre o grafo, campos desconocidos y grafo mal formado → 400 en español", async () => {
    expect((await t.call("PUT", A(uid(3)), "editor", { nombre: "Solo nombre" })).body).toMatchObject({ code: "VALIDATION", msg: "Para crear una automatización escribe el nombre y arma el diagrama." })
    expect((await t.call("PUT", A(uid(3)), "editor", { nombre: "X", grafo: good, plantilla: "gasto-alto" })).status).toBe(400)
    const bad = await t.call("PUT", A(uid(3)), "editor", { nombre: "X", grafo: { nodes: [{ id: "t", type: "trigger", kind: "nada", data: {}, position: pos }], edges: [] } })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe("VALIDATION")
    expect((await t.call("PUT", A("no-es-uuid"), "editor", { nombre: "X", grafo: good })).status).toBe(400)
  })

  it("activar con pendientes → 400 con issues; guardar una activa con pendientes la pausa", async () => {
    const id = uid(4)
    const r = await t.call("PUT", A(id), "editor", { nombre: "Incompleta", grafo: pending, activo: true })
    expect(r.status).toBe(400)
    expect(r.body.msg).toMatch(/^Revisa la automatización antes de activarla: /)
    expect((r.body.details as { issues: unknown[] }).issues.length).toBeGreaterThan(0)

    await t.call("PUT", A(id), "editor", { nombre: "Buena", grafo: good, activo: true })
    const p = await t.call("PUT", A(id), "editor", { grafo: pending })
    expect(p.body.data).toMatchObject({ pausada: true, automation: { activo: false, nombre: "Buena" } })
  })

  it("cupo del plan Gratis (3 activas): la cuarta → 409 con el texto del trigger; en pausa sí se guarda", async () => {
    seedActive(3)
    const r = await t.call("PUT", A(uid(6)), "editor", { nombre: "Cuarta", grafo: good, activo: true })
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ code: "CONFLICT", msg: "Tu plan permite 3 automatizaciones activas a la vez. Pausa otra o cambia de plan para tener más.", details: { limite: 3 } })
    expect((await t.call("PUT", A(uid(6)), "editor", { nombre: "Cuarta", grafo: good })).status).toBe(200)
    // Editar una que ya estaba activa no cuenta contra el cupo.
    expect((await t.call("PUT", A(uid(900)), "editor", { nombre: "Renombrada" })).status).toBe(200)
    // Premium: sin límite.
    seedActive(5, B_PREMIUM)
    expect((await t.call("PUT", A(uid(7), B_PREMIUM), "owner", { nombre: "Sexta", grafo: good, activo: true })).status).toBe(200)
  })

  it("el error del trigger automation_limit (P0001) también sale como 409", async () => {
    const orig = t.fx.rows.insert.bind(t.fx.rows)
    t.fx.rows.insert = async () => {
      throw DomainError.validation("Tu plan permite 3 automatizaciones activas a la vez. Pausa otra o cambia de plan para tener más.")
    }
    try {
      const r = await t.call("PUT", A(uid(8)), "editor", { nombre: "Carrera", grafo: good, activo: true })
      expect(r).toMatchObject({ status: 409, body: { code: "CONFLICT" } })
    } finally {
      t.fx.rows.insert = orig
    }
  })

  it("paso de IA: activarla en Gratis → 402; en Premium sí; pausada se guarda en Gratis", async () => {
    const r = await t.call("PUT", A(uid(10)), "editor", { nombre: "Consejo", grafo: withAi, activo: true })
    expect(r.status).toBe(402)
    expect(r.body).toMatchObject({ code: "PLAN_REQUIRED" })
    expect((await t.call("PUT", A(uid(10)), "editor", { nombre: "Consejo", grafo: withAi })).status).toBe(200)
    expect((await t.call("PUT", A(uid(11), B_PREMIUM), "owner", { nombre: "Consejo", grafo: withAi, activo: true })).status).toBe(200)
  })

  it("papelera: borrar, no editar borrada, restaurar (en pausa si ya no cabe)", async () => {
    seedActive(3)
    const id = uid(900)
    const d = await t.call("DELETE", A(id), "editor")
    expect(d.body.data).toMatchObject({ id, deleted_at: expect.any(String) })
    expect(t.changes.at(-1)).toEqual({ table: "automations", bookId: B_GRATIS, id, op: "DELETE" })
    expect((await t.call("DELETE", A(id), "editor")).status).toBe(404)
    expect((await t.call("PUT", A(id), "editor", { nombre: "X" })).body).toMatchObject({ code: "CONFLICT", msg: "Esta automatización está en la papelera. Restáurala para editarla." })

    // Mientras estaba en la papelera se activó otra: ya no cabe → vuelve en pausa.
    await t.call("PUT", A(uid(12)), "editor", { nombre: "Nueva", grafo: good, activo: true })
    const r = await t.call("POST", A(`${id}/restore`), "editor")
    expect(r.body.data).toMatchObject({ id, deleted_at: null, activo: false })
    expect((await t.call("POST", A(`${id}/restore`), "editor")).status).toBe(404)
  })

  it("idempotencia: repetir el PUT con la misma llave no lo vuelve a ejecutar", async () => {
    const h = { "idempotency-key": "auto-put-0001" }
    const a = await t.call("PUT", A(uid(13)), "editor", { nombre: "Una", grafo: good }, h)
    const b = await t.call("PUT", A(uid(13)), "editor", { nombre: "Una", grafo: good }, h)
    expect(b.status).toBe(200)
    expect(b.headers["idempotent-replayed"]).toBe("true")
    expect(b.body).toEqual(a.body)
    expect(t.changes).toHaveLength(1)
  })
})

describe("plantillas por defecto", () => {
  it("crea las que faltan una sola vez (aunque se borren no vuelven) y respeta el cupo", async () => {
    seedActive(3)
    const r = await t.call("POST", A("defaults"), "editor")
    expect(r.body.data).toEqual({ creadas: DEFAULT_TEMPLATES.length })
    const rows = t.fx.rows.all<{ plantilla: string | null; activo: boolean; created_by: string }>("automations").filter((a) => a.plantilla)
    expect(rows.map((a) => a.plantilla).sort()).toEqual(DEFAULT_TEMPLATES.map((x) => x.key).sort())
    expect(rows.every((a) => !a.activo && a.created_by === USERS.editor)).toBe(true) // el cupo estaba lleno
    await t.fx.rows.update({ kind: "system", reason: "prueba" }, "automations", { eq: { plantilla: "gasto-alto" } }, { deleted_at: "2026-11-02T00:00:00Z" })
    expect((await t.call("POST", A("defaults"), "editor")).body.data).toEqual({ creadas: 0 })
  })

  it("con cupo libre la que es activa por defecto queda activa; «Ver» no crea nada", async () => {
    expect((await t.call("POST", A("defaults"), "viewer")).body.data).toEqual({ creadas: 0 })
    await t.call("POST", A("defaults"), "admin")
    const on = t.fx.rows.all<{ plantilla: string; activo: boolean }>("automations").filter((a) => a.activo).map((a) => a.plantilla)
    expect(on).toEqual(DEFAULT_TEMPLATES.filter((x) => x.activo && !x.premium).map((x) => x.key))
  })
})

describe("probar, historial y procesar la cola", () => {
  it("probar usa el grafo del editor (o el guardado) y no escribe nada", async () => {
    seedActive(1)
    const r = await t.call("POST", A(`${uid(900)}/test`), "viewer", { graph: pending, monto: 1234, descripcion: "Pan" })
    expect(r.body.data).toMatchObject({ status: "ok", evento: { descripcion: "Pan", monto: 1234 } })
    expect((r.body.data as { issues: unknown[] }).issues.length).toBeGreaterThan(0)
    expect(tester.inputs[0]).toMatchObject({ bookId: B_GRATIS, graph: pending, monto: 1234 })
    await t.call("POST", A(`${uid(900)}/test`), "viewer", {})
    expect(tester.inputs[1].graph).toEqual(good)
    expect(t.fx.rows.calls.filter((c) => c.m !== "select")).toEqual([])
    const sin = await t.call("POST", A(`${uid(900)}/test`), "viewer", { graph: { nodes: [], edges: [] } })
    expect(sin.body).toMatchObject({ code: "VALIDATION", msg: "Agrega un disparador para poder probar." })
    expect((await t.call("POST", A(`${uid(99)}/test`), "viewer", {})).status).toBe(404)
  })

  it("historial: del libro, sin borradas, más recientes primero, filtro y límite", async () => {
    t.fx.rows.seed("automation_runs", [
      { id: uid(1), book_id: B_GRATIS, automation_id: uid(900), estado: "ok", deleted_at: null, created_at: "2026-11-01T00:00:00Z" },
      { id: uid(2), book_id: B_GRATIS, automation_id: uid(901), estado: "error", deleted_at: null, created_at: "2026-11-02T00:00:00Z" },
      { id: uid(3), book_id: B_GRATIS, automation_id: uid(900), estado: "ok", deleted_at: "2026-11-02T00:00:00Z", created_at: "2026-11-03T00:00:00Z" },
      { id: uid(4), book_id: B_PREMIUM, automation_id: uid(902), estado: "ok", deleted_at: null, created_at: "2026-11-04T00:00:00Z" },
    ])
    const all = await t.call("GET", `/v1/books/${B_GRATIS}/automation-runs`, "viewer")
    expect((all.body as unknown as { id: string }[]).map((r) => r.id)).toEqual([uid(2), uid(1)])
    const one = await t.call("GET", `/v1/books/${B_GRATIS}/automation-runs?automationId=${uid(900)}&limit=1`, "viewer")
    expect((one.body as unknown as { id: string }[]).map((r) => r.id)).toEqual([uid(1)])
    expect((await t.call("GET", `/v1/books/${B_GRATIS}/automation-runs?limit=500`, "viewer")).status).toBe(400)
  })

  it("drain procesa la cola del libro; si el motor falla → 502 en español", async () => {
    const r = await t.call("POST", A("drain"), "registra")
    expect(r.body).toEqual({ ok: true, data: { procesados: 2 } })
    expect(runner.books).toEqual([B_GRATIS])
    runner.fail = true
    expect((await t.call("POST", A("drain"), "registra")).body).toMatchObject({ code: "UPSTREAM", msg: "No pudimos revisar tus automatizaciones ahora. Lo intentamos de nuevo en unos minutos." })
    expect((await t.call("POST", A("drain"), null)).status).toBe(401)
  })

  it("límite `automatizaciones` (60 cada 10 min por persona) → 429 con Retry-After", async () => {
    let last = { status: 0, headers: {} as Record<string, unknown> }
    for (let i = 0; i < 61; i++) last = await t.call("POST", A("drain"), "admin")
    expect(last.status).toBe(429)
    expect(last.headers["retry-after"]).toBeTruthy()
  })
})
