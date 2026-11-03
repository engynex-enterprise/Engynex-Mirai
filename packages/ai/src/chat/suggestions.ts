// Sugerencias del chat: banco de preguntas útiles para Colombia, elección al azar (4 de temas distintos) personalizada con
// lo que tiene el libro, y preguntas de seguimiento después de cada respuesta. Puro, con pruebas en suggestions.test.ts.
import { norm } from "@mirai/domain"
import type { ChatFlags } from "./types"

export type Tema = "datos" | "ahorro" | "deudas" | "tarjeta" | "impuestos" | "nomina" | "metas" | "presupuesto" | "inversion" | "compras"

export type Sugerencia = {
  id: string
  tema: Tema
  q: string
  /** Se responde al instante con los datos del libro (sin IA). */
  rapida?: boolean
  /** Decisión que analiza el consejero con reglas (funciona sin IA). */
  decision?: boolean
  /** Solo si el libro tiene esto registrado. */
  requiere?: keyof Pick<ChatFlags, "tarjetas" | "deudas" | "metas" | "suscripciones" | "ingresos" | "gastos">
  /** Solo en estos meses (1-12). */
  meses?: number[]
  /** Pide escribir en el libro (no para personas con rol de solo lectura). */
  escribe?: boolean
}

export const TEMAS: Record<Tema, { label: string; icon: string; color: string }> = {
  datos: { label: "Tus números", icon: "zap", color: "#2A7F14" },
  ahorro: { label: "Ahorro", icon: "piggy-bank", color: "#3F7A1E" },
  deudas: { label: "Deudas", icon: "landmark", color: "#B4500A" },
  tarjeta: { label: "Tarjeta de crédito", icon: "credit-card", color: "#1F2B4B" },
  impuestos: { label: "Impuestos y renta", icon: "file-check", color: "#6B3FA0" },
  nomina: { label: "Nómina y prima", icon: "briefcase", color: "#13778F" },
  metas: { label: "Metas", icon: "target", color: "#D0243F" },
  presupuesto: { label: "Presupuesto", icon: "chart-pie", color: "#E08A00" },
  inversion: { label: "Inversión básica", icon: "trending-up", color: "#0B6E4F" },
  compras: { label: "Antes de comprar", icon: "shopping-bag", color: "#2D5BD7" },
}

