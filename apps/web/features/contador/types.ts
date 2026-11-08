import type { RentaData } from "@/features/renta/data"

/** Acceso del contador (portal público: el token es la credencial). */
export type Share = { id: string; book_id: string; label: string; perms: string; expires_at: string | null; owner: string }

/** Abrir el portal: `bloqueado: "plan"` = el enlace existe, pero el plan del cliente ya no incluye el contador. */
export type PortalResult = { share: Share; data: RentaData } | { bloqueado: "plan" } | null

/** Datos para crear un acceso (los valida la API). */
export type NewShare = { label: string; email: string; perms: "renta" | "todo"; exp: "30" | "90" | "dic" | "nunca" }
