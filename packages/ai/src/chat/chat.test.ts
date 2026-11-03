import { describe, expect, it } from "vitest"
import { BANCO, TEMAS, eligible, followUps, pickSuggestions, rng, temaDe } from "./suggestions"
import { autoTitle, groupOf, groupThreads, matchThread, preview } from "./history"
import { continueDecision, detectDecision, detectQuickAction } from "./intent"
import { inline, parseMarkdown, plainText } from "./markdown"
import { chatFacts, quickAnswer } from "../router"
import type { BookData } from "@mirai/domain"

// ── Banco de sugerencias y su selección ──
describe("sugerencias", () => {
  it("el banco tiene ≥ 30 preguntas, sin repetir, y cubre todos los temas pedidos", () => {
    expect(BANCO.length).toBeGreaterThanOrEqual(30)
    expect(new Set(BANCO.map((s) => s.id)).size).toBe(BANCO.length)
    expect(new Set(BANCO.map((s) => s.q)).size).toBe(BANCO.length)
    for (const t of ["ahorro", "deudas", "tarjeta", "impuestos", "nomina", "metas", "presupuesto", "inversion", "compras"] as const)
      expect(BANCO.some((s) => s.tema === t), t).toBe(true)
    for (const s of BANCO) expect(TEMAS[s.tema]).toBeDefined()
  })

  it("elige 4 de temas distintos y la misma semilla da lo mismo", () => {
    const a = pickSuggestions(4, rng(7), { flags: { tarjetas: 1, deudas: 1, metas: 1, suscripciones: 1, ingresos: 1, gastos: 5 }, month: 11 })
    const b = pickSuggestions(4, rng(7), { flags: { tarjetas: 1, deudas: 1, metas: 1, suscripciones: 1, ingresos: 1, gastos: 5 }, month: 11 })
    expect(a).toHaveLength(4)
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id))
    expect(new Set(a.map((s) => s.tema)).size).toBe(4)
  })

  it("barajar da otras ideas", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 6; i++) pickSuggestions(4, rng(i + 1)).forEach((s) => seen.add(s.id))
    expect(seen.size).toBeGreaterThan(8)
  })

  it("respeta lo que tiene el libro, el mes y el rol", () => {
    const vacio = eligible({ flags: {}, month: 3 })
    expect(vacio.some((s) => s.id === "tarjetas-deuda")).toBe(false)
    expect(vacio.some((s) => s.id === "prima-dic")).toBe(false)
    const conTarjeta = eligible({ flags: { tarjetas: 2 }, month: 12 })
    expect(conTarjeta.some((s) => s.id === "tarjetas-deuda")).toBe(true)
    expect(conTarjeta.some((s) => s.id === "prima-dic")).toBe(true)
    expect(eligible({ canEdit: false }).some((s) => s.escribe)).toBe(false)
  })

  it("personaliza con la categoría y la meta del libro", () => {
    const list = eligible({ flags: { topCategoria: "Mercado", meta: "Viaje a Cartagena", metas: 1 } })
    expect(list.map((s) => s.q)).toContain("¿Cuánto llevo gastado en Mercado?")
    expect(list.map((s) => s.q)).toContain('¿Cómo voy con mi meta "Viaje a Cartagena"?')
  })

  it("sin IA solo sugiere lo que responde Mirai con algoritmos", () => {
    const list = eligible({ ia: false, flags: { ingresos: 1, metas: 1, suscripciones: 1 } })
    expect(list.length).toBeGreaterThan(5)
    expect(list.every((s) => s.rapida || s.decision || s.id === "registrar")).toBe(true)
    expect(pickSuggestions(4, rng(3), { ia: false })).toHaveLength(4)
  })

  it("las preguntas rápidas las responde quickAnswer sin IA", () => {
    const b: BookData = {
      settings: { umbral: 25000, limite: 0, trm: {}, pct: { n: 50, g: 30, a: 20 }, emerg_meta: 3, anticipo: 5, corte_q: 15, alerta_pres: 80, notif: {}, uvt: {}, smmlv: {}, nomina: {} } as never,
      categories: [{ id: "c1", nombre: "Mercado", grupo: "n", icon: "tag", tope: 0 }], incomes: [], extraIncomes: [], expenses: [{ id: "e1", fecha: "2026-11-01", descripcion: "Éxito", valor: 50000, category_id: "c1" } as never],
      fixedExpenses: [], subscriptions: [], loans: [], creditCards: [], assets: [], liabilities: [], investments: [], goals: [{ id: "g1", nombre: "Viaje", objetivo: 1000000, ahorrado: 100000, fecha: null }], calendarEvents: [], contacts: [], entities: [],
    }
    const f = chatFacts(b, "2026-11-02")
    for (const s of BANCO.filter((x) => x.rapida)) expect(quickAnswer(s.q, f), s.q).toBeTruthy()
    expect(quickAnswer("¿Cuánto llevo gastado en Mercado?", f)).toContain("Mercado")
    expect(quickAnswer("¿Cuánto gasté el mes pasado?", f)).toMatch(/El mes pasado gastaste/)
  })

  it("las de decisión las detecta el consejero", () => {
    for (const s of BANCO.filter((x) => x.decision)) expect(detectDecision(s.q), s.q).not.toBeNull()
  })

  it("seguimiento: 2 o 3 del mismo tema o uno cercano, sin repetir la pregunta", () => {
    const f = followUps("¿Qué pasa si solo pago el mínimo de la tarjeta?", rng(1))
    expect(f.length).toBeGreaterThanOrEqual(2)
    expect(f.length).toBeLessThanOrEqual(3)
    expect(f).not.toContain("¿Qué pasa si solo pago el mínimo de la tarjeta?")
    expect(f.some((q) => ["tarjeta", "deudas"].includes(temaDe(q)))).toBe(true)
    expect(temaDe("¿Tengo que declarar renta?")).toBe("impuestos")
    expect(temaDe("¿cómo reparto la prima?")).toBe("nomina")
  })
})

