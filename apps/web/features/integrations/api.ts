// Integraciones del hogar por la API: PUT/PATCH/DELETE /v1/books/:b/integrations/:kind y, para probar y listar
// modelos, POST …/integrations/:kind/{test,models}.
import type { ModelList } from "@mirai/ai/server/integrations-ai"
import { failure } from "@/lib/api/errors"
import { activeBookId } from "@/lib/api/session"

const api = async (kind: string) => {
  const { browserApi, unwrapData } = await import("@/lib/api/client")
  return { api: browserApi(), unwrapData, params: { bookId: activeBookId(), kind } }
}

export async function saveIntegration(kind: string, values: Record<string, string | number | boolean>, enabled = true): Promise<void> {
  const { api: a, unwrapData, params } = await api(kind)
  unwrapData(await a.integrations.save({ params, body: { values, enabled } }))
}

export async function toggleIntegration(kind: string, enabled: boolean): Promise<void> {
  const { api: a, unwrapData, params } = await api(kind)
  unwrapData(await a.integrations.toggle({ params, body: { enabled } }))
}

export async function deleteIntegration(kind: string): Promise<void> {
  const { api: a, unwrapData, params } = await api(kind)
  unwrapData(await a.integrations.remove({ params }))
}

/** El resultado de la prueba viene en `data` ({ ok, msg }); un error de la API (rol, plan…) es `{ ok:false, msg }`. */
export async function testIntegration(kind: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const { api: a, unwrapData, params } = await api(kind)
    return unwrapData(await a.ai.integrationTest({ params }))
  } catch (e) { return failure(e) }
}

export async function listModels(kind: string, apiKey?: string): Promise<ModelList> {
  try {
    const { api: a, unwrapData, params } = await api(kind)
    return { ok: true, ...unwrapData(await a.ai.integrationModels({ params, body: { apiKey } })) }
  } catch (e) { return { ...failure(e), models: [] } }
}
