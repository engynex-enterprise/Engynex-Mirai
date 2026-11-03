// Tipos de las automatizaciones (isomórfico: navegador, servidor y pruebas).

export type NodeGroup = "trigger" | "condition" | "action"

export const TRIGGER_KINDS = ["gasto", "ingreso", "pago_fijo", "cuota", "compra_tarjeta", "suscripcion", "recordatorio", "programado", "presupuesto", "hormiga", "pago_proximo", "saldo_bajo", "meta_alcanzada"] as const
export const CONDITION_KINDS = ["monto", "categoria", "miembro", "fecha", "texto"] as const
export const ACTION_KINDS = ["aviso", "movimiento", "crear_ingreso", "pagar_fijo", "categorizar", "apartar", "agenda", "marcar_hormiga", "esperar", "ia"] as const

export type TriggerKind = (typeof TRIGGER_KINDS)[number]
export type ConditionKind = (typeof CONDITION_KINDS)[number]
export type ActionKind = (typeof ACTION_KINDS)[number]
export type NodeKind = TriggerKind | ConditionKind | ActionKind

/** Disparadores que llegan por la cola de eventos (al registrar algo). */
export const EVENT_TRIGGERS: TriggerKind[] = ["gasto", "ingreso", "pago_fijo", "hormiga", "cuota", "compra_tarjeta", "suscripcion", "recordatorio"]
/** Eventos que la versión publicada no conoce: la base los encola con procesado_at = epoch (no los toma el código viejo). */
export const V2_EVENT_TIPOS = ["cuota", "compra_tarjeta", "suscripcion", "recordatorio"] as const
export const V2_PENDING_AT = "1970-01-01T00:00:00Z"
/** Disparadores que se revisan por estado del libro (cron y después de cada evento). */
export const STATE_TRIGGERS: TriggerKind[] = ["presupuesto", "pago_proximo", "saldo_bajo", "meta_alcanzada", "ingreso"]

export type NodeData = Record<string, unknown>

export type FlowNode = {
  id: string
  type: NodeGroup
  kind: NodeKind
  data: NodeData
  position: { x: number; y: number }
}

/** Conexión. Las condiciones salen por "si" o "no"; los demás nodos por una sola salida (null). */
export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: "si" | "no" | null }

export type Graph = { nodes: FlowNode[]; edges: FlowEdge[] }

/** Datos del evento que disparó la automatización (variables para condiciones y mensajes). */
export type EventData = {
  monto?: number
  descripcion?: string
  category_id?: string | null
  member_id?: string | null
  /** Fecha del movimiento 'YYYY-MM-DD'. */
  fecha?: string
  /** Fila que originó el evento (gasto, ingreso extra o pago). */
  row_id?: string | null
  tabla?: string
  /** Variables extra para los mensajes: resumen, fijos, dias, pct, meta, pago… */
  [k: string]: unknown
}

export type TriggerEvent = {
  kind: TriggerKind
  /** Clave idempotente: una ejecución por automatización y clave. */
  clave: string
  /** Hoy en Colombia ('YYYY-MM-DD'). */
  hoy: string
  data: EventData
}

/** Nombres para mostrar en mensajes y en la simulación. */
export type Refs = {
  categorias?: Record<string, string>
  metas?: Record<string, string>
  miembros?: Record<string, string>
  /** Gastos fijos (id → nombre). */
  fijos?: Record<string, string>
  /** Personas con cuenta en el hogar (user_id → nombre), para "avisar a una persona". */
  personas?: Record<string, string>
}

export type StepResult = {
  node: string
  kind: NodeKind
  ok: boolean
  msg: string
  branch?: "si" | "no"
  /** true si el paso quedó en espera ("Esperar N días"). */
  wait?: boolean
}

export type RunStatus = "ok" | "error" | "omitida" | "esperando"

export type RunResult = {
  status: RunStatus
  steps: StepResult[]
  error?: string
  /** Si hubo "Esperar": cuándo y desde qué nodos seguir. */
  resume?: { at: string; nodes: string[] }
}

/** Parámetros ya resueltos de una acción (montos calculados y textos con variables llenas). */
export type ActionParams = {
  titulo?: string
  mensaje?: string
  canales?: "app" | "todos"
  tipo?: "gasto" | "ahorro" | "meta"
  destino?: "meta" | "fondo"
  monto?: number
  descripcion?: string
  category_id?: string | null
  goal_id?: string | null
  dias?: number
  fecha?: string
  pregunta?: string
  /** A quién avisar: todo el hogar, quien hizo el movimiento o una persona (user_id). */
  para?: string
  fixed_expense_id?: string | null
}

/** Ejecuta las acciones de verdad (servidor) o las imita (pruebas). Devuelve un texto corto del resultado. */
export interface ActionAdapter {
  run(kind: ActionKind, params: ActionParams, ev: TriggerEvent, node: FlowNode): Promise<string>
}
