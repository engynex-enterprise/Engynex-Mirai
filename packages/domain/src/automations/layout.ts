// Copia en @mirai/domain (V7-G) de apps/web/lib/automations/layout.ts: la usan las plantillas de la API. Cuando la web
// pase a re-exportar este archivo (V7-H), se borra la de la web. Puro.
// Auto-orden del diagrama: capas de arriba hacia abajo (disparador arriba), la rama "Sí" a la izquierda y la "No"
// a la derecha. Puro: devuelve un grafo nuevo con posiciones.
import type { Graph } from "./types"

export const NODE_W = 260
export const NODE_H = 96

export function autoLayout(g: Graph, gap = { x: 60, y: 80 }): Graph {
  const ids = g.nodes.map((n) => n.id)
  const out = new Map<string, { t: string; h: number }[]>()
  const indeg = new Map(ids.map((id) => [id, 0]))
  for (const e of g.edges) {
    if (!indeg.has(e.source) || !indeg.has(e.target) || e.source === e.target) continue
    out.set(e.source, [...(out.get(e.source) ?? []), { t: e.target, h: e.sourceHandle === "no" ? 2 : e.sourceHandle === "si" ? 0 : 1 }])
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  }
  // Capa = camino más largo desde una raíz (orden topológico de Kahn; si hay ciclo, los restantes van al final).
  const level = new Map<string, number>()
  const deg = new Map(indeg)
  const roots = g.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).sort((a, b) => (a.type === "trigger" ? -1 : b.type === "trigger" ? 1 : 0))
  const queue = roots.map((n) => n.id)
  roots.forEach((n) => level.set(n.id, 0))
  while (queue.length) {
    const id = queue.shift()!
    for (const { t } of out.get(id) ?? []) {
      level.set(t, Math.max(level.get(t) ?? 0, (level.get(id) ?? 0) + 1))
      deg.set(t, (deg.get(t) ?? 0) - 1)
      if (deg.get(t) === 0) queue.push(t)
    }
  }
  const maxL = Math.max(0, ...level.values())
  for (const id of ids) if (!level.has(id)) level.set(id, maxL + 1)
  // Orden dentro de cada capa: según el orden del padre y la rama (Sí, normal, No).
  const order = new Map<string, number>()
  const layers: string[][] = []
  for (const id of ids) (layers[level.get(id)!] ??= []).push(id)
  layers.forEach((layer, li) => {
    const key = (id: string) => {
      if (li === 0) return ids.indexOf(id)
      let best = Infinity
      for (const [src, list] of out) for (const x of list) if (x.t === id && level.get(src) === li - 1) best = Math.min(best, (order.get(src) ?? 0) * 3 + x.h)
      return best === Infinity ? 1e6 + ids.indexOf(id) : best
    }
    layer.sort((a, b) => key(a) - key(b))
    layer.forEach((id, i) => order.set(id, i))
  })
  const pos = new Map<string, { x: number; y: number }>()
  layers.forEach((layer, li) => {
    const w = layer.length * NODE_W + (layer.length - 1) * gap.x
    layer.forEach((id, i) => pos.set(id, { x: Math.round(-w / 2 + i * (NODE_W + gap.x)), y: li * (NODE_H + gap.y) }))
  })
  return { nodes: g.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })), edges: g.edges }
}
