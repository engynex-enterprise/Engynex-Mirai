"use client"

import { parseAsBoolean, parseAsString, useQueryState } from "nuqs"

/** ?nuevo=1 abre el formulario de alta (lo usan el menú Agregar y la tecla N). ?id=… selecciona un registro. */
export function useNewParam() {
  return useQueryState("nuevo", parseAsBoolean.withDefault(false).withOptions({ history: "replace" }))
}
export function useIdParam() {
  return useQueryState("id", parseAsString.withOptions({ history: "replace" }))
}
