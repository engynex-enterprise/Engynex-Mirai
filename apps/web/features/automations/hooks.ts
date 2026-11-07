"use client"

import { useMemo } from "react"
import { useQuery } from "@/lib/query"
import { useApp, useBookId } from "@/components/app/app-context"
import { useList } from "@/hooks/use-book-data"
import { useMembers } from "@/features/catalogs/hooks"
import { qk, type Row } from "@/lib/supabase/tables"
import { activeLimit, runnable } from "@/lib/automations/limits"
import { loadRuns } from "./api"
import type { Refs } from "@/lib/automations/types"

export type Automation = Row<"automations">
export type AutomationRun = Row<"automation_runs">

export const useAutomations = () => useList("automations", { order: { column: "created_at", ascending: true } })

/** Últimas ejecuciones (de una automatización o de todas). La clave empieza por la tabla: Realtime la refresca. */
export function useRuns(automationId?: string, limit = 30) {
  const bookId = useBookId()
  return useQuery({
    queryKey: qk(bookId, "automation_runs", automationId ?? "todas", limit),
    queryFn: () => loadRuns(bookId, automationId, limit),
  })
}

/** Categorías, metas, personas, gastos fijos y tarjetas: opciones de los formularios y nombres para los resúmenes. */
export function useRefs() {
  const cats = useList("categories", { order: { column: "sort" } })
  const goals = useList("goals", { order: { column: "created_at" } })
  const fixed = useList("fixed_expenses", { order: { column: "created_at" } })
  const cards = useList("credit_cards", { order: { column: "created_at" } })
  const members = useMembers()
  return useMemo(() => {
    // Solo las personas con cuenta en Mirai pueden recibir un aviso.
    const conCuenta = (members.data ?? []).filter((m) => m.user_id)
    const refs: Refs = {
      categorias: Object.fromEntries((cats.data ?? []).map((c) => [c.id, c.nombre])),
      metas: Object.fromEntries((goals.data ?? []).map((g) => [g.id, g.nombre])),
      miembros: Object.fromEntries((members.data ?? []).map((m) => [m.id, m.nombre])),
      fijos: Object.fromEntries((fixed.data ?? []).map((f) => [f.id, f.nombre])),
      personas: Object.fromEntries(conCuenta.map((m) => [m.user_id!, m.nombre])),
    }
    return {
      refs,
      categorias: (cats.data ?? []).map((c) => ({ value: c.id, label: c.nombre, icon: c.icon })),
      metas: (goals.data ?? []).map((g) => ({ value: g.id, label: g.nombre })),
      miembros: (members.data ?? []).map((m) => ({ value: m.id, label: m.nombre })),
      fijos: (fixed.data ?? []).map((f) => ({ value: f.id, label: f.nombre })),
      tarjetas: (cards.data ?? []).map((c) => ({ value: c.id, label: c.nombre })),
      personas: conCuenta.map((m) => ({ value: m.user_id!, label: m.nombre })),
    }
  }, [cats.data, goals.data, members.data, fixed.data, cards.data])
}

/** Límite de activas del plan, cuántas hay y cuáles no corren por estar sobre el límite (bajó de plan). */
export function useActiveLimit(list: Automation[] | undefined) {
  const { plan } = useApp()
  const limit = activeLimit(plan)
  const on = (list ?? []).filter((a) => a.activo)
  const corren = new Set(runnable(plan, on).map((a) => a.id))
  return { limit, activas: on.length, lleno: limit !== null && on.length >= limit, plan: plan.nombre, enPausaPorPlan: on.filter((a) => !corren.has(a.id)).map((a) => a.id) }
}

/** Fecha y hora cortas en Colombia: "3 nov, 7:05 a. m.". */
export const fechaHora = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "Nunca"

export const ESTADOS: Record<string, { label: string; tone: "ok" | "bad" | "gray" | "info" }> = {
  ok: { label: "Bien", tone: "ok" },
  error: { label: "Con error", tone: "bad" },
  omitida: { label: "Omitida", tone: "gray" },
  esperando: { label: "Esperando", tone: "info" },
}
