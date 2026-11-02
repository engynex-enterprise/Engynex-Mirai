// Motor de automatizaciones: recorre el grafo desde el disparador, evalúa condiciones (ramas Sí/No) y ejecuta acciones
// con un adaptador inyectable. Puro (sin Supabase ni reloj global): el servidor le pasa el adaptador real y la
// simulación ("Probar") lo corre sin adaptador, solo describiendo lo que haría.
import { formatCOP } from "@/lib/domain/money"
import { norm } from "@/lib/domain/hormiga"
import { DIAS_SEMANA, quincenaDeDia } from "@/lib/domain/reparto"
import { CATALOG } from "./catalog"
import { validateGraph } from "./schema"
import type { ActionAdapter, ActionKind, ActionParams, FlowEdge, FlowNode, Graph, Refs, RunResult, StepResult, TriggerEvent } from "./types"

export const MAX_STEPS = 50

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const dayOf = (fecha: string) => new Date(`${fecha}T12:00:00`)

/** Suma días a una fecha 'YYYY-MM-DD'. */
export function addDaysIso(fecha: string, dias: number) {
  const d = dayOf(fecha)
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Variables para los textos ({monto}, {descripcion}, {categoria}…). */
export function variables(ev: TriggerEvent, refs: Refs = {}): Record<string, string> {
  const d = ev.data
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(d)) if (typeof v === "string" || typeof v === "number") out[k] = String(v)
  if (d.monto !== undefined) out.monto = formatCOP(num(d.monto))
  if (d.fijos !== undefined) out.fijos = formatCOP(num(d.fijos))
  if (d.ingreso !== undefined) out.ingreso = formatCOP(num(d.ingreso))
  out.descripcion = String(d.descripcion ?? "")
  out.categoria = (d.category_id && refs.categorias?.[d.category_id]) || String(d.categoria ?? "Sin categoría")
  out.miembro = (d.member_id && refs.miembros?.[d.member_id]) || String(d.miembro ?? "la familia")
  out.fecha = String(d.fecha ?? ev.hoy)
  return out
}

/** Reemplaza {variable} en un texto. Las variables desconocidas quedan tal cual. */
export const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m))

/** ¿Se cumple la condición con los datos del evento? */
export function evalCondition(node: Pick<FlowNode, "kind" | "data">, ev: TriggerEvent): boolean {
  const d = node.data
  const e = ev.data
  switch (node.kind) {
    case "monto": {
      if (e.monto === undefined) return false
      return d.op === "menor" ? num(e.monto) < num(d.valor) : num(e.monto) > num(d.valor)
    }
    case "categoria": return Array.isArray(d.category_ids) && !!e.category_id && (d.category_ids as string[]).includes(e.category_id)
    case "miembro": return !!e.member_id && e.member_id === d.member_id
    case "fecha": {
      const f = dayOf(String(e.fecha ?? ev.hoy))
      if (d.modo === "quincena") return quincenaDeDia(f.getDate(), num(e.corte_q) || 15) === d.quincena
      return Array.isArray(d.dias) && (d.dias as number[]).includes(f.getDay())
    }
    case "texto": {
      const txt = norm(e.descripcion)
      return String(d.contiene ?? "").split(",").map(norm).filter(Boolean).some((w) => txt.includes(w))
    }
    default: return false
  }
}

/** Monto de una acción: fijo, % del monto del disparador o lo de los gastos fijos de la quincena. */
export function resolveMonto(node: Pick<FlowNode, "kind" | "data">, ev: TriggerEvent): number {
  const d = node.data
  if (node.kind === "apartar") return Math.round((num(ev.data.monto) * num(d.pct)) / 100)
  if (node.kind === "agenda") return d.usar_monto ? Math.round(num(ev.data.monto)) : 0
  if (node.kind === "pagar_fijo") return d.valor === "monto" ? Math.round(num(ev.data.monto)) : 0
  if (d.modo === "pct") return Math.round((num(ev.data.monto) * num(d.pct)) / 100)
  if (d.modo === "fijos") return Math.round(num(ev.data.fijos))
  return Math.round(num(d.valor))
}

