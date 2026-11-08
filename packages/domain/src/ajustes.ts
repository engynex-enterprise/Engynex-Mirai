// Cálculos de Ajustes › Finanzas y Ajustes › Relaciones (sin interfaz): repartos tipo 50/30/20, quincenas, tasa de
// usura mensual y el uso de las relaciones en los contactos. La web solo los muestra.
import { norm } from "./hormiga"

export type Pct = { n: number; g: number; a: number }

/** Repartos conocidos del ingreso: necesidades / gustos / ahorro. */
export const REPARTOS: { k: string; label: string; desc: string; pct: Pct }[] = [
  { k: "50-30-20", label: "50 / 30 / 20", desc: "La clásica: la mitad para lo necesario.", pct: { n: 50, g: 30, a: 20 } },
  { k: "70-20-10", label: "70 / 20 / 10", desc: "Cuando el arriendo y los servicios pesan más.", pct: { n: 70, g: 20, a: 10 } },
  { k: "60-20-20", label: "60 / 20 / 20", desc: "Menos gustos para ahorrar más.", pct: { n: 60, g: 20, a: 20 } },
]

/** Cuál reparto conocido es (o `null` si es uno propio). */
export const repartoDe = (p: Pct): string | null => REPARTOS.find((r) => r.pct.n === +p.n && r.pct.g === +p.g && r.pct.a === +p.a)?.k ?? null

/** Pesos al mes de cada parte con un ingreso mensual. El ahorro se lleva el redondeo para que sumen el ingreso. */
export function repartoMontos(ingreso: number, p: Pct): Pct {
  const ing = Math.max(0, Math.round(ingreso) || 0)
  const n = Math.round((ing * +p.n) / 100)
  const g = Math.round((ing * +p.g) / 100)
  const tot = +p.n + +p.g + +p.a
  return { n, g, a: tot === 100 ? ing - n - g : Math.round((ing * +p.a) / 100) }
}

/**
 * Deja la suma en 100 % cambiando lo menos posible: si `fijo` es la parte que la persona acaba de mover, se ajusta
 * primero el ahorro (o los gustos si movió el ahorro) y, si no alcanza, la otra parte.
 */
export function cuadrarReparto(p: Pct, fijo: keyof Pct = "n"): Pct {
  const r: Pct = { n: clamp(+p.n), g: clamp(+p.g), a: clamp(+p.a) }
  const orden: (keyof Pct)[] = fijo === "a" ? ["g", "n"] : fijo === "g" ? ["a", "n"] : ["a", "g"]
  let dif = 100 - (r.n + r.g + r.a)
  for (const k of orden) {
    if (!dif) break
    const nuevo = clamp(r[k] + dif)
    dif -= nuevo - r[k]
    r[k] = nuevo
  }
  return r
}
const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x) || 0))

/** Días de cada quincena en un mes con el corte de la primera (1–27). `mes` es 1–12. */
export function quincenasDelMes(corte: number, year: number, mes: number): { q1: [number, number]; q2: [number, number] } {
  const ult = new Date(year, mes, 0).getDate()
  const c = Math.max(1, Math.min(27, Math.round(corte) || 15))
  return { q1: [1, c], q2: [c + 1, ult] }
}

/** Tasa mensual equivalente (% M.V.) a una efectiva anual (% E.A.), con dos decimales. */
export const eaAMensual = (ea: number): number => Math.round((Math.pow(1 + (+ea || 0) / 100, 1 / 12) - 1) * 10000) / 100

// ——— Relaciones ———

/** Relaciones que se pueden agregar con un toque (las que ya están no se ofrecen). */
export const RELACIONES_SUGERIDAS = [
  "Mamá", "Papá", "Hermano(a)", "Hijo(a)", "Pareja", "Primo(a)", "Tío(a)", "Abuelo(a)", "Jefe", "Socio", "Arrendatario", "Arrendador",
]

export interface UsoRelaciones {
  /** Contactos por relación de la lista (clave: la relación tal como está escrita en la lista). */
  porRel: Map<string, number>
  /** Relaciones escritas en contactos que no están en la lista, con cuántos contactos (sin tildes ni mayúsculas). */
  fuera: { nombre: string; n: number }[]
  /** Contactos sin relación. */
  sin: number
}

/** Cuántos contactos (vivos) usa cada relación; compara sin tildes ni mayúsculas. */
export function usoRelaciones(contacts: readonly { relacion?: string | null; deleted_at?: string | null }[], rels: readonly string[]): UsoRelaciones {
  const porRel = new Map(rels.map((r) => [r, 0]))
  const idx = new Map(rels.map((r) => [norm(r), r]))
  const fuera = new Map<string, { nombre: string; n: number }>()
  let sin = 0
  for (const c of contacts) {
    if (c.deleted_at) continue
    const r = (c.relacion ?? "").trim()
    if (!r) { sin++; continue }
    const k = norm(r)
    const de = idx.get(k)
    if (de) porRel.set(de, (porRel.get(de) ?? 0) + 1)
    else { const f = fuera.get(k) ?? { nombre: r, n: 0 }; f.n++; fuera.set(k, f) }
  }
  return { porRel, fuera: [...fuera.values()].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es")), sin }
}

/** Mueve la relación `i` una posición arriba (-1) o abajo (+1). El orden es el de los selectores. */
export function moverRelacion(rels: readonly string[], i: number, dir: -1 | 1): string[] {
  const j = i + dir
  if (i < 0 || i >= rels.length || j < 0 || j >= rels.length) return [...rels]
  const r = [...rels]
  ;[r[i], r[j]] = [r[j], r[i]]
  return r
}

/** Contactos que hay que cambiar al renombrar (o unir) una relación: los que la tienen escrita, sin tildes ni mayúsculas. */
export const contactosConRelacion = <T extends { relacion?: string | null; deleted_at?: string | null }>(contacts: readonly T[], rel: string): T[] =>
  contacts.filter((c) => !c.deleted_at && !!c.relacion && norm(c.relacion) === norm(rel))
