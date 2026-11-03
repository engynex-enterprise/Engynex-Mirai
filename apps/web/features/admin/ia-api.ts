// Consola › Uso de IA por la API (v6 F2-H-5, interruptor `admin`): /v1/admin/ai/*. Misma firma y misma forma que las
// Server Actions de ./ia-server.ts; apagado son las de siempre. Cada cambio queda en admin_audit (lo hace la API).
import { apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import * as actions from "./ia-server"

export type { AdminAiUsage } from "./ia-server"

const on = () => apiOn("admin")
/** viaApiOr con la forma de la respuesta fijada por la acción (la versión de la API tiene que devolver lo mismo). */
const wrap = <A extends unknown[], R>(action: (...a: A) => Promise<R>, api: (...a: A) => Promise<NoInfer<R>>) => viaApiOr(on, action, api)
const client = () => import("@/lib/api/client")

export const adminAiUsage = wrap(actions.adminAiUsage, async (dias = 30) => {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().aiAdmin.usage({ query: { dias } })) as unknown as actions.AdminAiUsage
})

export const adminSaveAiSettings = wrap(actions.adminSaveAiSettings, async (input) => {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().aiAdmin.saveSettings({ body: input }))
})

export const adminSetPlanAiCupo = wrap(actions.adminSetPlanAiCupo, async (planId, cupo) => {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().aiAdmin.setPlanCupo({ params: { planId }, body: { cupo } }))
})

export const adminSetModelPrice = wrap(actions.adminSetModelPrice, async (model, price) => {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().aiAdmin.setModelPrice({ body: { model, price } }))
})

export const adminClearAiCache = wrap(actions.adminClearAiCache, async () => {
  const { browserApi, unwrapData } = await client()
  return unwrapData(await browserApi().aiAdmin.clearCache()).borradas
})
