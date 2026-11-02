// Pasar el hogar (titularidad) con aceptación. Puro e isomórfico. La base hace las mismas validaciones
// (request/respond/cancel_household_transfer, migración 20261103001600_cuenta_titularidad.sql).

import { ROLE_INFO, type AccessRole } from "./roles"

/** Días que tiene la persona para aceptar. */
export const TRANSFER_DAYS = 7

export type TransferStatus = "pendiente" | "aceptada" | "rechazada" | "cancelada" | "vencida"
export type TransferRow = { id: string; household_id: string; from_user: string; to_user: string; from_role: string; plan_action: string; status: string; expires_at: string; created_at: string }

/** Estado real: una pendiente que pasó su fecha está vencida aunque nadie la haya tocado. */
export function transferStatus(t: Pick<TransferRow, "status" | "expires_at">, now = new Date()): TransferStatus {
  if (t.status === "pendiente" && new Date(t.expires_at) <= now) return "vencida"
  return (["pendiente", "aceptada", "rechazada", "cancelada", "vencida"] as const).includes(t.status as TransferStatus) ? (t.status as TransferStatus) : "cancelada"
}

export const TRANSFER_LABEL: Record<TransferStatus, string> = { pendiente: "Esperando respuesta", aceptada: "Aceptada", rechazada: "Rechazada", cancelada: "Cancelada", vencida: "Venció" }

/** Roles que puede quedar teniendo quien pasa el hogar (por defecto "Administra"). */
export const FROM_ROLES: AccessRole[] = ["admin", "editor", "registra", "viewer"]
export const DEFAULT_FROM_ROLE: AccessRole = "admin"

export type Candidate = { userId: string | null; access: AccessRole | null; me?: boolean; estado?: string }

/** ¿Puede `actor` pasarle el hogar a esta persona? Solo el dueño, y solo a alguien con cuenta que ya sea del hogar. */
export function canReceive(actor: AccessRole, p: Candidate): { ok: true } | { ok: false; msg: string } {
  if (actor !== "owner") return { ok: false, msg: "Solo el dueño puede pasar el hogar a otra persona." }
  if (p.me) return { ok: false, msg: "Ya eres el dueño del hogar." }
  if (!p.userId || !p.access || (p.estado && p.estado !== "miembro")) return { ok: false, msg: "Solo puedes pasárselo a alguien que ya tenga su cuenta y haga parte del hogar. Invítala primero." }
  if (p.access === "owner") return { ok: false, msg: "Esa persona ya es dueña del hogar." }
  return { ok: true }
}

/** Personas que pueden recibir el hogar. */
export const receivers = <T extends Candidate>(actor: AccessRole, people: T[]) => people.filter((p) => canReceive(actor, p).ok)

/** La confirmación "escribe el nombre del hogar" (sin importar mayúsculas ni espacios de los lados). */
export const nameMatches = (typed: string, hogar: string) => typed.trim().toLowerCase() === hogar.trim().toLowerCase() && !!hogar.trim()

/** Qué cambia, en palabras simples (ventana de confirmación y correo). */
export function transferSummary(o: { hogar: string; para: string; fromRole: AccessRole; planAction: "seguir" | "cancelar"; tienePago: boolean }) {
  const lines = [
    `${o.para} será el Dueño del hogar “${o.hogar}”: podrá cambiar o pagar el plan, borrar el hogar y pasárselo a otra persona.`,
    `Tú quedas como ${ROLE_INFO[o.fromRole].label}: ${ROLE_INFO[o.fromRole].desc}`,
    "Los libros, los movimientos, las personas, las claves de IA del hogar y los accesos del contador siguen igual: no se borra nada.",
  ]
  if (o.tienePago) lines.push(o.planAction === "cancelar"
    ? "Cancelaremos la renovación automática que pagas tú: el plan sigue hasta su fecha y luego el dueño nuevo decide si lo paga."
    : "La renovación automática sigue a tu nombre hasta que la canceles en Mi plan.")
  lines.push(`${o.para} tiene ${TRANSFER_DAYS} días para aceptar. Hasta entonces sigues siendo el dueño.`)
  return lines
}
