"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/utils/supabase/client"
import { useApp, useBookId } from "@/components/app/app-context"
import { useList } from "@/hooks/use-book-data"
import { useMembers } from "@/features/catalogs/hooks"
import { qk, type Row } from "@/lib/supabase/tables"
import { activeLimit } from "@/lib/automations/limits"
import type { Refs } from "@/lib/automations/types"

export type Automation = Row<"automations">
export type AutomationRun = Row<"automation_runs">

export const useAutomations = () => useList("automations", { order: { column: "created_at", ascending: true } })

/** Últimas ejecuciones (de una automatización o de todas). La clave empieza por la tabla: Realtime la refresca. */
export function useRuns(automationId?: string, limit = 30) {
  const bookId = useBookId()
  return useQuery({
    queryKey: qk(bookId, "automation_runs", automationId ?? "todas", limit),
    queryFn: async () => {
      let q = createClient().from("automation_runs").select("*").eq("book_id", bookId).is("deleted_at", null).order("created_at", { ascending: false }).limit(limit)
      if (automationId) q = q.eq("automation_id", automationId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** Categorías, metas y personas: opciones de los formularios y nombres para los resúmenes. */
export function useRefs() {
  const cats = useList("categories", { order: { column: "sort" } })
  const goals = useList("goals", { order: { column: "created_at" } })
  const members = useMembers()
  return useMemo(() => {
    const refs: Refs = {
      categorias: Object.fromEntries((cats.data ?? []).map((c) => [c.id, c.nombre])),
      metas: Object.fromEntries((goals.data ?? []).map((g) => [g.id, g.nombre])),
      miembros: Object.fromEntries((members.data ?? []).map((m) => [m.id, m.nombre])),
    }
    return {
      refs,
      categorias: (cats.data ?? []).map((c) => ({ value: c.id, label: c.nombre, icon: c.icon })),
      metas: (goals.data ?? []).map((g) => ({ value: g.id, label: g.nombre })),
      miembros: (members.data ?? []).map((m) => ({ value: m.id, label: m.nombre })),
    }
  }, [cats.data, goals.data, members.data])
}

/** Límite de activas del plan y cuántas hay. */
export function useActiveLimit(list: Automation[] | undefined) {
  const { plan } = useApp()
  const limit = activeLimit(plan)
  const activas = (list ?? []).filter((a) => a.activo).length
  return { limit, activas, lleno: limit !== null && activas >= limit }
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