/** Banco de preguntas (≥ 30). Las "rapida" coinciden con las frases que responde quickAnswer (lib/ai/router.ts). */
export const BANCO: Sugerencia[] = [
  // Tus números (instantáneas)
  { id: "gaste-mes", tema: "presupuesto", q: "¿Cuánto gasté este mes?", rapida: true },
  { id: "gaste-pasado", tema: "presupuesto", q: "¿Cuánto gasté el mes pasado?", rapida: true },
  { id: "me-queda", tema: "presupuesto", q: "¿Cuánto me queda este mes?", rapida: true, requiere: "ingresos" },
  { id: "subs", tema: "presupuesto", q: "¿Cuánto pago en suscripciones?", rapida: true, requiere: "suscripciones" },
  { id: "fijos", tema: "presupuesto", q: "¿Cuánto son mis gastos fijos?", rapida: true },
  { id: "debo", tema: "deudas", q: "¿Cuánto debo en total?", rapida: true },
  { id: "metas-van", tema: "metas", q: "¿Cómo van mis metas?", rapida: true, requiere: "metas" },
  { id: "hormiga", tema: "ahorro", q: "¿Cuánto llevo en gastos hormiga este mes?", rapida: true },
  { id: "gano", tema: "nomina", q: "¿Cuánto gano al mes?", rapida: true, requiere: "ingresos" },
  { id: "tengo", tema: "ahorro", q: "¿Cuánta plata tengo?", rapida: true },
  // Ahorro
  { id: "ahorrar-mas", tema: "ahorro", q: "¿Cómo puedo ahorrar más cada mes?" },
  { id: "emergencia", tema: "ahorro", q: "¿Cuánto debería tener en mi fondo de emergencia?" },
  { id: "hormiga-ideas", tema: "ahorro", q: "Dame 3 ideas para bajar mis gastos hormiga" },
  { id: "de-mas", tema: "ahorro", q: "¿En qué categoría estoy gastando de más?", requiere: "gastos" },
  // Deudas
  { id: "deuda-primero", tema: "deudas", q: "¿Qué deuda debería pagar primero?", requiere: "deudas" },
  { id: "unificar", tema: "deudas", q: "¿Me sirve unificar mis deudas en un solo crédito?" },
  { id: "bola-nieve", tema: "deudas", q: "¿Qué es el método bola de nieve para pagar deudas?" },
  { id: "gota", tema: "deudas", q: "¿Cómo salgo de un préstamo gota a gota sin arriesgarme?" },
  // Tarjeta de crédito
  { id: "tarjeta-cuotas", tema: "tarjeta", q: "¿Cuánto me cuesta diferir una compra de la tarjeta a cuotas?" },
  { id: "minimo", tema: "tarjeta", q: "¿Qué pasa si solo pago el mínimo de la tarjeta?" },
  { id: "tarjetas-deuda", tema: "tarjeta", q: "¿Cuánto debo en mis tarjetas y cuándo las pago?", requiere: "tarjetas" },
  { id: "tasa-ea", tema: "tarjeta", q: "Explícame qué es la tasa E.A. y la tasa de usura" },
  { id: "sacar-tarjeta", tema: "tarjeta", q: "Quiero sacar una tarjeta de crédito con cupo de 5 millones", decision: true },
  // Impuestos y renta
  { id: "declarar", tema: "impuestos", q: "¿Tengo que declarar renta este año?" },
  { id: "uvt", tema: "impuestos", q: "¿Qué es la UVT y para qué sirve?" },
  { id: "deducciones", tema: "impuestos", q: "¿Qué gastos me ayudan a pagar menos renta?" },
  { id: "vence-renta", tema: "impuestos", q: "¿Cuándo vence mi declaración de renta?", meses: [5, 6, 7, 8, 9, 10] },
  // Nómina y prima
  { id: "prima", tema: "nomina", q: "¿Cómo se calcula la prima de servicios?" },
  { id: "descuentos", tema: "nomina", q: "¿Qué me descuentan de la nómina y por qué?" },
  { id: "cesantias", tema: "nomina", q: "¿Para qué sirven las cesantías y cuándo las puedo retirar?" },
  { id: "prima-dic", tema: "nomina", q: "¿Cómo reparto mi prima de diciembre?", meses: [11, 12, 1] },
  { id: "prima-jun", tema: "nomina", q: "¿Cómo reparto la prima de junio?", meses: [5, 6, 7] },
  // Metas
  { id: "meta-viaje", tema: "metas", q: "Ayúdame a crear una meta de ahorro para un viaje", escribe: true },
  { id: "meta-5m", tema: "metas", q: "¿Cuánto debo ahorrar al mes para juntar 5 millones en un año?" },
  // Presupuesto
  { id: "50-30-20", tema: "presupuesto", q: "Explícame la regla 50/30/20 con mis números" },
  { id: "registrar", tema: "presupuesto", q: "Registra un gasto de 15 mil en almuerzo", escribe: true },
  // Inversión básica
  { id: "cdt", tema: "inversion", q: "¿Qué es un CDT y cuánto me daría?" },
  { id: "emergencia-rinda", tema: "inversion", q: "¿Dónde guardo mi fondo de emergencia para que rinda?" },
  { id: "ahorrar-invertir", tema: "inversion", q: "¿Qué diferencia hay entre ahorrar e invertir?" },
  { id: "estafa", tema: "inversion", q: "¿Cómo reconozco una inversión que es estafa?" },
  // Antes de comprar (consejero sin formulario)
  { id: "celular", tema: "compras", q: "¿Me conviene comprar un celular de 3 millones a 12 cuotas?", decision: true },
  { id: "moto", tema: "compras", q: "¿Me alcanza para una moto de 8 millones a 24 cuotas?", decision: true },
  { id: "cdt-10m", tema: "compras", q: "Quiero meter 10 millones en un CDT a 6 meses", decision: true },
  { id: "prestar", tema: "compras", q: "¿Le presto 2 millones a mi hermano a 6 cuotas?", decision: true },
  { id: "arriendo", tema: "compras", q: "¿Me alcanza para un arriendo de 2 millones al mes?", decision: true },
]

