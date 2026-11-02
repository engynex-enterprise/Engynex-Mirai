"use client"

import { forwardRef, useState } from "react"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { parseMoney, typedMoney } from "@/lib/format"

const fmt = (n: number, dec: boolean) => (n ? new Intl.NumberFormat("es-CO", { maximumFractionDigits: dec ? 2 : 0 }).format(n) : "")

type Props = {
  value: number | null | undefined
  onChange: (v: number) => void
  currency?: string
  decimals?: boolean
  id?: string
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  onBlur?: () => void
  "aria-label"?: string
}

/** Campo de dinero: prefijo $, separador de miles en vivo, acepta "120 mil" o "1,5 millones". */
export const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { value, onChange, currency = "COP", decimals, id, placeholder = "0", invalid, disabled, onBlur, "aria-label": ariaLabel }, ref,
) {
  const dec = decimals ?? currency !== "COP"
  // Mientras escribe se muestra su texto; fuera de foco, el valor formateado (así refleja cambios externos).
  const [text, setText] = useState("")
  const [focus, setFocus] = useState(false)
  const shown = focus ? text : fmt(Number(value ?? 0), dec)
  return (
    <InputGroup className="h-11" data-disabled={disabled}>
      <InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
      <InputGroupInput
        ref={ref}
        id={id}
        inputMode={dec ? "decimal" : "numeric"}
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-label={ariaLabel}
        disabled={disabled}
        data-money
        className="num"
        value={shown}
        onFocus={() => { setText(fmt(Number(value ?? 0), dec)); setFocus(true) }}
        onChange={(e) => {
          const raw = e.target.value
          // Solo cifras: puntos de miles en vivo sin perder dígitos. Texto ("120 mil", "1,5 millones"): se interpreta.
          if (/^[\d.,\s$]*$/.test(raw)) { const t = typedMoney(raw, dec); setText(t.text); onChange(t.n) }
          else { setText(raw); onChange(parseMoney(raw)) }
        }}
        onBlur={() => { setFocus(false); onBlur?.() }}
      />
      {currency !== "COP" && <InputGroupAddon align="inline-end"><InputGroupText>{currency}</InputGroupText></InputGroupAddon>}
    </InputGroup>
  )
})
