import { describe, expect, it } from "vitest"
import type { ToolSet } from "ai"
import type { z } from "zod"
import { chatTools, herramientasDe, resolveCategory, type Categorize } from "./tools"
import { PERM_PROPUESTA, puedeProponer, tiposDelRol } from "./permisos"
import { PROPUESTA_TIPOS, type Propuesta } from "./types"
import { TIPO_INFO } from "./propuestas"
import { HOY, libroPrueba } from "./libro-prueba"
import type { AccessRole } from "@mirai/domain/household/roles"

// Herramientas del chat: cada una valida su entrada con zod, prepara la tarjeta con los cálculos de lib/domain y solo
// se entrega a los roles que pueden registrar eso. La categoría llega con un doble del modelo (sin IA real).

const categorizeDoble: Categorize = async (d) => (/celular/i.test(d) ? { id: "c-tec", nombre: "Tecnología", src: "ia" } : { id: null, nombre: null, src: null })

function armar(access: AccessRole) {
  const props: Propuesta[] = []
  const tools = chatTools({ b: libroPrueba(), today: HOY, access, rules: async () => [], categorize: categorizeDoble, onTool: () => {}, onPropuesta: (p) => props.push(p) })
  return { tools, props }
}
const run = (t: ToolSet, name: string, input: unknown) => (t[name].execute as unknown as (i: unknown, o: unknown) => Promise<Record<string, unknown>>)(input, { toolCallId: "t1", messages: [] })
const schema = (t: ToolSet, name: string) => t[name].inputSchema as unknown as z.ZodType

describe("permisos por rol", () => {
  it("cada tipo de propuesta tiene permiso, aspecto y destino", () => {
    for (const t of PROPUESTA_TIPOS) { expect(PERM_PROPUESTA[t], t).toBeDefined(); expect(TIPO_INFO[t], t).toBeDefined() }
  })
  it("Solo mira no recibe herramientas de proponer; Registra sus gastos solo gastos e ingresos; Colabora todo", () => {
    expect(herramientasDe(armar("viewer").tools)).toEqual([])
    expect(herramientasDe(armar("registra").tools).sort()).toEqual(["proponer_gasto", "proponer_ingreso", "proponer_ingreso_fijo"])
    for (const r of ["editor", "admin", "owner"] as AccessRole[]) expect(herramientasDe(armar(r).tools)).toHaveLength(PROPUESTA_TIPOS.length)
    expect(tiposDelRol("registra")).toEqual(["gasto", "ingreso", "ingreso_fijo"])
    expect(puedeProponer("registra", "prestamo")).toBe(false)
    expect(puedeProponer("viewer", "gasto")).toBe(false)
  })
  it("las consultas sí llegan a todos los roles", () => {
    for (const r of ["viewer", "registra", "editor"] as AccessRole[]) {
      const k = Object.keys(armar(r).tools)
      for (const c of ["gastos", "balance", "ingresos", "fijos_y_suscripciones", "tarjetas", "deudas", "metas", "proximos_pagos"]) expect(k, `${r} ${c}`).toContain(c)
    }
  })
})

describe("cada herramienta valida su entrada con zod", () => {
  const { tools } = armar("owner")
  const casos: [string, unknown, unknown][] = [
    ["proponer_gasto", { valor: 15000, descripcion: "Almuerzo" }, { valor: -1, descripcion: "Almuerzo" }],
    ["proponer_ingreso", { valor: 300000, descripcion: "Trabajo" }, { valor: 300000 }],
    ["proponer_ingreso_fijo", { concepto: "Sueldo", valor: 2000000, frecuencia: "quincenal" }, { concepto: "Sueldo", valor: 2000000, frecuencia: "cada rato" }],
    ["proponer_gasto_fijo", { nombre: "Internet", valor: 90000, frecuencia: "mensual", dia: 10 }, { nombre: "Internet", valor: 90000, frecuencia: "mensual", dia: 40 }],
    ["proponer_pago_fijo", { gasto_fijo: "arriendo" }, { gasto_fijo: "" }],
    ["proponer_suscripcion", { nombre: "Spotify", valor: 16900, ciclo: "mensual" }, { nombre: "Spotify", valor: 16900, ciclo: "semanal" }],
    ["proponer_cobro_suscripcion", { suscripcion: "Netflix" }, {}],
    ["proponer_compra_tarjeta", { descripcion: "Celular", valor: 2000000, cuotas: 12 }, { descripcion: "Celular", valor: 2000000, cuotas: 100 }],
    ["proponer_pago_tarjeta", { tarjeta: "visa", total: true }, { tarjeta: "visa", valor: -5 }],
    ["proponer_prestamo", { direccion: "me_deben", persona: "Juan", valor: 200000, cuotas: 3 }, { direccion: "prestado", persona: "Juan", valor: 200000 }],
    ["proponer_pago_cuota", { direccion: "le_debo", deuda: "carro" }, { direccion: "le_debo", deuda: "carro", fecha: "mañana" }],
    ["proponer_meta", { nombre: "Viaje", objetivo: 3000000 }, { nombre: "", objetivo: 3000000 }],
    ["proponer_abono_meta", { meta: "viaje", valor: 100000 }, { meta: "viaje", valor: 0 }],
    ["proponer_recordatorio", { titulo: "SOAT", fecha: "2026-12-15" }, { titulo: "SOAT" }],
  ]
  it.each(casos)("%s", (name, bueno, malo) => {
    expect(tools[name], name).toBeDefined()
    expect(schema(tools, name).safeParse(bueno).success).toBe(true)
    expect(schema(tools, name).safeParse(malo).success).toBe(false)
  })
  it("todas las de proponer tienen su caso de prueba", () => {
    expect(herramientasDe(tools).sort()).toEqual(casos.map((c) => c[0]).sort())
  })
})

