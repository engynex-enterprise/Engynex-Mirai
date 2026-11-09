// Tu meta financiera principal (Perfil): qué quieres lograr, cuánto cuesta, para cuándo, con qué meta de ahorro se
// cumple y qué pasos ya diste. Es el norte del libro: Mirai la usa para mostrarte el avance y para ordenar lo que te
// recomienda (Inicio, Dashboard, Consejero y el chat). Puro: sin acceso a la base ni a la red.
//
// Se guarda en book_settings: el título en `meta` (como siempre) y el resto en `meta_cfg` (jsonb).

import type { BookData, DateInput } from "./types"
import { fondoEstado } from "./savings"
import { liquidez, totales } from "./totals"
import { toDay } from "./dates"

export type MetaTipo = "fondo" | "deudas" | "casa" | "carro" | "viaje" | "estudio" | "retiro" | "negocio" | "otro"

export type MetaCfg = {
  tipo: MetaTipo
  /** Monto que hay que reunir (o la deuda que hay que pagar). Opcional: sin él solo se muestran los pasos. */
  monto?: number | null
  /** Para cuándo la quieres (AAAA-MM-DD). */
  fecha?: string | null
  /** Meta de ahorro de Metas con la que se cumple (goals.id). */
  goal_id?: string | null
  /** Pasos ya marcados: { "<id del paso>": true }. */
  pasos?: Record<string, boolean>
  /** Cuándo la definiste (para medir el avance desde ahí). */
  creada?: string | null
  /** Deuda total el día que la definiste (meta "salir de deudas"). */
  base?: number | null
}

export type MetaPaso = { id: string; t: string; d: string; /** Mirai lo marca solo cuando se cumple. */ auto?: boolean }

export type MetaDef = {
  tipo: MetaTipo
  n: string
  /** Cómo la explica Mirai en una línea. */
  d: string
  icon: string
  /** Sugerencia de título cuando la persona la escoge. */
  titulo: string
  /** Se mide con una meta de ahorro de Metas. */
  ahorro: boolean
  pasos: MetaPaso[]
}

