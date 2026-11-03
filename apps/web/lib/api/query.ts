// Reintentos de TanStack Query para las consultas que van por la API (v6 F2-H-1). Puro: se prueba en query.test.ts.
// El fetcher ya reintenta los cortes de red y los 502/503/504; aquí solo se agrega un reintento más para esos casos y
// NUNCA para los errores que la persona tiene que leer (rol, plan, validación, no existe, límite).
import { isApiError } from "./errors"

const NO_RETRY = new Set(["VALIDATION", "ROLE_DENIED", "PLAN_REQUIRED", "NOT_FOUND", "UNAUTHENTICATED", "RATE_LIMITED", "CONFLICT"])

export function apiRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && NO_RETRY.has(error.code)) return false
  return failureCount < 1
}
