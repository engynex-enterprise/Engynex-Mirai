"use client"

import { useCallback, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { toast } from "@/components/mirai/toast"
import { createClient } from "@/utils/supabase/client"
import { useApp, useBookId } from "@/components/app/app-context"
import { apiOn } from "@/lib/api/session"
import { readWithFallback } from "@/lib/api/book-tables"
import type { Row } from "@/lib/supabase/tables"

export type Prefs = Row<"user_preferences">

// V7-H2: preferencias por /v1/me/preferences (interruptor `me`) y ajustes del libro por /v1/books/:b/settings
// (interruptor `books`). Apagado: Supabase directo, como siempre (rama heredada).
const api = () => import("@/lib/api/client")
/** Copia sin las columnas que pone el servidor (la API las rechaza). */
const omit = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

/** Preferencias de la persona (o null si aún no hay fila, como maybeSingle). */
export async function fetchPrefs(userId: string): Promise<Prefs | null> {
  const legacy = async () => (await createClient().from("user_preferences").select("*").eq("user_id", userId).maybeSingle()).data
  if (!apiOn("me")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await api()
    return unwrap(await browserApi().me.preferences()) as unknown as Prefs
  }, legacy)
}

/** Guarda preferencias (upsert de la fila propia). Lanza Error con el mensaje para la persona. */
export async function savePrefs(userId: string, p: Partial<Prefs>): Promise<void> {
  if (apiOn("me")) {
    const { browserApi, unwrap } = await api()
    unwrap(await browserApi().me.updatePreferences({ body: omit(p, ["user_id", "updated_at"]) as never }))
    return
  }
  const { error } = await createClient().from("user_preferences").upsert({ user_id: userId, ...p })
  if (error) throw new Error(error.message)
}

/** Cambia campos de book_settings del libro. Lanza Error con el mensaje para la persona. */
export async function saveBookSettings(bookId: string, p: Partial<Row<"book_settings">>): Promise<void> {
  if (apiOn("books")) {
    const { browserApi, unwrap } = await api()
    unwrap(await browserApi().books.updateSettings({ params: { bookId }, body: omit(p, ["book_id", "updated_at"]) as never }))
    return
  }
  const { error } = await createClient().from("book_settings").update(p).eq("book_id", bookId)
  if (error) throw new Error(error.message)
}

/** Ajustes del libro (lo que lee useSettings). */
export async function fetchBookSettings(bookId: string): Promise<Row<"book_settings">> {
  const legacy = async () => {
    const { data, error } = await createClient().from("book_settings").select("*").eq("book_id", bookId).single()
    if (error) throw new Error(error.message)
    return data
  }
  if (!apiOn("books")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await api()
    return unwrap(await browserApi().books.settings({ params: { bookId } })) as unknown as Row<"book_settings">
  }, legacy)
}

/** Preferencias del usuario (se sincronizan entre dispositivos). */
export function usePrefs() {
  const { user } = useApp()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["prefs", user.id],
    queryFn: () => fetchPrefs(user.id),
  })
  const m = useMutation({
    mutationFn: ({ p }: { p: Partial<Prefs>; quiet?: boolean }) => savePrefs(user.id, p),
    onMutate: ({ p }) => qc.setQueryData(["prefs", user.id], (o: Prefs | null) => (o ? { ...o, ...p } : o)),
    onSuccess: (_d, v) => { if (!v.quiet) toast("Guardado") },
    onError: (e) => toast.error("No se pudo guardar", { description: e.message }),
  })
  const { mutate } = m
  // save: cambios que hace la persona (con aviso). saveQuiet: marcas automáticas (novedades vistas, tour hecho).
  const save = useCallback((p: Partial<Prefs>) => mutate({ p }), [mutate])
  const saveQuiet = useCallback((p: Partial<Prefs>) => mutate({ p, quiet: true }), [mutate])
  return { prefs: q.data, isPending: q.isPending, save, saveQuiet }
}

/** Ajustes del libro: actualizar campos de book_settings. */
export function useBookSettingsSave() {
  const bookId = useBookId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Partial<Row<"book_settings">>) => saveBookSettings(bookId, p),
    onSuccess: () => { toast("Guardado"); qc.invalidateQueries({ queryKey: ["b", bookId] }) },
    onError: (e) => toast.error("No se pudo guardar", { description: e.message }),
  })
}

/** Aplica tamaño de letra, densidad, reducir animaciones y privacidad al abrir (applyUI de la v4). */
export function ApplyPrefs() {
  const { prefs } = usePrefs()
  useEffect(() => {
    if (!prefs) return
    const h = document.documentElement
    h.classList.toggle("fs-l", prefs.font_scale === "l")
    h.classList.toggle("fs-xl", prefs.font_scale === "xl")
    h.classList.toggle("dense", prefs.dense)
    h.classList.toggle("rm", prefs.reduce_motion)
    if (prefs.privacy_mode) h.classList.add("priv")
    if (!prefs.privacy_blur_on_leave) return
    const on = () => h.classList.add("priv-blur")
    const off = () => h.classList.remove("priv-blur")
    const vis = () => (document.hidden ? on() : off())
    window.addEventListener("blur", on); window.addEventListener("focus", off); document.addEventListener("visibilitychange", vis)
    return () => { window.removeEventListener("blur", on); window.removeEventListener("focus", off); document.removeEventListener("visibilitychange", vis) }
  }, [prefs])
  // El service worker (push, app instalada, sin conexión) lo registra features/pwa/pwa-root.tsx en todas las páginas.
  return null
}
