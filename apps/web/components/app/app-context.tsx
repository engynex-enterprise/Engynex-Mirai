"use client"

import { createContext, use } from "react"
import type { AppContext } from "@/lib/dal"
import { can, canEditRow, type Perm } from "@/lib/household/roles"

const Ctx = createContext<AppContext | null>(null)

export function AppContextProvider({ value, children }: { value: AppContext; children: React.ReactNode }) {
  return <Ctx value={value}>{children}</Ctx>
}

/** Usuario, hogar y libro activo en componentes de cliente. */
export function useApp() {
  const v = use(Ctx)
  if (!v) throw new Error("useApp debe usarse dentro de AppContextProvider")
  return v
}

export const useBookId = () => useApp().book.id
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
