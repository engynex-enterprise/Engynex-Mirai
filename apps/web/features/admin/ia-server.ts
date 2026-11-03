"use server"

import "@/lib/services"
import type { z } from "zod"
import { requirePlatformAdmin } from "@/lib/dal"
import { adminAiUsageReport, clearAiCache, saveAiSettings, setModelPrice, setPlanAiCupo, type AiSettingsIn, type PriceIn } from "@mirai/ai/server/usage-report"

// Consola › Uso de IA. Métricas de toda la plataforma: llamadas, tokens y costo. Por privacidad nunca muestra
// montos ni movimientos de los hogares (ni el contenido de las preguntas: ai_usage no lo guarda).
// Los casos de uso viven en packages/ai (@mirai/ai/server/usage-report), los mismos de la API (/v1/admin/ai/*).

export async function adminAiUsage(dias = 30) {
  await requirePlatformAdmin()
  return adminAiUsageReport(dias)
}
export type AdminAiUsage = Awaited<ReturnType<typeof adminAiUsage>>

export async function adminSaveAiSettings(input: z.input<typeof AiSettingsIn>) {
  const ctx = await requirePlatformAdmin()
  await saveAiSettings(ctx.user.id, input)
}

export async function adminSetPlanAiCupo(planId: string, cupo: number | null) {
  const ctx = await requirePlatformAdmin()
  await setPlanAiCupo(ctx.user.id, planId, cupo)
}

/** Precio propio de un modelo (US$ por millón de tokens); null lo quita y vuelve al de la tabla. */
export async function adminSetModelPrice(model: string, price: z.input<typeof PriceIn> | null) {
  const ctx = await requirePlatformAdmin()
  await setModelPrice(ctx.user.id, model, price)
}

export async function adminClearAiCache() {
  const ctx = await requirePlatformAdmin()
  return clearAiCache(ctx.user.id)
}
