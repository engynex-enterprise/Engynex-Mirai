// Cabeceras de seguridad de todas las respuestas (next.config.ts › headers). Puro: se prueba en headers.test.ts.
//
// Política de contenido (CSP) en dos partes:
//  · Siempre activa (no puede romper nada de Mirai): no dejar que otros sitios metan Mirai en un iframe
//    (frame-ancestors), sin plugins (object-src) y sin <base> ajeno (base-uri).
//  · Completa (scripts, conexiones, imágenes, iframes): en modo "solo reportar" hasta revisarla en el navegador con
//    Google, AdSense, Turnstile y Sentry. Con MIRAI_CSP_ENFORCE=1 se aplica de verdad.
//    script-src lleva 'unsafe-inline' porque Next.js mete scripts en línea sin nonce (con cacheComponents un nonce
//    obligaría a renderizar todo dinámico) y https: porque AdSense carga scripts de varios dominios de Google.

type Header = { key: string; value: string }

type CspOpts = { dev: boolean; apiUrl?: string; realtimeUrl?: string }

const urlOf = (u?: string) => { try { return u ? new URL(u) : null } catch { return null } }

/** Origen de la API y del gateway de tiempo real (http(s) + ws(s) del mismo host). */
function apiOrigins(o: CspOpts): string[] {
  const out: string[] = []
  const api = urlOf(o.apiUrl)
  if (api) out.push(api.origin)
  const rt = urlOf(o.realtimeUrl)
  if (rt) out.push(rt.origin, `${rt.protocol === "http:" ? "ws" : "wss"}://${rt.host}`)
  return [...new Set(out)]
}

export function cspDirectives(o: CspOpts): string {
  const d: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "https:", ...(o.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...apiOrigins(o), "https:", "wss:", ...(o.dev ? ["ws:", "http://localhost:*", "http://127.0.0.1:*"] : [])],
    "frame-src": ["'self'", "https:"],
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "data:", "blob:"],
    "manifest-src": ["'self'"],
    "form-action": ["'self'", "https:"],
    "frame-ancestors": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
  }
  return Object.entries(d).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ") + (o.dev ? "" : "; upgrade-insecure-requests")
}

/** Lo que siempre se aplica de la CSP (no bloquea scripts, estilos ni conexiones). */
export const CSP_BASE = "frame-ancestors 'self'; object-src 'none'; base-uri 'self'"

export function securityHeaders(o: CspOpts & { enforceCsp?: boolean }): Header[] {
  const full = cspDirectives(o)
  return [
    o.enforceCsp ? { key: "Content-Security-Policy", value: full } : { key: "Content-Security-Policy", value: CSP_BASE },
    // upgrade-insecure-requests no aplica en modo solo-reporte (el navegador lo ignora y avisa en la consola).
    ...(o.enforceCsp ? [] : [{ key: "Content-Security-Policy-Report-Only", value: full.replace("; upgrade-insecure-requests", "") }]),
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Cámara y micrófono solo para Mirai (fotos de facturas y dictado en el chat); lo demás, apagado.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    ...(o.dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ]
}
