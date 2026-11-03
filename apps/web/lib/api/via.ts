// ¿Esta llamada va por la API? (v6 F2-H). Puro: se prueba en via.test.ts.
// En el navegador lo decide la configuración que mandó el servidor (AppContext.api); en el servidor de Next se lee con
// getApiConfig() de ./rollout (server-only).
import { flagOn } from "@mirai/contracts/rollout"
import type { ApiConfig, ApiModule } from "./modules"

/** ¿El módulo (o `módulo:detalle`) va por la API? Sin URL de la API, nunca. */
export function viaApi(cfg: ApiConfig | null | undefined, module: ApiModule, detail?: string): boolean {
  return !!cfg?.url && flagOn(cfg.flags, module, detail)
}

/**
 * Envuelve una Server Action: con el interruptor apagado llama a la acción (lo de hoy); encendido, a `api` (misma
 * firma y misma forma de respuesta). `on()` se evalúa en cada llamada.
 */
export function viaApiOr<A extends unknown[], R>(on: () => boolean, action: (...a: A) => Promise<R>, api: (...a: A) => Promise<R>): (...a: A) => Promise<R> {
  return (...a: A) => (on() ? api(...a) : action(...a))
}
