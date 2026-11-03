// Lista de todos los módulos de la API (§2.6 y §8). La crea F2-B con todos los módulos (los que aún no existen, como
// stubs vacíos); cada frente llena SOLO su carpeta, así nadie edita este archivo salvo para agregar un módulo nuevo.
// `id` coincide con `meta.id` de packages/contracts/src/modules/<id>.ts (la prueba modules/index.test.ts lo revisa).
import type { Type } from "@nestjs/common"
import { MeModule } from "./me/me.module"
import { AccountModule } from "./account/account.module"
import { HouseholdsModule } from "./households/households.module"
import { BooksModule } from "./books/books.module"
import { BookTablesModule } from "./book-tables/book-tables.module"
import { CatalogsModule } from "./catalogs/catalogs.module"
import { ExpensesModule } from "./expenses/expenses.module"
import { IncomesModule } from "./incomes/incomes.module"
import { FixedModule } from "./fixed/fixed.module"
import { CardsModule } from "./cards/cards.module"
import { LoansModule } from "./loans/loans.module"
import { SavingsModule } from "./savings/savings.module"
import { AssetsModule } from "./assets/assets.module"
import { BudgetModule } from "./budget/budget.module"
import { InsightsModule } from "./insights/insights.module"
import { TaxModule } from "./tax/tax.module"
import { BillingModule } from "./billing/billing.module"
import { AiModule } from "./ai/ai.module"
import { ChatModule } from "./chat/chat.module"
import { NotificationsModule } from "./notifications/notifications.module"
import { IntegrationsModule } from "./integrations/integrations.module"
import { GoogleModule } from "./google/google.module"
import { AutomationsModule } from "./automations/automations.module"
import { ImportModule } from "./import/import.module"
import { GamiModule } from "./gami/gami.module"
import { AdsModule } from "./ads/ads.module"
import { FeedbackModule } from "./feedback/feedback.module"
import { AdminModule } from "./admin/admin.module"
import { FilesModule } from "./files/files.module"
import { RealtimeModule } from "./realtime/realtime.module"
import { JobsModule } from "./jobs/jobs.module"
import { HealthModule } from "./health/health.module"

export type ApiModuleEntry = { id: string; owner: string; module: Type }

export const API_MODULES: readonly ApiModuleEntry[] = [
  { id: "me", owner: "F2-B", module: MeModule },
  { id: "account", owner: "F2-I", module: AccountModule },
  { id: "households", owner: "F2-I", module: HouseholdsModule },
  { id: "books", owner: "F2-I", module: BooksModule },
  { id: "book-tables", owner: "F2-C (lectura) y F2-D (escritura)", module: BookTablesModule },
  { id: "catalogs", owner: "F2-D", module: CatalogsModule },
  { id: "expenses", owner: "F2-D", module: ExpensesModule },
  { id: "incomes", owner: "F2-D", module: IncomesModule },
  { id: "fixed", owner: "F2-D", module: FixedModule },
  { id: "cards", owner: "F2-D", module: CardsModule },
  { id: "loans", owner: "F2-D", module: LoansModule },
  { id: "savings", owner: "F2-D", module: SavingsModule },
  { id: "assets", owner: "F2-D", module: AssetsModule },
  { id: "budget", owner: "F2-D", module: BudgetModule },
  { id: "insights", owner: "F2-C", module: InsightsModule },
  { id: "tax", owner: "F2-D (portal del contador: F2-I)", module: TaxModule },
  { id: "billing", owner: "F2-I (lectura pública: F2-C)", module: BillingModule },
  { id: "ai", owner: "F2-F", module: AiModule },
  { id: "chat", owner: "F2-F", module: ChatModule },
  { id: "notifications", owner: "F2-C (campana) y F2-E", module: NotificationsModule },
  { id: "integrations", owner: "F2-E", module: IntegrationsModule },
  { id: "google", owner: "F2-E", module: GoogleModule },
  { id: "automations", owner: "F2-E", module: AutomationsModule },
  { id: "import", owner: "F2-D", module: ImportModule },
  { id: "gami", owner: "F2-C", module: GamiModule },
  { id: "ads", owner: "F2-C", module: AdsModule },
  { id: "feedback", owner: "F2-D", module: FeedbackModule },
  { id: "admin", owner: "F2-I", module: AdminModule },
  { id: "files", owner: "F2-D", module: FilesModule },
  { id: "realtime", owner: "F2-G", module: RealtimeModule },
  { id: "jobs", owner: "F2-E", module: JobsModule },
  { id: "health", owner: "F2-B", module: HealthModule },
]

/** MODE=api: todos los módulos menos el gateway de WebSocket (va en su propio servicio de Cloud Run, D8). */
export const apiModules = (): Type[] => API_MODULES.filter((m) => m.id !== "realtime").map((m) => m.module)

/** MODE=realtime: solo salud y el gateway (F2-G). */
export const realtimeModules = (): Type[] => [HealthModule, RealtimeModule]
