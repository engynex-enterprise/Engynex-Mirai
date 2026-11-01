// Tipos y estados de las opiniones que la gente le envía a Mirai (tabla feedback).

export type FeedbackTipo = "calificacion" | "error" | "funcion" | "sugerencia" | "pregunta" | "otro"
export type FeedbackEstado = "nuevo" | "revisando" | "planeado" | "hecho" | "descartado"

export const TIPOS: Record<FeedbackTipo, { label: string; icon: string; desc: string; pregunta: string; placeholder: string }> = {
  calificacion: { label: "Calificar Mirai", icon: "star", desc: "Dinos qué tan útil te parece", pregunta: "¿Qué te gusta y qué mejorarías?", placeholder: "Opcional. Ej.: me encanta ver la quincena, pero me gustaría…" },
  error: { label: "Algo no funciona", icon: "bug", desc: "Un error o algo que se ve mal", pregunta: "¿Qué pasó?", placeholder: "Cuéntanos qué estabas haciendo, qué esperabas y qué pasó." },
  funcion: { label: "Pedir una función", icon: "lightbulb", desc: "Algo que te gustaría que Mirai hiciera", pregunta: "¿Qué te gustaría poder hacer?", placeholder: "Ej.: que me avise cuando el arriendo suba con el IPC." },
  sugerencia: { label: "Una sugerencia", icon: "sparkles", desc: "Una idea para mejorar algo que ya existe", pregunta: "¿Qué mejorarías?", placeholder: "Ej.: que el botón de agregar gasto esté más a la mano." },
  pregunta: { label: "Tengo una duda", icon: "circle-help", desc: "No encuentras cómo hacer algo", pregunta: "¿Cuál es tu duda?", placeholder: "Escribe tu pregunta. Te respondemos aquí mismo." },
  otro: { label: "Otro tema", icon: "message-square-text", desc: "Cualquier otra cosa", pregunta: "Cuéntanos", placeholder: "Escribe lo que quieras decirnos." },
}
export const TIPO_LIST = Object.keys(TIPOS) as FeedbackTipo[]

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
