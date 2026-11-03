// Módulo `realtime gateway` (docs/arquitectura/v6-separacion-front-back.md §2.6 y §2.8). Dueño: F2-G.
// Protocolo del gateway socket.io (servicio aparte `mirai-realtime`, MODE=realtime). Lo comparten:
// - apps/api/src/modules/realtime (servidor),
// - packages/contracts/src/realtime-client.ts (cliente sin React) y apps/web/hooks/use-live-gateway.ts,
// - la migración del trigger mirai_live_notify (lista NOTIFY_TABLES, revisada por una prueba).
// No hay endpoints HTTP: todo va por WebSocket (con *long-polling* de respaldo).
import { z } from "zod"
import type { AccessRole } from "@mirai/domain/household/roles"
import { Uuid } from "../common"
import { HOUSEHOLD_TABLES, LIVE_TABLES, type HouseholdTable, type LiveChange, type LiveTable } from "../live"

export const meta = { id: "realtime", owner: "F2-G" } as const

// ── Fuente del tiempo real en el front (interruptor) ──────────────────────────────────────────────────────────
/** `supabase` = Supabase Realtime (lo de hoy, por defecto) · `gateway` = este gateway socket.io. */
export const LIVE_SOURCES = ["supabase", "gateway"] as const
export type LiveSource = (typeof LIVE_SOURCES)[number]
/** Lee el interruptor (`NEXT_PUBLIC_LIVE_SOURCE`). Vacío o desconocido = `supabase`: nada cambia. */
export const liveSource = (v: string | null | undefined): LiveSource => (v?.trim().toLowerCase() === "gateway" ? "gateway" : "supabase")

// ── Salas ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Salas de socket.io: una por libro, una por hogar y una por persona; y una por libro y rol (eventos restringidos). */
export const rooms = {
  book: (bookId: string) => `book:${bookId}`,
  bookRole: (bookId: string, role: AccessRole) => `book:${bookId}:${role}`,
  household: (householdId: string) => `household:${householdId}`,
  user: (userId: string) => `user:${userId}`,
}

// ── Fuente de cambios en la base (pg_notify) ─────────────────────────────────────────────────────────────────
/** Canal de LISTEN/NOTIFY del trigger mirai_live_notify (migración 20261103004100_live_notify.sql). */
export const LIVE_NOTIFY_CHANNEL = "mirai_live"
/** Tablas extra que avisan por el trigger además de LIVE_TABLES y HOUSEHOLD_TABLES. */
export const USER_TABLES = ["notifications"] as const
/** Cola de automatizaciones (solo INSERT): equivale al canal `auto:{libro}` de features/automations/runner.tsx. */
export const AUTOMATION_TABLE = "automation_events" as const
/** Todas las tablas con trigger `mirai_live_notify` (la prueba del gateway la compara con la migración). */
export const NOTIFY_TABLES = [...LIVE_TABLES, ...HOUSEHOLD_TABLES, ...USER_TABLES, AUTOMATION_TABLE] as const
export type NotifyTable = (typeof NOTIFY_TABLES)[number]

const Op = z.enum(["INSERT", "UPDATE", "DELETE"])

/**
 * Carga útil del trigger: `{ t, op, id?, b?, h?, u? }` (tabla, operación, id de la fila, libro, hogar, persona).
 * Mínima a propósito (≤ 8 000 bytes de NOTIFY y nunca montos ni textos de la persona).
 */
export const PgLiveNotify = z.object({
  t: z.enum(NOTIFY_TABLES as unknown as [NotifyTable, ...NotifyTable[]]),
  op: Op,
  id: z.string().max(80).optional(),
  b: Uuid.optional(),
  h: Uuid.optional(),
  u: Uuid.optional(),
})
export type PgLiveNotify = z.infer<typeof PgLiveNotify>

// ── Eventos ───────────────────────────────────────────────────────────────────────────────────────────────────
/** Cambio en una tabla del libro o del hogar (el cliente invalida la caché con invalidateBook). */
export const LiveChangeSchema = z.object({
  table: z.enum([...LIVE_TABLES, ...HOUSEHOLD_TABLES] as unknown as [LiveTable | HouseholdTable, ...(LiveTable | HouseholdTable)[]]),
  bookId: Uuid.optional(),
  householdId: Uuid.optional(),
  id: z.string().optional(),
  op: Op,
}) satisfies z.ZodType<LiveChange>

