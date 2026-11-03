"use client"

import { createParser, parseAsString, useQueryState } from "nuqs"

/** Acepta ?nuevo=1, ?nuevo=true o ?nuevo=<subtipo> (p. ej. ?nuevo=activo). */
const parseAsFlag = createParser({
  parse: (v) => (v === "" || v === "0" || v === "false" ? null : v),
  serialize: (v: string) => v,
})

/** ?nuevo=… abre el formulario de alta (menú Agregar, tecla N, Puesta en marcha). */
export function useNewParam() {
  const [v, set] = useQueryState("nuevo", parseAsFlag.withOptions({ history: "replace" }))
  return [!!v, (open: boolean) => set(open ? "1" : null), v] as const
}

/** ?id=… selecciona un registro (buscador Ctrl K). */
export function useIdParam() {
  return useQueryState("id", parseAsString.withOptions({ history: "replace" }))
}
