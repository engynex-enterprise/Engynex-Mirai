"use client"

import { useCallback, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { toast } from "@/components/mirai/toast"
import { useApp, useBookId } from "@/components/app/app-context"
import type { Row } from "@/lib/supabase/tables"

export type Prefs = Row<"user_preferences">

// Preferencias por /v1/me/preferences y ajustes del libro por /v1/books/:b/settings.
const api = () => import("@/lib/api/client")
/** Copia sin las columnas que pone el servidor (la API las rechaza). */
const omit = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

/** Preferencias de la persona. */
export async function fetchPrefs(): Promise<Prefs | null> {
  const { browserApi, unwrap } = await api()
  return unwrap(await browserApi().me.preferences()) as unknown as Prefs
}

/** Guarda preferencias (upsert de la fila propia). Lanza Error con el mensaje para la persona. */
export async function savePrefs(_userId: string, p: Partial<Prefs>): Promise<void> {
  const { browserApi, unwrap } = await api()
  unwrap(await browserApi().me.updatePreferences({ body: omit(p, ["user_id", "updated_at"]) as never }))
}

/** Cambia campos de book_settings del libro. Lanza Error con el mensaje para la persona. */
export async function saveBookSettings(bookId: string, p: Partial<Row<"book_settings">>): Promise<void> {
  const { browserApi, unwrap } = await api()
  unwrap(await browserApi().books.updateSettings({ params: { bookId }, body: omit(p, ["book_id", "updated_at"]) as never }))
}

/** Ajustes del libro (lo que lee useSettings). */
export async function fetchBookSettings(bookId: string): Promise<Row<"book_settings">> {
  const { browserApi, unwrap } = await api()
  return unwrap(await browserApi().books.settings({ params: { bookId } })) as unknown as Row<"book_settings">
}

/** Preferencias del usuario (se sincronizan entre dispositivos). */
export function usePrefs() {
  const { user } = useApp()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["prefs", user.id],
    queryFn: () => fetchPrefs(),
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
