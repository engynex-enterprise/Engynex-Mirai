import { cn } from "@/lib/utils"
import { norm } from "@/lib/domain"
import { brandFor } from "@/lib/brands"
import { BrandLogo } from "@/components/mirai/brand-logo"

/** Accesos rápidos (SUBQ de la v4 + populares en Colombia): nombre + color de respaldo si la marca no tiene logo. */
export const SUBQ: [string, string][] = [
  ["Netflix", "#E50914"], ["Disney+", "#113CCF"], ["Max", "#5822B4"], ["Prime Video", "#00A8E1"], ["Spotify", "#1DB954"],
  ["YouTube Premium", "#FF0033"], ["Apple TV+", "#111111"], ["Paramount+", "#0064FF"], ["Crunchyroll", "#F47521"], ["Apple Music", "#FA243C"],
  ["iCloud", "#3693F3"], ["Google One", "#4285F4"], ["Xbox Game Pass", "#107C10"], ["PlayStation Plus", "#003791"], ["ChatGPT Plus", "#10A37F"],
  ["Claude Pro", "#D97757"], ["Microsoft 365", "#D83B01"], ["Canva Pro", "#00C4CC"], ["Duolingo", "#58CC02"], ["Deezer", "#A238FF"],
  ["ViX Premium", "#FF5A00"], ["Rappi Prime", "#FF441F"], ["Smart Fit", "#FFC20E"], ["Gimnasio", "#3F7A1E"],
]

export const subColor = (nombre: string) => {
  const n = norm(nombre)
  return SUBQ.find(([s]) => norm(s) === n || n.startsWith(norm(s)) || norm(s).startsWith(n))?.[1] ?? "#6E56CF"
}

/** Avatar de la suscripción: imagen propia si la subió, si no el logo del servicio (lib/brands) o la inicial con su color. */
export function SubAvatar({ nombre, logo, size = 40, className }: { nombre: string; logo?: string | null; size?: number; className?: string }) {
  if (logo) return <img src={logo} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} />
  const brand = brandFor(nombre)
  if (brand) return <BrandLogo k={brand} size={size} className={className} />
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full font-bold text-white", className)} style={{ width: size, height: size, background: subColor(nombre), fontSize: size * 0.42 }} aria-hidden>
      {(nombre.trim()[0] ?? "?").toUpperCase()}
    </span>
  )
}

/** Recorta al centro y reduce la imagen a 72×72 PNG (data URL), como en la v4. */
export async function toLogo(file: File): Promise<string> {
  const img = await createImageBitmap(file)
  const s = Math.min(img.width, img.height)
  const c = document.createElement("canvas")
  c.width = c.height = 72
  c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 72, 72)
  return c.toDataURL("image/png")
}
