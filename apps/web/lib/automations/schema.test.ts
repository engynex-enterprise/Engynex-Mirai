import { describe, expect, it } from "vitest"
import { CATALOG } from "./catalog"
import { autoLayout } from "./layout"
import { hasCycle, nodeIssues, parseGraph, validateGraph } from "./schema"
import { DEFAULT_TEMPLATES, TEMPLATES, automationFromTemplate } from "./templates"
import type { FlowNode, Graph, NodeKind } from "./types"

const n = (id: string, kind: NodeKind, data: Record<string, unknown> = {}): FlowNode => ({ id, type: CATALOG[kind].group, kind, data: { ...CATALOG[kind].defaults, ...data }, position: { x: 0, y: 0 } })
const msgs = (g: Graph) => validateGraph(g).issues.map((i) => i.msg)

describe("validación del grafo", () => {
  it("acepta un flujo simple", () => {
    const g: Graph = { nodes: [n("t", "gasto"), n("a", "aviso", { titulo: "Hola", mensaje: "Mundo" })], edges: [{ id: "1", source: "t", target: "a" }] }
    expect(validateGraph(g)).toEqual({ ok: true, issues: [] })
  })
  it("pide disparador y acción", () => {
    expect(msgs({ nodes: [], edges: [] }).join(" ")).toMatch(/Agrega un disparador/)
    expect(msgs({ nodes: [n("t", "gasto")], edges: [] }).join(" ")).toMatch(/al menos una acción/)
  })
  it("solo un disparador y nada llega a él", () => {
    const g: Graph = { nodes: [n("t", "gasto"), n("t2", "ingreso"), n("a", "aviso", { titulo: "a", mensaje: "b" })], edges: [{ id: "1", source: "t", target: "a" }, { id: "2", source: "a", target: "t2" }] }
    const m = msgs(g).join(" ")
    expect(m).toMatch(/Solo puede haber un disparador/)
    expect(m).toMatch(/Nada puede llegar al disparador/)
  })
  it("las condiciones salen por Sí o No", () => {
    const g: Graph = { nodes: [n("t", "gasto"), n("c", "monto"), n("a", "aviso", { titulo: "a", mensaje: "b" })], edges: [{ id: "1", source: "t", target: "c" }, { id: "2", source: "c", target: "a" }] }
    expect(msgs(g).join(" ")).toMatch(/salida Sí o No/)
  })
  it("detecta ciclos y pasos sueltos", () => {
    const g: Graph = {
      nodes: [n("t", "gasto"), n("a", "aviso", { titulo: "a", mensaje: "b" }), n("b", "esperar"), n("x", "aviso", { titulo: "a", mensaje: "b" })],
      edges: [{ id: "1", source: "t", target: "a" }, { id: "2", source: "a", target: "b" }, { id: "3", source: "b", target: "a" }],
    }
    expect(hasCycle(g)).toBe(true)
    const m = msgs(g).join(" ")
    expect(m).toMatch(/ciclo/)
    expect(m).toMatch(/no está conectado/)
  })
  it("valida los datos de cada paso con mensajes en español", () => {
    expect(nodeIssues(n("a", "aviso", { titulo: "", mensaje: "x" }))[0]).toMatchObject({ field: "titulo", msg: "Escribe el título" })
    expect(nodeIssues(n("m", "movimiento", { tipo: "meta", goal_id: null }))[0]).toMatchObject({ field: "goal_id", msg: "Elige la meta" })
    expect(nodeIssues(n("p", "pago_proximo", { tipos: [] }))[0].msg).toBe("Elige al menos un tipo de pago")
    expect(nodeIssues(n("f", "fecha", { modo: "semana", dias: [] }))[0].msg).toBe("Elige al menos un día")
  })
  it("revisa que el paso tenga sentido con el disparador", () => {
    const g: Graph = { nodes: [n("t", "programado"), n("k", "categorizar", { category_id: "c1" }), n("p", "apartar", { destino: "fondo" })], edges: [{ id: "1", source: "t", target: "k" }, { id: "2", source: "k", target: "p" }] }
    const m = msgs(g).join(" ")
    expect(m).toMatch(/solo sirve cuando el disparador es un gasto/)
    expect(m).toMatch(/no trae un monto/)
  })
  it("parseGraph tolera datos dañados", () => {
    expect(parseGraph(null)).toEqual({ nodes: [], edges: [] })
    expect(parseGraph({ nodes: [{ id: 1 }] })).toEqual({ nodes: [], edges: [] })
  })
})

describe("plantillas", () => {
  it("hay 7 por defecto y las que crean movimientos empiezan pausadas", () => {
    expect(DEFAULT_TEMPLATES).toHaveLength(7)
    const activas = DEFAULT_TEMPLATES.filter((t) => t.activo)
    expect(activas.length).toBeLessThanOrEqual(3) // caben en el plan Gratis
    for (const t of DEFAULT_TEMPLATES) {
      const crea = t.graph.nodes.some((x) => ["movimiento", "apartar", "categorizar", "marcar_hormiga"].includes(x.kind))
      if (crea) expect(t.activo, t.key).toBe(false)
    }
  })
  it("las activas por defecto son válidas; las demás solo pueden fallar por datos que elige la persona", () => {
    for (const t of TEMPLATES) {
      const v = validateGraph(t.graph)
      if (t.activo) expect(v.issues, t.key).toEqual([])
      for (const i of v.issues) expect(i.msg, t.key).toMatch(/Elige/)
    }
  })
  it("fila de inserción desde una plantilla", () => {
    const row = automationFromTemplate(DEFAULT_TEMPLATES[0], { asDefault: true })
    expect(row).toMatchObject({ plantilla: "gasto-alto", disparador: "gasto", activo: true })
    expect(automationFromTemplate(DEFAULT_TEMPLATES[0])).toMatchObject({ plantilla: null, activo: false })
  })
})

describe("auto-orden", () => {
  it("pone el disparador arriba, Sí a la izquierda y No a la derecha", () => {
    const g = autoLayout({
      nodes: [n("a", "aviso"), n("c", "monto"), n("t", "gasto"), n("b", "aviso")],
      edges: [{ id: "1", source: "t", target: "c" }, { id: "2", source: "c", target: "b", sourceHandle: "no" }, { id: "3", source: "c", target: "a", sourceHandle: "si" }],
    })
    const p = Object.fromEntries(g.nodes.map((x) => [x.id, x.position]))
    expect(p.t.y).toBeLessThan(p.c.y)
    expect(p.c.y).toBeLessThan(p.a.y)
    expect(p.a.y).toBe(p.b.y)
    expect(p.a.x).toBeLessThan(p.b.x)
  })
  it("no se cuelga con ciclos", () => {
    const g = autoLayout({ nodes: [n("t", "gasto"), n("a", "aviso"), n("b", "aviso")], edges: [{ id: "1", source: "t", target: "a" }, { id: "2", source: "a", target: "b" }, { id: "3", source: "b", target: "a" }] })
    expect(g.nodes).toHaveLength(3)
  })
})
