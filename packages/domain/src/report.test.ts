import { describe, it } from "vitest"
import { expectClose, scenario } from "./__tests__/adapt"
import { HOYS, RICO } from "./__tests__/fixtures"
import { monthSummaryData, reportData } from "./report"

for (const hoy of HOYS.slice(0, 3))
  describe(`reportData = v4 · ${hoy}`, () => {
    const sc = scenario(hoy).mutate(RICO)
    const name = (id: string) => sc.book.categories.find((c) => c.id === id)?.nombre ?? undefined
    for (const k of [hoy.slice(0, 7), sc.plain("mkey(addMonths(today(),-1))") as string, sc.plain("mkey(addMonths(today(),-2))") as string])
      it(k, () => {
        const v5 = reportData(sc.book, k, hoy)
        const v4 = sc.plain(`reportData('${k}')`)
        expectClose({ ...v5, cats: v5.cats.map(([id, v]) => [name(id) ?? "", v]) }, { ...v4, cats: v4.cats.map(([c, v]: [string, number]) => [sc.book.categories.some((x) => x.nombre === c) ? c : "", v]) })
      })
    it("datos del resumen del mes", () => {
      const k = hoy.slice(0, 7)
      const d = monthSummaryData(sc.book, k, hoy)
      const v4 = sc.plain(`(()=>{const k='${k}';const [yy,mm]=k.split('-').map(Number);const prevK=mkey(new Date(yy,mm-2,1));const by=kk=>{const o={};gastosMesK(kk).forEach(g=>o[g.cat]=(o[g.cat]||0)+ +g.valor);return o};const a=by(k),b=by(prevK);return {total:Math.round(Object.values(a).reduce((x,y)=>x+y,0)),total_anterior:Math.round(Object.values(b).reduce((x,y)=>x+y,0)),hormiga:Math.round(gastosMesK(k).filter(isHormiga).reduce((x,g)=>x+ +g.valor,0)),topes_excedidos:S.cfg.categorias.filter(c=>c.tope&&(a[c.nombre]||0)>c.tope).map(c=>c.nombre),deudas_saldo:Math.round(totales().xp+tarjetasDeuda())}})()`)
      expectClose({ total: d.total, total_anterior: d.total_anterior, hormiga: d.hormiga, topes_excedidos: d.topes_excedidos, deudas_saldo: d.deudas_saldo }, v4)
    })
  })
