import { describe, expect, it } from "vitest"
import { scenario } from "./__tests__/adapt"
import { formatCOP } from "./money"
import { montoCalendarioPrima, primas, repartoPrima, salarioDesdeIngresos } from "./primas"

const catIng = (sc: ReturnType<typeof scenario>) => sc.S.cfg.catIngreso.map((c: { id: string; nombre: string }) => ({ id: c.id, nombre: c.nombre }))

describe("primas y cesantías = V.primas de la v4", () => {
  for (const hoy of ["2026-03-15", "2026-07-01", "2026-12-21", "2026-12-20"]) {
    const sc = scenario(hoy)
    it(`${hoy}: salario tomado de los ingresos, valores y orden de fechas`, () => {
      const sal = salarioDesdeIngresos(sc.book.incomes, catIng(sc), sc.book.settings.trm)
      expect(sal).toBe(9500000) // salario titular quincenal 4.750.000 × 2
      const p = primas(sal, hoy)
      const html: string = sc.ev("(PRI.sal=null,V.primas())")
      // Las 4 tarjetas de la v4 en orden: "<b>$ X</b><span>Nombre · 30 jun</span>"
      const v4 = [...html.matchAll(/<div class="metric"><b>([^<]+)<\/b><span>([^<]+) · ([^<]+)<\/span>/g)].map((m) => [m[1], m[2]])
      expect(p.prox.map((x) => [formatCOP(x.v), x.n])).toEqual(v4)
      // Plan de la próxima: monto de cada parte con 40/30/20/10.
      const parts = [...html.matchAll(/<b class="num">([^<]+)<\/b>/g)].map((m) => m[1])
      const r = repartoPrima(p.prox[0].v)
      expect([r.deudas, r.ahorro, r.metas, r.gusto].map(formatCOP)).toEqual(parts)
    })
  }
  it("montos que se ponen en el calendario (priCal)", () => {
    const sc = scenario("2026-10-31")
    sc.ev("PRI.sal=null;try{EXTRA_ACT.priCal()}catch(e){}") // render() falla sin DOM real; los montos ya quedaron en S
    const v4 = sc.plain("S.calendario.map(c=>[c.titulo,c.monto])")
    const sal = 9500000
    for (const [titulo, monto] of v4 as [string, number][]) expect(montoCalendarioPrima(titulo, sal) ?? 0).toBe(monto)
  })
  it("reparto con porcentajes en cero no divide por cero", () => expect(repartoPrima(1000, { deudas: 0, ahorro: 0, metas: 0, gusto: 0 })).toEqual({ deudas: 0, ahorro: 0, metas: 0, gusto: 0 }))
})
