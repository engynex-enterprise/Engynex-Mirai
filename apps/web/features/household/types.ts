// Tipos compartidos de "Tu hogar" (los archivos "use server" solo exportan funciones async).
import type { AccessRole } from "@/lib/household/roles"
import type { LastResult } from "@/lib/household/invites"
import type { Row } from "@/lib/supabase/tables"

export type PersonInvite = {
  id: string
  kind: "email" | "tel"
  /** Correo o celular para mostrar (+57 315 123 4567). */
  destino: string
  phone: string | null
  access: AccessRole
  createdAt: string
  expiresAt: string
  estado: "pendiente" | "vencida"
  lastSentAt: string | null
  sendsDay: string | null
  sendsToday: number
  result: LastResult
  /** Enlace, texto y wa.me listos (solo pendientes con el token guardado). */
  share: Share | null
}

export type PersonEstado = "miembro" | "invitado" | "vencida" | "sin_cuenta"

/** Una persona del hogar: integrante sin cuenta, persona con cuenta o invitación pendiente. */
export type Person = {
  key: string
  familyId: string | null
  userId: string | null
  nombre: string
  avatar: string | null
  /** Parentesco o relación ("Hija", "Cónyuge o pareja"…). */
  parentesco: string | null
  access: AccessRole | null
  me: boolean
  titular: boolean
  email: string | null
  estado: PersonEstado
  invite: PersonInvite | null
  family: Row<"family_members"> | null
}

export type HouseholdPeople = {
  people: Person[]
  /** Integrantes sin cuenta y sin invitación (para "¿Es alguien que ya agregaste?"). */
  sinCuenta: { id: string; nombre: string; parentesco: string }[]
  /** Máximo de personas del plan (undefined = sin límite). */
  limite?: number
}

export type Share = { url: string; text: string; wa: string }

/** Por dónde puede enviar Mirai la invitación (GET /v1/households/:h/invitations/channels). */
export type InviteChannels = { email: boolean; whatsapp: boolean; motivoWhatsApp?: string }

export type InviteResult = {
  ok: boolean
  msg: string
  code?: "miembro" | "pendiente" | "mismo_nombre" | "limite" | "espera"
  invitationId?: string
  familyId?: string
  share?: Share
  delivery?: LastResult
}

/** Datos para invitar a una persona (POST /v1/households/:h/invitations). */
export type InviteInput = {
  destino: string
  nombre?: string | null
  parentesco?: string | null
  access: "admin" | "editor" | "registra" | "viewer"
  familyId?: string | null
  /** Es otra persona aunque se llame igual que un integrante sin cuenta. */
  nueva?: boolean
}

/** Crear (sin `id`) o editar un integrante. `force`: guardar aunque ya haya alguien con el mismo nombre. */
export type FamilyMemberInput = { id?: string | null; nombre: string; rol?: string | null; avatar?: string | null; nacimiento?: string | null; cupo?: number; force?: boolean }
