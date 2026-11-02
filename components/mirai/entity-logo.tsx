import { BRANDS, brandFor } from "@/lib/brands"
import { tipoIcon } from "@/lib/domain"
import { cn } from "@/lib/utils"
import { BrandLogo } from "./brand-logo"
import { Icon } from "./icon"

/**
 * Colores de referencia de los íconos (las categorías no guardan color). Tonos medios que se leen en claro y oscuro;
 * lo que no está aquí toma uno estable de la paleta según su nombre o id.
 */
const PALETTE = ["#1B7FCC", "#2E9E5B", "#E0731A", "#7A4BE0", "#D0243F", "#0E9AA7", "#C99400", "#DB2777", "#5A6C9E", "#8B5E34"] as const
const BY_ICON: Record<string, string> = {
  house: "#1B7FCC", zap: "#C99400", "shopping-cart": "#2E9E5B", car: "#0E9AA7", "graduation-cap": "#7A4BE0", "heart-pulse": "#D0243F",
  landmark: "#5A6C9E", dog: "#8B5E34", siren: "#D0243F", utensils: "#E0731A", coffee: "#8B5E34", bike: "#E0731A", cookie: "#C99400",
  film: "#7A4BE0", repeat: "#7A4BE0", shirt: "#DB2777", gift: "#DB2777", plane: "#0E9AA7", "piggy-bank": "#DB2777", "trending-up": "#2E9E5B",
  "circle-ellipsis": "#5A6C9E", briefcase: "#2E9E5B", "file-text": "#1B7FCC", store: "#0E9AA7", percent: "#2E9E5B", coins: "#C99400",
  wifi: "#1B7FCC", droplet: "#0E9AA7", flame: "#E0731A", smartphone: "#7A4BE0", "credit-card": "#5A6C9E", "hand-coins": "#2E9E5B",
  receipt: "#5A6C9E", "building-2": "#5A6C9E", shield: "#1B7FCC", "heart-handshake": "#DB2777",
}
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Color de referencia de un ícono (o, si no tiene, uno estable de la paleta según `seed`). */
export function refColor(icon?: string | null, seed?: string | null) {
  return (icon && BY_ICON[icon]) || PALETTE[hash(seed || icon || "mirai") % PALETTE.length]
}

/** Tono de estado que reemplaza el color (p. ej. un gasto fijo vencido se ve en rojo). */
const STATE = { danger: "#D0243F", warning: "#C99400", success: "#2E9E5B", info: "#1B7FCC" } as const

export type EntityLogoProps = {
  /** Texto donde se busca una marca conocida (nombre del gasto, del proveedor, de la tarjeta, del banco…). */
  name?: string | null
  /** Marca de lib/brands.ts ya elegida (gana sobre `name`). */
  brand?: string | null
  /** Imagen propia (logo subido de una suscripción o una entidad). */
  src?: string | null
  /** Proveedor del registro: su marca o, si no tiene, su ícono. */
  provider?: { nombre: string; tipo?: string | null; brand?: string | null; icon?: string | null } | null
  /** Ícono de respaldo (el de la categoría) y su color; sin color se deriva uno estable de `seed`. */
  icon?: string | null
  color?: string | null
  seed?: string | null
  /** Estado que tiñe el ícono de respaldo (no cambia los logos de marca). */
  tone?: keyof typeof STATE
  size?: number
  className?: string
}

/**
 * Logo único de las listas: logo de la marca (lib/brands.ts, solo para identificar el servicio, sin modificarlo) →
 * imagen propia → marca o ícono del proveedor → ícono de la categoría con su color de referencia → monograma.
 */
export function EntityLogo({ name, brand, src, provider, icon, color, seed, tone, size = 40, className }: EntityLogoProps) {
  if (src) return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} />
  const pb = provider ? (provider.brand && BRANDS[provider.brand] ? provider.brand : brandFor(provider.nombre)) : null
  const b = (brand && BRANDS[brand] ? brand : null) ?? brandFor(name) ?? pb
  if (b) return <BrandLogo k={b} size={size} className={className} />
  const ic = icon || (provider ? provider.icon || tipoIcon(provider.tipo) : null)
  const c = (tone && STATE[tone]) || color || refColor(ic, seed ?? name ?? provider?.nombre)
  const style = { width: size, height: size, "--el": c } as React.CSSProperties
  const tint = "bg-[color-mix(in_oklab,var(--el)_14%,transparent)] text-[var(--el)] dark:bg-[color-mix(in_oklab,var(--el)_26%,transparent)] dark:text-[color-mix(in_oklab,var(--el)_55%,white)]"
  if (ic) return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full", tint, className)} style={style}>
      <Icon name={ic} style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  )
  const t = (name ?? provider?.nombre ?? "?").trim()
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full font-bold", tint, className)} style={{ ...style, fontSize: size * 0.42 }}>
      {(t[0] ?? "?").toUpperCase()}
    </span>
  )
}
