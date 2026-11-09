// Lee los docker-compose.yml de verdad: servicios, imágenes, puertos y qué variables exige cada uno.
import { parse } from "yaml"
import { leer } from "./raiz.ts"
import { esNombreSensible } from "./secretos.ts"

export type Servicio = {
  nombre: string
  imagen: string
  /** "55432 → 5432" por cada mapeo. */
  puertos: string[]
  dependeDe: string[]
  perfil?: string
}

export type Compose = {
  archivo: string
  servicios: Servicio[]
  /** Variables que el compose exige sí o sí (${VAR:?}). */
  exigidas: string[]
  /** Variables que usa con valor por defecto (${VAR:-algo}). */
  opcionales: string[]
}

type CrudoServicio = {
  image?: string
  build?: unknown
  ports?: (string | number)[]
  depends_on?: string[] | Record<string, unknown>
  profiles?: string[]
}

/** Saca las ${VARIABLES} de un texto, separando las obligatorias (`:?`) de las que tienen respaldo. */
export function variablesDe(texto: string): { exigidas: string[]; opcionales: string[] } {
  const exigidas = new Set<string>()
  const opcionales = new Set<string>()
  for (const m of texto.matchAll(/\$\{([A-Z0-9_]+)(:\?|:-|-|\})/g)) {
    const [, nombre, marca] = m
    if (marca === ":?") exigidas.add(nombre)
    else opcionales.add(nombre)
  }
  for (const n of exigidas) opcionales.delete(n)
  return { exigidas: [...exigidas].sort(), opcionales: [...opcionales].sort() }
}

/** Interpreta un docker-compose.yml. Devuelve null si no está o no se puede leer. */
export function leerCompose(archivo: string): Compose | null {
  const txt = leer(archivo)
  if (!txt) return null
  let doc: { services?: Record<string, CrudoServicio> }
  try {
    // Las ${VAR:?} no son YAML inválido, pero sí rompen el tipado: se leen como texto y ya.
    doc = parse(txt) as { services?: Record<string, CrudoServicio> }
  } catch {
    return null
  }
  const servicios: Servicio[] = Object.entries(doc?.services ?? {}).map(([nombre, s]) => ({
    nombre,
    imagen: s?.image ?? (s?.build ? "(se construye aquí)" : "—"),
    puertos: (s?.ports ?? []).map((p) => {
      const t = String(p)
      const [fuera, dentro] = t.split(":")
      return dentro ? `${fuera} → ${dentro}` : t
    }),
    dependeDe: Array.isArray(s?.depends_on) ? s.depends_on : Object.keys(s?.depends_on ?? {}),
    perfil: s?.profiles?.[0],
  }))
  const { exigidas, opcionales } = variablesDe(txt)
  return { archivo, servicios, exigidas, opcionales }
}

/** Para mostrar: las exigidas primero, marcando cuáles guardan un secreto (su valor nunca se muestra). */
export function clasificarVariables(vars: string[]): { nombre: string; secreta: boolean }[] {
  return vars.map((nombre) => ({ nombre, secreta: esNombreSensible(nombre) }))
}
