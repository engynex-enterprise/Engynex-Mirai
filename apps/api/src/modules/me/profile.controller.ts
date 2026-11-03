// Controller de perfil, preferencias, libro activo y plataforma (V7-G). Sin :bookId: la sesión basta
// (AuthGuard) y la RLS de cada tabla deja tocar solo lo propio. El aviso para todos es público.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { meContract as c } from "@mirai/contracts/modules/me"
import { Public } from "../../core/auth/decorators"
import { ok } from "../book-tables/http"
import { ProfileService } from "./profile.service"

@Controller()
export class ProfileController {
  constructor(private readonly svc: ProfileService) {}

  @TsRestHandler(c.setActiveBook)
  setActiveBook() {
    return tsRestHandler(c.setActiveBook, async ({ body }) => ok(await this.svc.setActiveBook(body.bookId)))
  }

  @TsRestHandler(c.profile)
  profile() {
    return tsRestHandler(c.profile, async () => ({ status: 200, body: await this.svc.profile() }))
  }

  @TsRestHandler(c.updateProfile)
  updateProfile() {
    return tsRestHandler(c.updateProfile, async ({ body }) => ({ status: 200, body: await this.svc.updateProfile(body) }))
  }

  @TsRestHandler(c.preferences)
  preferences() {
    return tsRestHandler(c.preferences, async () => ({ status: 200, body: await this.svc.preferences() }))
  }

  @TsRestHandler(c.updatePreferences)
  updatePreferences() {
    return tsRestHandler(c.updatePreferences, async ({ body }) => ({ status: 200, body: await this.svc.updatePreferences(body) }))
  }

  @TsRestHandler(c.platformNotice)
  @Public()
  platformNotice() {
    return tsRestHandler(c.platformNotice, async () => ({ status: 200, body: await this.svc.platformNotice() }))
  }

  @TsRestHandler(c.platformIntegrations)
  platformIntegrations() {
    return tsRestHandler(c.platformIntegrations, async () => ({ status: 200, body: await this.svc.platformIntegrations() }))
  }
}
