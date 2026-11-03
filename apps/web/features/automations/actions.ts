"use server"

import { z } from "zod"
import { getAppContext } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { todayBogota } from "@/lib/domain/dates"
import { runGraph } from "@/lib/automations/engine"
import { sampleEvent } from "@/lib/automations/detect"
import { GraphSchema, triggerOf, validateGraph, type Issue } from "@/lib/automations/schema"
import { DEFAULT_TEMPLATES, automationFromTemplate } from "@/lib/automations/templates"
import { loadCtx, processBook } from "@/lib/automations/server"
import type { Graph, StepResult } from "@/lib/automations/types"

/**
 * Crea las automatizaciones por defecto del libro activo la primera vez (idempotente: única por libro y plantilla,
 * aunque después se borren no vuelven a aparecer). Si el plan no deja activar más, se crean pausadas.
 */
export async function ensureDefaultAutomations(): Promise<{ ok: boolean; creadas: number }> {
  try {
    const ctx = await getAppContext()
    if (ctx.household.role === "viewer") return { ok: true, creadas: 0 }
    const sb = await supabaseServer()
    const { data: ya } = await sb.from("automations").select("plantilla").eq("book_id", ctx.book.id).not("plantilla", "is", null)
    const have = new Set((ya ?? []).map((r) => r.plantilla))
    let creadas = 0
    for (const t of DEFAULT_TEMPLATES.filter((t) => !have.has(t.key))) {
      const row = { ...automationFromTemplate(t, { asDefault: true }), book_id: ctx.book.id }
      let { error } = await sb.from("automations").upsert(row as never, { onConflict: "book_id,plantilla", ignoreDuplicates: true })
      if (error && row.activo) ({ error } = await sb.from("automations").upsert({ ...row, activo: false } as never, { onConflict: "book_id,plantilla", ignoreDuplicates: true }))
      if (!error) creadas++
    }
    return { ok: true, creadas }
  } catch { return { ok: false, creadas: 0 } }
}

const TestInput = z.object({
  graph: GraphSchema,
  monto: z.number().min(0).max(1e12).nullish(),
  descripcion: z.string().max(120).nullish(),
})

export type TestResult = { ok: boolean; msg?: string; status?: string; steps: StepResult[]; evento?: { descripcion: string; monto: number | null; fecha: string }; issues: Issue[] }

/** "Probar": simula la automatización con datos reales del libro (o los que escribas) sin cambiar nada. */
export async function testAutomation(input: { graph: Graph; monto?: number | null; descripcion?: string | null }): Promise<TestResult> {
  const parsed = TestInput.safeParse(input)
  if (!parsed.success) return { ok: false, msg: "El diagrama tiene datos que no se pueden leer.", steps: [], issues: [] }
  try {
    const app = await getAppContext()
    const graph = parsed.data.graph as Graph
    const issues = validateGraph(graph).issues
    const trigger = triggerOf(graph)
    if (!trigger) return { ok: false, msg: "Agrega un disparador para poder probar.", steps: [], issues }
    const ctx = await loadCtx(app.book.id)
    const hoy = todayBogota()
    const ev = sampleEvent(trigger, ctx.book, hoy, ctx.extras)
    if (parsed.data.monto != null) ev.data.monto = parsed.data.monto
    if (parsed.data.descripcion) ev.data.descripcion = parsed.data.descripcion
    const r = await runGraph(graph, ev, { dryRun: true, refs: ctx.refs, validate: false })
    return {
      ok: true, status: r.status, steps: r.steps, issues,
      evento: { descripcion: String(ev.data.descripcion ?? ""), monto: ev.data.monto === undefined ? null : Number(ev.data.monto), fecha: String(ev.data.fecha ?? hoy) },
    }
  } catch (e) { return { ok: false, msg: (e as Error).message, steps: [], issues: [] } }
}

/** Procesa al instante los eventos pendientes del libro activo (lo llama la app al registrar un movimiento). */
export async function runPendingAutomations(): Promise<{ ok: boolean; n: number }> {
  try {
    const ctx = await getAppContext()
    const out = await processBook(ctx.book.id, { state: true })
    return { ok: true, n: out.length }
  } catch { return { ok: false, n: 0 } }
}
