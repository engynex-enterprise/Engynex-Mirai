// Plan Gratis vs Premium: qué incluye cada uno y qué secciones cubre cada función Premium.
// Fuente única para el menú, el paywall (<PremiumGate>), las Server Actions y la página /planes.

export type PlanId = string
export type PremiumFeature = "ia" | "banco" | "impuestos" | "familia"

/** Plan vigente de un hogar tal como lo usa la app (tabla plans). */
export type PlanLimits = { libros?: number; personas?: number; /** Automatizaciones activas a la vez por libro (sin dato = sin límite). */ automatizaciones?: number }
export type PlanInfo = { id: string; nombre: string; features: PremiumFeature[]; ads: boolean; limites: PlanLimits; pago: boolean }
/** Respaldo si el plan no está en la tabla plans (la base usa los mismos valores: plan_automation_limit). */
export const FREE_PLAN: PlanInfo = { id: "gratis", nombre: "Gratis", features: [], ads: true, limites: { libros: 1, personas: 2, automatizaciones: 3 }, pago: false }

/** Fila de la tabla plans → PlanInfo. */
export function toPlanInfo(row: { id: string; nombre: string; funciones?: string[] | null; anuncios?: boolean | null; limites?: unknown; precio_mes?: number | null } | null | undefined): PlanInfo {
  if (!row) return FREE_PLAN
  const lim = (row.limites ?? {}) as PlanLimits
  return { id: row.id, nombre: row.nombre, features: (row.funciones ?? []).filter((f): f is PremiumFeature => f in FEATURES), ads: row.anuncios ?? true, limites: lim, pago: (row.precio_mes ?? 0) > 0 }
}

/** ¿El plan incluye la función? */
export const can = (plan: PlanInfo, f: PremiumFeature | undefined) => !f || plan.features.includes(f)
/** ¿El plan incluye todas las funciones de pago? (para textos como "Premium"). */
export const isFull = (plan: PlanInfo) => FEATURE_LIST.every((f) => plan.features.includes(f))
/** Límite del plan (undefined = sin límite). */
export const limitOf = (plan: PlanInfo, k: keyof PlanLimits) => plan.limites[k]

export const FEATURES: Record<PremiumFeature, { label: string; icon: string; desc: string; beneficios: string[]; secciones: string[] }> = {
  ia: {
    label: "Inteligencia artificial", icon: "sparkles", desc: "Tu consejero financiero personal, disponible siempre.",
    beneficios: ["Consejero IA y chat que conocen tus números", "Lee facturas y recibos con una foto", "Clasifica tus gastos solo y detecta gastos hormiga", "Resumen del mes escrito para ti"],
    // El Consejero funciona en todos los planes (en Gratis responde con algoritmos): no lleva la corona en el menú.
    secciones: [],
  },
  banco: {
    label: "Automatización bancaria", icon: "landmark", desc: "Tus movimientos entran solos, sin digitarlos.",
    beneficios: ["Lee las compras de los correos de tu banco (Gmail)", "Importa extractos del banco", "Lleva tus pagos a Google Calendar"],
    secciones: ["correo", "importar"],
  },
  impuestos: {
    label: "Impuestos y contador", icon: "file-check", desc: "La DIAN sin estrés.",
    beneficios: ["Declaración de renta estimada (art. 241)", "Calendario fiscal y laboral con tus fechas", "Acceso seguro para tu contador"],
    secciones: ["renta", "calendario", "contador"],
  },
  familia: {
    label: "Familia y varios libros", icon: "users", desc: "Las finanzas de toda la casa, juntas.",
    beneficios: ["Más de un libro de cuentas (negocio, arriendos…)", "Toda la familia con acceso", "Mesada de los hijos y gastos compartidos", "Seguimiento por miembro"],
    secciones: ["familia", "mesadas", "compartidos"],
  },
}
export const FEATURE_LIST = Object.keys(FEATURES) as PremiumFeature[]

