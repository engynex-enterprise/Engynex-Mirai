// V7-G (E15): calificar, buscar y contar (cualquier rol del hogar: son sus propias conversaciones).
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { chatContract as c } from "@mirai/contracts/modules/chat"
import { MinRole } from "../../core/context/decorators"
import { ok } from "../book-tables/http"
import { ChatExtrasService } from "./chat-extras.service"

@Controller()
export class ChatExtrasController {
  constructor(private readonly svc: ChatExtrasService) {}

  @TsRestHandler(c.rateMessage)
  @MinRole("viewer")
  rateMessage() {
    return tsRestHandler(c.rateMessage, async ({ params, body }) => ok(await this.svc.rate(params.messageId, body.feedback)))
  }

  @TsRestHandler(c.search)
  @MinRole("viewer")
  search() {
    return tsRestHandler(c.search, async ({ query }) => ({ status: 200, body: await this.svc.search(query.q) }))
  }

  @TsRestHandler(c.threadsCount)
  @MinRole("viewer")
  threadsCount() {
    return tsRestHandler(c.threadsCount, async () => ({ status: 200, body: await this.svc.count() }))
  }
}
