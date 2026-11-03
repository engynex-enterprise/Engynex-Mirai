// /v1/admin/**: solo administradores de la plataforma (@PlatformAdmin en la clase: ninguna ruta queda sin guarda).
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { adminContract as c } from "@mirai/contracts/modules/admin"
import { PlatformAdmin } from "../../core/context/decorators"
import { AdminService } from "./admin.service"

const ok = <T>(data: T) => ({ status: 200 as const, body: { ok: true as const, data } })
const json = <T>(body: T) => ({ status: 200 as const, body })

@Controller()
@PlatformAdmin()
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @TsRestHandler(c)
  handler() {
    return tsRestHandler(c, {
      overview: async () => json(await this.svc.overview()),
      clients: async () => json(await this.svc.clients()),
      user: async ({ params }) => json(await this.svc.user(params.userId)),
      setSuspended: async ({ params, body }) => ok(await this.svc.setSuspended(params.userId, body.suspend)),
      recoveryLink: async ({ params }) => ok(await this.svc.recoveryLink(params.userId)),
      setPlatformAdmin: async ({ params, body }) => ok(await this.svc.setPlatformAdmin(params.userId, body.on)),
      deleteUser: async ({ params, body }) => ok(await this.svc.deleteUser(params.userId, body.confirmEmail)),
      addNote: async ({ params, body }) => ok(await this.svc.addNote(params.userId, body.texto)),
      deleteNote: async ({ params }) => ok(await this.svc.deleteNote(params.noteId)),
      inviteUser: async ({ body }) => ok(await this.svc.inviteUser(body.email, body.nombre)),
      households: async () => json(await this.svc.households()),
      assignPlan: async ({ params, body }) => ok(await this.svc.assignPlan(params.householdId, body)),
      grantPremium: async ({ params, body }) => ok(await this.svc.grantPremium(params.householdId, body)),
      revokeCourtesy: async ({ params }) => ok(await this.svc.revokeCourtesy(params.householdId)),
      subscriptions: async () => json(await this.svc.subscriptions()),
      updateSubscription: async ({ params, body }) => ok(await this.svc.updateSubscription(params.subscriptionId, body.action)),
      revenue: async () => json(await this.svc.revenue()),
      manualPayment: async ({ body }) => ok(await this.svc.manualPayment(body)),
      updatePayment: async ({ params, body }) => ok(await this.svc.updatePayment(params.paymentId, body)),
      broadcast: async ({ body }) => ok(await this.svc.broadcast(body)),
      admins: async () => json(await this.svc.admins()),
      addAdmin: async ({ body }) => ok(await this.svc.addAdmin(body.email)),
      audit: async () => json(await this.svc.auditLog()),
      system: async () => json(await this.svc.system()),
      saveSettings: async ({ body }) => ok(await this.svc.saveSettings(body)),
      cleanOrphans: async () => ok(await this.svc.cleanOrphans()),
      feedback: async () => json(await this.svc.feedback()),
      updateFeedback: async ({ params, body }) => ok(await this.svc.updateFeedback(params.feedbackId, body)),
      notifyLog: async () => json(await this.svc.notifyLog()),
      testDefaults: async () => json(await this.svc.testDefaults()),
    })
  }
}
