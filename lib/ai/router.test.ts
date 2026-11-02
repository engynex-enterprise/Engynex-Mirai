import { describe, expect, it } from "vitest"
import { dudasLocales, hormigaCierta, interpConfiable, mailMayBePurchase, quickAnswer, routeClassify, type ChatFacts } from "./router"
import { AI_FEATURES, AI_FEATURE_IDS } from "./features"
import { BASE_SYSTEM, BASE_SYSTEM_SHORT, systemFor } from "./prompts"

const cat = (id: string, nombre: string, grupo: string) => ({ id, nombre, grupo, icon: "tag", tope: 0 })
const cats = [cat("c1", "Café", "g"), cat("c2", "Mercado", "n"), cat("c3", "Vivienda", "n"), cat("c4", "Ahorro", "a"), cat("c5", "Restaurantes", "g"), cat("c6", "Otros", "g")]
const ctx = { rules: [{ keyword: "panaderia la 80", category_id: "c1" }], expenses: [{ descripcion: "Don Pepe", category_id: "c5" }], categories: cats, umbral: 25000, needCat: true, needH: true }

describe("hormigaCierta", () => {
  it("decide los casos claros sin IA", () => {
    expect(hormigaCierta({ descripcion: "Televisor", valor: 900000, veces_mes: 0 }, undefined, 25000)).toMatchObject({ h: false })
    expect(hormigaCierta({ descripcion: "Arriendo", valor: 20000, veces_mes: 1 }, cats[2], 25000)).toMatchObject({ h: false })
    expect(hormigaCierta({ descripcion: "Bolsillo", valor: 20000, veces_mes: 1 }, cats[3], 25000)).toMatchObject({ h: false })
    expect(hormigaCierta({ descripcion: "Tinto en la oficina", valor: 3000, veces_mes: 1 }, cats[0], 25000)).toMatchObject({ h: true })
    expect(hormigaCierta({ descripcion: "Algo raro", valor: 8000, veces_mes: 6 }, undefined, 25000)).toMatchObject({ h: true })
  })
  it("deja los dudosos para la IA", () => {
    expect(hormigaCierta({ descripcion: "Libro de cocina", valor: 30000, veces_mes: 1 }, undefined, 25000)).toBeNull()
  })
})

describe("routeClassify", () => {
  it("regla, historial y palabras clave resuelven la categoría sin IA", () => {
    const { done, pending } = routeClassify([
      { i: 0, descripcion: "Panaderia la 80", valor: 60000, veces_mes: 1 },
      { i: 1, descripcion: "Don Pepe", valor: 200000, veces_mes: 1 },
      { i: 2, descripcion: "Tinto Juan Valdez", valor: 6000, veces_mes: 2 },
    ], ctx)
    expect(pending).toHaveLength(0)
    expect(done.find((d) => d.i === 0)).toMatchObject({ category_id: "c1", src: "regla" })
    expect(done.find((d) => d.i === 1)).toMatchObject({ category_id: "c5", hormiga: false })
    expect(done.find((d) => d.i === 2)).toMatchObject({ category_id: "c1", hormiga: true })
  })
  it("solo manda a la IA lo que no se pudo decidir y dice qué pedir", () => {
    const { pending } = routeClassify([{ i: 0, descripcion: "Pago XYZ123", valor: 30000, veces_mes: 1 }], ctx)
    expect(pending).toEqual([expect.objectContaining({ i: 0, askCat: true, askH: true, category_id: null })])
  })
  it("si la categoría es conocida pero la hormiga es dudosa, solo pide la hormiga", () => {
    const { pending } = routeClassify([{ i: 0, descripcion: "Restaurante el cielo", valor: 40000, veces_mes: 1 }], ctx)
    expect(pending[0]).toMatchObject({ askCat: false, askH: true, category_id: "c5" })
  })
  it("respeta lo que se pidió en Ajustes", () => {
    const { done, pending } = routeClassify([{ i: 0, descripcion: "Pago XYZ123", valor: 30000, veces_mes: 1 }], { ...ctx, needCat: false })
    expect(done).toHaveLength(0)
    expect(pending[0]).toMatchObject({ askCat: false, askH: true })
  })
})

