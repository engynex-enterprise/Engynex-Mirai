import { describe, expect, it } from "vitest"
import { expectClose, scenario } from "./__tests__/adapt"
import { byAvalancha, byBolaNieve, debtsFrom, debtStrategy, simAbono, simDebts, type DebtSimResult } from "./debt-strategy"

const HOY = "2026-10-31"

// La v4 identifica cada deuda por su nombre; la v5 por id. Se traduce para comparar.
const byName = (r: DebtSimResult) => ({ m: r.m, ti: r.ti, pay: Object.fromEntries(Object.entries(r.pay).map(([id, m]) => [r.names[id], m])), ord: r.ord.map((id) => r.names[id]) })

const EXTRA_DEUDAS = `S.pagar.push(
 {id:'p3',acreedor:{kind:'entidad',id:S.cfg.entidades[2].id},concepto:'Tarjeta convertida',monto:3500000,sistema:'frances',tasa:2.4,frec:'mensual',plazo:18,inicio:iso(addMonths(today(),-2)),pagos:[],extra:0},
 {id:'p4',acreedor:{kind:'contacto',id:S.contactos[2].id},concepto:'Préstamo de Laura',monto:900000,sistema:'simple',tasa:1.5,frec:'quincenal',plazo:10,inicio:iso(addDays(today(),-20)),pagos:[],extra:0});`

describe("simulador avalancha / bola de nieve = sim() de la v4", () => {
  for (const [nombre, js] of [["sample", ""], ["sample + 2 deudas", EXTRA_DEUDAS]] as const) {
    const sc = scenario(HOY).mutate(js)
    const D = debtsFrom(sc.book.loans, sc.book.contacts, sc.book.entities, HOY)
    for (const extra of [0, 200000, 500000, 2000000])
      it(`${nombre} · extra ${extra}`, () => {
        expectClose(byName(simDebts(D, 0, () => 0, false)!), sc.plain("sim(0,()=>0,false)"))
        expectClose(byName(simDebts(D, extra, byAvalancha)!), sc.plain(`sim(${extra},(a,b)=>b.i-a.i)`))
        expectClose(byName(simDebts(D, extra, byBolaNieve)!), sc.plain(`sim(${extra},(a,b)=>a.s-b.s)`))
      })
    it(`${nombre} · recomendación`, () => {
      const r = debtStrategy(sc.book.loans, sc.book.contacts, sc.book.entities, 500000, HOY)!
      const ava = sc.plain("sim(500000,(a,b)=>b.i-a.i)")
      const bol = sc.plain("sim(500000,(a,b)=>a.s-b.s)")
      expect(r.recomendado).toBe(ava.ti <= bol.ti ? "avalancha" : "bola")
    })
  }
  it("sin deudas → null", () => expect(debtStrategy([], [], [], 1000, HOY)).toBeNull())
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
