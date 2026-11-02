// Cómo se combina la integración de un hogar con la global de la plataforma. Puro, para probarlo.

export type GlobalMode = "apagada" | "opcional" | "por_defecto" | "obligatoria"
export const MODES: { value: GlobalMode; label: string; desc: string }[] = [
  { value: "apagada", label: "Apagada", desc: "La plataforma no la ofrece. Cada hogar usa la suya si la configura." },
  { value: "opcional", label: "Opcional", desc: "Cada hogar puede elegir usar la de Mirai con un clic, sin configurar nada." },
  { value: "por_defecto", label: "Activa por defecto", desc: "Todos la tienen activa sin hacer nada; cada hogar puede apagarla o usar la suya." },
  { value: "obligatoria", label: "Obligatoria", desc: "Todos usan la de Mirai y no la pueden apagar ni reemplazar." },
]

type Own = { enabled: boolean; config: Record<string, unknown> } | null
type Global = { modo: GlobalMode; planes: string[] } | null

/** Marca que guarda el hogar cuando elige usar la integración de la plataforma (modo opcional). */
export const USE_PLATFORM = "usa_plataforma"

/**
 * Fuente efectiva: "plataforma" (la global), "hogar" (la propia), "env" (variable de entorno del despliegue) o null.
 * Un hogar con su propia configuración activa la usa, salvo que la global sea obligatoria.
 */
export function resolveIntegration({ own, global, plan, envReady }: { own: Own; global: Global; plan: string; envReady?: boolean }): { source: "plataforma" | "hogar" | "env"; locked: boolean } | null {
  const applies = !!global && global.modo !== "apagada" && (!global.planes.length || global.planes.includes(plan))
  if (applies && global!.modo === "obligatoria") return { source: "plataforma", locked: true }
  const usesPlatform = own?.config?.[USE_PLATFORM] === true
  if (own && !own.enabled) return null                                     // el hogar la apagó
  if (own && own.enabled && !usesPlatform) return { source: "hogar", locked: false }
  if (applies && (global!.modo === "por_defecto" || usesPlatform)) return { source: "plataforma", locked: false }
  if (envReady) return { source: "env", locked: false }
  return null
}

/** Modos de las integraciones que solo administra Mirai (todo menos la IA): apagada o activa. */
export const ADMIN_MODES: { value: GlobalMode; label: string; desc: string }[] = [
  { value: "apagada", label: "Apagada", desc: "Mirai no la usa." },
  { value: "obligatoria", label: "Activa", desc: "Mirai la usa para todos los hogares de los planes elegidos." },
]

/**
 * Integraciones que solo configura el administrador (correo, WhatsApp, Telegram, push, datos, Google, infraestructura):
 * la configuración del hogar se ignora (no se borra). Sin fila global se usa la variable de entorno o, si no pide datos
 * obligatorios, queda disponible (TRM, festivos…). Con fila global: apagada = no se usa; activa = solo en los planes elegidos.
 */
export function resolvePlatformOnly({ global, plan, envReady, keyless }: { global: Global; plan: string; envReady?: boolean; keyless?: boolean }): { source: "plataforma" | "env"; locked: true } | null {
  if (global) {
    if (global.modo === "apagada" || (global.planes.length && !global.planes.includes(plan))) return null
    return { source: "plataforma", locked: true }
  }
  if (envReady) return { source: "env", locked: true }
  if (keyless) return { source: "plataforma", locked: true }
  return null
}
