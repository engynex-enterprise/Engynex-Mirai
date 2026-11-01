"use client"

import { useState } from "react"
import { MoneyInput } from "./money-input"

/** Campo de dinero que guarda al salir (edición en línea, data-edit de la v4). */
export function MoneyAutosave({ value, onSave, id, placeholder }: { value: number; onSave: (v: number) => void; id?: string; placeholder?: string }) {
  const [v, setV] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setV(value) }
  return <MoneyInput id={id} value={v} onChange={setV} placeholder={placeholder} onBlur={() => { if (v !== value) onSave(v) }} />
}
