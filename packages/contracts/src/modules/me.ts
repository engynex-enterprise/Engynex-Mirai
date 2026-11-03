// Módulo `auth` / `me` (docs/arquitectura/v6-separacion-front-back.md §2.6, F2-B-8). Dueño: F2-B.
// GET /v1/me: contexto de la persona (usuario, hogares, libros, plan y admin). Reemplaza getAppContext (apps/web/lib/dal.ts)
// con la misma forma (AppContext de @mirai/domain/app-context). El libro activo va en `?bookId=` (la cookie mirai-book
// queda solo para el front).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { AppContext as AppContextT } from "@mirai/domain/app-context"
import { ACCESS_ROLES } from "@mirai/domain/household/roles"
import { FEATURE_LIST, type PremiumFeature } from "@mirai/domain/plans"
import { ApiError, COMMON_ERRORS, Uuid } from "../common"

export const meta = { id: "me", owner: "F2-B" } as const

export const AccessRole = z.enum(ACCESS_ROLES)
export const LegacyRole = z.enum(["owner", "editor", "viewer"])
export const PlanInfo = z.object({
  id: z.string(),
  nombre: z.string(),
  features: z.array(z.enum(FEATURE_LIST as [PremiumFeature, ...PremiumFeature[]])),
  ads: z.boolean(),
  limites: z.object({ libros: z.number().optional(), personas: z.number().optional(), automatizaciones: z.number().optional() }),
  pago: z.boolean(),
})
const Household = z.object({ id: z.string(), nombre: z.string(), role: LegacyRole, access: AccessRole })
const Book = z.object({ id: z.string(), nombre: z.string(), tipo: z.string(), icon: z.string() })

export const AppContext = z.object({
  user: z.object({ id: z.string(), email: z.string(), nombre: z.string(), avatar: z.string().nullable(), apodo: z.string(), nacimiento: z.string().nullable() }),
  household: Household,
  households: z.array(Household),
  book: Book,
  books: z.array(Book.extend({ household_id: z.string() })),
  isAdmin: z.boolean(),
  plan: PlanInfo,
}) satisfies z.ZodType<AppContextT>
export type AppContext = z.infer<typeof AppContext>

export const MeQuery = z.object({ bookId: Uuid.optional() })

const c = initContract()
export const meContract = c.router(
  {
    get: {
      method: "GET",
      path: "/v1/me",
      query: MeQuery,
      responses: { ...COMMON_ERRORS, 200: AppContext, 404: ApiError },
      summary: "Contexto de la persona: hogares, libros, libro activo, rol, plan y si es admin (antes getAppContext)",
      description: "404 NOT_FOUND con details.redirect = '/bienvenida' si todavía no tiene hogar o libro.",
    },
  },
  { strictStatusCodes: true },
)
