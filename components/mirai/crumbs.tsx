import Link from "next/link"
import { cn } from "@/lib/utils"

export type Crumb = { label: string; href?: string }

/**
 * Migas de pan al estilo de Meta (Servicio de ayuda de Facebook, medido): encima del título, 12 px seminegrita,
 * enlaces en azul y una flecha diminuta de 8 px como separador. Muestran los niveles de arriba; el título es la página.
 */
export function Crumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (!items.length) return null
  return (
    <nav aria-label="Migas de pan" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-4 font-semibold">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <svg aria-hidden viewBox="0 0 8 8" className="size-2 shrink-0 fill-current text-foreground/80"><path d="M2.3 0.9 5.4 4 2.3 7.1 2.9 7.7 6.6 4 2.9 0.3z" /></svg>}
            {c.href ? <Link href={c.href} className="text-link hover:underline">{c.label}</Link> : <span className="text-link">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}
