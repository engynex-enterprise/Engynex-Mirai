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

// ——— Campo de teléfono (perfil, contactos): formatea mientras se escribe y guarda un número limpio ———

/** Dígitos del número sin el país: quita +57, 0057 y el 0 de larga distancia. */
export function telefonoDigitos(input: string | null | undefined): string {
  let d = String(input ?? "").replace(/\D/g, "")
  if (d.startsWith("0057")) d = d.slice(4)
  else if (d.length >= 12 && d.startsWith("57")) d = d.slice(2)
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1)
  return d.slice(0, 10)
}

/**
 * Lo que se ve mientras la persona escribe: celular "300 123 4567", fijo nuevo "(601) 234 5678",
 * fijo viejo de 7 dígitos "234 5678". Con texto que no parece un número colombiano, lo deja igual.
 */
export function telefonoEscribiendo(raw: string): string {
  const t = String(raw ?? "")
  // Algo que no es un número (una extensión, un texto): no se toca.
  if (/[^\d\s()+.-]/.test(t)) return t
  const d = telefonoDigitos(t)
  if (!d) return ""
  if (d.startsWith("3")) return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(" ")
  if (d.startsWith("60")) return d.length <= 3 ? d : `(${d.slice(0, 3)}) ${[d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(" ")}`.trim()
  if (d.length <= 7) return d.length <= 3 ? d : `${d.slice(0, 3)} ${d.slice(3)}`
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(" ")
}

/** Cómo se guarda: los 10 dígitos del número colombiano; si no se reconoce, el texto tal cual (sin espacios de más). */
export function telefonoGuardar(raw: string): string {
  const t = String(raw ?? "").trim()
  const d = telefonoDigitos(t)
  if (/[^\d\s()+.-]/.test(t)) return t.replace(/\s+/g, " ")
  return /^3\d{9}$/.test(d) || /^60\d{8}$/.test(d) || /^\d{7}$/.test(d) ? d : t.replace(/\s+/g, " ")
}

/** Aviso en español si el número quedó a medias (null si está bien o si está vacío). */
export function telefonoAviso(raw: string): string | null {
  const t = String(raw ?? "").trim()
  if (!t || /[^\d\s()+.-]/.test(t)) return null
  const d = telefonoDigitos(t)
  if (!d) return null
  if (d.startsWith("3")) return d.length === 10 ? null : "Un celular tiene 10 dígitos y empieza por 3"
  if (d.startsWith("60")) return d.length === 10 ? null : "Un fijo tiene 10 dígitos: el indicativo 60X y 7 números"
  if (d.length === 7) return null
  return "Escribe tu celular (300 123 4567) o tu fijo con indicativo (601 234 5678)"
}