const facts: ChatFacts = {
  mes: "2026-11", gasto_mes: 1_500_000, gasto_mes_anterior: 2_000_000, por_categoria: { Mercado: 600_000, Restaurantes: 150_000 }, por_categoria_anterior: { Mercado: 700_000, Café: 40_000 },
  ingreso_mensual: 4_000_000, gastos_fijos_mes: 1_200_000, cuotas_deudas_mes: 300_000, suscripciones_mes: 60_000, disponible: 2_500_000, fondo_emergencia: 1_000_000,
  deudas: [{ nombre: "Tarjeta Visa", saldo: 800_000 }], te_deben: 0, hormiga_mes: 95_000, metas: [{ nombre: "Viaje", objetivo: 3_000_000, ahorrado: 1_500_000 }], categorias: ["Mercado", "Restaurantes", "Café", "Salud"],
}

describe("quickAnswer", () => {
  it("responde cuánto gastó en una categoría con los números", () => {
    const a = quickAnswer("¿Cuánto gasté en mercado este mes?", facts)
    expect(a).toContain("600.000")
    expect(a).toContain("Mercado")
    expect(quickAnswer("cuanto he gastado en restaurantes", facts)).toContain("150.000")
    expect(quickAnswer("¿Cuánto gasté en café el mes pasado?", facts)).toContain("40.000")
    expect(quickAnswer("¿Cuánto gasté en salud?", facts)).toMatch(/\*\*\$\s0\*\* en Salud/) // categoría sin gastos este mes
  })
  it("totales, deudas, hormiga, suscripciones, disponible y metas", () => {
    expect(quickAnswer("cuánto gasté este mes", facts)).toContain("1.500.000")
    expect(quickAnswer("¿Cuánto debo?", facts)).toContain("Tarjeta Visa")
    expect(quickAnswer("¿cuánto llevo en gastos hormiga?", facts)).toContain("95.000")
    expect(quickAnswer("cuanto pago en suscripciones", facts)).toContain("60.000")
    expect(quickAnswer("¿cuánto tengo disponible?", facts)).toContain("2.500.000")
    expect(quickAnswer("¿cómo van mis metas?", facts)).toContain("50 %")
    expect(quickAnswer("¿Cuánto me queda?", facts)).toContain("940.000") // 4M − 1,2M − 300k − 60k − 1,5M
  })
  it("con las cifras del flujo integral responde lo mismo que el Balance (mes, tarjetas y patrimonio)", () => {
    const f: ChatFacts = { ...facts, integral: { entra: 5_000_000, sale: 4_200_000, ahorro: 300_000, queda: 500_000, tengo: 20_000_000, debo: 8_000_000, patrimonio: 12_000_000, deuda_tarjetas: 800_000, pago_tarjetas_mes: 250_000, libre_mes: 400_000, colchon_meses: 1.5 } }
    expect(quickAnswer("¿Cuánto me queda?", f)).toMatch(/entran \*\*\$\s5\.000\.000\*\*.*te sobran \*\*\$\s500\.000\*\*/)
    expect(quickAnswer("¿Cuánto me queda?", { ...f, integral: { ...f.integral!, queda: -200_000 } })).toMatch(/te faltan \*\*\$\s200\.000\*\*/)
    expect(quickAnswer("¿Cuánto debo en tarjetas?", f)).toContain("800.000")
    expect(quickAnswer("¿Cuál es mi patrimonio?", f)).toContain("12.000.000")
    // Sin las cifras integrales (hechos a mano) no inventa: esas preguntas van a la IA.
    expect(quickAnswer("¿Cuál es mi patrimonio?", facts)).toBeNull()
  })
  it("deja a la IA los consejos, decisiones y lo que no entiende", () => {
    expect(quickAnswer("¿Debería pagar primero la tarjeta o ahorrar?", facts)).toBeNull()
    expect(quickAnswer("Quiero comprar un celular de 2 millones", facts)).toBeNull()
    expect(quickAnswer("¿Cuánto gasté en mercado y restaurantes?", facts)).toBeNull()
    expect(quickAnswer("¿Cuánto gasté en ropa interior de lujo?", facts)).toBeNull()
    expect(quickAnswer("Hola, ¿qué es la UVT?", facts)).toBeNull()
  })
})