/** Generador pseudoaleatorio con semilla (mulberry32): mismas sugerencias para la misma semilla. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const shuffle = <T>(xs: T[], r: () => number) => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

export type PickOpts = { flags?: Partial<ChatFlags>; month?: number; ia?: boolean; canEdit?: boolean; exclude?: string[] }

/** Preguntas que se pueden mostrar con este libro, plan y mes (incluye las personalizadas con nombres del libro). */
export function eligible({ flags = {}, month, ia = true, canEdit = true }: PickOpts = {}): Sugerencia[] {
  const list = BANCO.filter((s) =>
    (!s.requiere || (flags[s.requiere] ?? 0) > 0) &&
    (!s.meses || !month || s.meses.includes(month)) &&
    (canEdit || !s.escribe) &&
    // Sin IA solo lo que se resuelve con algoritmos: datos, decisiones y registrar un gasto.
    (ia || s.rapida || s.decision || s.id === "registrar"),
  )
  const own: Sugerencia[] = []
  if (flags.topCategoria) own.push({ id: "own-cat", tema: "datos", q: `¿Cuánto llevo gastado en ${flags.topCategoria}?`, rapida: true })
  if (flags.meta && ia) own.push({ id: "own-meta", tema: "metas", q: `¿Cómo voy con mi meta "${flags.meta}"?` })
  return [...own, ...list]
}

/**
 * Elige `n` preguntas al azar de temas distintos. Si hay una personalizada (con datos del libro), una de ellas va
 * primero la mitad de las veces para que se note que Mirai conoce tus números.
 */
export function pickSuggestions(n: number, r: () => number, opts: PickOpts = {}): Sugerencia[] {
  const pool = eligible(opts).filter((s) => !opts.exclude?.includes(s.id))
  const out: Sugerencia[] = []
  const used = new Set<Tema>()
  const own = shuffle(pool.filter((s) => s.id.startsWith("own-")), r)
  if (own.length && r() < 0.5) { out.push(own[0]); used.add(own[0].tema) }
  for (const s of shuffle(pool, r)) {
    if (out.length >= n) break
    if (out.includes(s) || used.has(s.tema)) continue
    out.push(s); used.add(s.tema)
  }
  // Si no alcanzan los temas distintos (plan gratis), completa con las que queden.
  for (const s of shuffle(pool, r)) { if (out.length >= n) break; if (!out.includes(s)) out.push(s) }
  return out
}

const TEMA_RE: [Tema, RegExp][] = [
  ["tarjeta", /tarjeta|cupo|diferir|minimo|usura|\be\.?a\b|cuota de manejo/],
  ["deudas", /deuda|debo|credito|prestamo|gota a gota|bola de nieve|abon|unificar|libranza/],
  ["impuestos", /renta|dian|uvt|impuesto|declar|retencion|deducc/],
  ["nomina", /prima|nomina|salario|sueldo|cesantia|descuento|gano|liquidacion|vacaciones/],
  ["metas", /meta|viaje|juntar|ahorrar para/],
  ["inversion", /cdt|invert|inversion|rinda|interes compuesto|fondo de|acciones|estafa|cripto/],
  ["ahorro", /ahorr|hormiga|emergencia|gastando de mas|plata tengo/],
  ["presupuesto", /gaste|gasto|gastos|presupuesto|50\/30\/20|queda|suscrip|fijos|categoria/],
  ["compras", /comprar|compra|me conviene|me alcanza|presto|arriendo|moto|carro|celular/],
]

/** Tema más probable de un texto. */
export function temaDe(text: string): Tema {
  const n = norm(text)
  return TEMA_RE.find(([, re]) => re.test(n))?.[0] ?? "ahorro"
}

/** Temas cercanos para variar las sugerencias de seguimiento. */
const VECINO: Record<Tema, Tema> = {
  datos: "presupuesto", ahorro: "metas", deudas: "tarjeta", tarjeta: "deudas", impuestos: "nomina", nomina: "ahorro",
  metas: "ahorro", presupuesto: "ahorro", inversion: "ahorro", compras: "deudas",
}

/** 2 o 3 preguntas de seguimiento: del mismo tema y uno cercano, sin repetir lo ya preguntado. */
export function followUps(question: string, r: () => number, opts: PickOpts & { asked?: string[] } = {}): string[] {
  const tema = temaDe(question)
  const asked = new Set([question, ...(opts.asked ?? [])].map((q) => norm(q).replace(/[¿?¡!.,"]/g, "").trim()))
  const pool = eligible(opts).filter((s) => !asked.has(norm(s.q).replace(/[¿?¡!.,"]/g, "").trim()))
  const same = shuffle(pool.filter((s) => s.tema === tema), r).slice(0, 2)
  const near = shuffle(pool.filter((s) => s.tema === VECINO[tema] && !same.includes(s)), r).slice(0, 1)
  const out = [...same, ...near]
  if (out.length < 2) out.push(...shuffle(pool.filter((s) => !out.includes(s)), r).slice(0, 2 - out.length))
  return out.slice(0, 3).map((s) => s.q)
}
