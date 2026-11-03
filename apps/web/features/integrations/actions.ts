"use server"

import "@/lib/services"
import { requireRole } from "@/lib/dal"
import { listAiModels, testAiIntegration, type ModelList } from "@mirai/ai/server/integrations-ai"
import { deleteHouseholdIntegration, saveHouseholdIntegration, toggleHouseholdIntegration } from "./household"

/** Guarda la configuración (los secretos vacíos conservan los guardados) y la activa. */
export async function saveIntegration(kind: string, values: Record<string, string | number | boolean>, enabled = true) {
  const ctx = await requireRole("admin")
  await saveHouseholdIntegration({ householdId: ctx.household.id, userId: ctx.user.id, kind, values, enabled })
}

export async function toggleIntegration(kind: string, enabled: boolean) {
  const ctx = await requireRole("admin")
  await toggleHouseholdIntegration({ householdId: ctx.household.id, userId: ctx.user.id, planId: ctx.plan.id, kind, enabled })
}

export async function deleteIntegration(kind: string) {
  const ctx = await requireRole("admin")
  await deleteHouseholdIntegration({ householdId: ctx.household.id, kind })
}

/** Prueba la conexión de un proveedor de IA del hogar. Devuelve un mensaje para el usuario (@mirai/ai/server/integrations-ai). */
export async function testIntegration(kind: string): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requireRole("editor")
  return testAiIntegration(ctx, kind)
}

/**
 * Modelos de chat que la cuenta puede usar, leídos de la API del proveedor. Usa la clave recién escrita
 * o, si está vacía, la guardada (o la del despliegue para el AI Gateway).
 */
export async function listModels(kind: string, apiKey?: string): Promise<ModelList> {
  const ctx = await requireRole("admin")
  return listAiModels(ctx, kind, apiKey)
}
