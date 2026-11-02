import { cn } from "@/lib/utils"
import { norm } from "@/lib/domain"
import { brandFor } from "@/lib/brands"
import { BrandLogo } from "@/components/mirai/brand-logo"

/** Accesos rápidos (SUBQ de la v4 + populares en Colombia): nombre + color de respaldo si la marca no tiene logo. */
export const SUBQ: [string, string, string][] = [
  // Video y música
  ["Netflix", "#E50914", "Video y música"], ["Disney+", "#113CCF", "Video y música"], ["Max", "#5822B4", "Video y música"], ["Prime Video", "#00A8E1", "Video y música"],
  ["YouTube Premium", "#FF0033", "Video y música"], ["Apple TV+", "#111111", "Video y música"], ["Paramount+", "#0064FF", "Video y música"], ["Crunchyroll", "#F47521", "Video y música"],
  ["ViX Premium", "#FF5A00", "Video y música"], ["DAZN", "#0C161C", "Video y música"], ["Mubi", "#001489", "Video y música"], ["Spotify", "#1DB954", "Video y música"],
  ["Apple Music", "#FA243C", "Video y música"], ["Deezer", "#A238FF", "Video y música"], ["Tidal", "#000000", "Video y música"], ["Audible", "#F8991C", "Video y música"],
  // Apple, Google y Microsoft
  ["Apple One", "#111111", "Apple, Google y Microsoft"], ["iCloud", "#3693F3", "Apple, Google y Microsoft"], ["Google One", "#4285F4", "Apple, Google y Microsoft"],
  ["Google Workspace", "#4285F4", "Apple, Google y Microsoft"], ["Microsoft 365", "#D83B01", "Apple, Google y Microsoft"],
  // Inteligencia artificial
  ["ChatGPT Plus", "#10A37F", "Inteligencia artificial"], ["Claude Pro", "#D97757", "Inteligencia artificial"], ["Gemini Advanced", "#4285F4", "Inteligencia artificial"],
  ["Perplexity Pro", "#20808D", "Inteligencia artificial"], ["Midjourney", "#000000", "Inteligencia artificial"], ["Cursor", "#000000", "Inteligencia artificial"],
  // Nube e infraestructura
  ["AWS", "#FF9900", "Nube e infraestructura"], ["Google Cloud", "#4285F4", "Nube e infraestructura"], ["Microsoft Azure", "#0078D4", "Nube e infraestructura"],
  ["DigitalOcean", "#0080FF", "Nube e infraestructura"], ["Cloudflare", "#F38020", "Nube e infraestructura"], ["Vercel", "#000000", "Nube e infraestructura"],
  ["Netlify", "#00C7B7", "Nube e infraestructura"], ["Heroku", "#430098", "Nube e infraestructura"], ["Supabase", "#3ECF8E", "Nube e infraestructura"],
  ["Firebase", "#FFCA28", "Nube e infraestructura"], ["MongoDB Atlas", "#47A248", "Nube e infraestructura"], ["Oracle Cloud", "#F80000", "Nube e infraestructura"],
  ["Hostinger", "#673DE6", "Nube e infraestructura"], ["GoDaddy", "#1BDBDB", "Nube e infraestructura"], ["Dropbox", "#0061FF", "Nube e infraestructura"],
  // Trabajo y productividad
  ["GitHub", "#181717", "Trabajo y productividad"], ["GitLab", "#FC6D26", "Trabajo y productividad"], ["Notion", "#000000", "Trabajo y productividad"],
  ["Slack", "#4A154B", "Trabajo y productividad"], ["Zoom", "#0B5CFF", "Trabajo y productividad"], ["Figma", "#F24E1E", "Trabajo y productividad"],
  ["Adobe Creative Cloud", "#FA0F00", "Trabajo y productividad"], ["Canva Pro", "#00C4CC", "Trabajo y productividad"], ["Atlassian (Jira)", "#0052CC", "Trabajo y productividad"],
  ["Trello", "#0052CC", "Trabajo y productividad"], ["Asana", "#F06A6A", "Trabajo y productividad"], ["Miro", "#FFD02F", "Trabajo y productividad"],
  ["Grammarly", "#15C39A", "Trabajo y productividad"], ["LinkedIn Premium", "#0A66C2", "Trabajo y productividad"], ["Shopify", "#7AB55C", "Trabajo y productividad"],
  // Seguridad
  ["1Password", "#3B66BC", "Seguridad"], ["Bitwarden", "#175DDC", "Seguridad"], ["NordVPN", "#4687FF", "Seguridad"], ["ExpressVPN", "#DA3940", "Seguridad"],
  // Juegos
  ["Xbox Game Pass", "#107C10", "Juegos"], ["PlayStation Plus", "#003791", "Juegos"], ["Nintendo Switch Online", "#E60012", "Juegos"], ["Steam", "#1B2838", "Juegos"], ["Discord Nitro", "#5865F2", "Juegos"],
  // Aprender
  ["Duolingo", "#58CC02", "Aprender"], ["Platzi", "#98CA3F", "Aprender"], ["Coursera", "#0056D2", "Aprender"], ["Udemy", "#A435F0", "Aprender"], ["Kindle Unlimited", "#232F3E", "Aprender"],
  // Servicios y bienestar
  ["Rappi Prime", "#FF441F", "Servicios y bienestar"], ["Uber One", "#000000", "Servicios y bienestar"], ["DiDi", "#FC4C02", "Servicios y bienestar"],
  ["Smart Fit", "#FFC20E", "Servicios y bienestar"], ["Bodytech", "#E30613", "Servicios y bienestar"], ["Gimnasio", "#3F7A1E", "Servicios y bienestar"],
]

/** Grupos de los accesos rápidos, en orden. */
export const SUBQ_GRUPOS = [...new Set(SUBQ.map(([, , g]) => g))]

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
