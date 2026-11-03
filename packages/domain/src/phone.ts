// Celulares de Colombia (invitaciones, WhatsApp, avisos). Puro e isomórfico.
// Misma regla que apps/web/lib/notify/whatsapp.ts (normalizeCoPhone/formatCoPhone).

/**
 * Número de celular en formato E.164 de Colombia, sin el "+": 57 + 10 dígitos que empiezan por 3.
 * Acepta "315 123 4567", "(315) 123-4567", "+57 315…", "57315…", "0057315…" y "03151234567". Devuelve null si no es un celular válido.
 */
export function normalizeCoPhone(input: string | null | undefined): string | null {
  let d = String(input ?? "").replace(/\D/g, "")
  if (d.startsWith("0057")) d = d.slice(4)
  else if (d.length === 12 && d.startsWith("57")) d = d.slice(2)
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1)
  return /^3\d{9}$/.test(d) ? `57${d}` : null
}

/** +57 315 123 4567 para mostrar. */
export const formatCoPhone = (e164: string) => e164.replace(/^57(\d{3})(\d{3})(\d{4})$/, "+57 $1 $2 $3")
