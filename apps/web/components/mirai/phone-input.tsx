"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { telefonoAviso, telefonoEscribiendo, telefonoGuardar } from "@mirai/domain/phone"

/**
 * Campo de teléfono de Colombia: se va acomodando solo mientras escribes (celular "300 123 4567", fijo
 * "(601) 234 5678") y al salir guarda el número limpio. Si escribes algo que no es un número, lo deja tal cual.
 */
export function PhoneInput({ id, value, onSave, placeholder = "300 123 4567", disabled }: {
  id: string; value: string | null | undefined; onSave: (v: string) => void; placeholder?: string; disabled?: boolean
}) {
  const inicial = telefonoEscribiendo(value ?? "")
  const [v, setV] = useState(inicial)
  const [prev, setPrev] = useState(inicial)
  if (prev !== inicial) { setPrev(inicial); setV(inicial) }
  const aviso = telefonoAviso(v)
  return (
    <>
      <Input id={id} type="tel" inputMode="tel" autoComplete="tel" className="h-11 tabular-nums" placeholder={placeholder} disabled={disabled}
        value={v} aria-describedby={aviso ? `${id}-aviso` : undefined}
        onChange={(e) => setV(telefonoEscribiendo(e.target.value))}
        onBlur={() => { const g = telefonoGuardar(v); if (g !== (value ?? "")) onSave(g) }} />
      {aviso && <p id={`${id}-aviso`} className="text-[13px] text-muted-foreground">{aviso}</p>}
    </>
  )
}