// ── Título automático e historial ──
describe("historial", () => {
  it("título automático sin saludos, signos ni relleno", () => {
    expect(autoTitle("¿Cuánto gasté este mes?")).toBe("Cuánto gasté este mes")
    expect(autoTitle("Hola, buenos días! ¿me puedes decir cuánto debo?")).toBe("Cuánto debo")
    expect(autoTitle("buenas tardes por favor explícame la UVT")).toBe("Explícame la UVT")
    expect(autoTitle("   ")).toBe("Nueva conversación")
    const largo = autoTitle("Quiero entender cómo funciona la tasa de interés efectiva anual de mi tarjeta de crédito del banco")
    expect(largo.length).toBeLessThanOrEqual(49)
    expect(largo.endsWith("…")).toBe(true)
  })

  it("agrupa por Fijadas, Hoy, Ayer, 7 días y Antes (días calendario)", () => {
    const now = new Date(2026, 10, 2, 9, 0)
    expect(groupOf(new Date(2026, 10, 2, 0, 5).toISOString(), now)).toBe("hoy")
    expect(groupOf(new Date(2026, 10, 1, 23, 50).toISOString(), now)).toBe("ayer")
    expect(groupOf(new Date(2026, 9, 28).toISOString(), now)).toBe("semana")
    expect(groupOf(new Date(2026, 9, 1).toISOString(), now)).toBe("antes")
    const g = groupThreads([
      { id: "a", fijado: false, updated_at: new Date(2026, 10, 2, 8).toISOString() },
      { id: "b", fijado: true, updated_at: new Date(2026, 9, 1).toISOString() },
      { id: "c", fijado: false, updated_at: new Date(2026, 10, 1, 8).toISOString() },
      { id: "d", fijado: false, updated_at: new Date(2026, 8, 1).toISOString() },
    ], now)
    expect(g.map((x) => x.label)).toEqual(["Fijadas", "Hoy", "Ayer", "Antes"])
    expect(g[0].items.map((x) => x.id)).toEqual(["b"])
  })

  it("búsqueda sin tildes, por todas las palabras o por contenido", () => {
    expect(matchThread({ titulo: "Cuánto gasté en Mercado" }, "gaste mercado")).toBe(true)
    expect(matchThread({ titulo: "Cuánto gasté en Mercado" }, "tarjeta")).toBe(false)
    expect(matchThread({ titulo: "Otra" }, "tarjeta", new Set(["x"]), "x")).toBe(true)
    expect(preview("**Debes $ 1.000** en total:\n- Banco: $ 1.000")).toBe("Debes $ 1.000 en total: - Banco: $ 1.000")
  })
})

