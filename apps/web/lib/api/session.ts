// Sesión de la API en el navegador: persona, hogar y libro activo. La fija AppContextProvider al renderizar (solo en el
// navegador: en el servidor de Next no se guarda nada entre peticiones). La usan las funciones que no son hooks
// (features/<x>/api.ts, el chat, los queryFn).

export type ApiSession = { userId: string; householdId: string; bookId: string }

let current: ApiSession | null = null

/** La llama AppContextProvider en cada render (no hace nada en el servidor). */
export function setApiSession(s: ApiSession) {
  if (typeof window === "undefined") return
  current = s
}

export const apiSession = () => current

/** Libro activo (la API lo lleva en la ruta; la cookie mirai-book queda solo para el front). */
export function activeBookId(): string {
  if (!current) throw new Error("No hay un libro activo")
  return current.bookId
}

export function activeHouseholdId(): string {
  if (!current) throw new Error("No hay un hogar activo")
  return current.householdId
}