/** Parámetros listos para ejecutar (textos con variables y montos calculados). */
export function resolveParams(node: FlowNode, ev: TriggerEvent, refs: Refs = {}): ActionParams {
  const d = node.data
  const vars = variables(ev, refs)
  switch (node.kind as ActionKind) {
    case "aviso": return { titulo: fill(String(d.titulo ?? ""), vars), mensaje: fill(String(d.mensaje ?? ""), vars), canales: d.canales === "todos" ? "todos" : "app", para: paraOf(d.para) }
    case "crear_ingreso": return { monto: resolveMonto(node, ev), descripcion: fill(String(d.descripcion ?? ""), vars).trim() || "Ingreso automático", category_id: (d.category_id as string) || null, fecha: ev.hoy }
    case "pagar_fijo": return { fixed_expense_id: (d.fixed_expense_id as string) || null, monto: resolveMonto(node, ev), fecha: ev.hoy }
    case "movimiento": return { tipo: d.tipo as ActionParams["tipo"], monto: resolveMonto(node, ev), descripcion: fill(String(d.descripcion ?? ""), vars), category_id: (d.category_id as string) || null, goal_id: (d.goal_id as string) || null, fecha: ev.hoy }
    case "categorizar": return { category_id: String(d.category_id ?? "") }
    case "apartar": return { destino: d.destino === "fondo" ? "fondo" : "meta", goal_id: (d.goal_id as string) || null, monto: resolveMonto(node, ev), descripcion: fill(`Apartado automático de {descripcion}`, vars), fecha: ev.hoy }
    case "agenda": return { titulo: fill(String(d.titulo ?? ""), vars), fecha: addDaysIso(ev.hoy, num(d.dias)), monto: resolveMonto(node, ev) }
    case "marcar_hormiga": return {}
    case "esperar": return { dias: num(d.dias) }
    case "ia": return { pregunta: fill(String(d.pregunta ?? ""), vars), canales: d.canales === "todos" ? "todos" : "app", para: paraOf(d.para) }
  }
}

const paraOf = (v: unknown) => (typeof v === "string" && v ? v : "hogar")

/** A quién va el aviso, en palabras ("a todo el hogar", "a quien lo hizo", "a Ana"). */
export function paraText(para: string | undefined, refs: Refs = {}) {
  if (!para || para === "hogar") return "a todo el hogar"
  if (para === "autor") return "a quien hizo el movimiento"
  return `a ${refs.personas?.[para] ?? "una persona del hogar"}`
}

/** Lo que haría la acción, en palabras (simulación y respaldo del historial). */
export function describeAction(node: FlowNode, p: ActionParams, refs: Refs = {}): string {
  const meta = (id: string | null | undefined) => (id && refs.metas?.[id]) || "tu meta"
  switch (node.kind as ActionKind) {
    case "aviso": return `Enviaría el aviso “${p.titulo}”${p.mensaje ? `: ${p.mensaje}` : ""} ${paraText(p.para, refs)}${p.canales === "todos" ? " (app y sus canales activos)" : " (en la app)"}`
    case "crear_ingreso": return p.monto ? `Registraría un ingreso de ${formatCOP(p.monto)} “${p.descripcion}”` : "No registraría nada: el monto da $0"
    case "pagar_fijo": {
      const f = (p.fixed_expense_id && refs.fijos?.[p.fixed_expense_id]) || "el gasto fijo"
      return `Marcaría “${f}” como pagado en su periodo pendiente${p.monto ? ` por ${formatCOP(p.monto)}` : " por su valor"}`
    }
    case "movimiento":
      if (!p.monto) return "No crearía nada: el monto da $0"
      if (p.tipo === "gasto") return `Crearía un gasto de ${formatCOP(p.monto)} “${p.descripcion}”`
      if (p.tipo === "ahorro") return `Guardaría ${formatCOP(p.monto)} en tu fondo de emergencia`
      return `Aportaría ${formatCOP(p.monto)} a “${meta(p.goal_id)}”`
    case "categorizar": return `Le pondría la categoría ${(p.category_id && refs.categorias?.[p.category_id]) || "elegida"} al gasto`
    case "apartar": return p.monto ? `Apartaría ${formatCOP(p.monto)} para ${p.destino === "fondo" ? "tu fondo de emergencia" : `“${meta(p.goal_id)}”`}` : "No apartaría nada: el monto da $0"
    case "agenda": return `Agregaría “${p.titulo}” a tu agenda el ${p.fecha}${p.monto ? ` por ${formatCOP(p.monto)}` : ""}`
    case "marcar_hormiga": return "Marcaría el gasto como hormiga"
    case "esperar": return `Esperaría ${p.dias} día${p.dias === 1 ? "" : "s"} antes de seguir`
    case "ia": return `Le preguntaría a la IA: “${p.pregunta}” y mandaría el consejo ${paraText(p.para, refs)}`
  }
}

