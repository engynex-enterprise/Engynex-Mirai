/**
 * Dirección pública de Mirai (enlaces en correos, invitaciones, portal del contador y retorno de Google).
 * Orden: NEXT_PUBLIC_SITE_URL → dominio de producción que Vercel expone solo (variable de sistema) → localhost.
 */
export function siteUrl() {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
  return (process.env.NEXT_PUBLIC_SITE_URL || (vercel ? `https://${vercel}` : "http://localhost:3000")).trim().replace(/\/+$/, "")
}

/**
 * Dirección pública con https para lo que descargan servicios externos (por ejemplo Meta, la imagen del encabezado de
 * WhatsApp): la del sitio si es https; si no (localhost), la de producción de Vercel o mirai.engynex.com.
 */
export function publicSiteUrl() {
  const s = siteUrl()
  if (/^https:\/\//.test(s) && !/localhost|127\.0\.0\.1/.test(s)) return s
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
  return vercel ? `https://${vercel}` : "https://mirai.engynex.com"
}
