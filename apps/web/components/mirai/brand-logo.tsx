import { BRANDS } from "@/lib/brands"
import { cn } from "@/lib/utils"

/**
 * Logo de un servicio de terceros sobre una placa blanca (se lee igual en modo claro y oscuro, también los logos
 * negros). Si la entidad publica un ícono oficial (img), ese; si no hay logo libre, monograma con su color. `bare` lo
 * dibuja sin placa.
 */
export function BrandLogo({ k, size = 40, bare, className, title }: { k: string; size?: number; bare?: boolean; className?: string; title?: string }) {
  const b = BRANDS[k]
  if (!b) return null
  const label = title ?? b.n
  if (b.img) {
    // Ícono oficial de la entidad (sin modificarlo): a sangre llena el cuadro; transparente va sobre placa blanca.
    const pad = b.bleed || bare ? 0 : Math.round(size * 0.16)
    return (
      <span role="img" aria-label={label} className={cn("grid shrink-0 place-items-center overflow-hidden", bare ? "rounded-md" : "rounded-[28%]", !b.bleed && !bare && "bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]", className)} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ícono fijo de pocos KB en /public: next/image no aporta */}
        <img src={b.img} alt="" width={size - pad * 2} height={size - pad * 2} loading="lazy" decoding="async" draggable={false} className={cn("block", b.bleed ? "size-full object-cover" : "object-contain")} />
      </span>
    )
  }
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
