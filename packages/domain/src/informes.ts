// Informes a la medida: gastos por categoría, persona, proveedor, producto o medio de pago; ingresos por fuente o por
// persona; activos, pasivos, deudas y préstamos; y la evolución mes a mes. Todas las cifras salen de `flujoIntegral`
// (nada contado dos veces: el mismo «Sale» de Todos los gastos y del Balance) y de `estadoIntegral` (lo que tienes y lo
// que debes, el mismo del Balance). Los nombres (personas, proveedores, medios) llegan de afuera: el dominio no los
// carga. Puro: sin React ni reloj.
import { MODULOS, GRUPOS, type EstadoIntegral, type FlujoIntegral, type Mov } from "./flujo-integral"
import { movsBandeja } from "./bandeja"
import { loanEngine } from "./loans"
import type { BookData, DateInput } from "./types"

export type TipoInforme =
  | "gastos-categoria" | "gastos-persona" | "gastos-proveedor" | "gastos-producto" | "gastos-medio" | "gastos-tipo"
  | "ingresos-fuente" | "ingresos-persona"
  | "activos" | "pasivos" | "deudas" | "me-deben"
  | "mes-a-mes"

export type GrupoInforme = "Gastos" | "Ingresos" | "Lo que tienes y lo que debes" | "En el tiempo"

export interface DefInforme {
  id: TipoInforme
  grupo: GrupoInforme
  label: string
  icon: string
  desc: string
  /** Usa un periodo (mes, trimestre, año…); los de patrimonio son "a hoy". */
  periodo: boolean
}

export const INFORMES: DefInforme[] = [
  { id: "gastos-categoria", grupo: "Gastos", label: "Por categoría", icon: "tag", desc: "En qué se va la plata: mercado, vivienda, transporte…", periodo: true },
  { id: "gastos-persona", grupo: "Gastos", label: "Por persona", icon: "users", desc: "Cuánto gastó cada persona de la familia", periodo: true },
  { id: "gastos-proveedor", grupo: "Gastos", label: "Por proveedor o a quién", icon: "store", desc: "A qué negocio, persona o banco le pagas más", periodo: true },
  { id: "gastos-producto", grupo: "Gastos", label: "Por producto o concepto", icon: "shopping-bag", desc: "Cada cosa que pagas: el arriendo, la gasolina, el tinto…", periodo: true },
  { id: "gastos-medio", grupo: "Gastos", label: "Por medio de pago", icon: "wallet", desc: "Con qué pagas: efectivo, débito, Nequi, transferencia…", periodo: true },
  { id: "gastos-tipo", grupo: "Gastos", label: "Por tipo de gasto", icon: "layers", desc: "Día a día, fijos, suscripciones, tarjetas, deudas…", periodo: true },
  { id: "ingresos-fuente", grupo: "Ingresos", label: "Por fuente", icon: "briefcase", desc: "De dónde te entra la plata: sueldo, extras, cobros…", periodo: true },
  { id: "ingresos-persona", grupo: "Ingresos", label: "Por persona", icon: "users", desc: "Cuánto aporta cada persona de la familia", periodo: true },
  { id: "activos", grupo: "Lo que tienes y lo que debes", label: "Activos", icon: "wallet", desc: "Lo que tienes hoy: cuentas, bienes, ahorro, inversiones y lo que te deben", periodo: false },
  { id: "pasivos", grupo: "Lo que tienes y lo que debes", label: "Pasivos", icon: "hand-coins", desc: "Lo que debes hoy: créditos, tarjetas, impuestos y otras deudas", periodo: false },
  { id: "deudas", grupo: "Lo que tienes y lo que debes", label: "Deudas (Le debo)", icon: "landmark", desc: "Cada deuda con lo que debes y su próxima cuota", periodo: false },
  { id: "me-deben", grupo: "Lo que tienes y lo que debes", label: "Préstamos que hiciste (Me deben)", icon: "hand-coins", desc: "Quién te debe, cuánto y su próximo pago", periodo: false },
  { id: "mes-a-mes", grupo: "En el tiempo", label: "Mes a mes", icon: "chart-column", desc: "Lo que entra, sale y te queda cada mes del año", periodo: false },
]

