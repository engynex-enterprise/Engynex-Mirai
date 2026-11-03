// Nodo "Consejo de la IA" de las automatizaciones en la API (F2-E-4 lo dejó pendiente: `rt().aiText`). ServicesRuntime
// (IntegrationsModule, F2-E) configura @mirai/services al iniciar su módulo; AiModule lo importa, así Nest inicia
// IntegrationsModule primero y aquí solo se agrega aiText de @mirai/ai/run (plan, créditos, caché y ai_usage iguales
// a la web, que lo conecta en apps/web/lib/services.ts).
import { Injectable, type OnModuleInit } from "@nestjs/common"
import type { AiFeature } from "@mirai/ai/features"
import { aiText } from "@mirai/ai/run"
import { configureServices, rt, servicesConfigured, type ServicesRuntime } from "@mirai/services/runtime"

/** aiText para @mirai/services (las pruebas lo cambian por un doble). */
export const automationAiText: NonNullable<ServicesRuntime["aiText"]> = async (o) => {
  const r = await aiText({ ...o, feature: o.feature as AiFeature })
  return { text: r.text }
}

@Injectable()
export class AiRuntime implements OnModuleInit {
  onModuleInit() {
    if (servicesConfigured()) configureServices({ ...rt(), aiText: automationAiText })
  }
}
