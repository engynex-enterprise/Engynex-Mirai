// Dirección pública de la web de Mirai para los enlaces (invitaciones, correos, retorno de las pasarelas, portal del
// contador). Misma regla que siteUrl() de apps/web/lib/site-url.ts, con SITE_URL (Cloud Run) primero.
import { Injectable } from "@nestjs/common"

export function siteUrlFrom(env: NodeJS.ProcessEnv): string {
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL || env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
  return (env.SITE_URL || env.NEXT_PUBLIC_SITE_URL || (vercel ? `https://${vercel}` : "http://localhost:3000")).trim().replace(/\/+$/, "")
}

@Injectable()
export class SiteUrl {
  readonly base: string
  constructor() {
    this.base = siteUrlFrom(process.env)
  }
  /** URL absoluta de una ruta de la web ("/invitacion/…"). */
  to(path: string) {
    return `${this.base}${path.startsWith("/") ? path : `/${path}`}`
  }
}
