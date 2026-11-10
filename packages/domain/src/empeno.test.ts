import { describe, expect, it } from "vitest"
import { empenoResumen, refrendosParaValor } from "./empeno"
import { loanEngine } from "./loans"

// El caso real: un Apple Watch (vale $ 800.000) empeñado el 10 de junio de 2026 por $ 450.000 al 10 % mensual
// ($ 45.000 de refrendo cada mes). Ha pagado 5 refrendos (julio a noviembre) y hoy es 12 de noviembre.
const HOY = "2026-11-12"
const pago = (n: number, fecha: string) => ({ id: `p${n}`, fecha, tipo: "cuota", valor: 45000 })
const reloj = (pagos = [pago(1, "2026-07-10"), pago(2, "2026-08-10"), pago(3, "2026-09-10"), pago(4, "2026-10-10"), pago(5, "2026-11-10")]) => ({
  monto: 450000, sistema: "americano", tasa: 10, frec: "mensual", plazo: 4, inicio: "2026-06-10", extra: 0,
  prenda: { obj: "Apple Watch", valor: 800000, refrendo: true }, payments: pagos,
})

describe("empeño con refrendo mes a mes", () => {
  it("sin fecha de fin: lo que viene es otro refrendo de $ 45.000, no el capital (aunque el plazo fuera de 4 meses)", () => {
    const e = loanEngine(reloj(), HOY)
    expect(e.vencidas).toHaveLength(0)
    expect(e.next).toMatchObject({ fecha: "2026-12-10", cap: 0 })
    expect(e.next!.valor).toBeCloseTo(45000, 2)
    expect(e.saldo).toBe(450000)
  })
  it("resumen: 5 refrendos = $ 225.000 pagados (la mitad de lo prestado); para recuperarlo hoy, $ 450.000", () => {
    const r = empenoResumen(reloj(), HOY)
    expect(r).toMatchObject({ capital: 450000, refrendoMes: 45000, refrendos: 5, interesesPagados: 225000, atrasados: 0, paraRecuperar: 450000, mesesParaIgualar: 5 })
    expect(r.pctDelPrestamo).toBeCloseTo(0.5)
    expect(r.ea).toBeCloseTo(Math.pow(1.1, 12) - 1, 8)
  })
  it("si deja de pagar, los refrendos atrasados se suman a lo que debe para recuperarlo", () => {
    const r = empenoResumen(reloj([pago(1, "2026-07-10"), pago(2, "2026-08-10"), pago(3, "2026-09-10")]), HOY)
    expect(r).toMatchObject({ atrasados: 2, atrasadoValor: 90000, paraRecuperar: 540000 })
  })
  it("un abono a capital baja el refrendo de los meses que siguen", () => {
    const L = reloj()
    L.payments = [...L.payments, { id: "ab", fecha: "2026-11-11", tipo: "abono", valor: 150000 } as never]
    expect(empenoResumen(L, HOY)).toMatchObject({ capital: 300000, refrendoMes: 30000 })
  })
  it("sin refrendo (plazo fijo) se comporta como antes: el capital se paga en la última cuota", () => {
    const L = { ...reloj([]), prenda: { obj: "Apple Watch" }, inicio: "2026-11-01" }
    const e = loanEngine(L, HOY)
    expect(e.plan).toHaveLength(4)
    expect(e.plan[3].cap).toBe(450000)
  })
})

describe("empeño: recuperar con el mes en curso, valor del objeto y usura", () => {
  it("recuperarlo hoy: $ 450.000, o $ 495.000 si la casa cobra el mes que va corriendo", () => {
    expect(empenoResumen(reloj(), HOY)).toMatchObject({ paraRecuperar: 450000, paraRecuperarConMes: 495000 })
  })
  it("el reloj vale $ 800.000: con 3 refrendos más (8 en total) lo pagado + lo que debe ya supera lo que vale", () => {
    expect(empenoResumen(reloj(), HOY).refrendosParaValor).toBe(3)
    // 8 × 45.000 + 450.000 = 810.000 > 800.000
    expect(refrendosParaValor(800000, 450000, 8 * 45000, 45000)).toBe(0)
    expect(refrendosParaValor(0, 450000, 0, 45000)).toBeNull()
  })
  it("10 % mensual = 213,84 % E.A., unas 7,5 veces la usura de noviembre de 2026 (28,34 % E.A., Res. 1707 de 2026)", () => {
    const r = empenoResumen(reloj(), HOY, { usuraEA: 28.34 })
    expect(r.ea * 100).toBeCloseTo(213.84, 2)
    expect(r.vecesUsura!).toBeCloseTo(7.55, 1)
    expect(empenoResumen(reloj(), HOY).vecesUsura).toBeNull()
  })
})
