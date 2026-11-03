// Contrato completo de la API (ts-rest): lo que ya está implementado en apps/api. El front (F2-H) arma su cliente con
// `initClient(apiContract, …)` y la API genera el OpenAPI de /docs con él. Cada frente agrega aquí su contrato.
import { initContract } from "@ts-rest/core"
import { catalogsContract } from "./modules/catalogs"
import { healthContract } from "./modules/health"
import { jobsContract } from "./modules/jobs"
import { meContract } from "./modules/me"

const c = initContract()
export const apiContract = c.router({
  health: healthContract,
  me: meContract,
  catalogs: catalogsContract,
  jobs: jobsContract,
})
export type ApiContract = typeof apiContract
