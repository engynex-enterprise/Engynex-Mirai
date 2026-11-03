import { Injectable } from "@nestjs/common"
import { booksWithPendingEvents, processBook, runAutomationsCron } from "@mirai/services/automations/server"
import { AutomationsRunner } from "./automations.port"

@Injectable()
export class ServicesAutomations extends AutomationsRunner {
  processBook(bookId: string) {
    return processBook(bookId, { state: true })
  }
  hourly() {
    // La API es siempre la pasada horaria (nunca la diaria de Vercel): respeta la hora de las programadas.
    return runAutomationsCron({ daily: false })
  }
  pendingBooks() {
    return booksWithPendingEvents()
  }
}