/** Catálogo de metas con sus pasos sugeridos (en palabras simples, sin jerga). */
export const METAS: MetaDef[] = [
  {
    tipo: "fondo", n: "Tener un colchón para emergencias", d: "Plata guardada para un imprevisto sin tener que endeudarte.", icon: "shield-check",
    titulo: "Armar mi fondo de emergencia", ahorro: false,
    pasos: [
      { id: "cuanto", t: "Mira cuánto necesitas", d: "Mirai lo calcula con tus gastos básicos de cada mes.", auto: true },
      { id: "separar", t: "Aparta esa plata en otra cuenta", d: "Que no se mezcle con el gasto del día a día.", auto: true },
      { id: "mitad", t: "Llega a la mitad", d: "La mitad de los meses que te propusiste.", auto: true },
      { id: "completo", t: "Completa tu colchón", d: "Ya aguantas sin ingresos los meses que te propusiste.", auto: true },
    ],
  },
  {
    tipo: "deudas", n: "Salir de deudas", d: "Pagar lo que debes y dejar de pagar intereses.", icon: "trending-down",
    titulo: "Salir de deudas", ahorro: false,
    pasos: [
      { id: "lista", t: "Anota todas tus deudas", d: "Créditos, tarjetas y lo que le debes a alguien.", auto: true },
      { id: "cara", t: "Averigua cuál deuda te sale más cara", d: "La que te cobra más intereses. Esa se paga de primeras.", auto: true },
      { id: "baja", t: "Baja la deuda una quinta parte", d: "Vas por buen camino.", auto: true },
      { id: "mitad2", t: "Baja la deuda a la mitad", d: "Ya pagaste la mitad del camino.", auto: true },
      { id: "cero", t: "Queda en cero", d: "Sin deudas: lo que ganas es tuyo.", auto: true },
    ],
  },
  {
    tipo: "casa", n: "Comprar vivienda", d: "Reunir la cuota inicial de tu casa o apartamento.", icon: "house",
    titulo: "Comprar casa", ahorro: true,
    pasos: [
      { id: "cuota", t: "Averigua cuánto te piden de cuota inicial", d: "Casi siempre del 20 % al 30 %. Si la casa vale $200 millones, son entre $40 y $60 millones.", auto: false },
      { id: "meta", t: "Crea el ahorro en Metas", d: "Para ver cuánto llevas y cuánto falta.", auto: true },
      { id: "credito", t: "Revisa cómo estás en Datacrédito", d: "Es tu hoja de vida de pagos. Si pagas a tiempo, el banco te presta más barato.", auto: false },
      { id: "mitad3", t: "Llega a la mitad de la cuota inicial", d: "", auto: true },
      { id: "listo", t: "Completa la cuota inicial", d: "", auto: true },
    ],
  },
  {
    tipo: "carro", n: "Comprar carro o moto", d: "Reunir la plata del vehículo o de su cuota inicial.", icon: "car",
    titulo: "Comprar carro", ahorro: true,
    pasos: [
      { id: "costos", t: "Cuenta lo que cuesta mantenerlo", d: "Gasolina, seguro, impuesto y mantenimiento.", auto: false },
      { id: "meta", t: "Crea el ahorro en Metas", d: "", auto: true },
      { id: "mitad3", t: "Llega a la mitad", d: "", auto: true },
      { id: "listo", t: "Completa lo que necesitas", d: "", auto: true },
    ],
  },
  {
    tipo: "viaje", n: "Viajar", d: "Pagar el viaje sin deberlo después.", icon: "plane",
    titulo: "Irme de viaje", ahorro: true,
    pasos: [
      { id: "presu", t: "Calcula cuánto cuesta el viaje", d: "Pasajes, estadía, comida y un extra por si acaso.", auto: false },
      { id: "meta", t: "Crea el ahorro en Metas", d: "", auto: true },
      { id: "mitad3", t: "Llega a la mitad", d: "", auto: true },
      { id: "listo", t: "Ten todo el viaje pago", d: "", auto: true },
    ],
  },
  {
    tipo: "estudio", n: "Estudiar", d: "Pagar tu carrera, un posgrado o un curso.", icon: "graduation-cap",
    titulo: "Pagar mis estudios", ahorro: true,
    pasos: [
      { id: "costo", t: "Averigua cuánto cuesta el semestre o el curso", d: "", auto: false },
      { id: "meta", t: "Crea el ahorro en Metas", d: "", auto: true },
      { id: "mitad3", t: "Llega a la mitad", d: "", auto: true },
      { id: "listo", t: "Ten el valor completo", d: "", auto: true },
    ],
  },
  {
    tipo: "retiro", n: "Prepararme para el retiro", d: "Guardar aparte para vivir tranquilo cuando dejes de trabajar.", icon: "armchair",
    titulo: "Prepararme para el retiro", ahorro: true,
    pasos: [
      { id: "aportes", t: "Revisa tus semanas de pensión", d: "Entra a Colpensiones o a tu fondo (Porvenir, Protección…) y mira cuántas llevas.", auto: false },
      { id: "meta", t: "Crea tu ahorro para el retiro", d: "", auto: true },
      { id: "mitad3", t: "Llega a la mitad de lo que te propusiste", d: "", auto: true },
      { id: "listo", t: "Completa tu objetivo", d: "", auto: true },
    ],
  },
  {
    tipo: "negocio", n: "Montar mi negocio", d: "Reunir la plata para empezar.", icon: "store",
    titulo: "Montar mi negocio", ahorro: true,
    pasos: [
      { id: "cuanto2", t: "Calcula cuánto necesitas para arrancar", d: "", auto: false },
      { id: "meta", t: "Crea el ahorro en Metas", d: "", auto: true },
      { id: "mitad3", t: "Llega a la mitad", d: "", auto: true },
      { id: "listo", t: "Ten toda la plata para arrancar", d: "", auto: true },
    ],
  },
  {
    tipo: "otro", n: "Otra meta", d: "Tú le pones el nombre y el monto.", icon: "target",
    titulo: "", ahorro: true,
    pasos: [
      { id: "monto", t: "Ponle un monto y una fecha", d: "Una meta con número y fecha se cumple más fácil.", auto: true },
      { id: "meta", t: "Crea el ahorro en Metas", d: "", auto: true },
      { id: "mitad3", t: "Llega a la mitad", d: "", auto: true },
      { id: "listo", t: "Complétala", d: "", auto: true },
    ],
  },
]

export const metaDef = (t: MetaTipo | undefined | null): MetaDef => METAS.find((m) => m.tipo === t) ?? METAS[METAS.length - 1]

/** Estado de la meta: cuánto llevas, cuánto falta, a cuánto por mes y qué pasos están cumplidos. */
export type MetaEstado = {
  def: MetaDef
  titulo: string
  /** Lo que llevas (ahorrado o deuda ya pagada). */
  llevas: number
  /** La cifra completa (monto objetivo o deuda inicial). */
  objetivo: number
  falta: number
  /** 0 a 1. Sin objetivo se queda en 0. */
  progreso: number
  /** Meses que faltan hasta la fecha (al menos 1); null si no pusiste fecha. */
  meses: number | null
  /** Cuánto tendrías que separar cada mes para llegar a tiempo (null sin fecha u objetivo). */
  mensual: number | null
  /** Ya la cumpliste. */
  lograda: boolean
  pasos: (MetaPaso & { ok: boolean })[]
  /** Qué hacer ahora (el primer paso que falta). */
  siguiente: (MetaPaso & { ok: boolean }) | null
  /** Frase corta para Inicio, el Dashboard y el chat. */
  resumen: string
}

const money = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Math.round(n))