// ── Intención: decisión y registrar ──
describe("intención", () => {
  it("detecta decisiones con monto y cuotas", () => {
    const d = detectDecision("¿Me conviene comprar una moto de 8 millones a 24 cuotas?")!
    expect(d.input.tipo).toBe("comprar")
    expect(+d.input.valor!).toBe(8_000_000)
    expect(+d.input.cuotas!).toBe(24)
    expect(d.input.forma).toBe("cuotas")
    expect(detectDecision("Quiero meter 10 millones en un CDT a 6 meses")!.input.tipo).toBe("invertir")
    expect(detectDecision("¿Le presto 2 millones a mi hermano?")!.input.tipo).toBe("prestar")
    expect(detectDecision("¿Me alcanza para un arriendo de 2 millones al mes?")!.input.tipo).toBe("fijo")
  })

  it("si falta el monto lo pregunta", () => {
    const d = detectDecision("¿Me conviene sacar una tarjeta de crédito?")!
    expect(d.input.tipo).toBe("tarjeta")
    expect(d.faltan[0]).toMatch(/cupo/)
  })

  it("no confunde preguntas de datos, conceptos o comparaciones con decisiones", () => {
    for (const q of ["¿Cuánto debo en mis tarjetas y cuándo las pago?", "¿Qué deuda debería pagar primero?", "¿Cómo puedo ahorrar más cada mes?", "¿Saco un CDT o pago la tarjeta?", "¿Qué es un CDT y cuánto me daría?", "Quiero ahorrar para un viaje", "Registra un gasto de 15 mil en almuerzo", "¿Cuánto gasté este mes?"])
      expect(detectDecision(q), q).toBeNull()
  })

  it("une la respuesta a la pregunta de datos faltantes", () => {
    expect(continueDecision("¿Me conviene sacar una tarjeta de crédito?", "5 millones")).toBe("¿Me conviene sacar una tarjeta de crédito, 5 millones")
    const t = continueDecision("Quiero comprar un celular de 3 millones a cuotas", "12")!
    expect(detectDecision(t)!.input.cuotas).toBe(12)
    expect(continueDecision("Quiero comprar un carro", "¿Qué es la UVT?")).toBeNull()
    const largo = continueDecision("Quiero comprar un carro", "mejor cuéntame cómo hago para organizar el presupuesto de mi casa este año")
    expect(largo).toBeNull()
  })

  it("detecta 'registra un gasto' y 'gasté' con monto y descripción", () => {
    expect(detectQuickAction("Registra un gasto de 15 mil en almuerzo")).toEqual({ tipo: "gasto", valor: 15000, descripcion: "Almuerzo", cuando: "hoy" })
    expect(detectQuickAction("ayer gasté $20.000 en taxi")).toEqual({ tipo: "gasto", valor: 20000, descripcion: "Taxi", cuando: "ayer" })
    expect(detectQuickAction("anota un ingreso de 300 mil por un trabajo extra")).toMatchObject({ tipo: "ingreso", valor: 300000, descripcion: "Trabajo extra" })
    expect(detectQuickAction("¿Cuánto gasté en taxi?")).toBeNull()
    expect(detectQuickAction("Registra un gasto")).toBeNull()
  })
})

// ── Markdown ──
describe("markdown", () => {
  it("títulos, listas, negritas y montos", () => {
    const b = parseMarkdown("### Tu mes\nLlevas **$ 1.234.567** en gastos.\n\n- Mercado: $ 300.000\n- Taxi\n  - Uber\n\n1. Uno\n2. Dos")
    expect(b[0]).toEqual({ t: "h", level: 3, c: [{ t: "text", v: "Tu mes" }] })
    expect(b[1]).toEqual({ t: "p", lines: [[{ t: "text", v: "Llevas " }, { t: "b", c: [{ t: "money", v: "$ 1.234.567" }] }, { t: "text", v: " en gastos." }]] })
    expect(b[2]).toMatchObject({ t: "ul", items: [{ c: [{ t: "text", v: "Mercado: " }, { t: "money", v: "$ 300.000" }] }, { c: [{ t: "text", v: "Taxi" }], sub: { items: [{ c: [{ t: "text", v: "Uber" }] }] } }] })
    expect(b[3]).toMatchObject({ t: "ol", start: 1 })
  })

  it("tablas, código, citas, enlaces seguros y cursiva", () => {
    const b = parseMarkdown("| Opción | Costo |\n|---|--:|\n| CDT | $ 100 |\n\n```\nx = 1\n```\n> ojo\n\nVe a [Metas](/metas) o [x](javascript:alert(1)) y *ya*")
    expect(b[0]).toMatchObject({ t: "table", align: [null, "right"], rows: [[[{ t: "text", v: "CDT" }], [{ t: "money", v: "$ 100" }]]] })
    expect(b[1]).toEqual({ t: "code", lang: "", v: "x = 1" })
    expect(b[2]).toMatchObject({ t: "quote" })
    const p = (b[3] as { lines: unknown[][] }).lines[0]
    expect(p).toContainEqual({ t: "a", href: "/metas", c: [{ t: "text", v: "Metas" }] })
    expect(JSON.stringify(p)).not.toContain('"href":"javascript')
    expect(p).toContainEqual({ t: "i", c: [{ t: "text", v: "ya" }] })
  })

  it("tolera texto a medias mientras llega (streaming)", () => {
    expect(inline("Llevas **$ 1.0")).toEqual([{ t: "text", v: "Llevas " }, { t: "money", v: "$ 1" }, { t: "text", v: ".0" }])
    expect(parseMarkdown("```js\nconst a")).toEqual([{ t: "code", lang: "js", v: "const a" }])
    expect(plainText("**Hola** [Metas](/metas)")).toBe("Hola Metas")
  })
})
