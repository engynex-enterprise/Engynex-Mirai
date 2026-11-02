/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest"
import { expectClose, scenario, type Scenario } from "./__tests__/adapt"
import { HOYS, RICO } from "./__tests__/fixtures"
import { calcRenta, corteRenta, deduciblesDe, deudaTarjetasAl, depInfo, patrimonio, rentaAuto, saldoPrestamoAl, tarifa241, titularId, topes, type RentaInput } from "./renta"
import { loanEngine } from "./loans"
import { compraEstado } from "./cards"

/** Construye la entrada de la v5 desde el estado de la v4. */
function rentaOf(sc: Scenario, y: number, mid: string): RentaInput {
  const S = sc.S
  const R = sc.plain(`rData(${y},'${mid}')`)
  return {
    book: { ...sc.book, incomes: S.ingresos.map((x: any) => ({ ...sc.book.incomes.find((i) => i.id === x.id)!, cat: x.cat, bruto: x.bruto ? +x.bruto : null })) },
    members: S.perfil.miembros.map((m: any) => ({ id: m.id, nombre: m.nombre, rol: m.rol, nacimiento: m.nac ?? null, dep_de: m.depDe || null, dep_rel: m.depRel || null, estudia: !!m.estudia, sin_ingresos: !!m.sinIng, discapacidad: !!m.discap })),
    bienes: (S.bienes || []).map((b: any) => ({ id: b.id, asset_id: b.aid ?? null, tipo: b.tipo, nombre: b.nombre, costo: +b.costo || 0, avaluo: +b.avaluo || 0, valor31: +b.valor31 || 0, member_id: b.duenio || null, pct: +b.pct || 100, predial: b.predial ?? null, imp_veh: b.impVeh ?? null, soat: b.soat ?? null })),
    tax: { ing: R.ing, ded: R.ded, docs: R.docs, consig: +R.consig || 0, consumos: +R.consumos || 0 },
    uvtOverrides: S.cfg.uvt, smmlvOverrides: S.cfg.smmlv,
  }
}

const EXTRA = `
const [a,b,c]=S.perfil.miembros.map(m=>m.id);
S.perfil.miembros[2].depDe=a;S.perfil.miembros[2].nac='2015-04-10';
S.perfil.miembros[1].depDe=a;S.perfil.miembros[1].depRel='conyuge';S.perfil.miembros[1].sinIng=true;
S.perfil.miembros.push({id:'m4',nombre:'Abuela',rol:'Madre',cupo:0,depDe:a,sinIng:false},{id:'m5',nombre:'Hijo mayor',rol:'Hijo',cupo:0,depDe:a,nac:'2004-01-01',estudia:true});
S.ingresos.push({id:'h1',concepto:'Consultoría',cat:'Honorarios',valor:4000000,frec:'mensual',dia:5,quien:b,moneda:'COP'},{id:'ar',concepto:'Arriendo apartamento',cat:'Arriendos',valor:1500000,frec:'mensual',dia:5,quien:'familia',moneda:'COP'},{id:'pe',concepto:'Pensión',cat:'Pensión',valor:3000000,frec:'mensual',dia:1,quien:'familia',moneda:'COP'});
S.bienes=[{id:'b1',tipo:'inmueble',nombre:'Apto',costo:250000000,avaluo:310000000,pct:50},{id:'b2',tipo:'vehiculo',nombre:'Carro',costo:60000000,avaluo:52000000,duenio:b,pct:100},{id:'b3',tipo:'cuenta',nombre:'Ahorros',valor31:8000000,aid:S.activos[0]&&S.activos[0].id}];
S.renta={};const R=rData(2025,a);R.ded={intViv:9000000,prep:4000000,gmf:600000,icetex:1000000,fe:30000000};R.ing={volun:5000000,afc:2000000,ret:''};R.consig=90000000;R.consumos=20000000;
const R2=rData(2025,b);R2.ing={lab:0,ret:1500000};`

for (const hoy of HOYS.slice(0, 3))
  for (const [nombre, js] of [["sample", ""], ["rico", RICO], ["con dependientes y bienes", RICO + EXTRA]] as const)
    describe(`renta = v4 · ${hoy} · ${nombre}`, () => {
      const sc = scenario(hoy).mutate(js)
      const mids: string[] = sc.S.perfil.miembros.map((m: any) => m.id)
      for (const y of [2024, 2025, 2026])
        for (const mid of mids.slice(0, 3))
          it(`${y} · ${mid}`, () => {
            const R = rentaOf(sc, y, mid)
            expect(titularId(R.members)).toBe(sc.plain("titularId()"))
            expectClose(rentaAuto(R, mid, hoy, { v4: true }), sc.plain(`rentaAuto(${y},'${mid}')`))
            const { A: _a, ...c5 } = calcRenta(R, y, mid, hoy, { deps: "v4", v4: true })
            const { A: _b, ...c4 } = sc.plain(`calcRenta(${y},'${mid}')`)
            expectClose({ ...c5, useA: !!c5.useA }, { ...c4, useA: !!c4.useA })
            const { B: _c, ...p5 } = patrimonio(R, mid, hoy, { v4: true })
            const { B: _d, ...p4 } = sc.plain(`patrimonio('${mid}')`)
            expectClose(p5, p4)
            expectClose(topes(R, y, mid, hoy, { v4: true }), sc.plain(`topes(${y},'${mid}')`))
          })
      it("depInfo", () => {
        const R = rentaOf(sc, 2025, mids[0])
        for (const m of sc.S.perfil.miembros) {
          const d5 = depInfo(R.members.find((x) => x.id === m.id)!, hoy, 23)
          expectClose({ ...d5, ok: d5.ok }, sc.plain(`depInfo(S.perfil.miembros.find(x=>x.id==='${m.id}'))`))
        }
      })
    })

