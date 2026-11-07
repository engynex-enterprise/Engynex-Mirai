"use client"

import { useQuery } from "@/lib/query"
import { createClient } from "@/utils/supabase/client"
import { useApp, useBookId } from "@/components/app/app-context"
import { useList } from "@/hooks/use-book-data"
import type { Option } from "@/components/mirai/combobox"
import type { Row } from "@/lib/supabase/tables"
import { entityIcon } from "@/lib/domain/registros"
import { apiOn } from "@/lib/api/session"
import { readWithFallback } from "@/lib/api/book-tables"
import { fetchBookSettings } from "@/features/settings/prefs"

const GRUPO = { n: "Necesidad", g: "Gusto", a: "Ahorro" } as const

export const useCategories = () => useList("categories", { order: { column: "sort" } })
export const useIncomeCategories = () => useList("income_categories", { order: { column: "sort" } })
export const usePaymentMethods = () => useList("payment_methods", { order: { column: "sort" } })
export const useEntities = () => useList("entities", { order: { column: "nombre" } })
export const useContacts = () => useList("contacts", { order: { column: "nombre" } })
export const useKeywordRules = () => useList("keyword_rules")
export const useProviders = () => useList("providers", { order: { column: "nombre" } })

/** Ajustes del libro (cfg de la v4). */
export function useSettings() {
  const bookId = useBookId()
  return useQuery({
    queryKey: ["b", bookId, "book_settings"],
    // V7-H2: GET /v1/books/:b/settings con el interruptor `books` (apagado: Supabase directo).
    queryFn: () => fetchBookSettings(bookId),
  })
}

/** Integrantes vivos del hogar. V7-H2: GET /v1/households/:h/family con el interruptor `households` (apagado: Supabase). */
export async function fetchMembers(householdId: string): Promise<Row<"family_members">[]> {
  const legacy = async () => {
    const { data, error } = await createClient().from("family_members").select("*").eq("household_id", householdId).is("deleted_at", null).order("sort").order("created_at")
    if (error) throw new Error(error.message)
    return data
  }
  if (!apiOn("households")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await import("@/lib/api/client")
    return unwrap(await browserApi().households.family({ params: { householdId } }))
  }, legacy)
}

/** Cambia el cupo o los datos de dependiente de un integrante. Lanza Error con el mensaje para la persona. */
export async function patchMember(householdId: string, id: string, patch: Partial<Pick<Row<"family_members">, "cupo" | "doc" | "dep_de" | "dep_rel" | "nacimiento" | "estudia" | "sin_ingresos" | "discapacidad">>): Promise<void> {
  if (apiOn("households")) {
    const { browserApi, unwrapData } = await import("@/lib/api/client")
    unwrapData(await browserApi().households.patchFamily({ params: { householdId, familyId: id }, body: patch }))
    return
  }
  const { error } = await createClient().from("family_members").update(patch).eq("id", id)
  if (error) throw new Error(error.message)
}

/** Integrantes de la familia (por hogar). */
export function useMembers() {
  const { household } = useApp()
  return useQuery({
    queryKey: ["h", household.id, "family_members"],
    queryFn: () => fetchMembers(household.id),
  })
}

// ── Opciones para selectores (catOpts, quienOpts, medioOpts, monOpts, contactOpts, entOpts de la v4) ──
export const categoryOptions = (cats: Row<"categories">[] = []): Option[] =>
  cats.map((c) => ({ value: c.id, label: c.nombre, icon: c.icon, hint: GRUPO[c.grupo as keyof typeof GRUPO], group: GRUPO[c.grupo as keyof typeof GRUPO] }))

export const memberOptions = (m: Row<"family_members">[] = []): Option[] => [
  { value: "familia", label: "Toda la familia", icon: "users" },
  ...m.map((x) => ({ value: x.id, label: x.nombre, icon: "user", hint: x.rol })),
]

export const methodOptions = (m: Row<"payment_methods">[] = []): Option[] => m.map((x) => ({ value: x.id, label: x.nombre, icon: x.icon }))

export const CURRENCY_OPTIONS: Option[] = [
  { value: "COP", label: "Pesos (COP)", icon: "banknote" },
  { value: "USD", label: "Dólares (USD)", icon: "dollar-sign" },
  { value: "EUR", label: "Euros (EUR)", icon: "euro" },
]

export const contactOptions = (c: Row<"contacts">[] = []): Option[] =>
  c.map((x) => ({ value: x.id, label: x.nombre, icon: x.tipo === "empresa" ? "building-2" : "user-round", hint: [x.relacion, x.telefono].filter(Boolean).join(" · ") }))

export const entityOptions = (e: Row<"entities">[] = []): Option[] =>
  e.map((x) => ({ value: x.id, label: x.nombre, icon: entityIcon(x.tipo), hint: [x.tipo, x.nit && `NIT ${x.nit}`].filter(Boolean).join(" · ") }))

export const memberName = (id: string | null | undefined, m: Row<"family_members">[] = []) => (id ? (m.find((x) => x.id === id)?.nombre ?? "—") : "Familia")

/** true cuando los catálogos que usan los formularios ya cargaron (para montar el formulario con sus valores por defecto). */
export function useCatalogsReady() {
  const a = useCategories(), b = usePaymentMethods(), c = useMembers(), d = useSettings(), e = useIncomeCategories()
  return [a, b, c, d, e].every((q) => !q.isPending)
}
