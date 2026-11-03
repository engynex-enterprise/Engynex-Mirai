// Anuncios del plan gratis: cuál mostrar en cada espacio. Puro, para probarlo sin red.

export type AdSlotId = "inicio" | "historia" | "consejero" | "lista" | "reportes" | "ticker" | "modal" | "accion"
export const AD_SLOTS: { value: AdSlotId; label: string; desc: string }[] = [
  { value: "inicio", label: "Feed de Inicio", desc: "Tarjeta en Inicio, debajo de las historias" },
  { value: "historia", label: "Historias", desc: "Una historia más entre las tarjetas de arriba de Inicio" },
  { value: "consejero", label: "Junto al consejero", desc: "Debajo de \"Consejero antes de gastar\" en Inicio" },
  { value: "lista", label: "Listas", desc: "Al final de las listas de gastos e ingresos" },
  { value: "reportes", label: "Reportes", desc: "Al final de Reportes" },
  { value: "ticker", label: "Texto en movimiento", desc: "Barra delgada fija arriba de todas las pantallas" },
  { value: "modal", label: "Ventana al entrar", desc: "Ventana emergente al iniciar sesión (máximo una vez cada cierto tiempo)" },
  { value: "accion", label: "Después de una acción", desc: "Al registrar un gasto, un ingreso u otro movimiento (con límite de frecuencia)" },
]
export type AdFormat = "imagen" | "carrusel" | "video" | "historia" | "texto" | "modal"
export const AD_FORMATS: { value: AdFormat; label: string; desc: string; slots: AdSlotId[] }[] = [
  { value: "imagen", label: "Imagen", desc: "Una imagen con título, texto y botón", slots: ["inicio", "consejero", "lista", "reportes", "modal", "accion"] },
  { value: "carrusel", label: "Carrusel", desc: "Varias tarjetas que se deslizan", slots: ["inicio", "consejero", "lista", "reportes", "modal", "accion"] },
  { value: "video", label: "Video", desc: "Un video corto (mp4) con botón", slots: ["inicio", "consejero", "reportes", "modal", "accion"] },
  { value: "historia", label: "Historia", desc: "Vertical, a pantalla de tarjeta, entre las historias", slots: ["historia"] },
  { value: "texto", label: "Texto", desc: "Solo texto: ideal para la barra en movimiento", slots: ["ticker", "inicio", "lista", "accion"] },
  { value: "modal", label: "Ventana", desc: "Imagen grande en una ventana emergente", slots: ["modal", "accion"] },
]
export type CampaignLike = { id: string; estado: string; desde: string | null; hasta: string | null; planes: string[]; dispositivos: string[]; frecuencia_max: number; prioridad: number }

export type AdLike = { id: string; ubicaciones: string[]; activo: boolean; desde: string | null; hasta: string | null; prioridad: number; campaign_id?: string | null; formato?: string }

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

/** Frecuencia por defecto para anuncios sin campaña (veces por persona al día). */
export const DEFAULT_FREQ = 5

/**
 * Anuncios que esta persona puede ver hoy en un espacio: anuncio y campaña vigentes y activos, plan y dispositivo
 * dentro de la segmentación y sin pasar el límite de veces por día. La prioridad de la campaña se suma a la del anuncio.
 */
export function eligibleAds<T extends AdLike>(ads: T[], campaigns: CampaignLike[], ctx: { slot: AdSlotId; hoy: string; plan: string; device: "movil" | "escritorio"; vistasHoy: Record<string, number> }): T[] {
  const camp = new Map(campaigns.map((c) => [c.id, c]))
  return ads.flatMap((a) => {
    if (!a.ubicaciones.includes(ctx.slot) || !adVigente(a, ctx.hoy)) return []
    const c = a.campaign_id ? camp.get(a.campaign_id) : undefined
    if (a.campaign_id && !c) return []
    if (c) {
      if (c.estado !== "activa" || (c.desde && c.desde > ctx.hoy) || (c.hasta && c.hasta < ctx.hoy)) return []
      if (c.planes.length && !c.planes.includes(ctx.plan)) return []
      if (c.dispositivos.length && !c.dispositivos.includes(ctx.device)) return []
    }
    if ((ctx.vistasHoy[a.id] ?? 0) >= (c?.frecuencia_max ?? DEFAULT_FREQ)) return []
    return [{ ...a, prioridad: a.prioridad + (c?.prioridad ?? 0) }]
  })
}

/** ¿Este espacio va para AdSense? Reparte según el porcentaje configurado (estable por persona, día y espacio). */
export const goesToAdsense = (seed: number, pct: number) => pct > 0 && Math.abs(seed) % 100 < pct

/** Gasto estimado de una campaña según su modelo de cobro. */
export function campaignCost(c: { modelo_cobro: string; tarifa: number }, impresiones: number, clics: number) {
  if (c.modelo_cobro === "cpc") return Math.round(clics * c.tarifa)
  if (c.modelo_cobro === "fijo") return Math.round(c.tarifa)
  return Math.round((impresiones / 1000) * c.tarifa)
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