describe("tarifa241 = v4", () => {
  const sc = scenario(HOYS[0])
  for (const u of [0, 500, 1090, 1500, 1700, 3000, 4100, 8000, 8670, 15000, 18970, 25000, 31000, 50000]) it(`${u} UVT`, () => expectClose(tarifa241(u), sc.plain(`tarifa241(${u})`)))
})

describe("dependientes según el Decreto 2231/2023", () => {
  const hoy = HOYS[0]
  const sc = scenario(hoy).mutate(RICO + EXTRA)
  const mid = sc.S.perfil.miembros[0].id
  it("el mismo dependiente da el 10 % y los 72 UVT", () => {
    const R = rentaOf(sc, 2025, mid)
    const a = calcRenta(R, 2025, mid, hoy, { v4: true }), b = calcRenta(R, 2025, mid, hoy, { deps: "v4", v4: true })
    expect(a.nD).toBeGreaterThan(0)
    expect(a.dep10).toBeCloseTo(Math.min(0.1 * (a.lab + a.hon), 384 * a.U))
    expect(a.dep72).toBeCloseTo(Math.min(a.nD, 4) * 72 * a.U)
    expect(a.dep10 + a.dep72).toBeGreaterThanOrEqual(b.dep10 + b.dep72)
    expect(a.imp).toBeLessThanOrEqual(b.imp)
  })
})

