"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/mirai/toast"
import { createClient } from "@/utils/supabase/client"
import { useBookId } from "@/components/app/app-context"
import { qk, type BookTable, type Insert, type Row, type Update } from "@/lib/supabase/tables"
import { BOOK_PART_NAMES, partsForTable } from "@/lib/book-data"
import { bookPartKey } from "@/features/book/use-book-data"
import type { QueryClient } from "@tanstack/react-query"

/**
 * Consultas derivadas (leen varias tablas) y de qué tablas dependen. Antes cualquier cambio del libro las
 * recargaba todas (y el libro completo: 16 consultas); ahora solo las que leen la tabla que cambió.
 */
const PARTS = new Set<string>(BOOK_PART_NAMES)
const CHILDREN = ["fixed_expense_payments", "loan_payments", "card_purchases"]
const DERIVED_DEPS: Record<string, (t: string) => boolean> = {
  "setup-progress": (t) => ["book_settings", "incomes", "fixed_expenses", "expenses", "goals", "assets", "loans", "categories", "profiles"].includes(t),
  "search-index": (t) => ["contacts", "loans", "fixed_expenses", "entities"].includes(t),
  // La renta lee el libro completo (loadBookData) y sus tablas propias.
  renta: (t) => PARTS.has(t) || CHILDREN.includes(t) || ["income_categories", "tax_assets", "tax_years", "attachments", "family_members"].includes(t),
}

/** Claves a refrescar cuando cambia una tabla: la tabla, las partes del libro que la incluyen y las derivadas que la leen. */
export function keysForTable(bookId: string, table: string) {
  const keys: (readonly unknown[])[] = [qk(bookId, table)]
  for (const p of partsForTable(table)) keys.push(bookPartKey(bookId, p))
  for (const [k, uses] of Object.entries(DERIVED_DEPS)) if (uses(table)) keys.push(qk(bookId, k))
  return keys
}

// Varias llamadas seguidas (p. ej. guardar una meta invalida 5 tablas) se agrupan en una sola pasada al final de
// la tarea actual: cada clave se invalida una vez y una consulta en curso no se cancela y relanza varias veces.
const pending = new Map<QueryClient, Map<string, Set<string>>>()
function flush(qc: QueryClient) {
  const byBook = pending.get(qc)
  pending.delete(qc)
  if (!byBook) return
  for (const [bookId, tables] of byBook) {
    const seen = new Set<string>()
    for (const t of tables) for (const key of keysForTable(bookId, t)) {
      const id = JSON.stringify(key)
      if (seen.has(id)) continue
      seen.add(id)
      void qc.invalidateQueries({ queryKey: key })
    }
  }
}

/** Refresca una tabla del libro y solo las consultas derivadas que dependen de ella. */
export function invalidateBook(qc: QueryClient, bookId: string, table: string) {
  let byBook = pending.get(qc)
  if (!byBook) {
    byBook = new Map()
    pending.set(qc, byBook)
    queueMicrotask(() => flush(qc))
  }
  if (!byBook.has(bookId)) byBook.set(bookId, new Set())
  byBook.get(bookId)!.add(table)
}

// Registros que este navegador acaba de escribir: Realtime devuelve el mismo cambio unos milisegundos después y
// volver a pedir la tabla sería trabajo doble (useSave/useSoftDelete ya la refrescan al terminar).
const LOCAL_ECHO_MS = 3_000
const localWrites = new Map<string, number>()
export function markLocalWrite(table: string, id: string) {
  const now = Date.now()
  localWrites.set(`${table}:${id}`, now)
  if (localWrites.size > 200) for (const [k, at] of localWrites) if (now - at > LOCAL_ECHO_MS) localWrites.delete(k)
}
/** ¿El cambio que avisa Realtime lo hizo este mismo navegador hace un momento? */
export function isLocalEcho(table: string, id: string | undefined) {
  if (!id) return false
  const at = localWrites.get(`${table}:${id}`)
  return at !== undefined && Date.now() - at < LOCAL_ECHO_MS
}

type ListOpts<T extends BookTable> = {
  order?: { column: keyof Row<T> & string; ascending?: boolean }
  /** Filtros de igualdad adicionales */
  eq?: Partial<Record<keyof Row<T> & string, string | number | boolean | null>>
  select?: string
  enabled?: boolean
}

/** Lista los registros vivos (sin borrar) de una tabla del libro activo. */
export function useList<T extends BookTable>(table: T, opts: ListOpts<T> = {}) {
  const bookId = useBookId()
  return useQuery({
    queryKey: qk(bookId, table, opts.eq ?? null, opts.order ?? null),
    enabled: opts.enabled ?? true,
    queryFn: async ({ signal }) => {
      let q = createClient().from(table).select(opts.select ?? "*").eq("book_id" as never, bookId as never).is("deleted_at" as never, null).abortSignal(signal)
      for (const [k, v] of Object.entries(opts.eq ?? {})) q = v === null ? q.is(k as never, null) : q.eq(k as never, v as never)
      if (opts.order) q = q.order(opts.order.column as never, { ascending: opts.order.ascending ?? true })
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data as unknown as Row<T>[]
    },
  })
}