describe("las herramientas preparan la tarjeta con los cálculos de Mirai", () => {
  it("préstamo a Juan a 3 meses → Me deben, 3 cuotas sin intereses", async () => {
    const { tools, props } = armar("editor")
    const r = await run(tools, "proponer_prestamo", { direccion: "me_deben", persona: "Juan", valor: 200000, cuotas: 3 })
    expect(r.listo).toBe(true)
    expect(props[0]).toMatchObject({ tipo: "prestamo", estado: "pendiente", datos: { kind: "cobrar", loan_tipo: "presto", valor: 200000, plazo: 3, frec: "mensual", tasa: 0, persona: "Juan" } })
    expect(props[0].datos.cuota).toBeCloseTo(66667, -1)
  })
  it("la cuota del carro encuentra el Crédito de vehículo (sinónimos) con el valor del plan", async () => {
    const { tools, props } = armar("editor")
    await run(tools, "proponer_pago_cuota", { direccion: "le_debo", deuda: "la cuota del carro" })
    expect(props[0]).toMatchObject({ tipo: "pago_cuota", datos: { ref_id: "l-carro", pago: "cuota", cuotas: 1, kind: "pagar" } })
    expect(props[0].datos.valor).toBeGreaterThan(800000)
    expect(props[0].datos.saldo).toBeLessThan(30000000)
  })
  it("un gasto que es el pago de un fijo pendiente se propone como pago del fijo", async () => {
    const { tools, props } = armar("editor")
    await run(tools, "proponer_gasto", { valor: 190000, descripcion: "luz" })
    expect(props[0]).toMatchObject({ tipo: "pago_fijo", datos: { ref_id: "f-luz", periodo: "2026-11", valor: 190000 } })
    // Registra sus gastos no paga fijos: queda como gasto suyo.
    const reg = armar("registra")
    await run(reg.tools, "proponer_gasto", { valor: 190000, descripcion: "luz" })
    expect(reg.props[0].tipo).toBe("gasto")
  })
  it("compra con tarjeta: una sola tarjeta se escoge sola y la categoría viene del clasificador", async () => {
    const { tools, props } = armar("editor")
    await run(tools, "proponer_compra_tarjeta", { descripcion: "Celular", valor: 2000000, cuotas: 12 })
    expect(props[0]).toMatchObject({ tipo: "compra_tarjeta", datos: { ref_id: "t-visa", cuotas: 12, category_id: "c-tec", cat_src: "ia" } })
    expect(props[0].datos.total).toBeGreaterThan(2000000)
  })
  it("si falta un dato o hay varias opciones, devuelve una pregunta y no prepara tarjeta", async () => {
    const { tools, props } = armar("editor")
    const r = await run(tools, "proponer_abono_meta", { valor: 100000 })
    expect(r.listo).toBe(false)
    expect(String(r.pregunta)).toMatch(/Viaje a Cartagena/)
    expect(props).toHaveLength(0)
  })
  it("cobro de Netflix y abono a la meta del viaje", async () => {
    const { tools, props } = armar("editor")
    await run(tools, "proponer_cobro_suscripcion", { suscripcion: "netflix" })
    await run(tools, "proponer_abono_meta", { meta: "viaje", valor: 100000 })
    expect(props[0]).toMatchObject({ tipo: "cobro_suscripcion", datos: { ref_id: "s-net", valor: 44900, fecha: HOY, proximo: "2026-12-06" } })
    expect(props[1]).toMatchObject({ tipo: "abono_meta", datos: { ref_id: "g-viaje", ahorrado: 2700000 } })
  })
  it("la consulta de balance da las cifras del flujo integral", async () => {
    const r = await run(armar("viewer").tools, "balance", {})
    expect(r).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-30" })
    expect(typeof r.te_queda).toBe("number")
  })
})

describe("resolveCategory", () => {
  it("si el modelo nombra una categoría que existe, es de la IA; si no, reglas o nada", () => {
    const b = libroPrueba()
    expect(resolveCategory(b, [], "algo", "mercado")).toMatchObject({ id: "c-mer", src: "ia" })
    expect(resolveCategory(b, [{ keyword: "almuerzo", category_id: "c-res" }], "Almuerzo corrientazo")).toMatchObject({ id: "c-res", src: "regla" })
    expect(resolveCategory(b, [], "zzz qqq")).toMatchObject({ id: null, src: null })
  })
})