export interface FilaInforme {
  k: string
  label: string
  /** Valor principal de la fila (lo que suma el total). */
  v: number
  /** Movimientos que la forman. */
  n: number
  /** Parte del total (0 a 1). */
  pct: number
  /** Grupo de la fila (activos: "Dinero en cuentas y efectivo"…). */
  grupo?: string
  /** Detalle corto ("próxima cuota $250.000 el 5 dic"). */
  sub?: string
  /** Mes a mes: lo que entra, sale y queda. */
  entra?: number
  sale?: number
  queda?: number
}

export interface Informe {
  filas: FilaInforme[]
  total: number
  /** Qué cuenta el informe (para leer bien la cifra). */
  nota: string
}

/** Nombres que el dominio no carga: personas de la familia, proveedores, contactos, entidades y medios de pago. */
export interface NombresInforme {
  member?: (id: string) => string | undefined
  provider?: (id: string) => string | undefined
  contact?: (id: string) => string | undefined
  entity?: (id: string) => string | undefined
  medio?: (id: string) => string | undefined
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()

/** El producto o concepto de un movimiento, sin el número de cuota ni lo de "falta de" de un abono. */
export function conceptoDe(m: Pick<Mov, "n">): { k: string; label: string } {
  const label = m.n.replace(/^Cuota \d+ · /, "").replace(/^Abono a /, "").replace(/^Mesada de /, "Mesada · ").trim()
  return { k: norm(label), label }
}

/** Agrupa movimientos por una clave; las filas van de mayor a menor y suman el total. */
export function agrupar(movs: Mov[], por: (m: Mov) => { k: string; label: string }): FilaInforme[] {
  const m = new Map<string, FilaInforme>()
  for (const x of movs) {
    const { k, label } = por(x)
    const f = m.get(k) ?? { k, label, v: 0, n: 0, pct: 0 }
    f.v += x.v
    f.n++
    m.set(k, f)
  }
  const tot = movs.reduce((a, x) => a + x.v, 0)
  // De mayor a menor; en un empate, por nombre (el informe sale siempre en el mismo orden).
  return [...m.values()].map((f) => ({ ...f, pct: tot ? f.v / tot : 0 })).sort((p, q) => q.v - p.v || p.label.localeCompare(q.label, "es"))
}

const conTotal = (filas: FilaInforme[], nota: string): Informe => ({ filas, total: filas.reduce((a, f) => a + f.v, 0), nota })

const NOTA_GASTOS = "Todo lo que sale en el periodo, pagado y por pagar, sin contar nada dos veces (las compras con tarjeta salen cuando pagas la tarjeta). Es el mismo «Sale» de Todos los gastos y del Balance."

/** Informe de gastos o ingresos de un periodo (`F` = flujoIntegral del periodo). */
export function informeFlujo(tipo: TipoInforme, F: Pick<FlujoIntegral, "movs">, N: NombresInforme = {}): Informe {
  const gastos = movsBandeja(F)
  const ingresos = F.movs.filter((m) => m.dir === "entra" && (m.clase === "ingreso" || m.clase === "cobro"))
  const nombre = (fn: ((id: string) => string | undefined) | undefined, id: string | null | undefined) => (id && fn?.(id)) || undefined
  switch (tipo) {
    case "gastos-categoria": return conTotal(agrupar(gastos, (m) => ({ k: m.cat, label: m.cat })), NOTA_GASTOS)
    case "gastos-tipo": return conTotal(agrupar(gastos, (m) => ({ k: m.modulo, label: MODULOS[m.modulo].label })), NOTA_GASTOS)
    case "gastos-producto": return conTotal(agrupar(gastos, conceptoDe), NOTA_GASTOS)
    case "gastos-persona":
      return conTotal(agrupar(gastos, (m) => (m.memberId ? { k: m.memberId, label: nombre(N.member, m.memberId) ?? "Persona eliminada" } : { k: "~familia", label: "Toda la familia" })), NOTA_GASTOS)
    case "gastos-medio":
      return conTotal(agrupar(gastos, (m) => (m.medioId ? { k: m.medioId, label: nombre(N.medio, m.medioId) ?? "Medio eliminado" } : { k: "~sin", label: "Sin medio de pago" })), NOTA_GASTOS)
    case "gastos-proveedor":
      return conTotal(agrupar(gastos, (m) => {
        const quien = nombre(N.provider, m.providerId) ?? nombre(N.contact, m.contactId) ?? nombre(N.entity, m.entityId) ?? m.paraTxt ?? undefined
        return quien ? { k: norm(quien), label: quien } : { k: "~sin", label: "Sin decir a quién" }
      }), NOTA_GASTOS)
    case "ingresos-fuente":
      return conTotal(agrupar(ingresos, (m) => ({ k: norm(m.n), label: m.n })), "Lo que te entra en el periodo (ingresos y lo que te pagan de préstamos que hiciste). La plata que te prestan no cuenta: no es tuya.")
    case "ingresos-persona":
      return conTotal(agrupar(ingresos, (m) => (m.memberId ? { k: m.memberId, label: nombre(N.member, m.memberId) ?? "Persona eliminada" } : { k: "~familia", label: "Sin decir quién" })), "Lo que te entra en el periodo, por la persona que lo recibe.")
    default: return { filas: [], total: 0, nota: "" }
  }
}

const fmtFecha = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1]} ${y}` }
const fmtCOP = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n)

/** Informe de lo que tienes y lo que debes, a hoy (`E` = estadoIntegral, el mismo del Balance). */
export function informeEstado(tipo: TipoInforme, E: Pick<EstadoIntegral, "tengo" | "debo">, b: Pick<BookData, "loans">, today: DateInput): Informe {
  const desde = (lineas: EstadoIntegral["tengo"], nota: string, extra?: (k: string) => string | undefined): Informe => {
    const tot = lineas.reduce((a, l) => a + l.v, 0)
    const filas = lineas.filter((l) => l.v > 0.5).map((l) => ({ k: l.k, label: l.n, v: l.v, n: 1, pct: tot ? l.v / tot : 0, grupo: GRUPOS[l.grupo]?.label, sub: extra?.(l.k) ?? (l.s || undefined) }))
    return conTotal(filas.sort((p, q) => q.v - p.v), nota)
  }
  const proxima = (k: string) => {
    const L = b.loans.find((x) => `loan:${x.id}` === k)
    const nx = L ? loanEngine(L, today).next : null
    return nx ? `Próxima cuota ${fmtCOP(nx.valor)} el ${fmtFecha(nx.fecha)}` : undefined
  }
  switch (tipo) {
    case "activos": return desde(E.tengo, "Lo que tienes hoy: el mismo «Lo que tengo» del Balance.")
    case "pasivos": return desde(E.debo, "Lo que debes hoy: el mismo «Lo que debo» del Balance (los impuestos que vienen son estimados).")
    case "deudas": return desde(E.debo.filter((l) => l.grupo === "creditos"), "Lo que debes de cada crédito o préstamo hoy (capital que falta).", proxima)
    case "me-deben": return desde(E.tengo.filter((l) => l.grupo === "me-deben"), "Lo que te debe cada persona hoy (capital que falta).", proxima)
    default: return { filas: [], total: 0, nota: "" }
  }
}

/** Mes a mes: `meses` trae el flujo de cada mes ('YYYY-MM' y su flujoIntegral). El valor de la fila es lo que sale. */
export function informeMeses(meses: { k: string; label: string; F: Pick<FlujoIntegral, "tot"> }[]): Informe {
  const tot = meses.reduce((a, m) => a + m.F.tot.sale, 0)
  const filas = meses.map(({ k, label, F }) => ({ k, label, v: F.tot.sale, n: 1, pct: tot ? F.tot.sale / tot : 0, entra: F.tot.entra, sale: F.tot.sale, queda: F.tot.queda }))
  return { filas, total: tot, nota: "Cada mes con lo que entra, lo que sale (gastos y deudas) y lo que te queda después de ahorrar: las mismas cifras del Balance." }
}
