// Llaves de las pasarelas (Secret Manager en Cloud Run). Se leen aquí y no en el esquema global para que el núcleo no
// cambie con cada pasarela; los nombres son los mismos de apps/web (.env.example). Nunca se registran sus valores.
import { Injectable } from "@nestjs/common"
import { AppConfig } from "../../core/config/app-config"

export type BillingEnv = {
  mercadopagoToken?: string
  mercadopagoWebhookSecret?: string
  wompiPublicKey?: string
  wompiIntegritySecret?: string
  wompiEventsSecret?: string
  /** En producción la firma de Mercado Pago es obligatoria (sin la clave del webhook no se procesa nada). */
  production: boolean
}

const v = (s: string | undefined) => (s?.trim() ? s.trim() : undefined)

export function billingEnvFrom(env: NodeJS.ProcessEnv, production: boolean): BillingEnv {
  return {
    mercadopagoToken: v(env.MERCADOPAGO_ACCESS_TOKEN),
    mercadopagoWebhookSecret: v(env.MERCADOPAGO_WEBHOOK_SECRET),
    wompiPublicKey: v(env.WOMPI_PUBLIC_KEY ?? env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY),
    wompiIntegritySecret: v(env.WOMPI_INTEGRITY_SECRET),
    wompiEventsSecret: v(env.WOMPI_EVENTS_SECRET),
    production,
  }
}

@Injectable()
export class BillingConfig {
  readonly env: BillingEnv
  constructor(config: AppConfig) {
    this.env = billingEnvFrom(process.env, config.env === "produccion")
  }
  /** Pasarelas listas en este despliegue (payConfig de apps/web/lib/payments/apply.ts). */
  get options() {
    return { mercadopago: !!this.env.mercadopagoToken, wompi: !!(this.env.wompiPublicKey && this.env.wompiIntegritySecret) }
  }
}
