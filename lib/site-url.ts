/**
 * Dirección pública de Mirai (enlaces en correos, invitaciones, portal del contador y retorno de Google).
 * Orden: NEXT_PUBLIC_SITE_URL → dominio de producción que Vercel expone solo (variable de sistema) → localhost.
 */
export function siteUrl() {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
  return (process.env.NEXT_PUBLIC_SITE_URL || (vercel ? `https://${vercel}` : "http://localhost:3000")).trim().replace(/\/+$/, "")
}
