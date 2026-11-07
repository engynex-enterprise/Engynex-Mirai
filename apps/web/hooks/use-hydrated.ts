"use client"

import { useSyncExternalStore } from "react"

const noop = () => () => {}

/**
 * false en el servidor y durante la hidratación; true después. Para lo que depende de datos que el servidor no tiene
 * (caché de TanStack, tiempo real): si esos datos llegan antes de que React hidrate esa parte (con la API en el mismo
 * origen pasa seguido), pintarlos en el primer render rompe la hidratación (error #418).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false)
}
