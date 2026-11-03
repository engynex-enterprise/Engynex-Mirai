// Contrato completo de la API (ts-rest): lo que ya está implementado en apps/api. El front (F2-H) arma su cliente con
// `initClient(apiContract, …)` y la API genera el OpenAPI de /docs con él. Cada frente agrega aquí su contrato.
import { initContract } from "@ts-rest/core"
import { catalogsContract } from "./modules/catalogs"
import { healthContract } from "./modules/health"
import { jobsContract } from "./modules/jobs"
import { meContract } from "./modules/me"
// F2-I: hogar, cuenta, planes, consola y portal del contador.
import { accountContract } from "./modules/account"
import { adminContract } from "./modules/admin"
import { billingContract } from "./modules/billing"
import { householdsContract } from "./modules/households"
import { accountantPortalContract } from "./modules/tax"
// F2-C: lecturas (CRUD genérico, refs, vistas, campana, logros y anuncios).
import { adsContract } from "./modules/ads"
import { bookTablesContract } from "./modules/book-tables"
import { gamiContract } from "./modules/gami"
import { insightsContract } from "./modules/insights"
import { bellContract } from "./modules/notifications-bell"
import { refsContract } from "./modules/refs"
// F2-E: integraciones, avisos (envíos, reglas, Telegram y push) y Google. Los trabajos van en `jobs`.
import { googleContract } from "./modules/google"
import { integrationsContract } from "./modules/integrations"
import { notifyDeliveryContract } from "./modules/notifications-delivery"
// F2-F: IA, chat (streaming NDJSON) y consola › Uso de IA.
import { aiAdminContract, aiContract } from "./modules/ai"
import { chatContract } from "./modules/chat"
// F2-D: escrituras (CRUD genérico en bookTables + comandos con reglas de cada módulo).
import { assetsContract } from "./modules/assets"
import { budgetContract } from "./modules/budget"
import { cardsContract } from "./modules/cards"
import { expensesContract } from "./modules/expenses"
import { fixedContract } from "./modules/fixed"
import { importContract } from "./modules/import"
import { incomesContract } from "./modules/incomes"
import { loansContract } from "./modules/loans"
import { savingsContract } from "./modules/savings"

const c = initContract()
export const apiContract = c.router({
  health: healthContract,
  me: meContract,
  catalogs: catalogsContract,
  jobs: jobsContract,
  households: householdsContract,
  account: accountContract,
  billing: billingContract,
  admin: adminContract,
  accountantPortal: accountantPortalContract,
  bookTables: bookTablesContract,
  refs: refsContract,
  insights: insightsContract,
  bell: bellContract,
  gami: gamiContract,
  ads: adsContract,
  integrations: integrationsContract,
  notify: notifyDeliveryContract,
  google: googleContract,
  ai: aiContract,
  aiAdmin: aiAdminContract,
  chat: chatContract,
  expenses: expensesContract,
  incomes: incomesContract,
  fixed: fixedContract,
  cards: cardsContract,
  loans: loansContract,
  savings: savingsContract,
  assets: assetsContract,
  budget: budgetContract,
  importer: importContract,
})
export type ApiContract = typeof apiContract
