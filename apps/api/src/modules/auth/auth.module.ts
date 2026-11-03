import { Global, Module } from "@nestjs/common"
import type { Logger } from "pino"
import { SessionResolver } from "../../core/auth/better-auth.verifier"
import { LOGGER } from "../../core/logging/logger"
import { AuthEnv } from "./auth.env"
import { AuthAdminController, AuthController } from "./auth.controller"
import { AuthMailer, LogAuthMailer, MemoryAuthMailer, ServicesAuthMailer } from "./auth-mailer"
import { AuthRoutes } from "./auth.routes"
import { AuthService } from "./auth.service"
import { BetterAuthIdentityAdmin } from "./better-auth.identity-admin"
import { MiraiAuthService } from "./mirai-auth.service"

// Módulo `auth` (v7, V7-A; docs/arquitectura/v7-gcp-total.md §3.1). Dueño: V7-A.
// Better Auth en /api/auth/* (cookie httpOnly en el mismo origen o Bearer de sesión) + lo de Mirai en /v1/auth/**.
// Con AUTH_PROVIDER=supabase (por defecto) no monta nada ni abre conexiones: /v1/auth/config responde `supabase`.
// Global: el verificador de la cadena (core) y la cuenta (account) usan SessionResolver y MiraiAuthService.
@Global()
@Module({
  controllers: [AuthController, AuthAdminController],
  providers: [
    AuthEnv,
    {
      provide: AuthMailer,
      inject: [AuthEnv, LOGGER],
      useFactory: (env: AuthEnv, log: Logger) => {
        const v = env.values
        if (v.mailDriver === "memory") return new MemoryAuthMailer()
        if (v.mailDriver === "log" && v.env === "local") return new LogAuthMailer(log)
        return new ServicesAuthMailer(log, v.mailFrom)
      },
    },
    MiraiAuthService,
    { provide: SessionResolver, useExisting: MiraiAuthService },
    BetterAuthIdentityAdmin,
    AuthService,
    AuthRoutes,
  ],
  exports: [AuthEnv, MiraiAuthService, SessionResolver, BetterAuthIdentityAdmin, AuthMailer],
})
export class AuthModule {}