/** Meses entre hoy y la fecha de la meta (mínimo 1). */
function mesesHasta(fecha: string | null | undefined, today: DateInput): number | null {
  if (!fecha) return null
  const t = toDay(today)
  const [y, m] = fecha.split("-").map(Number)
  if (!y || !m) return null
  return Math.max(1, (y - t.getFullYear()) * 12 + m - (t.getMonth() + 1))
}

/**
 * Avance de la meta con los datos del libro. Cada tipo se mide con lo que ya calcula Mirai:
 * el fondo con `fondoEstado`, salir de deudas con el total que debes y las demás con su meta de ahorro (o el monto).
 */
export function metaEstado(cfg: MetaCfg | null | undefined, titulo: string, b: BookData, today: DateInput): MetaEstado | null {
  if (!cfg?.tipo && !titulo.trim()) return null
  const def = metaDef(cfg?.tipo)
  const t = titulo.trim() || def.titulo || def.n
  const marcados = cfg?.pasos ?? {}
  const T = totales(b, today)

  let llevas = 0, objetivo = Number(cfg?.monto ?? 0) || 0, autos: Record<string, boolean> = {}

  if (def.tipo === "fondo") {
    const FE = fondoEstado(b, today, liquidez(b.assets, b.investments, b.settings.trm, today))
    llevas = FE.tiene
    objetivo = objetivo || FE.meta
    autos = {
      cuanto: FE.basicos > 0,
      separar: FE.enFondo || FE.tiene > 0,
      mitad: objetivo > 0 && llevas >= objetivo / 2,
      completo: objetivo > 0 && llevas >= objetivo,
    }
  } else if (def.tipo === "deudas") {
    const deudaHoy = T.P
    // La base es lo que debías cuando definiste la meta; sin ella, lo que debes hoy (el avance arranca en 0).
    const base = Number(cfg?.base ?? 0) || deudaHoy
    objetivo = base
    llevas = Math.max(0, base - deudaHoy)
    autos = {
      lista: deudaHoy > 0 || base > 0,
      cara: b.loans.some((L) => L.kind !== "cobrar") || b.creditCards.length > 0,
      baja: base > 0 && llevas >= base * 0.2,
      mitad2: base > 0 && llevas >= base / 2,
      cero: base > 0 && deudaHoy <= 0.5,
    }
  } else {
    const g = cfg?.goal_id ? b.goals.find((x) => x.id === cfg.goal_id) : undefined
    llevas = g ? Number(g.ahorrado) || 0 : 0
    objetivo = objetivo || (g ? Number(g.objetivo) || 0 : 0)
    autos = {
      monto: objetivo > 0,
      meta: !!g,
      mitad3: objetivo > 0 && llevas >= objetivo / 2,
      listo: objetivo > 0 && llevas >= objetivo,
    }
  }

  const falta = Math.max(0, objetivo - llevas)
  const progreso = objetivo > 0 ? Math.max(0, Math.min(1, llevas / objetivo)) : 0
  const meses = mesesHasta(cfg?.fecha, today)
  const mensual = meses && falta > 0 ? falta / meses : null
  const lograda = objetivo > 0 && falta <= 0.5

  const pasos = def.pasos.map((p) => ({ ...p, ok: p.auto ? !!autos[p.id] : !!marcados[p.id] }))
  const siguiente = pasos.find((p) => !p.ok) ?? null

  const resumen = lograda
    ? `¡Lograste tu meta "${t}"!`
    : objetivo > 0
      ? def.tipo === "deudas"
        ? `Ya pagaste el ${Math.round(progreso * 100)} % de tus deudas. Te faltan ${money(falta)}.`
        : `Llevas el ${Math.round(progreso * 100)} % de "${t}": ${money(llevas)} de ${money(objetivo)}.${mensual ? ` Guarda ${money(mensual)} al mes y llegas a tiempo.` : ""}`
      : `Tu meta es "${t}". Ponle un monto y una fecha para ver tu avance.`

  return { def, titulo: t, llevas, objetivo, falta, progreso, meses, mensual, lograda, pasos, siguiente, resumen }
}

/** Lee meta_cfg tal como viene de la base (jsonb) sin confiar en su forma. */
export function parseMetaCfg(raw: unknown): MetaCfg | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const tipo = typeof o.tipo === "string" && METAS.some((m) => m.tipo === o.tipo) ? (o.tipo as MetaTipo) : null
  if (!tipo) return null
  const pasos = o.pasos && typeof o.pasos === "object" && !Array.isArray(o.pasos)
    ? Object.fromEntries(Object.entries(o.pasos as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => [k, true]))
    : {}
  return {
    tipo,
    monto: typeof o.monto === "number" && isFinite(o.monto) ? o.monto : null,
    fecha: typeof o.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.fecha) ? o.fecha : null,
    goal_id: typeof o.goal_id === "string" && o.goal_id ? o.goal_id : null,
    base: typeof o.base === "number" && isFinite(o.base) ? o.base : null,
    creada: typeof o.creada === "string" ? o.creada : null,
    pasos,
  }
}
