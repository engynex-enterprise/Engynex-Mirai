"use client"

import { createContext, use } from "react"
import type { AppContext } from "@/lib/dal"

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
export const useCanEdit = () => useApp().household.role !== "viewer"
