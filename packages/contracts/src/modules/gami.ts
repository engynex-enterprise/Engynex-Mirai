// Módulo `gamification & academy` (docs/arquitectura/v6-separacion-front-back.md §2.6, F2-C-6). Dueño: F2-C.
// Lectura de logros y referidos:
//   GET /v1/books/:bookId/gami → useGamiState + useGami de apps/web/features/gami/use-gami.ts (puntos, nivel, racha,
//                                misiones de la semana e insignias, con @mirai/domain/gami). Va por libro (no en
//                                /v1/me/gami como decía §2.6) porque el estado de logros es de cada libro: así pasa por
//                                BookGuard (miembro del hogar) y usa el libro completo para los puntos.
//   GET /v1/me/referrals       → misReferidos de apps/web/features/referidos/actions.ts.
// Las escrituras (registrar visita, otorgar logros, preferencias) quedan para F2-D/F2-C siguiente.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { COMMON_ERRORS, IsoDate, Uuid } from "../common"

export const meta = { id: "gami", owner: "F2-C" } as const

export const BookParams = z.object({ bookId: Uuid })
export const GamiQuery = z.object({ hoy: IsoDate.optional() })

const Tier = z.enum(["b", "s", "g"])
export const Insignia = z.object({ id: z.string(), n: z.string(), d: z.string(), icon: z.string(), tier: Tier, unlocked_at: z.string().nullable() })
export const Mision = z.object({ k: z.string(), t: z.string(), d: z.string(), icon: z.string(), xp: z.number(), goal: z.number(), p: z.number(), ok: z.boolean(), wk: z.string(), fin: z.string() })
export const Nivel = z.object({ i: z.number(), n: z.number(), name: z.string(), icon: z.string(), min: z.number(), next: z.number().nullable(), nextName: z.string().nullable(), prog: z.number() })

export const GamiView = z.object({
  /** Interruptor del libro (book_settings.gami). Apagado: la web no muestra logros. */
  on: z.boolean(),
  hoy: z.string(),
  xp: z.object({ total: z.number(), parts: z.array(z.object({ k: z.string(), l: z.string(), icon: z.string(), v: z.number(), n: z.number() })) }),
  nivel: Nivel,
  racha: z.number(),
  rachaMax: z.number(),
  misiones: z.array(Mision),
  puntuales: z.object({ a: z.number(), t: z.number() }),
  insignias: z.array(Insignia),
  /** Insignias y misiones cumplidas que aún no están guardadas (gamiPending; las guarda la web o el futuro POST …/gami/check). */
  pendientes: z.object({ badges: z.array(z.string()), missions: z.array(z.string()) }),
  estado: z.object({ visitas: z.number(), maxLevel: z.number(), init: z.string().nullable(), chats: z.number(), consejos: z.number() }),
})
export type GamiView = z.infer<typeof GamiView>

export const Referidos = z.object({
  codigo: z.string(),
  /** Ruta para compartir (`/registro?ref=…`); la web le antepone su dirección pública. */
  ruta: z.string(),
  activo: z.boolean(),
  dias: z.number(),
  plan: z.string(),
  max: z.number(),
  invitados: z.array(z.object({ id: z.string(), nombre: z.string(), estado: z.string(), fecha: z.string() })),
})
export type Referidos = z.infer<typeof Referidos>

const c = initContract()
export const gamiContract = c.router(
  {
    get: {
      method: "GET",
      path: "/v1/books/:bookId/gami",
      pathParams: BookParams,
      query: GamiQuery,
      responses: { ...COMMON_ERRORS, 200: GamiView },
      summary: "Logros del libro para la persona: puntos, nivel, racha, misiones e insignias",
    },
    referrals: {
      method: "GET",
      path: "/v1/me/referrals",
      responses: { ...COMMON_ERRORS, 200: Referidos },
      summary: "Tu código de referidos y a quiénes has invitado (solo el primer nombre)",
      description: "La primera vez crea tu código (como misReferidos de la web).",
    },
  },
  { strictStatusCodes: true },
)