describe("consejero sin IA", () => {
  it("interpreta frases claras con un solo monto", () => {
    const d = interpConfiable("Quiero comprar una nevera de 2 millones a 12 cuotas")
    expect(d).toMatchObject({ tipo: "comprar", valor: 2_000_000, cuotas: 12, forma: "cuotas" })
    expect(d!.dudas).toContain("¿Qué tasa de interés mensual te cobran?")
    expect(interpConfiable("Pienso prestarle 500 mil a mi hermano")).toMatchObject({ tipo: "prestar", valor: 500_000 })
  })
  it("si la frase es ambigua, va a la IA", () => {
    expect(interpConfiable("No sé si cambiar de carro o seguir con el que tengo")).toBeNull()
    expect(interpConfiable("Comprar una moto de 8 millones o un carro de 30 millones")).toBeNull()
  })
  it("las dudas dependen del tipo", () => {
    expect(dudasLocales({ tipo: "credito", valor: 1 })).toEqual(["¿A cuántas cuotas sería?", "¿Qué tasa de interés te ofrecen (mensual o efectiva anual)?"])
    expect(dudasLocales({ tipo: "invertir", valor: 1, dias: 90 })).toEqual([])
  })
})

describe("correo del banco", () => {
  it("solo manda a la IA los correos que pueden ser compras", () => {
    expect(mailMayBePurchase("Bancolombia te informa compra por $45.900 en EXITO")).toBe(true)
    expect(mailMayBePurchase("Davivienda: transacción de COP 120.000 aprobada")).toBe(true)
    expect(mailMayBePurchase("Nuevo inicio de sesión en tu cuenta")).toBe(false)
    expect(mailMayBePurchase("Oferta exclusiva: gana hasta $1.000.000 en el sorteo")).toBe(false)
    expect(mailMayBePurchase("Recibiste una transferencia de $200.000")).toBe(false)
  })
})

describe("prompts", () => {
  it("cada función tiene su prompt estable que empieza por el base", () => {
    for (const f of AI_FEATURE_IDS) {
      const s = systemFor(f)
      expect(s.startsWith(BASE_SYSTEM) || s.startsWith(BASE_SYSTEM_SHORT)).toBe(true)
      expect(systemFor(f)).toBe(s) // sin datos variables: se puede cachear en el proveedor
    }
  })
  it("las tareas que lee la persona llevan el base completo; las de extracción, el corto", () => {
    expect(systemFor("chat").startsWith(BASE_SYSTEM)).toBe(true)
    expect(systemFor("categorizar").startsWith(BASE_SYSTEM_SHORT)).toBe(true)
    expect(systemFor("chat", { tono: "fin" })).toContain("sabe de finanzas")
    expect(BASE_SYSTEM).toContain("ESTIMACIÓN")
    expect(BASE_SYSTEM).toMatch(/contraseñas/)
  })
  it("las tareas simples usan el modelo barato y tienen tope de salida", () => {
    expect(AI_FEATURES.categorizar.tier).toBe("simple")
    expect(AI_FEATURES.consejero_analizar.tier).toBe("razonamiento")
    expect(AI_FEATURES.factura.tier).toBe("vision")
    for (const f of AI_FEATURE_IDS) expect(AI_FEATURES[f].maxOut).toBeGreaterThan(0)
  })
})
