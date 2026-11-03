// Uso de IA del hogar por la API (v6 F2-H-5, interruptor `ai`): GET /v1/books/:b/ai/usage. Misma firma y misma forma
// que la Server Action myAiUsage (./actions.ts); apagado es la acción de siempre.
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import * as actions from "./actions"

export type { MyAiUsage } from "./actions"

export const myAiUsage = viaApiOr<Parameters<typeof actions.myAiUsage>, Awaited<ReturnType<typeof actions.myAiUsage>>>(() => apiOn("ai"), actions.myAiUsage, async () => {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  return unwrap(await browserApi().ai.usage({ params: { bookId: activeBookId() } })) as unknown as actions.MyAiUsage
})
