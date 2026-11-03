import { describe, expect, it } from "vitest"
import { detectActions, detectDecision, original, plazoDe } from "./intent"
import { elegir, medioEnTexto, palabras } from "./acciones"
import { resolverAcciones } from "./resolver"
import { contextoChat } from "./contexto"
import { integralExtras } from "./extras"
import type { Categorize } from "./tools"
import { HOY, libroPrueba } from "./libro-prueba"
import { chatFacts, quickAnswer } from "../router"
import { estadoIntegral, flujoIntegral, periodo } from "@mirai/domain/flujo-integral"
import { capacidad, compromisos } from "@mirai/domain/dashboard"

// Registrar en todos los módulos desde el chat sin IA: frase → interpretación → registro del libro → tarjeta.

const cat: Categorize = async () => ({ id: "c-res", nombre: "Restaurantes", src: "regla" })
const resolver = (t: string, access: "owner" | "registra" | "viewer" = "owner") => resolverAcciones(detectActions(t), { b: libroPrueba(), today: HOY, access, categorize: cat })

describe("detectActions", () => {
  it("préstamos: le presté (Me deben) y me prestaron / saqué un crédito / le debo (Le debo)", () => {
    expect(detectActions("Le presté 200 mil a Juan a 3 meses")[0]).toMatchObject({ tipo: "prestamo", kind: "cobrar", valor: 200000, persona: "Juan", plazo: 3, frec: "mensual" })
    expect(detectActions("le presté a José 500 mil al 5%")[0]).toMatchObject({ kind: "cobrar", persona: "José", valor: 500000, tasa: 5 })
    expect(detectActions("Mi hermano me prestó 1 millón")[0]).toMatchObject({ tipo: "prestamo", kind: "pagar", persona: "Mi hermano", valor: 1_000_000 })
    expect(detectActions("Saqué un crédito de 10 millones en Bancolombia a 36 cuotas")[0]).toMatchObject({ kind: "pagar", persona: "Bancolombia", valor: 10_000_000, plazo: 36 })
    expect(detectActions("le debo 300 mil a Pedro")[0]).toMatchObject({ kind: "pagar", persona: "Pedro", valor: 300000 })
  })
  it("cuotas y abonos", () => {
    expect(detectActions("Pagué la cuota del carro")[0]).toMatchObject({ tipo: "pago_cuota", kind: "pagar", ref: "carro", estricto: false })
    expect(detectActions("pagué 2 cuotas de Bancolombia")[0]).toMatchObject({ tipo: "pago_cuota", cuotas: 2, ref: "bancolombia" })
    expect(detectActions("Andrés me pagó la cuota")[0]).toMatchObject({ tipo: "pago_cuota", kind: "cobrar", ref: "andres", estricto: false })
    expect(detectActions("abone 500 mil al carro").some((a) => a.tipo === "pago_cuota" && a.valor === 500000)).toBe(true)
  })
  it("fijos, suscripciones, tarjeta y metas", () => {
    expect(detectActions("ya pagué el arriendo").map((a) => a.tipo)).toEqual(["pago_fijo", "cobro_suscripcion", "pago_cuota", "pago_tarjeta"])
    expect(detectActions("pagué la tarjeta Visa")[0]).toMatchObject({ tipo: "pago_tarjeta", ref: "visa", total: false })
    expect(detectActions("pagué el total de la tarjeta")[0]).toMatchObject({ tipo: "pago_tarjeta", total: true })
    expect(detectActions("abone 300 mil a la tarjeta")[0]).toMatchObject({ tipo: "pago_tarjeta", valor: 300000 })
    expect(detectActions("ya se cobró Netflix")[0]).toMatchObject({ tipo: "cobro_suscripcion", ref: "netflix" })
    expect(detectActions("Compré un celular de 2 millones con la tarjeta Visa a 12 cuotas")[0]).toMatchObject({ tipo: "compra_tarjeta", valor: 2_000_000, descripcion: "Celular", ref: "visa", cuotas: 12 })
    expect(detectActions("gasté 80 mil en mercado con la tarjeta")[0]).toMatchObject({ tipo: "compra_tarjeta", descripcion: "Mercado", ref: "" })
    expect(detectActions("abona 100 mil a la meta del viaje")[0]).toMatchObject({ tipo: "abono_meta", valor: 100000, ref: "viaje", explicito: true })
    expect(detectActions("guardé 200 mil para el viaje")[0]).toMatchObject({ tipo: "abono_meta", explicito: false })
  })
  it("gastos e ingresos sueltos siguen igual", () => {
    expect(detectActions("Registra un gasto de 15 mil en almuerzo")).toEqual([{ tipo: "gasto", valor: 15000, descripcion: "Almuerzo", cuando: "hoy" }])
    expect(detectActions("me pagaron 300 mil por un trabajo ayer")[0]).toMatchObject({ tipo: "ingreso", valor: 300000, cuando: "ayer" })
  })
  it("las preguntas y las decisiones no son registros", () => {
    for (const t of ["¿Cuánto gasté este mes?", "¿Le presto 200 mil a Juan?", "Quiero prestarle 500 mil a mi hermano", "¿Cómo pago la tarjeta?", "Quiero darle a mi mujer 100 mil al mes"]) expect(detectActions(t), t).toEqual([])
    expect(detectDecision("Quiero prestarle 500 mil a mi hermano")).not.toBeNull()
  })
  it("plazo, tasa y nombres como los escribió la persona", () => {
    expect(plazoDe("a 6 quincenas al 2,5 %")).toEqual({ plazo: 6, frec: "quincenal", tasa: 2.5 })
    expect(plazoDe("en doce cuotas")).toMatchObject({ plazo: 12, frec: "mensual" })
    expect(original("Le presté a José Pérez", "jose perez")).toBe("José Pérez")
  })
})

