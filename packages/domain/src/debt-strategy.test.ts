import { describe, expect, it } from "vitest"
import { expectClose, scenario } from "./__tests__/adapt"
import { byAvalancha, byBolaNieve, cardDebt, CARD_PREFIX, debtsFrom, debtStrategy, simAbono, simDebts, TOPE_MESES, type DebtSimResult } from "./debt-strategy"
import { deudaTarjeta, tarjetaCuotaMes, tarjetaPagoMes, tarjetasDeuda } from "./cards"
import { cuotasMes } from "./totals"
import type { CreditCardIn, LoanIn } from "./types"

const HOY = "2026-10-31"

// La v4 identifica cada deuda por su nombre; la v5 por id. Se traduce para comparar.
const byName = (r: DebtSimResult) => ({ m: r.m, ti: r.ti, pay: Object.fromEntries(Object.entries(r.pay).map(([id, m]) => [r.names[id], m])), ord: r.ord.map((id) => r.names[id]) })

const EXTRA_DEUDAS = `S.pagar.push(
 {id:'p3',acreedor:{kind:'entidad',id:S.cfg.entidades[2].id},concepto:'Tarjeta convertida',monto:3500000,sistema:'frances',tasa:2.4,frec:'mensual',plazo:18,inicio:iso(addMonths(today(),-2)),pagos:[],extra:0},
 {id:'p4',acreedor:{kind:'contacto',id:S.contactos[2].id},concepto:'Préstamo de Laura',monto:900000,sistema:'simple',tasa:1.5,frec:'quincenal',plazo:10,inicio:iso(addDays(today(),-20)),pagos:[],extra:0});`

// La v4 sumaba la cuota quincenal una sola vez al mes y le cobraba la tasa de la quincena: un crédito a 20 quincenas
// (10 meses) salía como "20 meses". La v5 convierte cada deuda a su equivalente mensual, así que en ese escenario los
// números YA NO son los de la v4 a propósito; la paridad se mantiene donde la v4 estaba bien (deudas mensuales).
describe("simulador avalancha / bola de nieve = sim() de la v4 (deudas mensuales)", () => {
  const sc = scenario(HOY)
  const D = debtsFrom(sc.book.loans, sc.book.contacts, sc.book.entities, HOY)
  for (const extra of [0, 200000, 500000, 2000000])
    it(`sample · extra ${extra}`, () => {
      expectClose(byName(simDebts(D, 0, () => 0, false)!), sc.plain("sim(0,()=>0,false)"))
      expectClose(byName(simDebts(D, extra, byAvalancha)!), sc.plain(`sim(${extra},(a,b)=>b.i-a.i)`))
      expectClose(byName(simDebts(D, extra, byBolaNieve)!), sc.plain(`sim(${extra},(a,b)=>a.s-b.s)`))
    })
  it("sample · recomendación", () => {
    const r = debtStrategy(sc.book.loans, sc.book.contacts, sc.book.entities, 500000, HOY)!
    const ava = sc.plain("sim(500000,(a,b)=>b.i-a.i)")
    const bol = sc.plain("sim(500000,(a,b)=>a.s-b.s)")
    expect(r.recomendado).toBe(ava.ti <= bol.ti ? "avalancha" : "bola")
  })
  it("sin deudas → null", () => expect(debtStrategy([], [], [], 1000, HOY)).toBeNull())
})

