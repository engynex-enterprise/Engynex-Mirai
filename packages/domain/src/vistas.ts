// Vistas agregadas (Inicio, Balance y Dashboard): las mismas llamadas al cálculo integral que hacen las pantallas de la
// web (features/home/home-view.tsx, features/balance/balance-view.tsx y features/dashboard/dashboard-view.tsx), en
// funciones puras para que la API (módulo insights, F2-C) devuelva exactamente las mismas cifras. Solo números y
// filas: el formato (etiquetas, colores, PUC) se queda en la UI.
import type { BookData } from "./types"
import { addDays, addMonths, iso, lastDay, toDay } from "./dates"
import { hallazgosBalance, type HallazgoBalance } from "./balance"
import { capacidad, compromisos, decisiones, deudas, metasAvance, serieMeses } from "./dashboard"
import { estadoIntegral, flujoIntegral, partesEstado, periodo, snapshotMes, type ExtrasIntegral, type Periodo } from "./flujo-integral"
import type { SaldoCuenta } from "./cuentas"

// ── Dashboard ──────────────────────────────────────────────────────────────────────────────────────────────────

export const PERIODOS_DASHBOARD = ["mes", "mes-pasado", "3m", "12m", "anio"] as const
export type PeriodoDashboard = (typeof PERIODOS_DASHBOARD)[number]

/** Periodo del selector del Dashboard ("Este mes", "Mes pasado", "Últimos 3/12 meses", "Este año"). */
export function periodoDashboard(per: PeriodoDashboard, today: string): Periodo {
  const t = toDay(today)
  const fin = (d: Date) => iso(new Date(d.getFullYear(), d.getMonth(), lastDay(d.getFullYear(), d.getMonth())))
  const ini = (k: number) => addMonths(new Date(t.getFullYear(), t.getMonth(), 1), k)
  if (per === "mes-pasado") { const d = ini(-1); return { a: iso(d), b: fin(d), tipo: "mes" } }
  if (per === "3m") return { a: iso(ini(-2)), b: fin(t), tipo: "rango" }
  if (per === "12m") return { a: iso(ini(-11)), b: fin(t), tipo: "rango" }
  if (per === "anio") return { a: `${t.getFullYear()}-01-01`, b: `${t.getFullYear()}-12-31`, tipo: "anio" }
  return { a: iso(ini(0)), b: fin(t), tipo: "mes" }
}

/** Foto del patrimonio de un mes (tabla net_worth_snapshots). */
export type SnapshotIn = { mes: string; patrimonio: number | string }

/** Todo lo que calcula el Dashboard para un periodo (DashboardView de la web). */
export function vistaDashboard(book: BookData, today: string, X: ExtrasIntegral, per: PeriodoDashboard, snaps: SnapshotIn[] = []) {
  const P = periodoDashboard(per, today)
  const F = flujoIntegral(book, P, today, X)
  const E = estadoIntegral(book, today, X)
  const S = serieMeses(book, today, X)
  const comp = compromisos(book, today)
  const cap = capacidad(book, today, comp, E.liquidez)
  const deu = deudas(book, today)
  const t = toDay(today)
  const R = flujoIntegral(book, { a: iso(addDays(t, -90)), b: iso(addDays(t, 365)), tipo: "rango" }, today, X)
  const en30 = iso(addDays(t, 30))
  const vencidos = R.movs.filter((x) => x.estado === "vencido")
  const proximos = R.movs.filter((x) => x.fecha >= today && x.fecha <= en30 && x.estado !== "hecho" && x.modulo !== "presupuesto")
  const impuestos = R.movs.filter((x) => x.modulo === "impuestos" && x.fecha >= today)
  const sinValor = R.sinValor.filter((x) => x.fecha >= today)
  const dec = decisiones(book, today, { comp, cap, deu, vencidos, proximos: R.movs })
  const mes = today.slice(0, 7)
  const pat = [...snaps.filter((s) => s.mes !== mes).map((s) => ({ mes: s.mes, v: +s.patrimonio })), { mes, v: E.pat }].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12)
  const cats = F.porCategoria.slice(0, 8).map((c) => ({ cat: c.cat, v: Math.round(c.v) }))
  const otras = F.porCategoria.slice(8).reduce((a, c) => a + c.v, 0)
  if (otras > 0) cats.push({ cat: "Otras", v: Math.round(otras) })
  // Como la tarjeta de totales: sin préstamos que te dieron o hiciste (plata prestada, no ingreso ni gasto).
  const totales = { entra: F.tot.entra - F.tot.credEntra, sale: F.tot.sale - F.tot.credSale, queda: F.tot.queda - F.tot.credEntra + F.tot.credSale }
  return { periodo: P, flujo: F, estado: E, serie: S, totales, compromisos: comp, capacidad: cap, deudas: deu, vencidos, proximos, impuestos, sinValor, decisiones: dec, patrimonio: pat, categorias: cats, metas: metasAvance(book, today) }
}
export type VistaDashboard = ReturnType<typeof vistaDashboard>

