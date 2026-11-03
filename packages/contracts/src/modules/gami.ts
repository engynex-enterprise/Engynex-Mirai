// Módulo `gamification & academy` (docs/arquitectura/v6-separacion-front-back.md §2.6, F2-C-6). Dueño: F2-C.
// Lectura de logros y referidos:
//   GET /v1/books/:bookId/gami → useGamiState + useGami de apps/web/features/gami/use-gami.ts (puntos, nivel, racha,
//                                misiones de la semana e insignias, con @mirai/domain/gami). Va por libro (no en
//                                /v1/me/gami como decía §2.6) porque el estado de logros es de cada libro: así pasa por
//                                BookGuard (miembro del hogar) y usa el libro completo para los puntos.
//   GET /v1/me/referrals       → misReferidos de apps/web/features/referidos/actions.ts.
// V7-G: escrituras → POST …/gami/visit, …/gami/check (evalúa y guarda en el servidor) y …/gami/logros (= logroNotifs).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, COMMON_ERRORS, IsoDate, Uuid } from "../common"

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

// ── V7-G: escrituras de logros (gami-check.tsx y logroNotifs de apps/web/features/notify/actions.ts) ──
/** Insignia y subida de nivel para la campana (misma entrada que la Server Action logroNotifs). */
export const LogroIn = z.object({
  badges: z.array(z.object({ id: z.string().max(60), n: z.string().max(120), d: z.string().max(300) })).max(20),
  nivel: z.object({ n: z.number().int().min(1).max(200), name: z.string().max(80) }).nullable(),
})
export type LogroIn = z.infer<typeof LogroIn>
export const Visited = z.object({ dia: z.string() })
/** Lo que hay que celebrar después de guardar (la primera evaluación del libro no celebra nada: `first`). */
export const GamiChecked = z.object({
  on: z.boolean(),
  first: z.boolean(),
  badges: z.array(z.object({ id: z.string(), n: z.string(), d: z.string(), icon: z.string(), tier: Tier })),
  missions: z.array(z.object({ k: z.string(), t: z.string(), xp: z.number(), wk: z.string() })),
  nivel: z.object({ n: z.number(), name: z.string() }).nullable(),
})
export type GamiChecked = z.infer<typeof GamiChecked>

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
    visit: {
      method: "POST",
      path: "/v1/books/:bookId/gami/visit",
      pathParams: BookParams,
      query: GamiQuery,
      body: c.noBody(),
      responses: { ...COMMON_ERRORS, 200: ApiOk(Visited) },
      summary: "Registra tu visita del día (racha). Repetirla el mismo día no cambia nada",
    },
    check: {
      method: "POST",
      path: "/v1/books/:bookId/gami/check",
      pathParams: BookParams,
      query: GamiQuery,
      body: c.noBody(),
      responses: { ...COMMON_ERRORS, 200: ApiOk(GamiChecked) },
      summary: "Evalúa y guarda insignias, misiones y nivel; devuelve qué celebrar",
      description: "Con logros apagados en el libro no guarda nada. El nivel máximo solo lo guarda quien puede editar todo (como la web). Las insignias y el nivel nuevos quedan en la campana (salvo la primera evaluación del libro).",
    },
    logros: {
      method: "POST",
      path: "/v1/books/:bookId/gami/logros",
      pathParams: BookParams,
      body: LogroIn,
      responses: { ...COMMON_ERRORS, 200: ApiOk(z.object({ saved: z.number() })) },
      summary: "Insignias nuevas y subida de nivel → campana (kind «logro», sin duplicados). Igual que logroNotifs",
    },
  },
  { strictStatusCodes: true },
)
