// Validación (zod 4) de los datos de cada nodo y del grafo completo de una automatización. Isomórfico.
import { z } from "zod"
import { ACTION_KINDS, CONDITION_KINDS, TRIGGER_KINDS, type FlowNode, type Graph, type NodeKind, type TriggerKind } from "./types"

const money = (msg = "Escribe un valor") => z.number({ error: msg }).min(0, "No puede ser negativo").max(1_000_000_000_000, "Es un valor demasiado alto")
const pct = (min = 1, max = 100) => z.number({ error: "Escribe el porcentaje" }).int("Usa un número entero").min(min, `Mínimo ${min} %`).max(max, `Máximo ${max} %`)
const refId = (msg: string) => z.string({ error: msg }).min(1, msg)
const optId = z.string().nullable()
/** "hogar", "autor" (quien hizo el movimiento) o el user_id de una persona del hogar. */
const para = z.string().min(1, "Elige a quién avisar").max(64)

export const NODE_SCHEMAS = {
  // ── Disparadores ──
  gasto: z.object({}),
  ingreso: z.object({ fuente: z.enum(["todos", "extras", "nomina"]) }),
  pago_fijo: z.object({}),
  cuota: z.object({ dir: z.enum(["todas", "pagar", "cobrar"]) }),
  compra_tarjeta: z.object({ card_id: optId }),
  suscripcion: z.object({ evento: z.enum(["cobrada", "nueva", "todas"]) }),
  recordatorio: z.object({}),
  programado: z.object({
    frecuencia: z.enum(["diario", "semanal", "mensual", "quincena", "dia_pago"]),
    dia_semana: z.number().int().min(0).max(6),
    dia_mes: z.number({ error: "Escribe el día" }).int().min(1, "Del 1 al 31").max(31, "Del 1 al 31"),
    hora: z.number().int().min(0).max(23),
  }),
  presupuesto: z.object({ pct: pct(10, 200), category_id: optId }),
  hormiga: z.object({}),
  pago_proximo: z.object({
    dias: z.number({ error: "Escribe los días" }).int().min(0, "Mínimo 0 días").max(30, "Máximo 30 días"),
    tipos: z.array(z.enum(["fijo", "tarjeta", "pagar", "sub"])).min(1, "Elige al menos un tipo de pago"),
  }),
  saldo_bajo: z.object({ tipo: z.enum(["fondo", "disponible"]), pct: pct(1, 100), valor: money() }),
  meta_alcanzada: z.object({ goal_id: optId }),
  // ── Condiciones ──
  monto: z.object({ op: z.enum(["mayor", "menor"]), valor: money().positive("Escribe un valor mayor que cero") }),
  categoria: z.object({ category_ids: z.array(z.string()).min(1, "Elige al menos una categoría") }),
  miembro: z.object({ member_id: refId("Elige a la persona") }),
  fecha: z
    .object({ modo: z.enum(["semana", "quincena"]), dias: z.array(z.number().int().min(0).max(6)), quincena: z.enum(["q1", "q2"]) })
    .refine((v) => v.modo !== "semana" || v.dias.length > 0, { message: "Elige al menos un día", path: ["dias"] }),
  texto: z.object({ contiene: z.string().trim().min(1, "Escribe una o varias palabras").max(120, "Máximo 120 letras") }),
  // ── Acciones ──
  aviso: z.object({
    titulo: z.string().trim().min(1, "Escribe el título").max(80, "Máximo 80 letras"),
    mensaje: z.string().trim().min(1, "Escribe el mensaje").max(400, "Máximo 400 letras"),
    canales: z.enum(["app", "todos"]),
    para: para.optional(),
  }),
  movimiento: z
    .object({
      tipo: z.enum(["gasto", "ahorro", "meta"]),
      modo: z.enum(["fijo", "pct", "fijos"]),
      valor: money(),
      pct: pct(1, 100),
      descripcion: z.string().trim().min(1, "Escribe la descripción").max(120, "Máximo 120 letras"),
      category_id: optId,
      goal_id: optId,
    })
    .refine((v) => v.modo !== "fijo" || v.valor > 0, { message: "Escribe un valor mayor que cero", path: ["valor"] })
    .refine((v) => v.tipo !== "meta" || !!v.goal_id, { message: "Elige la meta", path: ["goal_id"] }),
  crear_ingreso: z
    .object({
      modo: z.enum(["fijo", "pct"]),
      valor: money(),
      pct: pct(1, 100),
      descripcion: z.string().trim().min(1, "Escribe la descripción").max(120, "Máximo 120 letras"),
      category_id: optId,
    })
    .refine((v) => v.modo !== "fijo" || v.valor > 0, { message: "Escribe un valor mayor que cero", path: ["valor"] }),
  pagar_fijo: z.object({ fixed_expense_id: refId("Elige el gasto fijo"), valor: z.enum(["fijo", "monto"]) }),
  categorizar: z.object({ category_id: refId("Elige la categoría") }),
  apartar: z
    .object({ pct: pct(1, 100), destino: z.enum(["meta", "fondo"]), goal_id: optId })
    .refine((v) => v.destino !== "meta" || !!v.goal_id, { message: "Elige la meta", path: ["goal_id"] }),
  agenda: z.object({
    titulo: z.string().trim().min(1, "Escribe el título").max(80, "Máximo 80 letras"),
    dias: z.number({ error: "Escribe los días" }).int().min(0, "Mínimo 0").max(365, "Máximo 365"),
    usar_monto: z.boolean(),
  }),
  marcar_hormiga: z.object({}),
  esperar: z.object({ dias: z.number({ error: "Escribe los días" }).int().min(1, "Mínimo 1 día").max(60, "Máximo 60 días") }),
  ia: z.object({ pregunta: z.string().trim().min(5, "Escribe qué quieres preguntar").max(300, "Máximo 300 letras"), canales: z.enum(["app", "todos"]), para: para.optional() }),
} satisfies Record<NodeKind, z.ZodType>

