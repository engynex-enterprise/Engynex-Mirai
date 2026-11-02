"use client"

import { useState } from "react"

/**
 * Llave para montar de nuevo el formulario de una ventana cada vez que se abre (queda limpio), sin limpiarlo al
 * cerrar: mientras se cierra (animación de salida) se sigue viendo lo mismo y no "se vuelve a abrir" vacío.
 * Úsala como `key` del cuerpo del formulario dentro de <ResponsiveDialog>.
 */
export function useOpenKey(open: boolean) {
  const [st, setSt] = useState({ open, n: 0 })
  if (open !== st.open) setSt({ open, n: open ? st.n + 1 : st.n })
  return st.n
}

/** Recuerda el último valor no nulo (p. ej. el registro que se edita) para seguir mostrándolo mientras se cierra. */
export function useLast<T>(value: T | null | undefined) {
  const [last, setLast] = useState<T | null>(value ?? null)
  if (value != null && value !== last) setLast(value)
  return value ?? last
}