// ── Balance ────────────────────────────────────────────────────────────────────────────────────────────────────

export const PESTANAS_BALANCE = ["general", "q1", "q2", "mes", "anio"] as const
export type PestanaBalance = (typeof PESTANAS_BALANCE)[number]

type ConCuenta = { cod?: string | number | null; cuenta?: SaldoCuenta }

/** Lo que calcula el Balance (BalanceView de la web) para una pestaña y un mes ('YYYY-MM'). */
export function vistaBalance(book: BookData, today: string, X: ExtrasIntegral, tab: PestanaBalance, ym: string = today.slice(0, 7)) {
  const E = estadoIntegral(book, today, X)
  const tengo = partesEstado(E.tengo)
  const debo = partesEstado(E.debo)
  const C = { T: { ...E.T, P: E.P, pat: E.pat }, liquidez: E.liquidez, tengo, debo }
  const [y, m] = ym.split("-").map(Number)
  const P = periodo(book, tab === "general" ? "mes" : tab, y, m - 1)
  const F = flujoIntegral(book, P, today, X)
  const [ty, tm] = today.split("-").map(Number)
  const mesHoy = P.tipo === "mes" && ym === today.slice(0, 7) ? F : flujoIntegral(book, periodo(book, "mes", ty, tm - 1), today, X)
  const H: HallazgoBalance[] = hallazgosBalance(book, today, mesHoy, C)
  const assets = book.assets as unknown as ConCuenta[]
  const vivas = assets.filter((a) => a.cuenta?.vivo).length
  const manuales = assets.filter((a) => /^11/.test(String(a.cod)) && !a.cuenta?.vivo).length
  return { estado: E, partes: { tengo, debo }, periodo: P, flujo: F, hallazgos: H, snapshot: snapshotMes(book, today, X), cuentas: { vivas, manuales } }
}
export type VistaBalance = ReturnType<typeof vistaBalance>

// ── Inicio ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** "Te queda esta quincena" y los totales de Inicio (HomeView de la web): el mismo cálculo del Balance. */
export function vistaInicio(book: BookData, today: string, X: ExtrasIntegral) {
  const [y, m, day] = today.split("-").map(Number)
  const which = day <= book.settings.corte_q ? "q1" : "q2"
  const E = estadoIntegral(book, today, X)
  const F = flujoIntegral(book, periodo(book, which, y, m - 1), today, X)
  const item = (x: (typeof F.movs)[number]) => ({ icon: x.icon, n: x.n, v: x.v, paid: x.estado === "hecho" && !x.supuesto })
  return {
    quincena: which,
    totales: { ...E.T, pat: E.pat },
    q: { E: F.tot.entra, Sa: F.tot.sale + F.tot.ahorro, disp: F.tot.queda, ent: F.ent.map(item), sal: F.sal.map(item) },
  }
}
export type VistaInicio = ReturnType<typeof vistaInicio>