const ALL_KINDS = [...TRIGGER_KINDS, ...CONDITION_KINDS, ...ACTION_KINDS] as [NodeKind, ...NodeKind[]]

export const NodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(["trigger", "condition", "action"]),
  kind: z.enum(ALL_KINDS),
  data: z.record(z.string(), z.unknown()),
  position: z.object({ x: z.number(), y: z.number() }),
})
export const EdgeSchema = z.object({
  id: z.string().min(1).max(160),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.enum(["si", "no"]).nullish(),
})
export const GraphSchema = z.object({ nodes: z.array(NodeSchema).max(60, "Máximo 60 pasos"), edges: z.array(EdgeSchema).max(120, "Máximo 120 conexiones") })

/** Lee un grafo guardado (jsonb). Si está dañado devuelve uno vacío. */
export function parseGraph(v: unknown): Graph {
  const r = GraphSchema.safeParse(v)
  return r.success ? (r.data as Graph) : { nodes: [], edges: [] }
}

export const groupOf = (kind: NodeKind) =>
  (TRIGGER_KINDS as readonly string[]).includes(kind) ? "trigger" : (CONDITION_KINDS as readonly string[]).includes(kind) ? "condition" : "action"

/** Disparadores nuevos (cuotas, tarjetas, suscripciones y agenda): traen monto y descripción. */
const MOV_V2: TriggerKind[] = ["cuota", "compra_tarjeta", "suscripcion", "recordatorio"]
/** Disparadores que traen un monto (para "% del monto" y la condición de monto). */
export function triggerHasMonto(t: FlowNode | undefined) {
  if (!t) return false
  if (t.kind === "programado") return ["quincena", "dia_pago"].includes(String(t.data.frecuencia))
  return (["gasto", "ingreso", "pago_fijo", "hormiga", ...MOV_V2] as TriggerKind[]).includes(t.kind as TriggerKind)
}
/** Disparadores que traen un movimiento con descripción, categoría y persona. */
export const triggerHasMov = (t: FlowNode | undefined) => !!t && (["gasto", "ingreso", "pago_fijo", "hormiga", ...MOV_V2] as string[]).includes(t.kind)
/** Disparadores con alguien que hizo el movimiento (para "avisar a quien lo hizo"). */
export const triggerHasAutor = (t: FlowNode | undefined) => !!t && (["gasto", "ingreso", "hormiga", ...MOV_V2] as string[]).includes(t.kind)
/** Disparadores que traen un gasto (para categorizar o marcar como hormiga). */
export const triggerHasGasto = (t: FlowNode | undefined) => !!t && (t.kind === "gasto" || t.kind === "hormiga")

export type Issue = { nodeId?: string; field?: string; msg: string }

/** Errores de los datos de un nodo (por campo). */
export function nodeIssues(n: Pick<FlowNode, "id" | "kind" | "data">): Issue[] {
  const schema = NODE_SCHEMAS[n.kind]
  if (!schema) return [{ nodeId: n.id, msg: "Paso desconocido" }]
  const r = schema.safeParse(n.data)
  return r.success ? [] : r.error.issues.map((i) => ({ nodeId: n.id, field: i.path.join("."), msg: i.message }))
}

/**
 * Revisa el grafo completo: un solo disparador, conexiones válidas, sin ciclos, todo conectado,
 * al menos una acción y datos de cada nodo correctos según lo que trae el disparador.
 */
