// Adaptador de PRUEBAS: convierte el estado `S` de la v4 (forma localStorage) al modelo de la v5
// (filas de Supabase en snake_case) para alimentar las funciones de lib/domain.
import { expect } from "vitest"
import type { BookData, CategoryIn, ExpenseIn, FixedExpenseIn, KeywordRuleIn, LoanIn, SettingsIn } from "../types"
import { loadLegacy, type Legacy } from "./legacy"

/* eslint-disable @typescript-eslint/no-explicit-any */

const lc = (s: unknown) => String(s ?? "").toLowerCase()

export const catId = (S: any, name: unknown): string | null => S.cfg.categorias.find((c: any) => lc(c.nombre) === lc(name))?.id ?? null

export function settingsOf(S: any): SettingsIn {
  const c = S.cfg
  return {
    umbral: c.umbral, limite: c.limite, trm: c.trm, pct: c.pct, emerg_meta: c.emergMeta, anticipo: c.anticipo,
    corte_q: c.corteQ, alerta_pres: c.alertaPres, notif: c.notif, uvt: c.uvt, smmlv: c.smmlv,
  }
}

export const categoriesOf = (S: any): CategoryIn[] => S.cfg.categorias.map((c: any) => ({ id: c.id, nombre: c.nombre, grupo: c.grupo, icon: c.icon, tope: +c.tope }))

export const expenseOf = (S: any, g: any): ExpenseIn => ({
  id: g.id, fecha: g.fecha, descripcion: g.desc ?? "", valor: +g.valor, category_id: catId(S, g.cat),
  member_id: g.quien && g.quien !== "familia" ? g.quien : null, fixed_expense_id: g.fijoId ?? null, periodo: g.per ?? null,
  hormiga: typeof g.hormiga === "boolean" ? g.hormiga : false,
  hormiga_src: typeof g.hormiga === "boolean" ? g.hormigaSrc || "manual" : null,
})

export const fixedOf = (S: any, f: any): FixedExpenseIn => ({
  id: f.id, nombre: f.nombre, valor: +f.valor, frec: f.frec, dia: f.dia, dia2: f.dia2 ?? null, mes: f.mes ?? null,
  fecha_unica: f.fecha ?? null, inicio: f.inicio ?? null, desde: f.desde ?? null, variable: !!f.variable,
  category_id: catId(S, f.cat), link_type: f.link?.t ?? null, link_id: f.link?.id ?? null,
  payments: (f.pagos || []).map((p: any) => ({ periodo: p.per, fecha: p.fecha, valor: +p.valor })),
})

export const loanOf = (L: any, kind: "cobrar" | "pagar"): LoanIn => ({
  id: L.id, kind, concepto: L.concepto ?? "", monto: +L.monto, sistema: L.sistema, tasa: +L.tasa, frec: L.frec, plazo: +L.plazo,
  inicio: L.inicio, extra: +L.extra || 0, prenda: L.prenda ?? null,
  contact_id: kind === "cobrar" ? L.contactoId ?? null : L.acreedor?.kind === "contacto" ? L.acreedor.id : null,
  entity_id: kind === "pagar" && L.acreedor?.kind !== "contacto" ? L.acreedor?.id ?? null : null,
  payments: (L.pagos || []).map((p: any) => ({ id: p.id, fecha: p.fecha, tipo: p.tipo, valor: +p.valor || 0, modo: p.modo ?? null })),
})

export const rulesOf = (S: any): KeywordRuleIn[] => S.cfg.reglas.map((r: any) => ({ keyword: r.k, category_id: catId(S, r.cat) }))

export function bookOf(S: any): BookData {
  return {
    settings: settingsOf(S),
    categories: categoriesOf(S),
    incomes: S.ingresos.map((x: any) => ({
      id: x.id, concepto: x.concepto, valor: +x.valor, frec: x.frec, dia: x.dia, currency: x.moneda || "COP",
      member_id: x.quien && x.quien !== "familia" ? x.quien : null,
      category_id: S.cfg.catIngreso.find((c: any) => lc(c.nombre) === lc(x.cat))?.id ?? null,
    })),
    extraIncomes: S.extras.map((x: any) => ({ id: x.id, fecha: x.fecha, descripcion: x.desc ?? "", valor: +x.valor })),
    expenses: S.gastos.map((g: any) => expenseOf(S, g)),
    fixedExpenses: S.fijos.map((f: any) => fixedOf(S, f)),
    subscriptions: S.suscripciones.map((s: any) => ({ id: s.id, nombre: s.nombre, valor: +s.valor, ciclo: s.ciclo, proximo: s.proximo, currency: s.moneda || "COP", comparte: s.comparte ? +s.comparte : 1 })),
    loans: [...S.cobrar.map((L: any) => loanOf(L, "cobrar")), ...S.pagar.map((L: any) => loanOf(L, "pagar"))],
    creditCards: S.tarjetas.map((t: any) => ({
      id: t.id, nombre: t.nombre, corte: +t.corte, pago: +t.pago, tasa: +t.tasa, cupo: +t.cupo || 0,
      purchases: (t.compras || []).map((c: any) => ({ id: c.id, fecha: c.fecha, valor: +c.valor, cuotas: +c.cuotas, pagada: !!c.pagada })),
    })),
    assets: S.activos.map((a: any) => ({ id: a.id, cod: a.cod, valor: +a.valor, currency: a.moneda || "COP" })),
    liabilities: S.pasivos.map((a: any) => ({ id: a.id, valor: +a.valor, currency: a.moneda || "COP" })),
    investments: S.inversiones.map((x: any) => ({ id: x.id, tipo: x.tipo, nombre: x.nombre, capital: +x.capital, tasa: +x.tasa, inicio: x.inicio, dias: x.dias ?? null, ret: x.ret ?? 0, currency: x.moneda || "COP", actual: x.actual ?? null })),
    goals: S.metas.map((m: any) => ({ id: m.id, nombre: m.nombre, objetivo: +m.objetivo, ahorrado: +m.ahorrado, fecha: m.fecha ?? null })),
    calendarEvents: S.calendario.map((c: any) => ({ id: c.id, titulo: c.titulo, fecha: c.fecha, tipo: c.tipo, monto: +c.monto || 0 })),
    contacts: S.contactos.map((c: any) => ({ id: c.id, nombre: c.nombre })),
    entities: S.cfg.entidades.map((e: any) => ({ id: e.id, nombre: e.nombre })),
  }
}

