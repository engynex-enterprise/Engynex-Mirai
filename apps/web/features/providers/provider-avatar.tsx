import { BRANDS, brandFor } from "@/lib/brands"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { Icon } from "@/components/mirai/icon"
import { tipoIcon } from "@/lib/domain"
import { cn } from "@/lib/utils"

type P = { nombre: string; tipo?: string | null; brand?: string | null; icon?: string | null }

/** Marca de lib/brands.ts que identifica al proveedor (la guardada o la que reconoce el nombre). */
export const providerBrand = (p: P) => (p.brand && BRANDS[p.brand] ? p.brand : brandFor(p.nombre))

/**
 * Logo del proveedor: el del servicio si está en lib/brands.ts (solo para identificarlo, sin modificarlo); si no,
 * su ícono propio o el de su tipo (rayo para servicios públicos, wifi para internet…).
 */
export function ProviderAvatar({ p, size = 36, className }: { p: P; size?: number; className?: string }) {
  const brand = providerBrand(p)
  if (brand) return <BrandLogo k={brand} size={size} className={className} />
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-muted text-muted-foreground", className)} style={{ width: size, height: size }} aria-hidden>
      <Icon name={p.icon || tipoIcon(p.tipo)} style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  )
}
