// Tipos del chat de Mirai (burbuja flotante y /consejero comparten conversación y motor). Puro: lo usan el servidor
// (app/api/chat, features/chat/actions.ts) y el navegador.
import type { AdvisorInput, AdvisorMetrics, Veredicto } from "@/lib/domain"

export type Tono = "simple" | "fin"

/** Concepto de la IA sobre una decisión (consejero_analizar). */
export type AiVerdict = {
  veredicto: "si" | "con_cuidado" | "no"; titular: string; explicacion: string
  razones: string[]; alternativas: string[]; plan: string[]; pregunta: string
  tecnico: { resumen: string; indicadores: { nombre: string; valor: string; lectura: "sano" | "alerta" | "riesgo" }[]; recomendacion: string }
}

/** Análisis de una decisión ("¿me conviene…?") con los cálculos de lib/domain y, si hay IA, su concepto. */
export type Consulta = {
  id: string; fecha: string; d: AdvisorInput; txt: string; v: Veredicto; R: string[]; m: AdvisorMetrics; X: Record<string, number>
  ai: AiVerdict | null; aiErr: string | null; provider?: string; usura?: number
  /** Qué tiene registrado el libro: sin cuentas ni fondo no se habla de "disponible" ni de "colchón" como si fueran datos. */
  datos?: { cuentas: boolean; ingresos: boolean }
  /** Créditos de IA que costó el análisis. */
  creditos?: number
}

/** Acción que el asistente propone y la persona debe confirmar antes de escribir en su libro. */
export type PropuestaTipo = "gasto" | "ingreso" | "meta" | "recordatorio"
export type Propuesta = {
  id: string
  tipo: PropuestaTipo
  estado: "pendiente" | "hecho" | "cancelado"
  datos: {
    valor?: number; descripcion?: string; fecha?: string; category_id?: string | null; categoria?: string | null
    nombre?: string; objetivo?: number; ahorrado?: number; titulo?: string; monto?: number
  }
  /** Id del registro creado al confirmar. */
  registroId?: string
}

/** De dónde salió la respuesta (se muestra una marca discreta). */
export type Fuente = "algoritmo" | "ia" | "cache" | "consejero" | "upsell" | "error" | "lectura"

export type ChatMeta = {
  fuente?: Fuente
  provider?: string
  /** Preguntas de seguimiento sugeridas después de la respuesta. */
  sugerencias?: string[]
  decision?: Consulta
  /** Decisión a la que le faltan datos: el siguiente mensaje se suma a este texto. */
  pendiente?: { txt: string }
  propuestas?: Propuesta[]
  /** Datos que consultó la IA con herramientas (para mostrar "Revisé: tus gastos, tus tarjetas"). */
  consultas?: string[]
  /** La persona detuvo la respuesta. */
  detenido?: boolean
  /** Por qué no respondió la IA: plan sin IA, IA apagada o créditos agotados (se muestra un botón para resolverlo). */
  aviso?: "plan" | "apagada" | "creditos"
  /** Créditos de IA que costó esta respuesta (0 si la calculó Mirai). */
  creditos?: number
}

export type ChatAdjunto = { nombre: string; tipo: string; tam: number }

export type ChatMsg = {
  id: string; thread_id?: string; role: "user" | "assistant"; content: string; meta: ChatMeta
  feedback: -1 | 1 | null; adjuntos: ChatAdjunto[]; created_at: string
}

export type ChatThread = { id: string; titulo: string; fijado: boolean; archivado: boolean; updated_at: string; created_at: string; ultimo: string }

/** Eventos del streaming de /api/chat (una línea JSON por evento). */
export type ChatEvent =
  | { t: "thread"; id: string; titulo: string; nuevo: boolean }
  | { t: "user"; msg: ChatMsg }
  | { t: "tool"; label: string }
  | { t: "delta"; text: string }
  | { t: "card"; propuesta?: Propuesta; decision?: Consulta }
  | { t: "done"; msg: ChatMsg }
  | { t: "error"; msg: string }

/** Datos del libro para personalizar las sugerencias (sin montos). */
export type ChatFlags = {
  tarjetas: number; deudas: number; metas: number; suscripciones: number; ingresos: number; gastos: number
  /** Categoría con más gasto este mes (para sugerir "¿cuánto llevo en …?"). */
  topCategoria?: string | null
  /** Meta con menos avance (para sugerir "¿cómo voy con …?"). */
  meta?: string | null
}

export type ChatHints = {
  nombre: string
  canEdit: boolean
  flags: ChatFlags
  ia: { allowed: boolean; premium: boolean; off: boolean; quota: { nivel: "ok" | "aviso" | "agotado" | "sin_limite"; quedan: number | null; cupo: number | null } | null }
}

/** Fila de chat_messages → ChatMsg (normaliza meta, feedback y adjuntos). */
export function toMsg(r: { id: string; thread_id?: string; role: string; content: string; meta: unknown; feedback?: number | null; adjuntos?: unknown; created_at: string }): ChatMsg {
  return {
    id: r.id, thread_id: r.thread_id, role: r.role === "user" ? "user" : "assistant", content: r.content ?? "",
    meta: (r.meta && typeof r.meta === "object" ? r.meta : {}) as ChatMeta,
    feedback: r.feedback === 1 || r.feedback === -1 ? r.feedback : null,
    adjuntos: Array.isArray(r.adjuntos) ? (r.adjuntos as ChatAdjunto[]) : [],
    created_at: r.created_at,
  }
}

export const MSG_COLS = "id,thread_id,role,content,meta,feedback,adjuntos,created_at"
export const THREAD_COLS = "id,titulo,fijado,archivado,updated_at,created_at,ultimo"
