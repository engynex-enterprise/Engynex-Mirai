"use client"

// Piezas comunes de las listas de Ajustes (categorías, entidades, reglas…): edición en línea y fila para agregar.
import { useState } from "react"
import { Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { SubmitButton } from "@/components/mirai/submit-button"

/** Texto que guarda al salir (edición en línea). */
export function TextBlur({ value, onSave, label, className, disabled, placeholder }: { value: string; onSave: (v: string) => void; label: string; className?: string; disabled?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setV(value) }
  return <Input aria-label={label} className={className ?? "h-10"} value={v} disabled={disabled} placeholder={placeholder} maxLength={60} onChange={(e) => setV(e.target.value)} onBlur={() => { const t = v.trim(); if (t && t !== value) onSave(t); else setV(value) }} />
}

/**
 * Fila para agregar: el botón Agregar queda inactivo hasta escribir un nombre nuevo (si ya existe lo dice ahí mismo)
 * y muestra "Agregando…" mientras guarda. Enter también agrega.
 */
export function AddRow({ placeholder, onAdd, extra, disabled, taken, needsExtra, onType }: {
  placeholder: string; onAdd: (nombre: string) => Promise<unknown> | void; extra?: React.ReactNode; disabled?: boolean
  /** Devuelve true si el nombre ya existe. */
  taken?: (nombre: string) => boolean
  /** Falta elegir algo en `extra` (p. ej. la categoría de una regla): texto del motivo. */
  needsExtra?: string | false
  /** Avisa lo que se va escribiendo (p. ej. para contar coincidencias). */
  onType?: (texto: string) => void
}) {
  const [n, setN] = useState("")
  const [busy, setBusy] = useState(false)
  const t = n.trim()
  const dup = !!t && !!taken?.(t)
  const ok = !!t && !dup && !needsExtra && !disabled
  const add = async () => {
    if (!ok || busy) return
    setBusy(true)
    // Si falla, el aviso lo muestra la mutación y el texto queda escrito para intentar de nuevo.
    try { await onAdd(t); setN("") } catch { /* aviso de la mutación */ }
    setBusy(false)
  }
  return (
    <div className="grid gap-1.5 border-b pb-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input className="h-10 flex-1" placeholder={placeholder} value={n} maxLength={60} disabled={disabled} aria-invalid={dup || undefined}
          onChange={(e) => { setN(e.target.value); onType?.(e.target.value) }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }} aria-label={placeholder} />
        {extra}
        <SubmitButton className="h-10" onClick={add} disabled={!ok} loading={busy} loadingText="Agregando…"
          hint={disabled ? "Tu rol no permite cambiar esta lista" : dup ? "Ese nombre ya existe" : needsExtra || "Escribe un nombre"}><Plus /> Agregar</SubmitButton>
      </div>
      {dup && <p className="text-xs text-danger" role="alert">“{t}” ya está en la lista.</p>}
    </div>
  )
}
