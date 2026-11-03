"use client"

import { useCallback, useEffect, useMemo } from "react"
import { usePrefs } from "@/features/settings/prefs"
import { APP_VER } from "@/lib/content/ayuda"
import { novedadesNoLeidas, type FaqVotos } from "@/lib/content/centro-ayuda"

/** Lo que guarda el Centro de ayuda en user_preferences.extra (se sincroniza entre dispositivos). */
type AyudaExtra = { ayuda?: { leidas?: string[]; faq?: FaqVotos }; academia?: string[] }

/** Estado del Centro de ayuda: novedades leídas, votos de preguntas y avance de la Academia. */
export function useAyuda() {
  const { prefs, isPending, saveQuiet } = usePrefs()
  const extra = useMemo(() => ((prefs?.extra ?? {}) as AyudaExtra & Record<string, unknown>), [prefs])
  const ayuda = useMemo(() => extra.ayuda ?? {}, [extra])
  const leidas = useMemo(() => ayuda.leidas ?? [], [ayuda])
  const votos = useMemo(() => ayuda.faq ?? {}, [ayuda])
  const academia = useMemo(() => extra.academia ?? [], [extra])
  const noLeidas = useMemo(() => (isPending ? [] : novedadesNoLeidas({ seen: prefs?.seen_release ?? null, leidas })), [isPending, prefs, leidas])

  const saveAyuda = useCallback((patch: Partial<NonNullable<AyudaExtra["ayuda"]>>) => {
    if (!prefs) return
    saveQuiet({ extra: { ...extra, ayuda: { ...ayuda, ...patch } } })
  }, [prefs, extra, ayuda, saveQuiet])

  /** Marca novedades como leídas (claves de releaseKey). Solo guarda las de versiones recientes. */
  const marcarLeidas = useCallback((keys: string[]) => {
    const nuevas = keys.filter((k) => !leidas.includes(k))
    if (nuevas.length) saveAyuda({ leidas: [...leidas, ...nuevas].slice(-300) })
  }, [leidas, saveAyuda])

  const votar = useCallback((id: string, v: 1 | -1) => saveAyuda({ faq: { ...votos, [id]: v } }), [votos, saveAyuda])

  const terminarLeccion = useCallback((id: string) => {
    if (prefs && !academia.includes(id)) saveQuiet({ extra: { ...extra, academia: [...academia, id] } })
  }, [prefs, extra, academia, saveQuiet])

  return { ready: !isPending, isPending, prefs, leidas, noLeidas, votos, academia, marcarLeidas, votar, terminarLeccion }
}

/** Al ver las novedades se da por vista la versión actual (quita la insignia "Nuevo" del menú). */
export function useMarcarVersionVista() {
  const { prefs, saveQuiet } = usePrefs()
  useEffect(() => {
    if (prefs && prefs.seen_release !== APP_VER) {
      const t = setTimeout(() => saveQuiet({ seen_release: APP_VER }), 400)
      return () => clearTimeout(t)
    }
  }, [prefs, saveQuiet])
}