/** Lo que siempre es gratis (para la página de planes). */
export const GRATIS_INCLUYE = [
  "Gastos, ingresos, quincena y balance", "Gastos fijos, tarjetas y suscripciones", "Presupuesto 50/30/20, metas y retos",
  "Préstamos, deudas y contactos", "Inversiones, logros y salud financiera", "Recordatorios y avisos en la app",
]

export const FREE_LIMITS = { libros: 1, personas: 2 }
export const GRACE_DAYS = 3

/** Función Premium que cubre una sección del menú (o undefined si es gratis). */
export const featureOfSection = (id: string): PremiumFeature | undefined => FEATURE_LIST.find((f) => FEATURES[f].secciones.includes(id))


/** Precio en pesos con formato colombiano: 14900 → "$14.900". */
export const precio = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`

/** Ahorro del plan anual frente a 12 meses: { pesos, meses }. */
export function ahorroAnual(mes: number, anio: number) {
  const pesos = Math.max(0, mes * 12 - anio)
  return { pesos, meses: mes ? Math.round((pesos / mes) * 10) / 10 : 0 }
}

/** Nueva fecha de vencimiento al pagar un periodo: desde hoy o desde el vencimiento actual si aún no ha llegado. */
export function extendVence(actual: string | Date | null | undefined, periodo: "mes" | "anio", now = new Date()) {
  const base = actual && new Date(actual) > now ? new Date(actual) : new Date(now)
  const d = new Date(base)
  if (periodo === "anio") d.setFullYear(d.getFullYear() + 1)
  else {
    const day = d.getDate()
    d.setMonth(d.getMonth() + 1)
    if (d.getDate() < day) d.setDate(0) // 31 ene + 1 mes → 28/29 feb
  }
  return d
}

/** ¿El plan sigue vigente (con días de gracia)? */
export function vigente(vence: string | Date | null | undefined, now = new Date()) {
  return !!vence && new Date(vence).getTime() + GRACE_DAYS * 86_400_000 > now.getTime()
}

/** Ingreso mensual recurrente (MRR) estimado: suscripciones pagas activas, las anuales prorrateadas a 12 meses. */
export function mrr(subs: { periodo: string; estado: string; proveedor: string }[], mes: number, anio: number) {
  return subs.filter((s) => s.estado === "activa" && s.proveedor !== "manual").reduce((t, s) => t + (s.periodo === "anio" ? anio / 12 : mes), 0)
}

export type Coupon = { codigo: string; tipo: "porcentaje" | "valor"; valor: number; planes: string[]; periodos: string[]; desde: string | null; hasta: string | null; max_usos: number | null; usos: number; activo: boolean }

/** ¿El cupón sirve para ese plan y periodo hoy? Devuelve el motivo si no. */
export function couponProblem(c: Coupon | null | undefined, plan: string, periodo: "mes" | "anio", hoy: string): string | null {
  if (!c || !c.activo) return "Ese cupón no existe o ya no está activo."
  if (c.desde && c.desde > hoy) return "Ese cupón todavía no está vigente."
  if (c.hasta && c.hasta < hoy) return "Ese cupón ya venció."
  if (c.max_usos !== null && c.usos >= c.max_usos) return "Ese cupón ya se usó el máximo de veces."
  if (c.planes.length && !c.planes.includes(plan)) return "Ese cupón no aplica para este plan."
  if (!c.periodos.includes(periodo)) return `Ese cupón no aplica para el pago ${periodo === "anio" ? "anual" : "mensual"}.`
  return null
}

/** Precio con el cupón aplicado (mínimo $1.000, lo que permiten las pasarelas). */
export function withCoupon(price: number, c: Pick<Coupon, "tipo" | "valor"> | null | undefined) {
  if (!c) return price
  const off = c.tipo === "porcentaje" ? Math.round((price * Math.min(100, c.valor)) / 100) : c.valor
  return Math.max(1000, price - off)
}