// Los registros nuevos reciben su UUID definitivo en el navegador (antes eran filas "tmp-…" que no se podían borrar ni
// editar hasta que el servidor respondiera: borrar enviaba ?id=eq.tmp-… y fallaba con 400). Mientras se guarda, el id
// queda en `inflight`: borrar o editar ese registro espera a que termine la inserción.
const newIds = new WeakMap<object, string>()
const idOf = (v: object) => {
  const own = (v as { id?: string }).id
  if (own) return own
  if (!newIds.has(v)) newIds.set(v, crypto.randomUUID())
  return newIds.get(v)!
}
const inflight = new Map<string, Promise<void>>()
const settle = new Map<string, () => void>()
const waitSaved = async (id: string) => { await inflight.get(id) }

/** Crear o editar (upsert por id) con actualización optimista. */
/** Registros cuya creación cuenta como "acción" (para el anuncio después de una acción). */
const ACTION_TABLES = new Set<string>(["expenses", "incomes", "extra_incomes", "loans", "loan_payments", "fixed_expenses", "subscriptions", "card_purchases", "goals", "fund_movements", "contacts", "wishlist", "credit_cards"])

export function useSave<T extends BookTable>(table: T, messages?: { created?: string; updated?: string }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Insert<T> | (Update<T> & { id: string })) => {
      const isNew = !(values as { id?: string }).id
      const id = idOf(values)
      markLocalWrite(table, id)
      try {
        const sb = createClient()
        if (!isNew) {
          await waitSaved(id)
          // Edición: update y no upsert. Con upsert Postgres valida el registro completo como si fuera
          // nuevo y un cambio parcial (solo el ícono) fallaba por las columnas obligatorias (nombre).
          const { data, error } = await sb.from(table).update(values as never).eq("id" as never, id as never).select()
          if (error) throw new Error(error.message)
          if (data?.length) return data[0] as unknown as Row<T>
        }
        const { data, error } = await sb.from(table).upsert({ ...values, id, book_id: bookId } as never).select().single()
        if (error) throw new Error(error.message)
        return data as unknown as Row<T>
      } finally {
        markLocalWrite(table, id) // el eco de Realtime llega justo después de la respuesta
        if (isNew) { settle.get(id)?.(); settle.delete(id); inflight.delete(id) }
      }
    },
    onMutate: async (values) => {
      if (!(values as { id?: string }).id) {
        const id = idOf(values)
        inflight.set(id, new Promise<void>((r) => settle.set(id, r)))
      }
      await qc.cancelQueries({ queryKey: qk(bookId, table) })
      const prev = qc.getQueriesData<Row<T>[]>({ queryKey: qk(bookId, table) })
      const v = values as Partial<Row<T>> & { id?: string }
      qc.setQueriesData<Row<T>[]>({ queryKey: qk(bookId, table) }, (old) => {
        if (!old) return old
        if (v.id && old.some((r) => r.id === v.id)) return old.map((r) => (r.id === v.id ? { ...r, ...v } : r))
        return [...old, { ...v, id: idOf(values), book_id: bookId } as Row<T>]
      })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error("No se pudo guardar", { description: e.message })
    },
    onSuccess: (_d, v) => {
      const created = !(v as { id?: string }).id
      if (created && ACTION_TABLES.has(table) && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("mirai:accion", { detail: table }))
      const msg = created ? messages?.created : messages?.updated
      if (msg) toast.success(msg)
    },
    onSettled: () => invalidateBook(qc, bookId, table),
  })
}

/** Borrado lógico con botón "Deshacer" (restaura deleted_at = null). */
export function useSoftDelete<T extends BookTable>(table: T, label = "Registro eliminado") {
  const bookId = useBookId()
  const qc = useQueryClient()
  const sb = createClient()
  const setDeleted = async (id: string, value: string | null) => {
    await waitSaved(id) // si el registro se acaba de crear, primero termina de guardarse
    markLocalWrite(table, id)
    const { error } = await sb.from(table).update({ deleted_at: value } as never).eq("id" as never, id as never)
    markLocalWrite(table, id)
    if (error) throw new Error(error.message)
  }
  return useMutation({
    mutationFn: async (row: { id: string; nombre?: string; descripcion?: string; concepto?: string }) => setDeleted(row.id, new Date().toISOString()),
    onMutate: async (row) => {
      await qc.cancelQueries({ queryKey: qk(bookId, table) })
      const prev = qc.getQueriesData<Row<T>[]>({ queryKey: qk(bookId, table) })
      qc.setQueriesData<Row<T>[]>({ queryKey: qk(bookId, table) }, (old) => old?.filter((r) => r.id !== row.id))
      return { prev }
    },
    onError: (e, _r, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error("No se pudo eliminar", { description: e.message })
    },
    onSuccess: (_d, row) => {
      const name = row.nombre ?? row.descripcion ?? row.concepto
      toast(label, {
        description: name ? `“${name}”` : undefined,
        action: {
          label: "Deshacer",
          onClick: async () => {
            await setDeleted(row.id, null)
            invalidateBook(qc, bookId, table) // también el libro y las derivadas (Realtime ignora este eco propio)
            toast.success("Listo, lo recuperamos")
          },
        },
        duration: 8000,
      })
    },
    onSettled: () => invalidateBook(qc, bookId, table),
  })
}
