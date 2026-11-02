"use client"

import { useCallback, useState } from "react"
import { MarkerType, type Edge, type Node } from "@xyflow/react"
import { CATALOG, summarize } from "@/lib/automations/catalog"
import type { Issue } from "@/lib/automations/schema"
import type { FlowEdge, FlowNode, Graph, NodeData, NodeKind, Refs } from "@/lib/automations/types"

/** Estado del paso en la última prueba: recorrido, rama tomada o error. */
export type RunMark = "ok" | "si" | "no" | "error" | "wait"

export type StepData = { kind: NodeKind; params: NodeData; summary: string; issues: string[]; run?: RunMark; dim?: boolean }
export type StepNode = Node<StepData, "step">

/** JSON con las llaves ordenadas: la base (jsonb) reordena las llaves y no queremos "cambios" falsos. */
export const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0))) : x))

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10))

const EDGE_COLOR = { si: "#3F7A1E", no: "#D0243F", out: "#8A93A6" }

export function edgeView(e: FlowEdge, run?: Set<string>): Edge {
  const color = e.sourceHandle === "si" ? EDGE_COLOR.si : e.sourceHandle === "no" ? EDGE_COLOR.no : EDGE_COLOR.out
  const hot = run?.has(e.id)
  return {
    id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, type: "smoothstep",
    label: e.sourceHandle === "si" ? "Sí" : e.sourceHandle === "no" ? "No" : undefined,
    labelStyle: { fontWeight: 700, fill: color },
    labelBgStyle: { fill: "var(--card)", fillOpacity: 1 },
    labelBgPadding: [6, 3], labelBgBorderRadius: 6,
    animated: !!hot,
    style: { stroke: color, strokeWidth: hot ? 3 : 2, opacity: run && run.size && !hot ? 0.35 : 1 },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
  }
}

export function nodeView(n: FlowNode, refs: Refs, issues: Issue[], selected: string | null, run?: Map<string, RunMark>): StepNode {
  return {
    id: n.id, type: "step", position: n.position, selected: n.id === selected, deletable: true,
    data: { kind: n.kind, params: n.data, summary: summarize(n, refs), issues: issues.filter((i) => i.nodeId === n.id).map((i) => i.msg), run: run?.get(n.id), dim: !!run?.size && !run.has(n.id) },
  }
}

/** Nodo nuevo con los valores iniciales del catálogo. */
export const makeNode = (kind: NodeKind, position: { x: number; y: number }): FlowNode => ({ id: newId(), type: CATALOG[kind].group, kind, data: structuredClone(CATALOG[kind].defaults), position })

export const edgeId = (source: string, target: string, h: "si" | "no" | null | undefined) => `${source}-${h ?? "o"}-${target}`

/** ¿Se puede conectar? Devuelve el motivo si no. */
export function connectProblem(g: Graph, source: string, target: string, handle: string | null | undefined): string | null {
  const s = g.nodes.find((n) => n.id === source), t = g.nodes.find((n) => n.id === target)
  if (!s || !t) return "Ese paso ya no existe"
  if (source === target) return "Un paso no puede conectarse consigo mismo"
  if (t.type === "trigger") return "El disparador siempre es el primer paso: nada puede llegar a él"
  if (g.edges.some((e) => e.source === source && e.target === target && (e.sourceHandle ?? null) === (handle ?? null))) return "Esa conexión ya existe"
  // ¿Formaría un ciclo? (si el destino ya llega al origen)
  const out = new Map<string, string[]>()
  for (const e of g.edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target])
  const stack = [target], seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === source) return "Esa conexión haría un ciclo: un paso volvería a uno anterior"
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(out.get(id) ?? []))
  }
  return null
}

/** Deshacer / rehacer con un historial de grafos. */
export function useGraphHistory(initial: Graph) {
  const [h, setH] = useState({ past: [] as Graph[], present: initial, future: [] as Graph[] })
  /** Cambia el grafo; `record` guarda el estado anterior para Deshacer. */
  const set = useCallback((f: Graph | ((g: Graph) => Graph), record = true) => {
    setH((s) => {
      const next = typeof f === "function" ? f(s.present) : f
      if (next === s.present) return s
      return record ? { past: [...s.past.slice(-49), s.present], present: next, future: [] } : { ...s, present: next }
    })
  }, [])
  /** Guarda el estado actual como punto de Deshacer (antes de arrastrar o editar un paso). */
  const checkpoint = useCallback(() => setH((s) => (s.past.at(-1) === s.present ? s : { past: [...s.past.slice(-49), s.present], present: s.present, future: [] })), [])
  const undo = useCallback(() => setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past.at(-1)!, future: [s.present, ...s.future] } : s)), [])
  const redo = useCallback(() => setH((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), [])
  const reset = useCallback((g: Graph) => setH({ past: [], present: g, future: [] }), [])
  return { graph: h.present, set, checkpoint, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 }
}

/** Orden de lectura (de arriba hacia abajo) para la vista de lista en el celular. */
export function readingOrder(g: Graph): FlowNode[] {
  const t = g.nodes.find((n) => n.type === "trigger")
  const out = new Map<string, FlowEdge[]>()
  for (const e of g.edges) out.set(e.source, [...(out.get(e.source) ?? []), e])
  const seen = new Set<string>(), list: FlowNode[] = []
  const visit = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const n = g.nodes.find((x) => x.id === id)
    if (n) list.push(n)
    for (const e of [...(out.get(id) ?? [])].sort((a, b) => (a.sourceHandle === "no" ? 1 : 0) - (b.sourceHandle === "no" ? 1 : 0))) visit(e.target)
  }
  if (t) visit(t.id)
  for (const n of g.nodes) if (!seen.has(n.id)) list.push(n)
  return list
}