export function validateGraph(g: Graph): { ok: boolean; issues: Issue[] } {
  const issues: Issue[] = []
  const shape = GraphSchema.safeParse(g)
  if (!shape.success) return { ok: false, issues: shape.error.issues.map((i) => ({ msg: i.message })) }
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  if (byId.size !== g.nodes.length) issues.push({ msg: "Hay pasos repetidos" })
  const triggers = g.nodes.filter((n) => n.type === "trigger")
  if (triggers.length === 0) issues.push({ msg: "Agrega un disparador: lo que pone a andar la automatización" })
  if (triggers.length > 1) triggers.slice(1).forEach((t) => issues.push({ nodeId: t.id, msg: "Solo puede haber un disparador por automatización" }))
  for (const n of g.nodes) if (groupOf(n.kind) !== n.type) issues.push({ nodeId: n.id, msg: "Tipo de paso no válido" })
  const seen = new Set<string>()
  for (const e of g.edges) {
    const s = byId.get(e.source), t = byId.get(e.target)
    if (!s || !t) { issues.push({ msg: "Hay una conexión suelta" }); continue }
    if (e.source === e.target) issues.push({ nodeId: s.id, msg: "Un paso no puede conectarse consigo mismo" })
    if (t.type === "trigger") issues.push({ nodeId: t.id, msg: "Nada puede llegar al disparador: siempre es el primer paso" })
    if (s.type === "condition" && e.sourceHandle !== "si" && e.sourceHandle !== "no") issues.push({ nodeId: s.id, msg: "Conecta la condición por la salida Sí o No" })
    const k = `${e.source}>${e.sourceHandle ?? ""}>${e.target}`
    if (seen.has(k)) issues.push({ nodeId: s.id, msg: "Hay una conexión repetida" })
    seen.add(k)
  }
  if (hasCycle(g)) issues.push({ msg: "El flujo tiene un ciclo (un paso vuelve a uno anterior). Quita esa conexión." })
  const trigger = triggers[0]
  if (trigger) {
    const reach = reachable(g, trigger.id)
    for (const n of g.nodes) if (n.type !== "trigger" && !reach.has(n.id)) issues.push({ nodeId: n.id, msg: "Este paso no está conectado al disparador" })
    if (!g.nodes.some((n) => n.type === "action" && reach.has(n.id))) issues.push({ msg: "Agrega al menos una acción: lo que Mirai hace por ti" })
  }
  for (const n of g.nodes) {
    issues.push(...nodeIssues(n))
    if (!trigger || n.type === "trigger") continue
    const usaMonto = (n.kind === "monto") || (n.kind === "apartar") || ((n.kind === "movimiento" || n.kind === "crear_ingreso") && n.data.modo === "pct") || (n.kind === "agenda" && n.data.usar_monto === true) || (n.kind === "pagar_fijo" && n.data.valor === "monto")
    if (usaMonto && !triggerHasMonto(trigger)) issues.push({ nodeId: n.id, msg: "Usa el monto del disparador, pero ese disparador no trae un monto" })
    if ((n.kind === "categoria" || n.kind === "miembro" || n.kind === "texto") && !triggerHasMov(trigger)) issues.push({ nodeId: n.id, msg: "Esta condición necesita un disparador de gasto, ingreso o pago" })
    if ((n.kind === "categorizar" || n.kind === "marcar_hormiga") && !triggerHasGasto(trigger)) issues.push({ nodeId: n.id, msg: "Esta acción solo sirve cuando el disparador es un gasto" })
    if ((n.kind === "aviso" || n.kind === "ia") && n.data.para === "autor" && !triggerHasAutor(trigger)) issues.push({ nodeId: n.id, msg: "“Quien hizo el movimiento” solo sirve con un disparador de gasto, ingreso, cuota, tarjeta, suscripción o agenda" })
    if (n.kind === "movimiento" && n.data.modo === "fijos" && !(trigger.kind === "programado" && trigger.data.frecuencia === "quincena")) issues.push({ nodeId: n.id, msg: "“Lo de tus gastos fijos” solo sirve con el disparador de quincena" })
  }
  return { ok: issues.length === 0, issues }
}

export function hasCycle(g: Graph) {
  const out = new Map<string, string[]>()
  for (const e of g.edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target])
  const state = new Map<string, 1 | 2>()
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true
    if (state.get(id) === 2) return false
    state.set(id, 1)
    for (const t of out.get(id) ?? []) if (visit(t)) return true
    state.set(id, 2)
    return false
  }
  return g.nodes.some((n) => visit(n.id))
}

export function reachable(g: Graph, from: string) {
  const out = new Map<string, string[]>()
  for (const e of g.edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target])
  const seen = new Set<string>([from])
  const stack = [from]
  while (stack.length) for (const t of out.get(stack.pop()!) ?? []) if (!seen.has(t)) { seen.add(t); stack.push(t) }
  return seen
}

export const triggerOf = (g: Graph) => g.nodes.find((n) => n.type === "trigger")