/** Quién está conectado y en qué pantalla (mismo tipo que PresenceUser de apps/web/hooks/use-realtime.ts). */
export const PresenceUser = z.object({ id: z.string(), nombre: z.string(), avatar: z.string().nullable(), path: z.string(), at: z.string() })
export type PresenceUser = z.infer<typeof PresenceUser>

export const JoinBookInput = z.object({ bookId: Uuid })
export type JoinBookInput = z.infer<typeof JoinBookInput>

/** `presence:update`: la persona (el id sale del token, no del cliente) dice en qué pantalla está. */
export const PresenceUpdateInput = z.object({
  bookId: Uuid,
  path: z.string().max(300, "Ruta demasiado larga"),
  nombre: z.string().max(120).default(""),
  avatar: z.string().max(1000).nullable().default(null),
})
export type PresenceUpdateInput = z.input<typeof PresenceUpdateInput>

export const AuthRefreshInput = z.object({ token: z.string().min(20).max(8000) })

/** Respuesta (ack) de los comandos del cliente. Los errores usan los mismos códigos de la API. */
export type Ack<T = object> = ({ ok: true } & T) | { ok: false; code: "UNAUTHENTICATED" | "ROLE_DENIED" | "NOT_FOUND" | "VALIDATION" | "RATE_LIMITED" | "INTERNAL"; msg: string }
export type JoinBookAck = Ack<{ bookId: string; householdId: string; role: AccessRole }>

/** Eventos que manda el servidor. */
export interface ServerToClientEvents {
  /** Cambió una tabla del libro (sala `book:{id}`) o del hogar (sala `household:{id}`). */
  change: (c: LiveChange) => void
  /** Lista completa de quién está en el libro (cada vez que alguien entra, se mueve o sale). */
  presence: (p: { bookId: string; users: PresenceUser[] }) => void
  /** La campana de la persona cambió (sala `user:{id}`). */
  notification: (n: { id?: string; op: LiveChange["op"] }) => void
  /** La base encoló un evento de automatización del libro (antes: canal `auto:{libro}`). */
  automation: (a: { bookId: string; id?: string }) => void
  /** Ya no eres miembro del libro (te sacaron del hogar o cambió tu rol). */
  "book:left": (b: { bookId: string; msg: string }) => void
  /** Se perdieron cambios (la escucha de la base se reconectó): recarga lo del libro. */
  resync: (r: { reason: string }) => void
  /** El token venció: el servidor desconecta; el cliente renueva la sesión y vuelve a conectar. */
  "auth:expired": (e: { msg: string }) => void
}

/** Comandos del cliente (todos con ack). */
export interface ClientToServerEvents {
  "join:book": (i: JoinBookInput, ack: (r: JoinBookAck) => void) => void
  "leave:book": (i: JoinBookInput, ack: (r: Ack) => void) => void
  "presence:update": (i: PresenceUpdateInput, ack: (r: Ack) => void) => void
  /** Token nuevo (Supabase lo renueva cada hora): evita que el servidor desconecte por vencimiento. */
  "auth:refresh": (i: { token: string }, ack: (r: Ack<{ expiresAt: number }>) => void) => void
}

/** Rol mínimo para recibir cambios de una tabla (por defecto todos los miembros: "ver" es de todos los roles). */
export const LIVE_MIN_ROLE: Partial<Record<LiveTable | HouseholdTable | "automation", AccessRole>> = {}

/** Mensajes para la persona (español, tuteo). */
export const RT_MSG = {
  login: "Inicia sesión para ver los cambios en vivo.",
  expired: "Tu sesión venció. Volviendo a conectar…",
  notMember: "No encontramos ese libro.",
  left: "Ya no tienes acceso a este libro.",
  notJoined: "Primero entra al libro.",
  rate: "Vas muy rápido. Espera un momento.",
  origin: "Origen no permitido.",
  tooManyBooks: "Abriste demasiados libros a la vez.",
} as const