// ───────────────────────── Datos de la v5 (sin equivalente en la v4) ─────────────────────────
// Sin `v4`, la renta usa la deuda de las tarjetas, los descuentos guardados de cada ingreso, los ingresos extra, los
// gastos marcados como deducibles y los saldos al 31 de diciembre. La v4 no tenía esos datos: se comparan contra el
// resultado en modo v4 más el efecto esperado de cada dato nuevo.
describe("renta con los datos de la v5", () => {
  const hoy = HOYS[0]
  const sc = scenario(hoy).mutate(RICO)
  const mid: string = sc.S.perfil.miembros[0].id
  const base = () => rentaOf(sc, 2025, mid)

  it("corte: 31 de diciembre si ya pasó; si no, hoy", () => {
    expect(corteRenta(2024, "2026-03-10")).toBe("2024-12-31")
    expect(corteRenta(2026, "2026-03-10")).toBe("2026-03-10")
  })

  it("patrimonio: la deuda de las tarjetas resta (la v4 no la contaba)", () => {
    const R = base()
    R.book = { ...R.book, creditCards: [{ id: "tc1", nombre: "Visa", corte: 25, pago: 10, tasa: 2, cupo: 10_000_000, purchases: [{ id: "c1", fecha: "2025-11-02", valor: 1_200_000, cuotas: 6 }] }] }
    const v4 = patrimonio(R, mid, hoy, { v4: true }), v5 = patrimonio(R, mid, hoy, { y: 2025 })
    const esperado = compraEstado(R.book.creditCards[0], R.book.creditCards[0].purchases[0], "2025-12-31").saldo
    expect(esperado).toBeGreaterThan(0)
    expect(v5.tarjetas).toBeCloseTo(esperado, 6)
    expect(deudaTarjetasAl(R.book.creditCards, "2025-12-31")).toBeCloseTo(esperado, 6)
    // Una compra hecha después del 31 de diciembre no cuenta para ese año.
    expect(deudaTarjetasAl([{ ...R.book.creditCards[0], purchases: [{ fecha: "2026-01-05", valor: 500_000, cuotas: 1 }] }], "2025-12-31")).toBe(0)
    expect(v5.deudas).toBeCloseTo(v5.pasivos + v5.prestamos + v5.tarjetas, 6)
    expect(v4.deudas).toBeCloseTo(v5.pasivos + patrimonio(R, mid, hoy).prestamos, 6)
  })

  it("saldo de un préstamo al 31 de diciembre: ignora los pagos posteriores", () => {
    const L = { id: "L", kind: "pagar", monto: 6_000_000, sistema: "frances", tasa: 2, frec: "mensual", plazo: 12, inicio: "2025-06-15",
      payments: [{ fecha: "2025-07-15", tipo: "cuota", valor: 0 }, { fecha: "2025-08-15", tipo: "cuota", valor: 0 }, { fecha: "2026-01-15", tipo: "cuota", valor: 0 }] }
    const hasta31 = loanEngine({ ...L, payments: L.payments.slice(0, 2) }, "2025-12-31").saldo
    expect(saldoPrestamoAl(L, "2025-12-31")).toBeCloseTo(hasta31, 6)
    expect(saldoPrestamoAl(L, "2025-12-31")).toBeGreaterThan(loanEngine(L, hoy).saldo)
    // Un préstamo que empezó después del corte no existía ese año.
    expect(saldoPrestamoAl({ ...L, inicio: "2026-02-01" }, "2025-12-31")).toBe(0)
  })

  it("retención guardada en el ingreso (valor fijo del mes) se respeta en lugar de la tabla", () => {
    const R = base()
    const sal = R.book.incomes.find((x) => /salari/i.test(`${x.cat} ${x.concepto}`))
    expect(sal).toBeTruthy()
    const bruto = 8_000_000
    R.book = { ...R.book, incomes: R.book.incomes.map((x) => (x === sal ? { ...x, frec: "mensual", bruto, deducciones: { tipo: "empleado", mes: true, retModo: "manual", retV: 250_000 } } : x)) }
    const A = rentaAuto(R, mid, hoy, { y: 2025 })
    expect(A.retG).toBe(250_000 * 12)
    // Salud 4 % + pensión 4 % del mes (redondeo PILA a $100) + FSP del 1 % (8 millones son más de 4 SMMLV).
    expect(A.apG).toBe((320_000 + 320_000 + 80_000) * 12)
    const sinRet = rentaAuto({ ...R, book: { ...R.book, incomes: R.book.incomes.map((x) => (x.id === sal!.id ? { ...x, deducciones: { tipo: "empleado", mes: true, ret: false } } : x)) } }, mid, hoy, { y: 2025 })
    expect(sinRet.retG).toBe(0)
    expect(A.ret - sinRet.ret).toBe(250_000 * 12)
  })

  it("ingresos extra del año suman a la persona que los recibió", () => {
    const R = base()
    const antes = rentaAuto(R, mid, hoy, { y: 2025 })
    R.book = { ...R.book, extraIncomes: [
      { fecha: "2025-05-10", descripcion: "Honorarios asesoría", valor: 3_000_000, cat: "" },
      { fecha: "2025-08-01", descripcion: "Venta de bicicleta", valor: 700_000, cat: "Otros ingresos" },
      { fecha: "2024-12-20", descripcion: "Bono de otro año", valor: 9_000_000, cat: "" },
    ] }
    const A = rentaAuto(R, mid, hoy, { y: 2025 })
    expect(A.ext).toBe(3_700_000)
    expect(A.hon - antes.hon).toBe(3_000_000)
    expect(A.otr - antes.otr).toBe(700_000)
  })

  it("gasto marcado como deducible de salud se propone como medicina prepagada (con su tope)", () => {
    const R = base()
    R.book = { ...R.book, expenses: [...R.book.expenses,
      { id: "d1", fecha: "2025-03-01", descripcion: "Colsanitas", valor: 450_000, deducible: "salud" },
      { id: "d2", fecha: "2025-04-01", descripcion: "Cuota hipoteca", valor: 2_000_000, deducible: "vivienda" },
      { id: "d3", fecha: "2024-04-01", descripcion: "Colsanitas 2024", valor: 450_000, deducible: "salud" },
    ] }
    R.tax = { ...(R.tax ?? { ing: {}, docs: {}, consig: 0, consumos: 0 }), ded: {} } as RentaInput["tax"]
    const D = deduciblesDe(R, 2025, mid)
    expect(D.salud).toEqual({ v: 450_000, n: 1 })
    expect(D.vivienda.n).toBe(1)
    const C = calcRenta(R, 2025, mid, hoy)
    expect(C.prep).toBe(450_000)
    // Vivienda solo se muestra como referencia: los intereses salen del certificado del banco.
    expect(C.intViv).toBe(0)
    // Lo que escribe la persona manda sobre lo marcado.
    const M = calcRenta({ ...R, tax: { ...R.tax!, ded: { prep: 300_000 } } }, 2025, mid, hoy)
    expect(M.prep).toBe(300_000)
    // Tope de 16 UVT al mes.
    R.book.expenses.push({ id: "d4", fecha: "2025-06-01", descripcion: "Prepagada anual", valor: 50_000_000, deducible: "salud" })
    expect(calcRenta(R, 2025, mid, hoy).prep).toBeCloseTo(192 * C.U, 6)
  })

  it("hijo de 24 años que estudia: cuenta desde la Ley 2411 de 2024 (la v4 usaba 23)", () => {
    const m = { id: "h", nombre: "Hijo", rol: "Hijo", dep_de: mid, nacimiento: "2002-01-01", estudia: true }
    expect(depInfo(m, "2026-06-01").ok).toBe(true)
    expect(depInfo(m, "2026-06-01", 23).ok).toBe(false)
    expect(depInfo({ ...m, nacimiento: "2000-01-01" }, "2026-06-01").ok).toBe(false)
  })
})
