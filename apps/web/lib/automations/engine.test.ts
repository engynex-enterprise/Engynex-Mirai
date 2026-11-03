import { describe, expect, it, vi } from "vitest"
import { addDaysIso, describeAction, evalCondition, fill, resolveMonto, resolveParams, runGraph, variables } from "./engine"
import { queuedEventFor, type QueuedEvent } from "./detect"
import { validateGraph } from "./schema"
import { avisoDeDisparador, destinatarios } from "./notify-rules"
import type { BookData } from "@/lib/domain/types"
import { TEMPLATES } from "./templates"
import type { ActionAdapter, FlowEdge, FlowNode, Graph, NodeKind, TriggerEvent } from "./types"
import { CATALOG } from "./catalog"
import { formatCOP } from "@/lib/domain/money"

const n = (id: string, kind: NodeKind, data: Record<string, unknown> = {}): FlowNode => ({ id, type: CATALOG[kind].group, kind, data: { ...CATALOG[kind].defaults, ...data }, position: { x: 0, y: 0 } })
const e = (source: string, target: string, sourceHandle: "si" | "no" | null = null): FlowEdge => ({ id: `${source}-${target}-${sourceHandle}`, source, target, sourceHandle })
const ev = (data: TriggerEvent["data"], kind: TriggerEvent["kind"] = "gasto"): TriggerEvent => ({ kind, clave: "ev:1", hoy: "2026-11-10", data })
const spy = () => {
  const calls: { kind: string; params: unknown }[] = []
  const adapter: ActionAdapter = { run: vi.fn(async (kind, params) => { calls.push({ kind, params }); return `hecho ${kind}` }) }
  return { adapter, calls }
}

const gastoAlto: Graph = {
  nodes: [n("t", "gasto"), n("c", "monto", { op: "mayor", valor: 200_000 }), n("si", "aviso", { titulo: "Gasto alto: {monto}", mensaje: "En {descripcion}" }), n("no", "aviso", { titulo: "Normal", mensaje: "ok" })],
  edges: [e("t", "c"), e("c", "si", "si"), e("c", "no", "no")],
}

