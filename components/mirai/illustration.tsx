import { ILLUSTRATIONS } from "@/lib/content/illustrations"
import { cn } from "@/lib/utils"

/** Ilustración vectorial de Mirai (estados vacíos, "no se encontró", introducción, errores). Decorativa. */
export function Illustration({ k, className, width = 220 }: { k: string; className?: string; width?: number }) {
  return (
    <svg viewBox="0 0 320 240" width={width} height={(width * 3) / 4} className={cn("shrink-0", className)} aria-hidden
      dangerouslySetInnerHTML={{ __html: ILLUSTRATIONS[k] ?? ILLUSTRATIONS.vacio }} />
  )
}
