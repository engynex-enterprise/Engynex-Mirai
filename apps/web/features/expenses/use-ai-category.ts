"use client"

import { useEffect, useRef, useState } from "react"
import { useList } from "@/hooks/use-book-data"
import { useSettings } from "@/features/catalogs/hooks"
import { classifyExpenses } from "@/features/ai/actions"

type Hit = { category_id: string | null; hormiga: boolean | null; razon: string }
const keyOf = (desc: string, valor: number) => `${desc.trim().toLowerCase()}|${Math.round(valor / 1000)}`

/**
 * La IA decide siempre la categoría (como en el gasto): 750 ms después de escribir pregunta a `classifyExpenses` con
 * lo local (reglas, historial, palabras) como "categoría probable", guarda la respuesta por texto y no cambia nada si
 * la persona ya eligió la categoría a mano o si el texto cambió mientras respondía. Con la IA apagada (o en el plan
 * Gratis) `classifyExpenses` devuelve null y queda la categoría local.
 */
export function useAICategory({ manual, onCategory }: { manual: boolean; onCategory: (id: string) => void }) {
  const { data: cfg } = useSettings()
  const { data: history = [] } = useList("expenses", { order: { column: "created_at" } })
  const [busy, setBusy] = useState(false)
  const [fromAI, setFromAI] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cache = useRef(new Map<string, Hit>())
  const last = useRef("")
  // La respuesta llega después: si mientras tanto la persona escogió la categoría, se respeta la suya.
  const manualRef = useRef(manual)
  useEffect(() => { manualRef.current = manual }, [manual])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const ia = (cfg?.ia ?? {}) as { on?: boolean; autocat?: boolean }

  const ask = (desc: string, valor = 0) => {
    last.current = desc
    setFromAI(false)
    if (timer.current) clearTimeout(timer.current)
    if (ia.on === false || ia.autocat === false || manualRef.current || desc.trim().length < 3) return
    timer.current = setTimeout(async () => {
      const key = keyOf(desc, valor)
      let r = cache.current.get(key)
      if (!r) {
        setBusy(true)
        const t = desc.trim().toLowerCase()
        const veces = history.filter((g) => (g.descripcion ?? "").trim().toLowerCase() === t).length
        const out = await classifyExpenses([{ i: 0, descripcion: desc, valor: Math.round(valor), veces_mes: veces }]).catch(() => null)
        setBusy(false)
        if (!out?.[0]) return
        r = out[0]; cache.current.set(key, r)
      }
      if (last.current !== desc || manualRef.current || !r.category_id) return
      onCategory(r.category_id)
      setFromAI(true)
    }, 750)
  }
  /** Texto de ayuda bajo el campo Categoría. */
  const hint = busy ? "Categorizando con IA…" : fromAI && !manual ? "Categoría sugerida por IA. Puedes cambiarla." : undefined
  return { ask, busy, fromAI, hint }
}

/** Categoriza en lote (importar, correo): la IA decide la categoría de cada fila; null si la IA está apagada. */
export async function classifyBatch(items: { descripcion: string; valor: number }[], history: { descripcion: string | null }[] = []) {
  if (!items.length) return null
  const count = new Map<string, number>()
  for (const g of history) { const t = (g.descripcion ?? "").trim().toLowerCase(); if (t) count.set(t, (count.get(t) ?? 0) + 1) }
  const all = items.map((x, i) => ({ i, descripcion: x.descripcion ?? "", valor: Math.round(x.valor), veces_mes: count.get((x.descripcion ?? "").trim().toLowerCase()) ?? 0 }))
  // classifyExpenses atiende hasta 60 por llamada.
  const out: NonNullable<Awaited<ReturnType<typeof classifyExpenses>>> = []
  for (let k = 0; k < all.length; k += 60) {
    const r = await classifyExpenses(all.slice(k, k + 60)).catch(() => null)
    if (!r) return k ? out : null
    out.push(...r)
  }
  return out
}