describe("motor de automatizaciones", () => {
  it("sigue la rama Sí cuando se cumple la condición y llena las variables", async () => {
    const { adapter, calls } = spy()
    const r = await runGraph(gastoAlto, ev({ monto: 250_000, descripcion: "Mercado" }), { adapter })
    expect(r.status).toBe("ok")
    expect(calls).toHaveLength(1)
    expect(calls[0].params).toMatchObject({ titulo: `Gasto alto: ${formatCOP(250_000)}`, mensaje: "En Mercado" })
    expect(r.steps.map((s) => s.node)).toEqual(["t", "c", "si"])
    expect(r.steps[1].branch).toBe("si")
  })

  it("sigue la rama No cuando no se cumple", async () => {
    const { adapter, calls } = spy()
    const r = await runGraph(gastoAlto, ev({ monto: 50_000, descripcion: "Tinto" }), { adapter })
    expect(r.steps[1].branch).toBe("no")
    expect(calls[0].params).toMatchObject({ titulo: "Normal" })
  })

  it("la simulación no llama al adaptador y describe lo que haría", async () => {
    const { adapter, calls } = spy()
    const r = await runGraph(gastoAlto, ev({ monto: 250_000, descripcion: "Mercado" }), { adapter, dryRun: true })
    expect(calls).toHaveLength(0)
    expect(r.steps.at(-1)?.msg).toContain(`Enviaría el aviso “Gasto alto: ${formatCOP(250_000)}”`)
  })

  it("omite si el evento no corresponde al disparador", async () => {
    const r = await runGraph(gastoAlto, ev({ monto: 1 }, "ingreso"))
    expect(r.status).toBe("omitida")
  })

  it("no corre un grafo con errores (p. ej. un ciclo)", async () => {
    const g: Graph = { nodes: [n("t", "gasto"), n("a", "aviso", { titulo: "x", mensaje: "y" }), n("b", "aviso", { titulo: "x", mensaje: "y" })], edges: [e("t", "a"), e("a", "b"), e("b", "a")] }
    const { adapter, calls } = spy()
    const r = await runGraph(g, ev({ monto: 1 }), { adapter })
    expect(r.status).toBe("error")
    expect(r.error).toMatch(/ciclo/)
    expect(calls).toHaveLength(0)
  })

  it("cada nodo corre una sola vez aunque dos ramas lleguen a él", async () => {
    const g: Graph = {
      nodes: [n("t", "gasto"), n("a", "aviso", { titulo: "1", mensaje: "1" }), n("b", "aviso", { titulo: "2", mensaje: "2" }), n("z", "aviso", { titulo: "fin", mensaje: "fin" })],
      edges: [e("t", "a"), e("t", "b"), e("a", "z"), e("b", "z")],
    }
    const { adapter, calls } = spy()
    await runGraph(g, ev({ monto: 1 }), { adapter })
    expect(calls.filter((c) => (c.params as { titulo: string }).titulo === "fin")).toHaveLength(1)
  })

  it("respeta el tope de pasos", async () => {
    const nodes = [n("t", "gasto"), ...Array.from({ length: 8 }, (_, i) => n(`a${i}`, "aviso", { titulo: "x", mensaje: "y" }))]
    const edges = nodes.slice(1).map((x, i) => e(nodes[i].id, x.id))
    const r = await runGraph({ nodes, edges }, ev({}), { maxSteps: 4 })
    expect(r.status).toBe("error")
    expect(r.error).toMatch(/más de 4 pasos/)
  })

  it("“Esperar” detiene la rama y dice cuándo y dónde seguir; al reanudar sigue desde ahí", async () => {
    const g: Graph = { nodes: [n("t", "gasto"), n("w", "esperar", { dias: 3 }), n("a", "aviso", { titulo: "¿Valió la pena?", mensaje: "{descripcion}" })], edges: [e("t", "w"), e("w", "a")] }
    const { adapter, calls } = spy()
    const r = await runGraph(g, ev({ monto: 600_000, descripcion: "TV" }), { adapter })
    expect(r.status).toBe("esperando")
    expect(r.resume).toEqual({ at: "2026-11-13", nodes: ["a"] })
    expect(calls).toHaveLength(0)
    const r2 = await runGraph(g, { ...ev({ monto: 600_000, descripcion: "TV" }), hoy: "2026-11-13" }, { adapter, startAt: r.resume!.nodes })
    expect(r2.status).toBe("ok")
    expect(calls[0].params).toMatchObject({ mensaje: "TV" })
  })

  it("si una acción falla, la ejecución queda en error con el mensaje", async () => {
    const adapter: ActionAdapter = { run: async () => { throw new Error("Sin conexión") } }
    const r = await runGraph(gastoAlto, ev({ monto: 300_000 }), { adapter })
    expect(r.status).toBe("error")
    expect(r.error).toBe("Sin conexión")
    expect(r.steps.at(-1)?.ok).toBe(false)
  })

  it("calcula montos: fijo, porcentaje del disparador y gastos fijos de la quincena", () => {
    expect(resolveMonto(n("m", "movimiento", { modo: "fijo", valor: 50_000 }), ev({ monto: 1 }))).toBe(50_000)
    expect(resolveMonto(n("m", "movimiento", { modo: "pct", pct: 10 }), ev({ monto: 1_234_567 }))).toBe(123_457)
    expect(resolveMonto(n("m", "movimiento", { modo: "fijos" }), ev({ fijos: 900_000 }))).toBe(900_000)
    expect(resolveMonto(n("a", "apartar", { pct: 10 }), ev({ monto: 2_000_000 }))).toBe(200_000)
  })

  it("evalúa condiciones de categoría, persona, día, quincena y texto", () => {
    const base = ev({ monto: 10, category_id: "c1", member_id: "m1", descripcion: "Domicilio Rappí", fecha: "2026-11-07" })
    expect(evalCondition(n("x", "categoria", { category_ids: ["c1", "c2"] }), base)).toBe(true)
    expect(evalCondition(n("x", "categoria", { category_ids: ["c2"] }), base)).toBe(false)
    expect(evalCondition(n("x", "miembro", { member_id: "m1" }), base)).toBe(true)
    expect(evalCondition(n("x", "fecha", { modo: "semana", dias: [6] }), base)).toBe(true) // 7 nov 2026 es sábado
    expect(evalCondition(n("x", "fecha", { modo: "quincena", quincena: "q1" }), base)).toBe(true)
    expect(evalCondition(n("x", "texto", { contiene: "ifood, rappi" }), base)).toBe(true)
    expect(evalCondition(n("x", "texto", { contiene: "netflix" }), base)).toBe(false)
    expect(evalCondition(n("x", "monto", { op: "menor", valor: 20 }), base)).toBe(true)
    expect(evalCondition(n("x", "monto", { op: "mayor", valor: 1 }), ev({}))).toBe(false)
  })

  it("variables y fechas", () => {
    expect(fill("Hola {monto} {nada}", variables(ev({ monto: 1500 })))).toBe(`Hola ${formatCOP(1500)} {nada}`)
    expect(variables(ev({ category_id: "c1" }), { categorias: { c1: "Mercado" } }).categoria).toBe("Mercado")
    expect(addDaysIso("2026-12-30", 3)).toBe("2027-01-02")
  })

  it("todas las plantillas por defecto se pueden simular sin errores de estructura", async () => {
    for (const t of TEMPLATES) {
      const trig = t.graph.nodes.find((x) => x.type === "trigger")!
      const r = await runGraph(t.graph, { kind: trig.kind as TriggerEvent["kind"], clave: "p", hoy: "2026-11-10", data: { monto: 300_000, descripcion: "Prueba", fijos: 100_000 } }, { dryRun: true, validate: false })
      expect(r.status, t.key).not.toBe("error")
      expect(r.steps.length, t.key).toBeGreaterThan(1)
    }
  })
})

