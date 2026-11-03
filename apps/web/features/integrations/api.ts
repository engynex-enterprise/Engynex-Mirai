// Integraciones del hogar por la API (v6 F2-H-5, interruptor `integrations`): PUT/PATCH/DELETE
// /v1/books/:b/integrations/:kind y, para probar y listar modelos, POST …/integrations/:kind/{test,models}.
// Misma firma y misma forma que las Server Actions de ./actions.ts; con el interruptor apagado son exactamente esas.
import type { ModelList } from "@mirai/ai/server/integrations-ai"
import { failure } from "@/lib/api/errors"
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import * as actions from "./actions"

const on = () => apiOn("integrations")
const api = async (kind: string) => {
  const { browserApi, unwrapData } = await import("@/lib/api/client")
  return { api: browserApi(), unwrapData, params: { bookId: activeBookId(), kind } }
}

export const saveIntegration = viaApiOr(on, actions.saveIntegration, async (kind, values, enabled = true) => {
  const { api: a, unwrapData, params } = await api(kind)
  unwrapData(await a.integrations.save({ params, body: { values, enabled } }))
})

export const toggleIntegration = viaApiOr(on, actions.toggleIntegration, async (kind, enabled) => {
  const { api: a, unwrapData, params } = await api(kind)
  unwrapData(await a.integrations.toggle({ params, body: { enabled } }))
})

export const deleteIntegration = viaApiOr(on, actions.deleteIntegration, async (kind) => {
  const { api: a, unwrapData, params } = await api(kind)
  unwrapData(await a.integrations.remove({ params }))
})

/** El resultado de la prueba viene en `data` ({ ok, msg }); un error de la API (rol, plan…) es `{ ok:false, msg }`. */
export const testIntegration = viaApiOr(on, actions.testIntegration, async (kind) => {
  try {
    const { api: a, unwrapData, params } = await api(kind)
    return unwrapData(await a.ai.integrationTest({ params }))
  } catch (e) { return failure(e) }
})

export const listModels = viaApiOr(on, actions.listModels, async (kind: string, apiKey?: string): Promise<ModelList> => {
  try {
    const { api: a, unwrapData, params } = await api(kind)
    return { ok: true, ...unwrapData(await a.ai.integrationModels({ params, body: { apiKey } })) }
  } catch (e) { return { ...failure(e), models: [] } }
})
