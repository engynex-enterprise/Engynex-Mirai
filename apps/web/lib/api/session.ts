// Sesión de la API en el navegador (v6 F2-H): configuración (origen + interruptores), persona, hogar y libro activo.
// La fija AppContextProvider al renderizar (solo en el navegador: en el servidor de Next no se guarda nada entre
// peticiones). La usan las funciones que no son hooks (features/<x>/api.ts, el chat, los queryFn).
import { API_OFF, type ApiConfig, type ApiModule } from "./modules"
import { viaApi } from "./via"
import { isMiraiAuth } from "@/lib/auth/provider"

export type ApiSession = { cfg: ApiConfig; userId: string; householdId: string; bookId: string }

let current: ApiSession | null = null

/** La llama AppContextProvider en cada render (no hace nada en el servidor). */
export function setApiSession(s: ApiSession) {
  if (typeof window === "undefined") return
  current = s
}

export const apiSession = () => current

/**
 * ¿Este módulo va por la API ahora? (siempre false en el servidor de Next o sin sesión). v7 (V7-H4): con
 * AUTH_PROVIDER=mirai no hay sesión de Supabase en el navegador, así que TODO va por la API (también fuera del shell:
 * invitación, bienvenida), sin importar los interruptores.
 */
export function apiOn(module: ApiModule, detail?: string): boolean {
  if (typeof window === "undefined") return false
  return isMiraiAuth() || viaApi(current?.cfg ?? API_OFF, module, detail)
}

/** Libro activo (la API lo lleva en la ruta; la cookie mirai-book queda solo para el front). */
export function activeBookId(): string {
  if (!current) throw new Error("No hay un libro activo")
  return current.bookId
}

export function activeHouseholdId(): string {
  if (!current) throw new Error("No hay un hogar activo")
  return current.householdId
}
