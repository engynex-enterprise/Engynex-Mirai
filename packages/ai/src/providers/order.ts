// Orden de respaldo de los proveedores de IA. Puro (sin red ni base) para probarlo.
import { ALL_AI_KINDS, integrationByKind } from "@mirai/services/integrations/registry"

/** AI_PLATFORM_PROVIDER → kind del registro. */
export const PLATFORM_PROVIDERS: Record<string, string> = {
  vertex: "ai_vertex",
  bedrock: "ai_bedrock",
  azure: "ai_azure",
  gateway: "ai_gateway",
}

/**
 * Orden de los proveedores para un hogar:
 * 1. Si el hogar guardó su orden (book_settings.ia.orden), ese va primero, tal cual (hoy solo ordena los que ve).
 * 2. Después, el resto en el orden base:
 *    - AI_PLATFORM_PROVIDER vacío (o desconocido): el del registro (Gateway, Vertex, Bedrock, Azure, Gemini…), como hoy.
 *    - vertex | bedrock | azure | gateway: ese proveedor de la plataforma primero y luego el registro.
 *    - none: ningún proveedor de la plataforma va primero: las claves del hogar y luego los de la plataforma.
 * Solo se intentan los que estén activos y listos (model.ts › aiCandidates).
 */
export function aiKindOrder(orden: string[] | undefined, platform?: string | null): string[] {
  const p = (platform ?? "").trim().toLowerCase()
  const first = PLATFORM_PROVIDERS[p] ?? (ALL_AI_KINDS.includes(p) ? p : undefined)
  const isPlatform = (k: string) => integrationByKind(k)?.scope === "platform"
  const base = p === "none"
    ? [...ALL_AI_KINDS.filter((k) => !isPlatform(k)), ...ALL_AI_KINDS.filter(isPlatform)]
    : first ? [first, ...ALL_AI_KINDS.filter((k) => k !== first)] : ALL_AI_KINDS
  return [...new Set([...(orden ?? []), ...base])].filter((k) => ALL_AI_KINDS.includes(k))
}
