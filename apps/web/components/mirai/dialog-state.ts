"use client"

import { useCallback, useState } from "react"

/**
 * Estado de ventanas sin "parpadeos": el formulario arranca limpio cada vez que se abre y, mientras se cierra
 * (animación de salida), sigue mostrando lo mismo en vez de quedar vacío o "volver a abrirse".
 * Compleméntalo con <ResponsiveDialog>, que ya conserva su último contenido al cerrar.
 */

/** Llave para montar de nuevo el cuerpo del formulario cada vez que la ventana se abre. Úsala como `key`. */
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

/**
 * Ventana que abre un registro: `show(fila)` la abre con una `key` nueva y `close()` la cierra sin borrar la fila,
 * así el contenido no cambia durante la animación de salida.
 */
export function useDialogTarget<T>() {
  const [s, setS] = useState<{ value: T | null; open: boolean; key: number }>({ value: null, open: false, key: 0 })
  const show = useCallback((value: T) => setS((x) => ({ value, open: true, key: x.key + 1 })), [])
  const close = useCallback(() => setS((x) => ({ ...x, open: false })), [])
  return { value: s.value, open: s.open, key: s.key, show, close, onOpenChange: (o: boolean) => { if (!o) close() } }
}
