import { SetMetadata } from "@nestjs/common"

export const IS_PUBLIC = "mirai:public"
/** Ruta sin sesión (health, webhooks con firma, portal del contador, jobs con SchedulerGuard). */
export const Public = () => SetMetadata(IS_PUBLIC, true)