describe("una deuda quincenal cuenta en MESES, no en quincenas (corrige la v4)", () => {
  const sc = scenario(HOY).mutate(EXTRA_DEUDAS)
  const D = debtsFrom(sc.book.loans, sc.book.contacts, sc.book.entities, HOY)
  const quincenal = sc.book.loans.find((L) => L.kind === "pagar" && L.frec === "quincenal")!

  it("entra con la tasa del mes y con las dos cuotas del mes", () => {
    const d = D.find((x) => x.id === quincenal.id)!
    // La v4 usaba la tasa de la quincena (la mitad larga) y una sola cuota.
    expect(d.i).toBeCloseTo(+quincenal.tasa / 100, 12)
    const v4 = debtsFrom([quincenal], sc.book.contacts, sc.book.entities, HOY)[0]
    expect(d.c).toBeCloseTo(v4.c, 6)
    expect(d.c).toBeGreaterThan(0)
  })

  it("el presupuesto de la simulación es el mismo que la pantalla muestra como cuotas del mes", () => {
    // Antes la pantalla decía "hoy pagas X" y simulaba con menos: la cuota quincenal entraba una sola vez.
    const soloPrestamos = sc.book.loans.filter((L) => L.kind === "pagar")
    const budget = debtsFrom(soloPrestamos, sc.book.contacts, sc.book.entities, HOY).reduce((a, d) => a + d.c, 0)
    const conSeguros = cuotasMes(soloPrestamos, "pagar", HOY)
    const seguros = soloPrestamos.reduce((a, L) => a + (+(L.extra ?? 0) || 0) * (L.frec === "quincenal" ? 2 : 1), 0)
    expectClose(budget, conSeguros - seguros)
  })

  it("el crédito a 20 quincenas se acaba en ~10 meses, no en 20", () => {
    const sola = debtsFrom([quincenal], sc.book.contacts, sc.book.entities, HOY)
    const r = simDebts(sola, 0, () => 0, false)!
    const quincenas = +quincenal.plazo
    expect(r.fin).toBe(true)
    expect(r.m).toBeLessThanOrEqual(Math.ceil(quincenas / 2) + 1)
    expect(r.m).toBeGreaterThanOrEqual(Math.floor(quincenas / 2) - 1)
  })
})

describe("deudas que con la cuota mínima no se acaban nunca", () => {
  const soloIntereses: LoanIn = { id: "am", kind: "pagar", concepto: "Crédito de solo intereses", monto: 5_000_000,
    sistema: "americano", tasa: 2, frec: "mensual", plazo: 12, inicio: "2026-01-10", payments: [], extra: 0 } as LoanIn

  it("no se inventa un plazo: fin = false y la deuda queda señalada", () => {
    const r = debtStrategy([soloIntereses], [], [], 0, HOY)!
    // Pagando solo los intereses el capital nunca baja. Antes esto salía como "600 meses / $60.000.000".
    expect(r.base.fin).toBe(false)
    expect(r.base.sinFin).toContain("am")
    expect(r.base.m).toBe(TOPE_MESES)
  })

  it("con un extra suficiente sí se acaba", () => {
    const r = debtStrategy([soloIntereses], [], [], 500_000, HOY)!
    expect(r.avalancha.fin).toBe(true)
    expect(r.avalancha.m).toBeLessThan(TOPE_MESES)
  })
})

describe("simulador de abono = bloque de V.estrategia de la v4", () => {
  const sc = scenario(HOY)
  for (const modo of ["plazo", "cuota"] as const)
    for (const valor of [500000, 2000000, 99999999])
      it(`${modo} · ${valor}`, () => {
        const L = sc.book.loans.find((x) => x.kind === "pagar")!
        const r = simAbono(L, valor, modo, HOY)
        const v4 = sc.plain(`(()=>{const L=S.pagar[0],e0=engine(L),L2=clone(L);L2.pagos.push({id:'sim',fecha:iso(today()),tipo:'abono',valor:${valor},modo:'${modo}'});const e1=engine(L2);return{e0,e1,ah:Math.max(e0.intTotal-e1.intTotal,0)}})()`)
        expectClose(r.antes, v4.e0)
        expectClose(r.despues, v4.e1)
        expect(r.ahorroIntereses).toBeCloseTo(v4.ah, 6)
      })
})