/** Texto del resultado de una condición. */
export function describeCondition(node: FlowNode, ok: boolean, ev: TriggerEvent, refs: Refs = {}) {
  const v = variables(ev, refs)
  const si = ok ? "Sí" : "No"
  switch (node.kind) {
    case "monto": return `${si}: ${ev.data.monto === undefined ? "no hay monto" : `${v.monto} ${node.data.op === "menor" ? "<" : ">"} ${formatCOP(num(node.data.valor))}`}`
    case "categoria": return `${si}: la categoría es ${v.categoria}`
    case "miembro": return `${si}: es de ${v.miembro}`
    case "fecha": {
      const f = dayOf(String(ev.data.fecha ?? ev.hoy))
      return node.data.modo === "quincena" ? `${si}: el ${f.getDate()} es de la ${quincenaDeDia(f.getDate(), num(ev.data.corte_q) || 15) === "q1" ? "primera" : "segunda"} quincena` : `${si}: es ${DIAS_SEMANA[f.getDay()].toLowerCase()}`
    }
    case "texto": return `${si}: “${v.descripcion}”`
    default: return si
  }
}

type RunOpts = {
  /** Sin adaptador o con dryRun: solo describe (no cambia nada). */
  adapter?: ActionAdapter
  dryRun?: boolean
  refs?: Refs
  /** Reanudar desde estos nodos (después de "Esperar"). */
  startAt?: string[]
  maxSteps?: number
  /** Si false, no valida el grafo antes (para simular un borrador). */
  validate?: boolean
}

const nextOf = (edges: FlowEdge[], id: string, handle?: "si" | "no") =>
  edges.filter((e) => e.source === id && (handle ? e.sourceHandle === handle : !e.sourceHandle || e.sourceHandle === null)).map((e) => e.target)

/**
 * Corre la automatización para un evento. Cada nodo se ejecuta como máximo una vez por recorrido (evita bucles) y hay un
 * tope de pasos. "Esperar" (fuera de la simulación) detiene esa rama y devuelve dónde y cuándo seguir.
 */
export async function runGraph(graph: Graph, ev: TriggerEvent, opts: RunOpts = {}): Promise<RunResult> {
  const refs = opts.refs ?? {}
  const dry = opts.dryRun || !opts.adapter
  const max = opts.maxSteps ?? MAX_STEPS
  if (opts.validate !== false) {
    const v = validateGraph(graph)
    if (!v.ok) return { status: "error", steps: [], error: `La automatización tiene errores: ${v.issues[0]?.msg ?? "revísala"}` }
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const steps: StepResult[] = []
  let queue: string[]
  if (opts.startAt?.length) queue = [...opts.startAt]
  else {
    const t = graph.nodes.find((n) => n.type === "trigger")
    if (!t) return { status: "error", steps, error: "No hay disparador" }
    if (t.kind !== ev.kind) return { status: "omitida", steps, error: "El evento no corresponde a este disparador" }
    steps.push({ node: t.id, kind: t.kind, ok: true, msg: `${CATALOG[t.kind].label}${ev.data.descripcion ? `: ${ev.data.descripcion}` : ""}${ev.data.monto !== undefined ? ` (${formatCOP(num(ev.data.monto))})` : ""}` })
    queue = nextOf(graph.edges, t.id)
  }
  const visited = new Set<string>()
  const waiting: { at: string; nodes: string[] }[] = []
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = byId.get(id)
    if (!node) continue
    if (steps.length >= max) return { status: "error", steps, error: `Se detuvo: más de ${max} pasos` }
    if (node.type === "condition") {
      const ok = evalCondition(node, ev)
      steps.push({ node: id, kind: node.kind, ok: true, branch: ok ? "si" : "no", msg: describeCondition(node, ok, ev, refs) })
      queue.push(...nextOf(graph.edges, id, ok ? "si" : "no"))
      continue
    }
    if (node.type !== "action") continue
    const params = resolveParams(node, ev, refs)
    if (node.kind === "esperar" && !dry) {
      const next = nextOf(graph.edges, id)
      steps.push({ node: id, kind: node.kind, ok: true, wait: true, msg: describeAction(node, params, refs).replace("Esperaría", "Esperando") })
      if (next.length) waiting.push({ at: addDaysIso(ev.hoy, params.dias ?? 1), nodes: next })
      continue
    }
    if (dry) {
      steps.push({ node: id, kind: node.kind, ok: true, msg: describeAction(node, params, refs) })
    } else {
      try {
        const msg = await opts.adapter!.run(node.kind as ActionKind, params, ev, node)
        steps.push({ node: id, kind: node.kind, ok: true, msg: msg || describeAction(node, params, refs) })
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        steps.push({ node: id, kind: node.kind, ok: false, msg: error })
        return { status: "error", steps, error }
      }
    }
    queue.push(...nextOf(graph.edges, id))
  }
  if (waiting.length) {
    // Si hay varias esperas, se sigue en la más próxima con todos los nodos pendientes.
    const at = waiting.map((w) => w.at).sort()[0]
    return { status: "esperando", steps, resume: { at, nodes: waiting.flatMap((w) => w.nodes) } }
  }
  return { status: "ok", steps }
}
