import { type CanActivate, Injectable } from "@nestjs/common"
import { DomainError } from "../errors/domain-error"
import { AppContextService } from "./app-context.service"
import { RequestContextService } from "./request-context.service"

/** @PlatformAdmin(): la persona está en platform_admins (mirai_app_context.admin). */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly contexts: AppContextService,
    private readonly ctx: RequestContextService,
  ) {}
  async canActivate(): Promise<boolean> {
    const raw = await this.contexts.raw(this.ctx.user)
    if (!raw.admin) throw DomainError.role("Solo el administrador de Mirai puede ver esto.")
    return true
  }
}
