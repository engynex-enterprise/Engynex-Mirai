"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { useApp, useBookId } from "@/components/app/app-context"
import type { Row } from "@/lib/supabase/tables"

export type Prefs = Row<"user_preferences">

/** Preferencias del usuario (se sincronizan entre dispositivos). */
export function usePrefs() {
  const { user } = useApp()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["prefs", user.id],
    queryFn: async () => (await createClient().from("user_preferences").select("*").eq("user_id", user.id).maybeSingle()).data,
  })
  const m = useMutation({
    mutationFn: async (p: Partial<Prefs>) => {
      const { error } = await createClient().from("user_preferences").upsert({ user_id: user.id, ...p })
      if (error) throw new Error(error.message)
    },
    onMutate: (p) => qc.setQueryData(["prefs", user.id], (o: Prefs | null) => (o ? { ...o, ...p } : o)),
    onSuccess: () => toast("Guardado"),
    onError: (e) => toast.error("No se pudo guardar", { description: e.message }),
  })
  return { prefs: q.data, isPending: q.isPending, save: m.mutate }
}

/** Ajustes del libro: actualizar campos de book_settings. */
export function useBookSettingsSave() {
  const bookId = useBookId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: Partial<Row<"book_settings">>) => {
      const { error } = await createClient().from("book_settings").update(p).eq("book_id", bookId)
      if (error) throw new Error(error.message)
    },
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
  // PWA: registra el service worker (push y "Agregar a inicio") solo en producción.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {})
  }, [])
  return null
}
