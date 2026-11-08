// Automatizaciones por la API: plantillas por defecto, probar, ejecuciones y el runner (POST …/automations/drain).
// La lista, guardar, borrar y deshacer van con useList / useSave / useSoftDelete (CRUD genérico del libro: mismas
// reglas de la base y el trigger automation_limit).
import type { Row } from "@mirai/db/tables"
import type { Issue } from "@/lib/automations/schema"
import type { Graph } from "@/lib/automations/types"
import { errorMsg, isApiError } from "@/lib/api/errors"
import { activeBookId } from "@/lib/api/session"
import type { TestResult } from "./types"

export type { TestResult } from "./types"

const api = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { a: browserApi().automations, unwrap, unwrapData, bookId: activeBookId() }
}

/** Crea las automatizaciones por defecto la primera vez (idempotente). Nunca lanza. */
export async function ensureDefaultAutomations(): Promise<{ ok: boolean; creadas: number }> {
  try {
    const { a, unwrapData, bookId } = await api()
    return { ok: true, creadas: unwrapData(await a.defaults({ params: { bookId } })).creadas }
  } catch { return { ok: false, creadas: 0 } }
}

type TestIn = { id: string; graph: Graph; monto?: number | null; descripcion?: string | null }

/** «Probar»: simula con datos reales del libro sin cambiar nada (el diagrama del editor, aunque no esté guardado). */
export async function testAutomation({ id, graph, monto, descripcion }: TestIn): Promise<TestResult> {
  try {
    const { a, unwrapData, bookId } = await api()
    const r = unwrapData(await a.test({ params: { bookId, id }, body: { graph: graph as never, monto: monto ?? null, descripcion: descripcion ?? null } }))
    return { ok: true, status: r.status, steps: r.steps as TestResult["steps"], issues: r.issues as Issue[], evento: r.evento }
  } catch (e) {
    const issues = isApiError(e) ? (((e.details as { issues?: Issue[] } | undefined)?.issues) ?? []) : []
    return { ok: false, msg: errorMsg(e), steps: [], issues }
  }
}

/** Procesa ya los eventos pendientes del libro activo (el runner de la app). Nunca lanza. */
export async function runPendingAutomations(): Promise<{ ok: boolean; n: number }> {
  try {
    const { a, unwrapData, bookId } = await api()
    return { ok: true, n: unwrapData(await a.drain({ params: { bookId } })).procesados }
  } catch { return { ok: false, n: 0 } }
}

/** Últimas ejecuciones (de una automatización o de todas), la más reciente primero. */
export async function loadRuns(bookId: string, automationId: string | undefined, limit: number): Promise<Row<"automation_runs">[]> {
  const { a, unwrap } = await api()
  return unwrap(await a.runs({ params: { bookId }, query: { limit, ...(automationId ? { automationId } : {}) } })) as Row<"automation_runs">[]
}