export interface Scenario {
  L: Legacy
  /** Estado v4 en JSON plano. */
  S: any
  /** El mismo estado en forma v5. */
  book: BookData
  /** Aplica una mutación JS sobre `S` dentro del sandbox v4 y recalcula `S` y `book`. */
  mutate(js: string): Scenario
  /** Evalúa en la v4 con el `S` de ESTE escenario (el sandbox se comparte entre escenarios del mismo día). */
  ev<T = any>(src: string): T
  /** Igual que `ev` pero devuelve JSON plano (fechas → 'YYYY-MM-DD'). */
  plain<T = any>(src: string): T
}

let seq = 0

/**
 * Escenario de prueba: sandbox v4 con "hoy" fijo y `S = sample()` (familia Navarro).
 * `uid()` usa Math.random: cada escenario tiene ids distintos, pero las funciones se comparan sobre el mismo S.
 */
export function scenario(today: string, setup = "S=sample()"): Scenario {
  const L = loadLegacy(today)
  const key = `__sc${++seq}`
  L.ev(`${setup};globalThis.${key}=S`)
  const activar = () => L.ev(`S=globalThis.${key}`)
  const sc: Scenario = {
    L,
    S: null,
    book: null as unknown as BookData,
    ev: (src) => (activar(), L.ev(src)),
    plain: (src) => (activar(), L.plain(L.ev(src))),
    mutate(js: string) {
      activar()
      L.ev(`(function(){${js}})()`)
      sc.S = L.plain(L.ev("S"))
      sc.book = bookOf(sc.S)
      return sc
    },
  }
  return sc.mutate("")
}

/** Compara en profundidad con tolerancia para números (los cálculos se hacen en el mismo orden, pero por si acaso). */
export function expectClose(actual: unknown, expected: unknown, path = "$"): void {
  if (typeof expected === "number" && typeof actual === "number") {
    if (Number.isNaN(expected)) return void expect(Number.isNaN(actual), path).toBe(true)
    const tol = Math.max(1e-6, Math.abs(expected) * 1e-12)
    if (Math.abs(actual - expected) > tol) expect(actual, path).toBe(expected)
    return
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path + " es arreglo").toBe(true)
    expect((actual as unknown[]).length, path + ".length").toBe(expected.length)
    expected.forEach((e, i) => expectClose((actual as unknown[])[i], e, `${path}[${i}]`))
    return
  }
  if (expected && typeof expected === "object") {
    expect(actual && typeof actual === "object", path + " es objeto").toBeTruthy()
    for (const k of Object.keys(expected)) expectClose((actual as Record<string, unknown>)[k], (expected as Record<string, unknown>)[k], `${path}.${k}`)
    return
  }
  expect(actual, path).toEqual(expected)
}

/** Préstamo v4 suelto (para casos borde del motor). */
export function v4Loan(o: Record<string, unknown>) {
  return { id: "L1", concepto: "", monto: 1000000, sistema: "frances", tasa: 2, frec: "mensual", plazo: 6, inicio: "2026-01-15", pagos: [], extra: 0, ...o }
}

export const asV5Loan = (L: Record<string, unknown>, kind: "cobrar" | "pagar" = "pagar") => loanOf(L, kind)

export function legacyCall(L: Legacy, fn: string, ...jsonArgs: unknown[]) {
  // Los argumentos se pasan como JSON para que vivan en el "realm" del sandbox.
  const args = jsonArgs.map((a) => (a === undefined ? "undefined" : `JSON.parse(${JSON.stringify(JSON.stringify(a))})`)).join(",")
  return L.plain(L.ev(`${fn}(${args})`))
}

export type { LoanIn }
