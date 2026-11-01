/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest"
import { expectClose, scenario, type Scenario } from "./__tests__/adapt"
import { HOYS, RICO } from "./__tests__/fixtures"
import { calcRenta, depInfo, patrimonio, rentaAuto, tarifa241, titularId, topes, type RentaInput } from "./renta"

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
            expectClose(rentaAuto(R, mid, hoy), sc.plain(`rentaAuto(${y},'${mid}')`))
            const { A: _a, ...c5 } = calcRenta(R, y, mid, hoy, { deps: "v4" })
            const { A: _b, ...c4 } = sc.plain(`calcRenta(${y},'${mid}')`)
            expectClose({ ...c5, useA: !!c5.useA }, { ...c4, useA: !!c4.useA })
            const { B: _c, ...p5 } = patrimonio(R, mid, hoy)
            const { B: _d, ...p4 } = sc.plain(`patrimonio('${mid}')`)
            expectClose(p5, p4)
            expectClose(topes(R, y, mid, hoy), sc.plain(`topes(${y},'${mid}')`))
          })
      it("depInfo", () => {
        const R = rentaOf(sc, 2025, mids[0])
        for (const m of sc.S.perfil.miembros) {
          const d5 = depInfo(R.members.find((x) => x.id === m.id)!, hoy)
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
    const a = calcRenta(R, 2025, mid, hoy), b = calcRenta(R, 2025, mid, hoy, { deps: "v4" })
    expect(a.nD).toBeGreaterThan(0)
    expect(a.dep10).toBeCloseTo(Math.min(0.1 * (a.lab + a.hon), 384 * a.U))
    expect(a.dep72).toBeCloseTo(Math.min(a.nD, 4) * 72 * a.U)
    expect(a.dep10 + a.dep72).toBeGreaterThanOrEqual(b.dep10 + b.dep72)
    expect(a.imp).toBeLessThanOrEqual(b.imp)
  })
})