describe("encontrar el registro", () => {
  it("palabras con sinónimos y elegir el que más coincide", () => {
    expect(palabras("la cuota del carro")).toEqual(["vehiculo"])
    expect(palabras("Crédito de vehículo")).toEqual(["vehiculo"])
    const b = libroPrueba()
    expect(elegir("viaje", b.goals.map((g) => ({ item: g.id, textos: [g.nombre] }))).item).toBe("g-viaje")
    expect(elegir("", b.goals.map((g) => ({ item: g.id, textos: [g.nombre] }))).empate).toHaveLength(2)
  })
})

describe("medio de pago en la frase", () => {
  it("encuentra Nequi o Efectivo y no inventa", () => {
    const ms = [{ id: "m1", nombre: "Efectivo" }, { id: "m2", nombre: "Nequi / Daviplata" }, { id: "m3", nombre: "Tarjeta de crédito" }]
    expect(medioEnTexto("gasté 20 mil en taxi en efectivo", ms)?.id).toBe("m1")
    expect(medioEnTexto("me pagaron 300 mil por nequi", ms)?.id).toBe("m2")
    expect(medioEnTexto("gasté 20 mil en taxi", ms)).toBeUndefined()
  })
})

describe("resolverAcciones (frase → tarjeta, sin IA)", () => {
  it("le presté 200 mil a Juan a 3 meses → préstamo en Me deben", async () => {
    const r = await resolver("le presté 200 mil a Juan a 3 meses")
    expect(r && "propuesta" in r && r.propuesta).toMatchObject({ tipo: "prestamo", datos: { kind: "cobrar", valor: 200000, plazo: 3, persona: "Juan", contact_id: null } })
  })
  it("pagué la cuota del carro → cuota del Crédito de vehículo; Andrés me pagó la cuota → Me deben", async () => {
    const a = await resolver("pagué la cuota del carro")
    expect(a && "propuesta" in a && a.propuesta).toMatchObject({ tipo: "pago_cuota", datos: { ref_id: "l-carro", kind: "pagar" } })
    const c = await resolver("Andrés me pagó la cuota")
    expect(c && "propuesta" in c && c.propuesta).toMatchObject({ tipo: "pago_cuota", datos: { ref_id: "l-andres", kind: "cobrar" } })
  })
  it("pagué el arriendo → pago del fijo (no una deuda ni una suscripción)", async () => {
    const r = await resolver("ya pagué el arriendo")
    expect(r && "propuesta" in r && r.propuesta).toMatchObject({ tipo: "pago_fijo", datos: { ref_id: "f-arr", periodo: "2026-11", valor: 1700000 } })
  })
  it("pagué 190 mil de la luz → pago de Energía, no un gasto aparte", async () => {
    const r = await resolver("pagué 190 mil de la luz")
    expect(r && "propuesta" in r && r.propuesta).toMatchObject({ tipo: "pago_fijo", datos: { ref_id: "f-luz", valor: 190000 } })
  })
  it("pagar la tarjeta: el pago del mes, el total u otro valor (pay_credit_card)", async () => {
    const mes = await resolver("pagué la tarjeta")
    expect(mes && "propuesta" in mes && mes.propuesta).toMatchObject({ tipo: "pago_tarjeta", datos: { ref_id: "t-visa", pago_tarjeta: "minimo" } })
    const tot = await resolver("pagué el total de la tarjeta Visa")
    expect(tot && "propuesta" in tot && tot.propuesta).toMatchObject({ tipo: "pago_tarjeta", datos: { pago_tarjeta: "total", saldo: 0 } })
    const otro = await resolver("abone 100 mil a la tarjeta")
    expect(otro && "propuesta" in otro && otro.propuesta).toMatchObject({ tipo: "pago_tarjeta", datos: { pago_tarjeta: "otro", valor: 100000 } })
  })
  it("algo que no existe con varias interpretaciones → null (sigue la IA o la respuesta con datos)", async () => {
    expect(await resolver("pagué el colegio")).toBeNull()
  })
  it("si falta un dato, pregunta", async () => {
    const r = await resolver("me prestaron 500 mil")
    expect(r && "msg" in r && r.msg).toMatch(/Quién te prestó/)
  })
  it("respeta el rol: Registra sus gastos registra su gasto pero no un préstamo; Solo mira, nada", async () => {
    expect(await resolver("Registra un gasto de 15 mil en almuerzo", "registra")).toMatchObject({ propuesta: { tipo: "gasto", datos: { valor: 15000, category_id: "c-res", cat_src: "regla" } } })
    expect(await resolver("le presté 200 mil a Juan a 3 meses", "registra")).toMatchObject({ msg: expect.stringMatching(/Registra sus gastos/) })
    expect(await resolver("Registra un gasto de 15 mil en almuerzo", "viewer")).toMatchObject({ msg: expect.stringMatching(/Solo mira/) })
  })
})

