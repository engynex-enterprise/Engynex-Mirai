"use client"

import { createContext, use } from "react"
import type { AppContext } from "@/lib/dal"
import { can, canEditRow, type Perm } from "@/lib/household/roles"
import { API_OFF, type ApiModule } from "@/lib/api/modules"
import { setApiSession } from "@/lib/api/session"
import { viaApi } from "@/lib/api/via"

const Ctx = createContext<AppContext | null>(null)

export function AppContextProvider({ value, children }: { value: AppContext; children: React.ReactNode }) {
  // Para las funciones que no son hooks (features/<x>/api.ts, chat, consultas): solo en el navegador.
  setApiSession({ cfg: value.api ?? API_OFF, userId: value.user.id, householdId: value.household.id, bookId: value.book.id })
  return <Ctx value={value}>{children}</Ctx>
}

/** Usuario, hogar y libro activo en componentes de cliente. */
export function useApp() {
  const v = use(Ctx)
  if (!v) throw new Error("useApp debe usarse dentro de AppContextProvider")
  return v
}

export const useBookId = () => useApp().book.id
/** ¿Este módulo va por la API para esta persona? (interruptores de lib/api/modules.ts; apagado = lo de siempre). */
export const useViaApi = (module: ApiModule, detail?: string) => viaApi(use(Ctx)?.api ?? API_OFF, module, detail)
/** ¿Puede registrar y editar todos los movimientos? (Dueño, Administra y Colabora). */
export const useCanEdit = () => can(useApp().household.access, "editarTodo")
/** Rol real en el hogar activo. */
export const useAccess = () => useApp().household.access
/** Permiso de la matriz de roles (invitar, ajustes, plan…). */
export const useCan = (p: Perm) => can(useApp().household.access, p)
/** ¿Puede agregar gastos e ingresos? (también "Registra sus gastos", que solo agrega los suyos). */
export const useCanRecord = () => can(useApp().household.access, "registrarPropio")
/** Función para saber si puede editar un registro (los de "Registra sus gastos" solo los que crearon). */
export function useCanEditRow() {
  const { household, user } = useApp()
  return (row: { created_by?: string | null } | null | undefined) => canEditRow(household.access, row, user.id)
}
