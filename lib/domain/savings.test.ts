import { describe, expect, it } from "vitest"
import { catId, scenario } from "./__tests__/adapt"
import { gastosBasicos } from "./totals"
import { aporteDias, aporteFondoSugerido, aporteSugerido, fondoDisponible, fondoEstado, imprevistos, metaPlan, payDays, usarFondo } from "./savings"

const HOY = "2026-10-31"
const catIng = (sc: ReturnType<typeof scenario>) => sc.S.cfg.catIngreso.map((c: { id: string; nombre: string }) => ({ id: c.id, nombre: c.nombre }))

describe("aportes y fondo de emergencia = v4", () => {
  it.each([
    ["sample (salario quincenal)", ""],
    ["solo mensual con salario", "S.ingresos=S.ingresos.filter(i=>i.frec!=='quincenal')"],
    ["sin palabra salario", "S.ingresos=[{id:'x',concepto:'Arriendo',cat:'Arriendos',valor:1,frec:'mensual',dia:7}]"],
    ["sin ingresos", "S.ingresos=[]"],
  ])("payDays · %s", (_n, js) => {
    const sc = scenario(HOY).mutate(js)
    expect(payDays(sc.book.incomes, catIng(sc))).toEqual(sc.plain("payDays()"))
  })
  it("aporte sugerido al fondo (10 % de gastos básicos)", () => {
    const sc = scenario(HOY)
    const v4 = sc.ev("Math.ceil(gastosBasicos()*0.1/1000)*1000")
    expect(aporteFondoSugerido(gastosBasicos(sc.book, HOY))).toBe(v4)
    expect(aporteSugerido(1234567, "quincenal")).toBe(618000)
    expect(aporteSugerido(1234567, "mensual")).toBe(1235000)
    expect(aporteSugerido(0, "mensual")).toBe(0)
  })
  it("días del aporte se acotan", () => {
    expect(aporteDias("quincenal", 20, 10)).toEqual({ dia: 15, dia2: 16 })
    expect(aporteDias("mensual", null, null, 40)).toEqual({ dia: 31, dia2: 30 })
    expect(aporteDias("mensual")).toEqual({ dia: 30, dia2: 30 })
  })
  it("usar el fondo: cubre hasta el saldo", () => {
    expect(usarFondo(500000, 300000)).toEqual({ cubre: 300000, resto: 200000, saldoFinal: 0 })
    expect(usarFondo(100000, 300000)).toEqual({ cubre: 100000, resto: 0, saldoFinal: 200000 })
  })
  it("imprevistos del mes y del año", () => {
    const sc = scenario(HOY).mutate("S.gastos.push({id:'i1',fecha:iso(today()),desc:'Grúa',cat:'Imprevistos',valor:250000},{id:'i2',fecha:'2026-02-03',desc:'Plomero',cat:'Imprevistos',valor:90000},{id:'i3',fecha:'2025-12-03',desc:'Viejo',cat:'Imprevistos',valor:1})")
    const r = imprevistos(sc.book.expenses, catId(sc.S, "Imprevistos"), HOY)
    const html: string = sc.ev("fondoBlock()")
    const v4 = [...html.matchAll(/<div class="metric"><b>([^<]+)<\/b>/g)].map((m) => m[1])
    expect(v4).toEqual([sc.ev(`$(${r.mes})`), sc.ev(`$(${r.ano})`)])
  })
})

describe("plan de una meta = V.metas de la v4", () => {
  it("meses, ahorro mensual y aporte sugerido", () => {
    const sc = scenario(HOY)
    for (const m of sc.book.goals) {
      const p = metaPlan(m, HOY)
      const v4 = sc.plain(`(()=>{const m=S.metas.find(x=>x.id==='${m.id}');const falta=Math.max(m.objetivo-m.ahorrado,0),meses=Math.max(1,(parse(m.fecha).getFullYear()-today().getFullYear())*12+parse(m.fecha).getMonth()-today().getMonth());return{falta,meses,mensual:falta/meses,sug:Math.ceil(falta/meses/1000)*1000}})()`)
      expect([p.falta, p.meses, p.sugerido]).toEqual([v4.falta, v4.meses, v4.sug])
      expect(p.mensual).toBeCloseTo(v4.mensual, 9)
    }
  })
  it("meta vencida o del mes actual → 1 mes", () => expect(metaPlan({ objetivo: 100, ahorrado: 0, fecha: "2026-01-01" }, HOY).meses).toBe(1))
})

describe("fondoDisponible y fondoEstado: la misma cifra en Metas y Dashboard", () => {
  const b = { settings: { emerg_meta: 6 }, fixedExpenses: [], loans: [], subscriptions: [], categories: [{ id: "n1", nombre: "Mercado", icon: "tag", tope: 1000000, grupo: "n" }] } as never
  it("con el fondo activo cuenta su saldo; si no, el dinero disponible", () => {
    expect(fondoDisponible({ activo: true, saldo: 800000 }, 5000000)).toBe(800000)
    expect(fondoDisponible({ activo: true, saldo: "-5" }, 5000000)).toBe(0)
    expect(fondoDisponible({ activo: false, saldo: 800000 }, 5000000)).toBe(5000000)
    expect(fondoDisponible(null, 5000000)).toBe(5000000)
    expect(fondoDisponible(undefined, 0)).toBe(0)
  })
  it("meta, lo que falta y los meses que aguantas", () => {
    expect(fondoEstado(b, HOY, 5000000, { activo: true, saldo: 1500000 })).toEqual({ basicos: 1000000, metaMeses: 6, meta: 6000000, tiene: 1500000, falta: 4500000, meses: 1.5, enFondo: true })
    expect(fondoEstado(b, HOY, 7000000)).toMatchObject({ tiene: 7000000, falta: 0, meses: 7, enFondo: false })
    // Sin meta en los ajustes se usan 6 meses (como el Dashboard).
    expect(fondoEstado({ ...(b as object), settings: { emerg_meta: 0 } } as never, HOY, 0).metaMeses).toBe(6)
  })
})
