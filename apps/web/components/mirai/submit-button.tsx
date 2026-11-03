"use client"

import { useEffect } from "react"
import { create } from "zustand"
import type { FieldValues, UseFormReturn } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * Botón Guardar de los formularios: inactivo hasta que el formulario sea válido y, mientras guarda, con un indicador de
 * carga (sin poder enviarlo dos veces). El botón suele estar en el pie de la ventana (fuera del <form>), así que el
 * formulario publica su estado por id con `useSubmitState(formId, form)` y el botón lo lee con `<SubmitButton form>`.
 * Para formularios sin react-hook-form, pasa `disabled` y `loading` directamente.
 */
type St = { valid: boolean; busy: boolean }
const useForms = create<{ s: Record<string, St>; set: (id: string, v: St) => void; drop: (id: string) => void }>((set) => ({
  s: {},
  set: (id, v) => set((x) => (x.s[id]?.valid === v.valid && x.s[id]?.busy === v.busy ? x : { s: { ...x.s, [id]: v } })),
  drop: (id) => set((x) => { const { [id]: _, ...rest } = x.s; void _; return { s: rest } }),
}))

/** Publica si el formulario es válido y si se está guardando (react-hook-form). */
export function useSubmitState<T extends FieldValues>(formId: string, form: UseFormReturn<T>, extra: { valid?: boolean; busy?: boolean } = {}) {
  const { isValid, isSubmitting } = form.formState
  const valid = isValid && extra.valid !== false
  const busy = isSubmitting || !!extra.busy
  const set = useForms((x) => x.set)
  const drop = useForms((x) => x.drop)
  useEffect(() => { set(formId, { valid, busy }) }, [formId, valid, busy, set])
  useEffect(() => () => drop(formId), [formId, drop])
}

export function SubmitButton({ form, children = "Guardar", disabled, loading, loadingText = "Guardando…", className, onClick, hint = "Completa los campos obligatorios para guardar", type, variant }: {
  form?: string; children?: React.ReactNode; disabled?: boolean; loading?: boolean; loadingText?: string; className?: string
  onClick?: () => void
  /** "submit" para usarlo dentro de un <form> sin react-hook-form (Enter envía). Con `form` siempre es submit. */
  type?: "submit" | "button"
  /** Variante del botón (p. ej. "destructive" para borrar o formatear). */
  variant?: React.ComponentProps<typeof Button>["variant"]
  /** Por qué está inactivo (tooltip). */
  hint?: string
}) {
  const st = useForms((x) => (form ? x.s[form] : undefined))
  // Si el formulario aún no publicó su estado (cargando catálogos), el botón espera inactivo.
  const busy = !!loading || !!st?.busy
  const off = !!disabled || busy || (form ? !st?.valid : false)
  const btn = (
    <Button type={form ? "submit" : (type ?? "button")} variant={variant} form={form} disabled={off} aria-busy={busy || undefined} className={className} onClick={onClick}>
      {busy ? <><Spinner /> {loadingText}</> : children}
    </Button>
  )
  // Un botón inactivo no recibe el mouse: el aviso de por qué está inactivo va en un envoltorio que sí lo recibe.
  if (!off || busy) return btn
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="inline-grid rounded-md focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none [&>button]:w-full">{btn}</span></TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}
