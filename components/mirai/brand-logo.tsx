import { BRANDS } from "@/lib/brands"
import { cn } from "@/lib/utils"

/**
 * Logo de un servicio de terceros sobre una placa blanca (se lee igual en modo claro y oscuro, también los logos
 * negros). Si la marca no tiene logo libre, monograma con su color. `bare` lo dibuja sin placa.
 */
export function BrandLogo({ k, size = 40, bare, className, title }: { k: string; size?: number; bare?: boolean; className?: string; title?: string }) {
  const b = BRANDS[k]
  if (!b) return null
  const label = title ?? b.n
  if (b.mono) {
    const len = b.mono.t.length
    return (
      <span role="img" aria-label={label} className={cn("grid shrink-0 place-items-center font-bold tracking-tight", bare ? "rounded-md" : "rounded-[28%]", className)}
        style={{ width: size, height: size, background: b.mono.bg, color: b.mono.fg, fontSize: size * (len > 3 ? 0.26 : len > 2 ? 0.3 : len > 1 ? 0.38 : 0.5) }}>
        {b.mono.t}
      </span>
    )
  }
  const pad = bare ? 0 : Math.round(size * 0.2)
  const inner = size - pad * 2
  const svg = (
    <svg viewBox={`0 0 ${b.w} ${b.h}`} width={inner} height={inner} preserveAspectRatio="xMidYMid meet" aria-hidden dangerouslySetInnerHTML={{ __html: b.body ?? "" }} />
  )
  if (bare) return <span role="img" aria-label={label} className={cn("inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>{svg}</span>
  return (
    <span role="img" aria-label={label} className={cn("grid shrink-0 place-items-center rounded-[28%] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]", className)} style={{ width: size, height: size }}>
      {svg}
    </span>
  )
}
