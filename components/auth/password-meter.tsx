"use client"

import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

export const PASSWORD_RULES = [
  { id: "len", label: "Al menos 10 caracteres", test: (p: string) => p.length >= 10 },
  { id: "mix", label: "Mayúsculas y minúsculas", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { id: "num", label: "Al menos un número", test: (p: string) => /\d/.test(p) },
  { id: "sym", label: "Un símbolo (por ejemplo ! # $)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]

export const passwordScore = (p: string) => PASSWORD_RULES.filter((r) => r.test(p)).length

const LABELS = ["Muy débil", "Débil", "Aceptable", "Buena", "Fuerte"]
const COLORS = ["bg-danger", "bg-danger", "bg-warning", "bg-brand", "bg-success"]

/** Medidor de contraseña (4 barras + requisitos), igual que en la v4. */
export function PasswordMeter({ value }: { value: string }) {
  const score = passwordScore(value)
  return (
    <div className="grid gap-2" aria-live="polite">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full bg-muted transition-colors", i < score && COLORS[score])} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Seguridad: <b className="text-foreground">{value ? LABELS[score] : "—"}</b>
      </p>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(value)
          return (
            <li key={r.id} className={cn("flex items-center gap-1.5", ok ? "text-success" : "text-muted-foreground")}>
              {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
              {r.label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