describe("simulador con tarjetas de crédito (v5)", () => {
  const sc = scenario(HOY)
  const tc: CreditCardIn = { id: "visa", nombre: "Visa", corte: 25, pago: 10, tasa: 2.5, cupo: 8_000_000, purchases: [
    { id: "a", fecha: "2026-08-10", valor: 2_400_000, cuotas: 12 },
    { id: "b", fecha: "2026-10-28", valor: 300_000, cuotas: 1 },
  ] }
  it("la tarjeta entra con su saldo, la cuota de un mes normal y la tasa ponderada", () => {
    const d = cardDebt(tc, HOY)!
    expect(d.id).toBe(CARD_PREFIX + "visa")
    expect(d.s).toBeCloseTo(tarjetasDeuda([tc], HOY), 6)
    expect(d.c).toBeCloseTo(Math.max(tarjetaCuotaMes(tc, HOY), tarjetaCuotaMes(tc, HOY, 1)), 6)
    // Sin pagos registrados, lo que falta por pagar este mes y la cuota del mes son lo mismo.
    expect(d.c).toBeCloseTo(tarjetaPagoMes(tc, HOY), 6)
    // La compra a una cuota no causa intereses: la tasa queda por debajo de la de la tarjeta.
    expect(d.i).toBeGreaterThan(0)
    expect(d.i).toBeLessThan(0.025)
    expect(cardDebt({ ...tc, purchases: [] }, HOY)).toBeNull()
  })
  it("sin tarjetas el resultado es el de la v4; con tarjeta se agrega al orden", () => {
    const sin = debtsFrom(sc.book.loans, sc.book.contacts, sc.book.entities, HOY)
    const con = debtsFrom(sc.book.loans, sc.book.contacts, sc.book.entities, HOY, [tc])
    expect(con.length).toBe(sin.length + 1)
    const r = debtStrategy(sc.book.loans, sc.book.contacts, sc.book.entities, 300_000, HOY, [tc])!
    expect(r.avalancha.ord).toContain(CARD_PREFIX + "visa")
    expect(r.avalancha.pay[CARD_PREFIX + "visa"]).toBeGreaterThan(0)
    expect(r.base.m).toBeLessThan(600)
  })
  it("solo una tarjeta (sin préstamos) también se simula", () => {
    const r = debtStrategy([], [], [], 200_000, HOY, [tc])!
    expect(r.avalancha.m).toBeLessThanOrEqual(r.base.m)
    expect(r.base.ti).toBeGreaterThanOrEqual(r.avalancha.ti)
  })

  // Regresión: con el pago del mes registrado, la tarjeta entraba con cuota 0 y saldo sin descontar el pago. La deuda
  // nunca bajaba, la simulación llegaba al tope y la pantalla mostraba "600 meses" y un ahorro de billones de pesos.
  it("haber registrado el pago del mes no rompe la simulación", () => {
    const cuota = tarjetaCuotaMes(tc, HOY)
    const pagada: CreditCardIn = { ...tc, payments: [{ id: "p", fecha: HOY, valor: cuota }] } as CreditCardIn
    const d = cardDebt(pagada, HOY)!
    // El saldo es lo que de verdad debes (`deudaTarjeta`), no el saldo crudo de las compras.
    expect(d.s).toBeCloseTo(deudaTarjeta(pagada, HOY), 6)
    // Ya no falta nada por pagar este mes, pero el otro mes vuelve a tocar la cuota: la simulación usa esa.
    expect(tarjetaPagoMes(pagada, HOY)).toBe(0)
    expect(d.c).toBeGreaterThan(0)
    // Y un abono por encima de la cuota sí baja lo que debes.
    const conAbono: CreditCardIn = { ...tc, payments: [{ id: "p", fecha: HOY, valor: cuota + 500_000 }] } as CreditCardIn
    expect(cardDebt(conAbono, HOY)!.s).toBeLessThan(d.s)
    const r = debtStrategy([], [], [], 500_000, HOY, [pagada])!
    expect(r.base.fin).toBe(true)
    expect(r.base.m).toBeLessThan(TOPE_MESES)
    // Los intereses de una tarjeta con ~$2.000.000 de saldo se cuentan en cientos de miles, no en billones.
    expect(r.base.ti).toBeLessThan(1_000_000)
    expect(r.base.ti - r.avalancha.ti).toBeLessThan(1_000_000)
  })
})
