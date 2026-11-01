// Plan Gratis vs Premium: qué incluye cada uno y qué secciones cubre cada función Premium.
// Fuente única para el menú, el paywall (<PremiumGate>), las Server Actions y la página /planes.

export type PlanId = "gratis" | "premium"
export type PremiumFeature = "ia" | "banco" | "impuestos" | "familia"

export const FEATURES: Record<PremiumFeature, { label: string; icon: string; desc: string; beneficios: string[]; secciones: string[] }> = {
  ia: {
    label: "Inteligencia artificial", icon: "sparkles", desc: "Tu consejero financiero personal, disponible siempre.",
    beneficios: ["Consejero IA y chat que conocen tus números", "Lee facturas y recibos con una foto", "Clasifica tus gastos solo y detecta gastos hormiga", "Resumen del mes escrito para ti"],
    secciones: ["consejero"],
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

export const hasFeature = (plan: PlanId, _f: PremiumFeature) => plan === "premium"

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
