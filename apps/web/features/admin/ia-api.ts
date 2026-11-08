// Consola › Uso de IA por la API: /v1/admin/ai/*. Cada cambio queda en admin_audit (lo hace la API).
// Por privacidad nunca muestra montos ni movimientos de los hogares (ni el contenido de las preguntas).
import type { z } from "zod"
import type { AdminAiUsage, AiSettingsIn, PriceIn } from "@mirai/ai/server/usage-report"

export type { AdminAiUsage } from "@mirai/ai/server/usage-report"

const client = () => import("@/lib/api/client")

export async function adminAiUsage(dias = 30): Promise<AdminAiUsage> {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().aiAdmin.usage({ query: { dias } })) as unknown as AdminAiUsage
}

export async function adminSaveAiSettings(input: z.input<typeof AiSettingsIn>): Promise<void> {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().aiAdmin.saveSettings({ body: input }))
}

export async function adminSetPlanAiCupo(planId: string, cupo: number | null): Promise<void> {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().aiAdmin.setPlanCupo({ params: { planId }, body: { cupo } }))
}

/** Precio propio de un modelo (US$ por millón de tokens); null lo quita y vuelve al de la tabla. */
export async function adminSetModelPrice(model: string, price: z.input<typeof PriceIn> | null): Promise<void> {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().aiAdmin.setModelPrice({ body: { model, price } }))
}

export async function adminClearAiCache(): Promise<number> {
  const { browserApi, unwrapData } = await client()
  return unwrapData(await browserApi().aiAdmin.clearCache()).borradas
}
