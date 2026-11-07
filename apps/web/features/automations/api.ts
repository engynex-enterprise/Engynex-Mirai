// Automatizaciones por la API (V7-H3, interruptor `automations`): plantillas por defecto, probar, ejecuciones y el
// runner (POST …/automations/drain). La lista, guardar, borrar y deshacer siguen con useList / useSave / useSoftDelete
// (CRUD genérico del libro, interruptor `book-tables:automations`: mismas reglas de la base, RLS y el trigger
// automation_limit). Misma firma y forma que ./actions.ts; con el interruptor apagado es exactamente la acción de
// siempre y las ejecuciones se leen directo (modo heredado: la única rama con `.from` de esta carpeta, con ./actions.ts
// y el canal de Supabase Realtime de ./runner.tsx).
import type { Row } from "@mirai/db/tables"
import type { Issue } from "@/lib/automations/schema"
import type { Graph } from "@/lib/automations/types"
import { readWithFallback } from "@/lib/api/book-tables"
import { errorMsg, isApiError } from "@/lib/api/errors"
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import { createClient } from "@/utils/supabase/client"
import * as actions from "./actions"
import type { TestResult } from "./actions"

export type { TestResult } from "./actions"

const on = () => apiOn("automations")
const api = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { a: browserApi().automations, unwrap, unwrapData, bookId: activeBookId() }
}

/** Crea las automatizaciones por defecto la primera vez (idempotente). Nunca lanza, como la acción. */
export const ensureDefaultAutomations = viaApiOr(on, actions.ensureDefaultAutomations, async () => {
  try {
    const { a, unwrapData, bookId } = await api()
    return { ok: true, creadas: unwrapData(await a.defaults({ params: { bookId } })).creadas }
  } catch { return { ok: false, creadas: 0 } }
})

type TestIn = { id: string; graph: Graph; monto?: number | null; descripcion?: string | null }

/** «Probar»: simula con datos reales del libro sin cambiar nada (el diagrama del editor, aunque no esté guardado). */
export const testAutomation = viaApiOr<[TestIn], TestResult>(on, ({ graph, monto, descripcion }) => actions.testAutomation({ graph, monto, descripcion }), async ({ id, graph, monto, descripcion }) => {
  try {
    const { a, unwrapData, bookId } = await api()
    const r = unwrapData(await a.test({ params: { bookId, id }, body: { graph: graph as never, monto: monto ?? null, descripcion: descripcion ?? null } }))
    return { ok: true, status: r.status, steps: r.steps as TestResult["steps"], issues: r.issues as Issue[], evento: r.evento }
  } catch (e) {
    const issues = isApiError(e) ? (((e.details as { issues?: Issue[] } | undefined)?.issues) ?? []) : []
    return { ok: false, msg: errorMsg(e), steps: [], issues }
  }
})

/** Procesa ya los eventos pendientes del libro activo (el runner de la app). Nunca lanza. */
export const runPendingAutomations = viaApiOr(on, actions.runPendingAutomations, async () => {
  try {
    const { a, unwrapData, bookId } = await api()
    return { ok: true, n: unwrapData(await a.drain({ params: { bookId } })).procesados }
  } catch { return { ok: false, n: 0 } }
})

/** Últimas ejecuciones (de una automatización o de todas), la más reciente primero. */
export async function loadRuns(bookId: string, automationId: string | undefined, limit: number): Promise<Row<"automation_runs">[]> {
  const legacy = async () => {
    let q = createClient().from("automation_runs").select("*").eq("book_id", bookId).is("deleted_at", null).order("created_at", { ascending: false }).limit(limit)
    if (automationId) q = q.eq("automation_id", automationId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data
  }
  if (!on()) return legacy()
  return readWithFallback(async () => {
    const { a, unwrap } = await api()
    return unwrap(await a.runs({ params: { bookId }, query: { limit, ...(automationId ? { automationId } : {}) } })) as Row<"automation_runs">[]
  }, legacy)
}
