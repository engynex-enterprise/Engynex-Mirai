import { describe, expect, it } from "vitest"
import { asAnalyze, type AdvisorInput, type BookData } from "@mirai/domain"
import { concepto, decisionView, grupoDe, num } from "./decision-view"
import { detectDecision } from "./intent"
import type { Consulta } from "./types"

const settings = { umbral: 25000, limite: 0, trm: {}, pct: { n: 50, g: 30, a: 20 }, emerg_meta: 3, anticipo: 5, corte_q: 15, alerta_pres: 80, notif: {}, uvt: {}, smmlv: {}, nomina: {} } as never
const book = (o: Partial<BookData> = {}): BookData => ({
  settings, categories: [], incomes: [{ id: "i1", concepto: "Salario", valor: 6_679_200, frec: "mensual", dia: 30 } as never], extraIncomes: [], expenses: [],
  fixedExpenses: [], subscriptions: [], loans: [], creditCards: [], assets: [], liabilities: [], investments: [], goals: [], calendarEvents: [], contacts: [], entities: [], ...o,
})
const TODAY = "2026-11-02"

/** Consulta como la arma features/advisor/engine.ts (sin IA). */
function consulta(txt: string, b = book(), id = "c1"): Consulta {
  const d = detectDecision(txt)!.input as AdvisorInput
  const an = asAnalyze(b, d, { usura: 26 }, TODAY)
  return { id, fecha: TODAY, d, txt, v: an.v, R: an.R, m: an.m, X: an.X ?? {}, ai: null, aiErr: null, datos: { cuentas: b.assets.length > 0 || b.investments.length > 0, ingresos: an.m.ing > 0 } }
}

describe("tarjeta del consejero", () => {
  it("gasto mensual (caso del dueño): frases claras, días de trabajo con decimal y sin 'disponible' ni 'colchón'", () => {
    const c = consulta("Quiero darle a mi mujer para sus cosas 100 mil al mes")
    expect(c.d.tipo).toBe("fijo")
    const v = decisionView(c)
    expect(v.grupo).toBe("mensual")
    expect(v.cifras.map((x) => x.id)).toEqual(["sobra", "dias", "anio"])
    expect(v.cifras[0].frase).toBe("Después de este gasto, cada mes te sobran")
    expect(v.cifras[1].valor).toBe("0,4 días de tu trabajo al mes")
    expect(v.cifras[2].valor).toMatch(/1\.200\.000/)
    expect(v.cifras.every((x) => x.ayuda.length > 20)).toBe(true)
    expect(JSON.stringify(v)).not.toMatch(/disponible|colchón/i)
    expect(v.intro).toMatch(/darle a tu mujer para sus cosas/i)
    expect(v.peso).toMatchObject({ tone: "ok" })
    expect(v.peso!.label).toMatch(/1,5 % de lo que te sobra/)
    expect(v.razones.length).toBeGreaterThanOrEqual(2)
    expect(v.pasos.length).toBeGreaterThanOrEqual(1)
  })

  it("elige 2 o 3 cifras distintas según el tipo de decisión", () => {
    const ids = (t: string) => decisionView(consulta(t)).cifras.map((x) => x.id)
    expect(ids("¿Me conviene comprar una moto de 8 millones a 24 cuotas?")).toEqual(["cuota", "sin-int", "sobra"])
    expect(ids("¿Me conviene comprar una nevera de 2 millones de contado?").slice(0, 2)).toEqual(["meses", "dias"])
    expect(ids("Quiero meter 10 millones en un CDT a 6 meses")[0]).toBe("gana")
    expect(ids("Quiero sacar una tarjeta de crédito con cupo de 5 millones")).toContain("manejo")
    expect(grupoDe(consulta("¿Le presto 2 millones a mi hermano a 6 cuotas?"))).toBe("prestamo")
    for (const t of ["¿Me conviene comprar una moto de 8 millones a 24 cuotas?", "Quiero meter 10 millones en un CDT a 6 meses", "¿Le presto 2 millones a mi hermano a 6 cuotas?"]) {
      const n = decisionView(consulta(t)).cifras.length
      expect(n).toBeGreaterThanOrEqual(2)
      expect(n).toBeLessThanOrEqual(3)
    }
  })

  it("sin cuentas ni fondo: no muestra 'te quedaría disponible' como dato y explica qué falta", () => {
    const sin = decisionView(consulta("¿Me conviene comprar una nevera de 2 millones de contado?"))
    expect(sin.cifras.some((x) => x.id === "disponible" || x.id === "colchon")).toBe(false)
    expect(sin.avisos.join(" ")).toMatch(/Aún no registras tu plata en cuentas/)
    expect(sin.razones.join(" ")).not.toMatch(/disponibles|colchón/)
    expect(sin.v).not.toBe("no") // 2 millones con $ 6,6 millones libres al mes no es "mejor no"
    const con = decisionView(consulta("¿Me conviene comprar una nevera de 2 millones de contado?", book({ assets: [{ id: "a1", cod: "cta", valor: 9_000_000 } as never] })))
    expect(con.cifras.some((x) => x.id === "disponible")).toBe(true)
    expect(con.avisos.join(" ")).not.toMatch(/cuentas/)
  })

  it("sin ingresos lo dice en vez de mostrar ceros", () => {
    const v = decisionView(consulta("Quiero darle a mi mujer 100 mil al mes", book({ incomes: [] })))
    expect(v.intro).toMatch(/cuánto ganas|ingresos/)
    expect(v.avisos[0]).toMatch(/ingresos/)
    expect(v.veredicto).toBe("Me faltan tus ingresos para decidir")
    expect(v.cifras.some((x) => x.id === "sobra" || x.id === "dias")).toBe(false)
  })

  it("varía la redacción entre consultas", () => {
    const intros = new Set(["a", "b", "c", "d", "e", "f"].map((id) => decisionView(consulta("Quiero darle a mi mujer 100 mil al mes", book(), id)).intro))
    expect(intros.size).toBeGreaterThan(1)
  })

  it("concepto en segunda persona y sin montos; formato colombiano", () => {
    expect(concepto({ d: { tipo: "fijo" }, txt: "¿Me conviene darle a mi mujer para sus cosas $100.000 al mes?" })).toBe("darle a tu mujer para sus cosas")
    expect(concepto({ d: { tipo: "comprar" }, txt: "¿Me alcanza para una moto de 8 millones a 24 cuotas?" })).toBe("una moto")
    expect(num(0.449)).toBe("0,4")
    expect(num(2.25)).toBe("2,3")
    expect(num(12.4)).toBe("12")
  })
})
