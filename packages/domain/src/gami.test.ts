/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest"
import { catId, expectClose, scenario } from "./__tests__/adapt"
import { HOYS, RICO } from "./__tests__/fixtures"
import { GBADGES, gamiXP, misionesSemana, nivel, racha, rachaMax, type GamiInput } from "./gami"

const GAMI = `
S.perfil.nombre='Ana';S.gami={visitas:[],unl:{perfil:'2026-10-01',gasto1:'2026-10-01'},mis:{'2026-10-19':['reg5','dias3'],'2026-10-26':['aldia']},init:'2026-10-01'};
for(let i=0;i<9;i++)S.gami.visitas.push(iso(addDays(today(),-i)));for(let i=20;i<55;i++)S.gami.visitas.push(iso(addDays(today(),-i)));
S.retos=[{id:'r1',k:'rest',tipo:'sin_cat',cat:'Viajes',dias:30,inicio:iso(addDays(today(),-40)),marcas:[]},{id:'r2',k:'hormiga',tipo:'sin_hormiga',dias:7,inicio:iso(addDays(today(),-3)),marcas:[]}];
S.consejos=[{id:'c'}];S.fondo={on:true,saldo:500000,movs:[]};
for(let i=0;i<12;i++)S.gastos.push({id:'gx'+i,fecha:iso(addDays(today(),-(i%4))),desc:'Tinto',valor:3000,cat:'Café',quien:'familia'});`

function gamiOf(sc: any): GamiInput {
  const S = sc.S
  return {
    book: sc.book, perfilNombre: S.perfil.nombre ?? "", fondo: S.fondo ? { on: !!S.fondo.on, saldo: +S.fondo.saldo || 0 } : null,
    retos: (S.retos || []).map((r: any) => ({ tipo: r.tipo, category_id: r.cat ? catId(S, r.cat) : null, dias: r.dias, base: r.base ?? 0, inicio: r.inicio, marcas: r.marcas ?? [] })),
    consejos: (S.consejos || []).length, chats: Array.isArray(S.chats) ? S.chats.length : 0,
    visitas: S.gami?.visitas ?? [], unl: S.gami?.unl ?? {}, mis: S.gami?.mis ?? {},
  }
}

for (const hoy of HOYS)
  for (const [n, js] of [["sample", ""], ["rico + logros", RICO + GAMI]] as const)
    describe(`gamificación = v4 · ${hoy} · ${n}`, () => {
      const sc = scenario(hoy).mutate(js)
      const G = gamiOf(sc)
      it("puntos y nivel", () => {
        const x = gamiXP(G, hoy)
        expectClose(x, sc.plain("gamiXP()"))
        expectClose(nivel(x.total), sc.plain(`nivel(${x.total})`))
      })
      it("rachas", () => {
        expect(racha(G.visitas, hoy)).toBe(sc.plain("racha()"))
        expect(rachaMax(G.visitas)).toBe(sc.plain("rachaMax()"))
      })
      it("misiones de la semana", () => {
        const m5 = misionesSemana(G, hoy).map((m) => ({ k: m.k, p: m.p, ok: m.ok, wk: m.wk, fin: m.fin }))
        const m4 = sc.plain("misionesSemana().map(m=>({k:m.k,p:m.p,ok:m.ok,wk:m.wk,fin:iso(m.fin)}))")
        expectClose(m5, m4)
      })
      it("insignias", () => {
        const b5 = Object.fromEntries(GBADGES.map((b) => [b.id, b.ok(G, hoy)]))
        const b4 = sc.plain("Object.fromEntries(GBADGES.map(b=>{let ok=false;try{ok=!!b[5]()}catch(e){}return [b[0],ok]}))")
        expect(b5).toEqual(b4)
      })
    })
