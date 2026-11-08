"use client"

import { useCallback, useEffect, useMemo } from "react"
import { usePrefs } from "@/features/settings/prefs"
import { APP_VER } from "@/lib/content/ayuda"
import { novedadesNoLeidas, type FaqVotos } from "@/lib/content/centro-ayuda"
import type { AcademiaLog, Evaluaciones, Nivel } from "@/lib/content/academia"
import { todayISO } from "@/lib/format"

/** Lo que guarda el Centro de ayuda en user_preferences.extra (se sincroniza entre dispositivos). */
type AyudaExtra = {
  ayuda?: { leidas?: string[]; faq?: FaqVotos }
  /** Academia: lecciones terminadas, cuándo (racha), apuntes por lección y mejor nota de cada evaluación. */
  academia?: string[]; academia_log?: AcademiaLog; academia_notas?: Record<string, string>; academia_eval?: Evaluaciones
}

/** Estado del Centro de ayuda: novedades leídas, votos de preguntas y avance de la Academia. */
export function useAyuda() {
  const { prefs, isPending, saveQuiet } = usePrefs()
  const extra = useMemo(() => ((prefs?.extra ?? {}) as AyudaExtra & Record<string, unknown>), [prefs])
  const ayuda = useMemo(() => extra.ayuda ?? {}, [extra])
  const leidas = useMemo(() => ayuda.leidas ?? [], [ayuda])
  const votos = useMemo(() => ayuda.faq ?? {}, [ayuda])
  const academia = useMemo(() => extra.academia ?? [], [extra])
  const academiaLog = useMemo(() => extra.academia_log ?? {}, [extra])
  const notas = useMemo(() => extra.academia_notas ?? {}, [extra])
  const evaluaciones = useMemo(() => extra.academia_eval ?? {}, [extra])
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
    if (prefs && !academia.includes(id)) saveQuiet({ extra: { ...extra, academia: [...academia, id], academia_log: { ...academiaLog, [id]: todayISO() } } })
  }, [prefs, extra, academia, academiaLog, saveQuiet])

  /** Apuntes de una lección (máximo 2.000 caracteres; vacío los borra). */
  const guardarNota = useCallback((id: string, texto: string) => {
    if (!prefs) return
    const t = texto.slice(0, 2000)
    const resto = Object.fromEntries(Object.entries(notas).filter(([k]) => k !== id))
    saveQuiet({ extra: { ...extra, academia_notas: t.trim() ? { ...resto, [id]: t } : resto } })
  }, [prefs, extra, notas, saveQuiet])

  /** Guarda la nota de una evaluación si es la mejor del nivel. */
  const guardarEvaluacion = useCallback((n: Nivel, pct: number) => {
    if (!prefs || (evaluaciones[n]?.pct ?? -1) >= pct) return
    saveQuiet({ extra: { ...extra, academia_eval: { ...evaluaciones, [n]: { pct, fecha: todayISO() } } } })
  }, [prefs, extra, evaluaciones, saveQuiet])

  return { ready: !isPending, isPending, prefs, leidas, noLeidas, votos, academia, academiaLog, notas, evaluaciones, marcarLeidas, votar, terminarLeccion, guardarNota, guardarEvaluacion }
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