describe("eventos y acciones nuevas (cuotas, tarjetas, suscripciones, agenda)", () => {
  const book = {
    settings: { umbral: 15000, corte_q: 15 }, categories: [], incomes: [], extraIncomes: [], expenses: [], fixedExpenses: [], subscriptions: [], loans: [],
    creditCards: [], assets: [], liabilities: [], investments: [], goals: [], calendarEvents: [], contacts: [], entities: [],
  } as unknown as BookData
  const q = (tipo: string, datos: Record<string, unknown>, tabla = "loan_payments"): QueuedEvent => ({ id: "q1", tipo, tabla, row_id: "r1", datos })

  it("pagar una cuota dispara “Se paga una cuota” y respeta el filtro Le debo / Me deben", () => {
    const cobro = q("cuota", { valor: 350_000, descripcion: "Préstamo a Carlos", persona: "Carlos", dir: "cobrar", fecha: "2026-11-10", created_by: "u1" })
    const todas = queuedEventFor(n("t", "cuota", { dir: "todas" }), cobro, book, "2026-11-10")
    expect(todas).toMatchObject({ kind: "cuota", clave: "ev:q1", data: { monto: 350_000, persona: "Carlos", dir: "cobrar", autor: "u1", tabla: "loan_payments" } })
    expect(queuedEventFor(n("t", "cuota", { dir: "cobrar" }), cobro, book, "2026-11-10")).not.toBeNull()
    expect(queuedEventFor(n("t", "cuota", { dir: "pagar" }), cobro, book, "2026-11-10")).toBeNull()
    expect(queuedEventFor(n("t", "gasto"), cobro, book, "2026-11-10")).toBeNull()
  })

  it("compra con tarjeta (por tarjeta), suscripción (cobrada o nueva) y recordatorio", () => {
    const compra = q("compra_tarjeta", { valor: 180_000, descripcion: "Zapatos", tarjeta: "Visa", card_id: "visa" }, "card_purchases")
    expect(queuedEventFor(n("t", "compra_tarjeta"), compra, book, "2026-11-10")?.data.tarjeta).toBe("Visa")
    expect(queuedEventFor(n("t", "compra_tarjeta", { card_id: "visa" }), compra, book, "2026-11-10")).not.toBeNull()
    expect(queuedEventFor(n("t", "compra_tarjeta", { card_id: "master" }), compra, book, "2026-11-10")).toBeNull()
    const cobrada = q("suscripcion", { valor: 44_900, descripcion: "Netflix", evento: "cobrada" }, "subscriptions")
    expect(queuedEventFor(n("t", "suscripcion", { evento: "cobrada" }), cobrada, book, "2026-11-10")).not.toBeNull()
    expect(queuedEventFor(n("t", "suscripcion", { evento: "todas" }), cobrada, book, "2026-11-10")).not.toBeNull()
    expect(queuedEventFor(n("t", "suscripcion", { evento: "nueva" }), cobrada, book, "2026-11-10")).toBeNull()
    expect(queuedEventFor(n("t", "recordatorio"), q("recordatorio", { valor: 0, descripcion: "SOAT" }, "calendar_events"), book, "2026-11-10")?.data.descripcion).toBe("SOAT")
  })

  it("“cuota pagada” avisa a quien la registró y registra un ingreso con el monto", async () => {
    const g: Graph = {
      nodes: [n("t", "cuota"), n("a", "aviso", { titulo: "Cuota de {persona}", mensaje: "{monto}", para: "autor" }), n("i", "crear_ingreso", { modo: "pct", pct: 100, descripcion: "Cobro a {persona}" })],
      edges: [e("t", "a"), e("a", "i")],
    }
    const { adapter, calls } = spy()
    const r = await runGraph(g, ev({ monto: 350_000, persona: "Carlos", autor: "u1" }, "cuota"), { adapter })
    expect(r.status).toBe("ok")
    expect(calls[0]).toMatchObject({ kind: "aviso", params: { titulo: "Cuota de Carlos", para: "autor" } })
    expect(calls[1]).toMatchObject({ kind: "crear_ingreso", params: { monto: 350_000, descripcion: "Cobro a Carlos" } })
  })

  it("marcar un fijo pagado: con el valor del fijo (monto 0) o con el del disparador", () => {
    const t = ev({ monto: 120_000 }, "pago_proximo")
    expect(resolveParams(n("p", "pagar_fijo", { fixed_expense_id: "arr", valor: "fijo" }), t)).toMatchObject({ fixed_expense_id: "arr", monto: 0 })
    expect(resolveParams(n("p", "pagar_fijo", { fixed_expense_id: "arr", valor: "monto" }), t)).toMatchObject({ monto: 120_000 })
    const d = describeAction(n("p", "pagar_fijo"), { fixed_expense_id: "arr", monto: 0 }, { fijos: { arr: "Arriendo" } })
    expect(d).toContain("Marcaría “Arriendo” como pagado")
  })

  it("validación: pagar un fijo exige elegirlo y “quien lo hizo” necesita un movimiento", () => {
    const sinFijo: Graph = { nodes: [n("t", "programado"), n("p", "pagar_fijo")], edges: [e("t", "p")] }
    expect(validateGraph(sinFijo).issues.map((i) => i.msg)).toContain("Elige el gasto fijo")
    const autorProgramado: Graph = { nodes: [n("t", "programado"), n("a", "aviso", { titulo: "x", mensaje: "y", para: "autor" })], edges: [e("t", "a")] }
    expect(validateGraph(autorProgramado).ok).toBe(false)
    const autorCuota: Graph = { nodes: [n("t", "cuota"), n("a", "aviso", { titulo: "x", mensaje: "y", para: "autor" })], edges: [e("t", "a")] }
    expect(validateGraph(autorCuota).ok).toBe(true)
  })

  it("los avisos de un disparador siguen la matriz de Ajustes › Alertas y llegan a quien toca", () => {
    expect(avisoDeDisparador("pago_proximo")).toBe("pagos")
    expect(avisoDeDisparador("presupuesto")).toBe("presupuesto")
    expect(avisoDeDisparador("cuota", { dir: "cobrar" })).toBe("cobros")
    expect(avisoDeDisparador("gasto")).toBeUndefined()
    const casa = ["u1", "u2", "u3"]
    expect(destinatarios(casa, { para: "hogar" })).toEqual(casa)
    expect(destinatarios(casa, { para: "autor", autor: "u2" })).toEqual(["u2"])
    expect(destinatarios(casa, { para: "u3" })).toEqual(["u3"])
    // La persona ya no está: le llega a quien creó la automatización; si tampoco, a todo el hogar.
    expect(destinatarios(casa, { para: "u9", creador: "u1" })).toEqual(["u1"])
    expect(destinatarios(casa, { para: "autor", autor: null, creador: "u9" })).toEqual(casa)
  })

  it("las plantillas que repetirían avisos de Mirai vienen en pausa", () => {
    const def = (k: string) => TEMPLATES.find((t) => t.key === k)!
    expect(def("recordatorio-pagos").activo).toBe(false)
    expect(def("presupuesto-80").activo).toBe(false)
    expect(def("gasto-alto").activo).toBe(true)
    for (const k of ["cuota-pagada", "tarjeta-grande", "suscripcion-cobrada", "debito-automatico"]) expect(def(k).porDefecto, k).toBe(false)
  })
})
