// Controllers del hogar (§2.1): validan con el contrato y llaman UN método del servicio. Las reglas de rol se revisan
// en el servicio con HouseholdAccess (la ruta lleva :householdId, no :bookId) y la base vuelve a revisar.
import { Controller, Req } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { householdsContract as c } from "@mirai/contracts/modules/households"
import { bearer } from "../../core/auth/auth.guard"
import { Public } from "../../core/auth/decorators"
import { TokenVerifier } from "../../core/auth/token-verifier"
import { RequestContextService } from "../../core/context/request-context.service"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { HouseholdsService } from "./households.service"

const ok = <T>(data: T) => ({ status: 200 as const, body: { ok: true as const, data } })

@Controller()
export class HouseholdsController {
  constructor(private readonly svc: HouseholdsService) {}

  @TsRestHandler(c.create)
  @Idempotent()
  create() {
    return tsRestHandler(c.create, async ({ body }) => ok(await this.svc.create(body)))
  }

  @TsRestHandler(c.rename)
  rename() {
    return tsRestHandler(c.rename, async ({ params, body }) => ok(await this.svc.rename(params.householdId, body.nombre)))
  }

  @TsRestHandler(c.remove)
  remove() {
    return tsRestHandler(c.remove, async ({ params, body }) => ok(await this.svc.remove(params.householdId, body.confirm)))
  }

  @TsRestHandler(c.leave)
  leave() {
    return tsRestHandler(c.leave, async ({ params }) => ok(await this.svc.leave(params.householdId)))
  }

  @TsRestHandler(c.people)
  people() {
    return tsRestHandler(c.people, async ({ params }) => ({ status: 200, body: await this.svc.people(params.householdId) }))
  }

  @TsRestHandler(c.changeRole)
  changeRole() {
    return tsRestHandler(c.changeRole, async ({ params, body }) => ok(await this.svc.changeRole(params.householdId, params.userId, body.access)))
  }

  @TsRestHandler(c.removePerson)
  removePerson() {
    return tsRestHandler(c.removePerson, async ({ params }) => ok(await this.svc.removePerson(params.householdId, params.userId)))
  }

  @TsRestHandler(c.linkPerson)
  linkPerson() {
    return tsRestHandler(c.linkPerson, async ({ params, body }) => ok(await this.svc.linkPerson(params.householdId, params.userId, body.familyId)))
  }

  @TsRestHandler(c.makeOwner)
  makeOwner() {
    return tsRestHandler(c.makeOwner, async ({ params, body }) => ok(await this.svc.makeOwner(params.householdId, body.userId)))
  }

  @TsRestHandler(c.inviteChannels)
  inviteChannels() {
    return tsRestHandler(c.inviteChannels, async ({ params }) => ({ status: 200 as const, body: await this.svc.inviteChannels(params.householdId) }))
  }

  @TsRestHandler(c.invite)
  @Idempotent()
  invite() {
    return tsRestHandler(c.invite, async ({ params, body }) => ok(await this.svc.invite(params.householdId, body)))
  }

  @TsRestHandler(c.resendInvitation)
  resendInvitation() {
    return tsRestHandler(c.resendInvitation, async ({ params }) => ok(await this.svc.resend(params.householdId, params.invitationId)))
  }

  @TsRestHandler(c.shareInvitation)
  shareInvitation() {
    return tsRestHandler(c.shareInvitation, async ({ params }) => ok(await this.svc.share(params.householdId, params.invitationId)))
  }

  @TsRestHandler(c.markInvitationShared)
  markInvitationShared() {
    return tsRestHandler(c.markInvitationShared, async ({ params }) => ok(await this.svc.markShared(params.householdId, params.invitationId)))
  }

  @TsRestHandler(c.cancelInvitation)
  cancelInvitation() {
    return tsRestHandler(c.cancelInvitation, async ({ params }) => ok(await this.svc.cancelInvitation(params.householdId, params.invitationId)))
  }

  @TsRestHandler(c.createFamily)
  createFamily() {
    return tsRestHandler(c.createFamily, async ({ params, body }) => ok(await this.svc.saveFamily(params.householdId, null, body)))
  }

  @TsRestHandler(c.updateFamily)
  updateFamily() {
    return tsRestHandler(c.updateFamily, async ({ params, body }) => ok(await this.svc.saveFamily(params.householdId, params.familyId, body)))
  }

  @TsRestHandler(c.family)
  family() {
    return tsRestHandler(c.family, async ({ params }) => ({ status: 200, body: await this.svc.family(params.householdId) }))
  }

  @TsRestHandler(c.patchFamily)
  patchFamily() {
    return tsRestHandler(c.patchFamily, async ({ params, body }) => ok(await this.svc.patchFamily(params.householdId, params.familyId, body)))
  }

  @TsRestHandler(c.deleteFamily)
  deleteFamily() {
    return tsRestHandler(c.deleteFamily, async ({ params }) => ok(await this.svc.deleteFamily(params.householdId, params.familyId)))
  }

  @TsRestHandler(c.restoreFamily)
  restoreFamily() {
    return tsRestHandler(c.restoreFamily, async ({ params }) => ok(await this.svc.deleteFamily(params.householdId, params.familyId, true)))
  }

  @TsRestHandler(c.transferCandidates)
  transferCandidates() {
    return tsRestHandler(c.transferCandidates, async ({ params }) => ({ status: 200, body: await this.svc.transferCandidates(params.householdId) }))
  }

  @TsRestHandler(c.requestTransfer)
  requestTransfer() {
    return tsRestHandler(c.requestTransfer, async ({ params, body }) => ok(await this.svc.requestTransfer(params.householdId, body)))
  }

  @TsRestHandler(c.respondTransfer)
  respondTransfer() {
    return tsRestHandler(c.respondTransfer, async ({ params, body }) => ok(await this.svc.respondTransfer(params.transferId, body.accept)))
  }

  @TsRestHandler(c.cancelTransfer)
  cancelTransfer() {
    return tsRestHandler(c.cancelTransfer, async ({ params }) => ok(await this.svc.cancelTransfer(params.transferId)))
  }

  @TsRestHandler(c.acceptInvitation)
  acceptInvitation() {
    return tsRestHandler(c.acceptInvitation, async ({ params }) => ok(await this.svc.accept(params.token)))
  }
}

/**
 * /v1/invitations/:token: pública (la página de la invitación se ve sin cuenta). Si llega un Bearer válido se usa la
 * sesión para saber si ya es miembro (igual que la web con supabaseServer); uno inválido se ignora.
 */
@Controller()
export class InvitationsController {
  constructor(
    private readonly svc: HouseholdsService,
    private readonly verifier: TokenVerifier,
    private readonly ctx: RequestContextService,
  ) {}

  @TsRestHandler(c.invitationInfo)
  @Public()
  invitationInfo(@Req() req: { headers: Record<string, string | string[] | undefined> }) {
    return tsRestHandler(c.invitationInfo, async ({ params }) => {
      const token = bearer(req.headers.authorization)
      let withUser = false
      if (token) {
        try {
          this.ctx.patch({ user: await this.verifier.verify(token) })
          withUser = true
        } catch {
          /* sin sesión */
        }
      }
      return { status: 200, body: await this.svc.invitationInfo(params.token, withUser) }
    })
  }
}
