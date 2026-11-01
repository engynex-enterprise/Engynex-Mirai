// Anuncios del plan gratis: cuál mostrar en cada espacio. Puro, para probarlo sin red.

export type AdSlotId = "inicio" | "lista" | "reportes"
export const AD_SLOTS: { value: AdSlotId; label: string; desc: string }[] = [
  { value: "inicio", label: "Inicio", desc: "Tarjeta en Inicio, debajo de los accesos rápidos" },
  { value: "lista", label: "Listas", desc: "Al final de las listas de gastos e ingresos" },
  { value: "reportes", label: "Reportes", desc: "Al final de Reportes" },
]

export type AdLike = { id: string; ubicaciones: string[]; activo: boolean; desde: string | null; hasta: string | null; prioridad: number }

/** ¿El anuncio está vigente hoy (fechas en hora de Colombia, AAAA-MM-DD)? */
export const adVigente = (a: AdLike, hoy: string) => a.activo && (!a.desde || a.desde <= hoy) && (!a.hasta || a.hasta >= hoy)

/**
 * Elige el anuncio de un espacio: solo los vigentes de esa ubicación; la prioridad más alta gana y, entre iguales,
 * rota según la semilla (por ejemplo el día + la persona) para repartir las vistas.
 */
export function pickAd<T extends AdLike>(ads: T[], slot: AdSlotId, hoy: string, seed: number): T | null {
  const ok = ads.filter((a) => a.ubicaciones.includes(slot) && adVigente(a, hoy))
  if (!ok.length) return null
  const top = Math.max(...ok.map((a) => a.prioridad))
  const best = ok.filter((a) => a.prioridad === top).sort((a, b) => a.id.localeCompare(b.id))
  return best[Math.abs(seed) % best.length]
}

/** Semilla estable por día y persona (el mismo anuncio durante el día, distinto entre personas). */
export function adSeed(userId: string, hoy: string) {
  let h = 0
  for (const c of userId + hoy) h = (h * 31 + c.charCodeAt(0)) | 0
  return h
}

/** CTR en porcentaje con un decimal. */
export const ctr = (vistas: number, clics: number) => (vistas ? Math.round((clics / vistas) * 1000) / 10 : 0)

/** Línea de ads.txt para AdSense a partir del id de cliente ("ca-pub-123…"). */
export function adsTxt(client?: string | null) {
  const pub = client?.replace(/^ca-/, "")
  return pub && /^pub-\d+$/.test(pub) ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : ""
}
