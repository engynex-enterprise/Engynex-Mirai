import iso from "@/lib/data/iso.json"
import { cn } from "@/lib/utils"

const ICONS = iso.icons as Record<string, string>

/** Definiciones de degradados de los isotipos. Se monta una sola vez en el layout raíz. */
export function IsoDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs dangerouslySetInnerHTML={{ __html: iso.defs }} />
    </svg>
  )
}

export const hasIso = (k: string) => k in ICONS

/** Isotipo ilustrado (estilo Fluent) de cada sección. */
export function IsoIcon({ k, size = 24, className, title }: { k: string; size?: number; className?: string; title?: string }) {
  const svg = ICONS[k] ?? ICONS.mirai
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
