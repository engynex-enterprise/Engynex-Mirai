// Tipos y estados de las opiniones que la gente le envía a Mirai (tabla feedback).

export type FeedbackTipo = "calificacion" | "error" | "funcion" | "sugerencia" | "elogio" | "pregunta" | "soporte" | "otro"
export type FeedbackEstado = "nuevo" | "revisando" | "planeado" | "hecho" | "descartado"

export const TIPOS: Record<FeedbackTipo, { label: string; icon: string; desc: string; pregunta: string; placeholder: string }> = {
  calificacion: { label: "Calificar Mirai", icon: "star", desc: "Dinos qué tan útil te parece", pregunta: "¿Qué te gusta y qué mejorarías?", placeholder: "Opcional. Ej.: me encanta ver la quincena, pero me gustaría…" },
  error: { label: "Algo no funciona", icon: "bug", desc: "Un error o algo que se ve mal", pregunta: "¿Qué pasó?", placeholder: "Cuéntanos qué estabas haciendo, qué esperabas y qué pasó." },
  funcion: { label: "Pedir una función", icon: "lightbulb", desc: "Algo que te gustaría que Mirai hiciera", pregunta: "¿Qué te gustaría poder hacer?", placeholder: "Ej.: que me avise cuando el arriendo suba con el IPC." },
  sugerencia: { label: "Una sugerencia", icon: "sparkles", desc: "Una idea para mejorar algo que ya existe", pregunta: "¿Qué mejorarías?", placeholder: "Ej.: que el botón de agregar gasto esté más a la mano." },
  elogio: { label: "Un elogio", icon: "heart", desc: "Algo que te encanta de Mirai", pregunta: "¿Qué es lo que más te gusta?", placeholder: "Ej.: ver cuánto me queda en la quincena me cambió el mes." },
  pregunta: { label: "Tengo una duda", icon: "circle-help", desc: "No encuentras cómo hacer algo", pregunta: "¿Cuál es tu duda?", placeholder: "Escribe tu pregunta. Te respondemos aquí mismo." },
  soporte: { label: "Caso de soporte", icon: "life-buoy", desc: "Necesitas que te ayudemos con algo puntual", pregunta: "Cuéntanos qué necesitas", placeholder: "Qué pasó, desde cuándo y qué intentaste." },
  otro: { label: "Otro tema", icon: "message-square-text", desc: "Cualquier otra cosa", pregunta: "Cuéntanos", placeholder: "Escribe lo que quieras decirnos." },
}
export const TIPO_LIST = Object.keys(TIPOS) as FeedbackTipo[]
/** Tipos que se eligen en "Tu opinión" (el soporte tiene su propio formulario en el Centro de ayuda). */
export const TIPO_FORM: FeedbackTipo[] = ["calificacion", "error", "funcion", "sugerencia", "elogio", "pregunta"]

/** Temas de "Contactar soporte" (van en contexto.soporte.tema). */
export const SOPORTE_TEMAS = [
  { value: "cuenta", label: "Mi cuenta o acceso", icon: "key-round" },
  { value: "plan", label: "Pagos y plan Premium", icon: "crown" },
  { value: "datos", label: "Mis datos o respaldos", icon: "database" },
  { value: "familia", label: "Hogar e invitaciones", icon: "users" },
  { value: "integraciones", label: "Integraciones y avisos", icon: "plug" },
  { value: "error", label: "Algo no funciona", icon: "bug" },
  { value: "otro", label: "Otro tema", icon: "message-square-text" },
] as const
export type SoporteTema = (typeof SOPORTE_TEMAS)[number]["value"]
export type SoporteCtx = { tema: SoporteTema; asunto: string }

/** Número corto de un caso para mostrar y citar ("#A1B2C3"). */
export const casoNumero = (id: string) => `#${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`

export const ESTADOS: Record<FeedbackEstado, { label: string; tone: "info" | "porVencer" | "estimado" | "pagado" | "gray" }> = {
  nuevo: { label: "Recibido", tone: "info" },
  revisando: { label: "En revisión", tone: "porVencer" },
  planeado: { label: "Planeado", tone: "estimado" },
  hecho: { label: "Listo", tone: "pagado" },
  descartado: { label: "Por ahora no", tone: "gray" },
}
export const ESTADO_LIST = Object.keys(ESTADOS) as FeedbackEstado[]

export const STAR_LABELS = ["Muy mala", "Mala", "Regular", "Buena", "Excelente"]

/** Cuándo pedir la calificación en Inicio: tras 7 días de uso y no más de una vez cada 90 días. */
export const PROMPT_DAYS_FIRST = 7
export const PROMPT_DAYS_AGAIN = 90

export function shouldPromptRating({ since, lastRated, lastDismissed, now = new Date() }: { since?: string | null; lastRated?: string | null; lastDismissed?: string | null; now?: Date }) {
  const days = (d?: string | null) => (d ? (now.getTime() - new Date(d).getTime()) / 86_400_000 : Infinity)
  if (!since || days(since) < PROMPT_DAYS_FIRST) return false
  return days(lastRated) >= PROMPT_DAYS_AGAIN && days(lastDismissed) >= PROMPT_DAYS_AGAIN
}

/** Promedio y reparto de estrellas (panel de administración). */
export function ratingStats(ratings: number[]) {
  const dist = [1, 2, 3, 4, 5].map((n) => ratings.filter((r) => r === n).length)
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
  return { avg, count: ratings.length, dist }
}
