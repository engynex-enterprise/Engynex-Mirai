import { cn } from "@/lib/utils"
import { Icon } from "./icon"
import { IsoIcon } from "./iso-icon"

/**
 * Ícono con color de referencia (círculo suave + ícono del color). Sirve para identificar de un vistazo el tipo de
 * cada fila (evento, reto, deseo, regla…). Tonos de la paleta Engynex más los de estado.
 */
export const TONE = {
  brand: "bg-brand-soft text-forest dark:text-lime",
  navy: "bg-navy/10 text-navy dark:bg-white/10 dark:text-white",
  green: "bg-success-soft text-success",
  amber: "bg-warning-soft text-warning",
  red: "bg-danger-soft text-danger",
  blue: "bg-info-soft text-info",
  violet: "bg-[#EFE8FF] text-[#6B3FD6] dark:bg-[#6B3FD6]/20 dark:text-[#C4A6FF]",
  gray: "bg-secondary text-muted-foreground",
} as const
export type IconTone = keyof typeof TONE

const CYCLE: IconTone[] = ["blue", "green", "amber", "violet", "brand", "red", "navy"]
/** Tono estable a partir de un texto (el mismo nombre siempre da el mismo color). */
export const toneFor = (text: string): IconTone => CYCLE[[...(text || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % CYCLE.length]

const SIZES = { sm: "size-8 [&>svg]:size-4", md: "size-10 [&>svg]:size-5", lg: "size-12 [&>svg]:size-6" } as const

export function ToneIcon({ icon, iso, tone = "brand", size = "md", label, className }: {
  icon?: string; iso?: string; tone?: IconTone; size?: keyof typeof SIZES; label?: string; className?: string
}) {
  return (
    <span role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      className={cn("grid shrink-0 place-items-center rounded-full", SIZES[size], iso ? "bg-soft-gradient" : TONE[tone], className)}>
      {iso ? <IsoIcon k={iso} size={size === "sm" ? 22 : size === "md" ? 28 : 34} /> : <Icon name={icon ?? "circle"} />}
    </span>
  )
}
