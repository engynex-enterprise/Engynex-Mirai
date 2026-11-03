// Registros escogibles (contactos, bancos y entidades): cómo reconocer uno que ya existe para no crearlo dos veces.
// Mismo criterio de nombres que los proveedores (normProv = public.provider_norm()). Sin React ni Supabase.
import { normProv } from "./proveedores"

/** Tipos de entidad (igual a entities_tipo_check; "Casa de empeño" desde 20261103002000_deudas_acreedor_registro.sql). */
export const ENTITY_TIPOS = ["Banco", "Cooperativa", "Fintech", "Billetera", "Fondo", "Casa de empeño", "Otro"] as const
export type EntityTipo = (typeof ENTITY_TIPOS)[number]
export const CASA_EMPENO: EntityTipo = "Casa de empeño"
/** Ícono de la entidad según su tipo. */
export const entityIcon = (tipo: string | null | undefined) => (tipo === "Billetera" ? "smartphone" : tipo === CASA_EMPENO ? "gem" : "landmark")

const digitos =(s: string | null | undefined) => (s ?? "").replace(/\D/g, "")

/** Entidad (banco, cooperativa, casa de empeño…) con el mismo NIT o el mismo nombre (sin tildes, mayúsculas ni puntos). */
export function findEntity<T extends { nombre: string; nit?: string | null }>(list: T[], q: { nombre?: string | null; nit?: string | null }): T | undefined {
  const nit = digitos(q.nit)
  if (nit.length >= 6) {
    const porNit = list.find((e) => digitos(e.nit) === nit)
    if (porNit) return porNit
  }
  const k = normProv(q.nombre)
  return k ? list.find((e) => normProv(e.nombre) === k) : undefined
}

/**
 * Contacto con el mismo documento, o con el mismo nombre siempre que los documentos no digan que son personas distintas
 * (dos "Juan Pérez" con cédulas diferentes no son el mismo).
 */
export function findContact<T extends { nombre: string; doc?: string | null }>(list: T[], q: { nombre?: string | null; doc?: string | null }): T | undefined {
  const doc = digitos(q.doc)
  if (doc.length >= 5) {
    const porDoc = list.find((c) => digitos(c.doc) === doc)
    if (porDoc) return porDoc
  }
  const k = normProv(q.nombre)
  if (!k) return undefined
  return list.find((c) => normProv(c.nombre) === k && (!doc || !digitos(c.doc) || digitos(c.doc) === doc))
}