describe("las cifras del chat son las del Balance y el Dashboard", () => {
  const b = libroPrueba()
  const X = integralExtras(b, HOY, { taxAssets: [], incCats: [], allowances: [], movs: [], fondo: [], members: [] })
  const f = chatFacts(b, HOY, X)
  it("mes, lo que tienes y debes, compromisos y capacidad", () => {
    const F = flujoIntegral(b, periodo(b, "mes", 2026, 10), HOY, X)
    const E = estadoIntegral(b, HOY, X)
    const C = compromisos(b, HOY)
    const cap = capacidad(b, HOY, C, E.liquidez)
    expect(f.integral).toMatchObject({ entra: Math.round(F.tot.entra), sale: Math.round(F.tot.sale), ahorro: Math.round(F.tot.ahorro), queda: Math.round(F.tot.queda), tengo: Math.round(E.A), debo: Math.round(E.P), patrimonio: Math.round(E.pat), libre_mes: Math.round(cap.libre) })
    expect(f.disponible).toBe(Math.round(E.liquidez))
    expect(f.ingreso_mensual).toBe(Math.round(C.ingreso))
    expect(f.deudas.reduce((a, d) => a + d.saldo, 0)).toBeCloseTo(E.P, -1)
    // "¿Cuánto debo?" incluye la tarjeta (como el Balance), no solo Le debo.
    expect(quickAnswer("¿Cuánto debo?", f)).toContain("Tarjeta Visa Oro")
    expect(quickAnswer("¿Cuánto me queda?", f)).toContain("Balance")
    expect(quickAnswer("¿Cuál es mi patrimonio?", f)).toContain(Math.abs(Math.round(E.pat)).toLocaleString("es-CO"))
  })
  it("el contexto de la IA trae ingresos extra, tarjetas, topes, cuentas y lo que te conviene", () => {
    const d = contextoChat(b, HOY, f, X)
    for (const k of ["mes_te_queda", "ingresos_extra_mes: 400000", "compromisos_mes", "deudas:", "Tarjeta Visa Oro", "topes_presupuesto_mes", "cuentas: nombre=Nequi", "metas:", "lo_que_te_conviene"]) expect(d, k).toContain(k)
  })
})
