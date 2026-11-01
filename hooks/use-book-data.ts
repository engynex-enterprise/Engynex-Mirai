"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { useBookId } from "@/components/app/app-context"
import { DERIVED_KEYS, qk, type BookTable, type Insert, type Row, type Update } from "@/lib/supabase/tables"
import type { QueryClient } from "@tanstack/react-query"

/** Refresca una tabla del libro y las consultas derivadas. */
export function invalidateBook(qc: QueryClient, bookId: string, table: string) {
  qc.invalidateQueries({ queryKey: qk(bookId, table) })
  for (const k of DERIVED_KEYS) qc.invalidateQueries({ queryKey: qk(bookId, k) })
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
    queryFn: async () => {
      let q = createClient().from(table).select(opts.select ?? "*").eq("book_id" as never, bookId as never).is("deleted_at" as never, null)
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
export function useSave<T extends BookTable>(table: T, messages?: { created?: string; updated?: string }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Insert<T> | (Update<T> & { id: string })) => {
      const isNew = !(values as { id?: string }).id
      const id = idOf(values)
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
      const msg = (v as { id?: string }).id ? messages?.updated : messages?.created
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
    const { error } = await sb.from(table).update({ deleted_at: value } as never).eq("id" as never, id as never)
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
            qc.invalidateQueries({ queryKey: qk(bookId, table) })
            toast.success("Listo, lo recuperamos")
          },
        },
        duration: 8000,
      })
    },
    onSettled: () => invalidateBook(qc, bookId, table),
  })
}
