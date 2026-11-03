// Controller de opiniones (§2.1): sin :bookId (la opinión es de la persona); límite por persona.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { feedbackContract as c } from "@mirai/contracts/modules/feedback"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { RateLimit } from "../../core/rate-limit/rate-limit.guard"
import { ok } from "../book-tables/http"
import { FeedbackService } from "./feedback.service"

/** Límite propio de opiniones (LIMITS.opiniones: 10 por hora por persona). */
const LIMIT = "opiniones" as const
const LIMIT_MSG = "Enviaste muchas opiniones seguidas"

@Controller()
export class FeedbackController {
  constructor(private readonly svc: FeedbackService) {}

  @TsRestHandler(c.send)
  @RateLimit(LIMIT, "user", LIMIT_MSG)
  @Idempotent()
  send() {
    return tsRestHandler(c.send, async ({ body }) => ok(await this.svc.send(body)))
  }

  @TsRestHandler(c.rating)
  @RateLimit(LIMIT, "user", LIMIT_MSG)
  @Idempotent()
  rating() {
    return tsRestHandler(c.rating, async ({ body }) => ok(await this.svc.rating(body)))
  }

  @TsRestHandler(c.mine)
  mine() {
    return tsRestHandler(c.mine, async () => ({ status: 200, body: await this.svc.mine() }))
  }

  @TsRestHandler(c.remove)
  remove() {
    return tsRestHandler(c.remove, async ({ params }) => ok(await this.svc.remove(params.feedbackId)))
  }
}
