// Redirecciones y enlaces seguros. Isomórfico (navegador y servidor), sin dependencias de Node. Movido de
// apps/web/lib/security/safe-next.ts (F2-E: lo usa también el callback de Google de la API).

/**
 * Ruta interna segura para redirigir después de entrar (?next=…). Solo rutas del mismo sitio: empiezan por "/",
 * no por "//" ni "/\" (los navegadores las tratan como otro dominio) y sin caracteres de control.
 */
export function safeNext(n: string | null | undefined, fallback = "/inicio"): string {
  if (typeof n !== "string" || !n.startsWith("/") || n.length > 2000) return fallback
  if (n.startsWith("//") || n.startsWith("/\\") || /[\u0000-\u001f\u007f\\]/.test(n)) return fallback
  return n
}

/** ¿Es un enlace que se puede abrir sin riesgo (http/https externo, ruta interna o mailto)? Bloquea javascript:, data:, etc. */
export function safeHref(u: string | null | undefined): boolean {
  if (typeof u !== "string" || !u.trim()) return false
  const s = u.trim()
  if (s.startsWith("/")) return safeNext(s, "") !== ""
  return /^(https?:\/\/[^\s/?#]+|mailto:[^\s]+)/i.test(s)
}
